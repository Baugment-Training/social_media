/* BAUGMENT — core runtime
   Namespaced globals so every page works from file:// as well as from a server.
   No build step, no bundler, no module loader. */

window.BAUGMENT = window.BAUGMENT || {};

/* ========================================================================== */
/* Utilities                                                                  */
/* ========================================================================== */

BAUGMENT.util = (function () {
  const pad = (n) => String(n).padStart(2, '0');

  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  /* Deterministic PRNG so the demo data set is identical on every machine. */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  const fmt = {
    int: (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('en-US')),
    compact(n) {
      if (n == null || isNaN(n)) return '—';
      const a = Math.abs(n);
      if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
      if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
      if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
      return Math.round(n).toLocaleString('en-US');
    },
    pct: (n, d) => (n == null || isNaN(n) ? '—' : n.toFixed(d == null ? 2 : d) + '%'),
    signed: (n, d) => (n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d == null ? 1 : d) + '%'),
    idr(n) {
      if (n == null || isNaN(n)) return '—';
      return 'Rp ' + Math.round(n).toLocaleString('id-ID');
    },
    duration(sec) {
      if (sec == null || isNaN(sec)) return '—';
      const m = Math.floor(sec / 60), s = Math.round(sec % 60);
      return m ? m + 'm ' + pad(s) + 's' : s + 's';
    },
    date(iso, style) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      if (style === 'long') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      if (style === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },
    time: (t) => (t ? String(t).slice(0, 5) : '—'),
    relative(iso) {
      const diff = Date.now() - new Date(iso).getTime();
      const day = 86400000;
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < day) return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 7 * day) return Math.floor(diff / day) + 'd ago';
      return fmt.date(iso);
    }
  };

  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));       /* Monday */
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const quarterOf = (d) => Math.floor(d.getMonth() / 3) + 1;

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const sum = (arr, k) => arr.reduce((a, r) => a + (Number(k ? r[k] : r) || 0), 0);
  const mean = (arr, k) => (arr.length ? sum(arr, k) / arr.length : 0);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function groupBy(arr, keyFn) {
    const m = new Map();
    for (const item of arr) {
      const k = keyFn(item);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(item);
    }
    return m;
  }

  function pick(list, r) { return list[Math.floor(r() * list.length)]; }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms == null ? 220 : ms);
    };
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  return { esc, uid, rng, fmt, iso, parse, addDays, startOfWeek, startOfMonth, endOfMonth, quarterOf,
    DOW, MONTHS, sum, mean, clamp, groupBy, pick, debounce, download, slug, pad };
})();

/* ========================================================================== */
/* Persistence — localStorage with a transparent in-memory fallback.          */
/* Some hosts (sandboxed iframes, private mode, file:// on strict browsers)   */
/* block Web Storage. The app must still run; it just won't survive a reload. */
/* ========================================================================== */

BAUGMENT.persist = (function () {
  const PREFIX = 'baugment.v1.';
  const memory = new Map();
  let available = false;

  try {
    const probe = PREFIX + '__probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch (e) {
    available = false;
  }

  function get(key, fallback) {
    try {
      const raw = available ? window.localStorage.getItem(PREFIX + key) : memory.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (available) window.localStorage.setItem(PREFIX + key, raw);
      else memory.set(key, raw);
      return true;
    } catch (e) {
      memory.set(key, raw);
      return false;
    }
  }

  function remove(key) {
    try {
      if (available) window.localStorage.removeItem(PREFIX + key);
      memory.delete(key);
    } catch (e) { /* nothing useful to do */ }
  }

  function clearAll() {
    try {
      if (available) {
        Object.keys(window.localStorage)
          .filter((k) => k.indexOf(PREFIX) === 0)
          .forEach((k) => window.localStorage.removeItem(k));
      }
    } catch (e) { /* nothing useful to do */ }
    memory.clear();
  }

  return { get, set, remove, clearAll, get durable() { return available; } };
})();

/* ========================================================================== */
/* Icons — one 24px stroke set, referenced by name                            */
/* ========================================================================== */

BAUGMENT.icon = (function () {
  const P = {
    dashboard: '<path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z"/>',
    analytics: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>',
    planner: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
    pillars: '<path d="M4 21V8m5 13V8m5 13V8m5 13V8M3 8l9-5 9 5M3 21h18"/>',
    campaign: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
    media: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-5 5-2-2-6 6"/>',
    reports: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5M12 4v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 11l5 5 5-5M12 16V4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.6 1.6 0 0 0 15 19.4a1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.09A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.09A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9v0a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.47 1Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="m5 13 4 4L19 7"/>',
    alert: '<path d="M12 9v4m0 4h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
    chevronL: '<path d="m15 6-6 6 6 6"/>',
    chevronR: '<path d="m9 6 6 6-6 6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.7M6.6 6.7A17 17 0 0 0 2 12s3.6 7 10 7c1.9 0 3.5-.5 4.9-1.3"/><path d="m2 2 20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    print: '<path d="M6 9V3h12v6M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.5-7Z"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/>',
    tag: '<path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8Z"/><path d="M7.5 7.5h.01"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
    sparkle: '<path d="M12 3v4m0 10v4M3 12h4m10 0h4"/><path d="M12 8.5 13.4 11l2.6 1-2.6 1-1.4 2.5L10.6 13 8 12l2.6-1L12 8.5Z"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>'
  };

  /* Brand glyphs are simplified single-path marks, not the official logos. */
  const BRAND = {
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/>',
    tiktok: '<path d="M15 4v9.5a4 4 0 1 1-3.2-3.9"/><path d="M15 4a5 5 0 0 0 5 5"/>',
    youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4"/>',
    facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8a1 1 0 0 1 1-1Z"/>',
    threads: '<path d="M16 8.5C15 6.8 13.6 6 12 6c-3.3 0-5.5 2.6-5.5 6s2 6 5.5 6c2.4 0 4-1.3 4-3s-1.4-2.6-3.3-2.6c-1.5 0-2.4.7-2.4 1.6"/>',
    x: '<path d="m4 4 16 16M20 4 4 20"/>',
    pinterest: '<circle cx="12" cy="12" r="9"/><path d="M11 21c-.5-2 .8-6.4 1.2-8"/><path d="M8.6 10.6c0-2.2 1.7-3.8 3.9-3.8 2 0 3.5 1.3 3.5 3.3 0 2.3-1.2 4-2.9 4-1 0-1.7-.8-1.5-1.7"/>'
  };

  function render(name, size) {
    const d = P[name];
    if (!d) return '';
    const s = size || 24;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  function brand(name, size) {
    const d = BRAND[name] || BRAND.x;
    const s = size || 16;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  return { render, brand, names: Object.keys(P) };
})();

/* ========================================================================== */
/* UI primitives                                                              */
/* ========================================================================== */

BAUGMENT.ui = (function () {
  const esc = BAUGMENT.util.esc;
  const icon = BAUGMENT.icon.render;

  function toastRoot() {
    let el = document.querySelector('.toasts');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toasts';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(title, message, kind, ms) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.innerHTML =
      '<span style="color:var(--' + (kind === 'error' ? 'rose' : kind === 'warn' ? 'gold' : kind === 'info' ? 'sky' : 'accent') + ')">' +
      icon(kind === 'error' || kind === 'warn' ? 'alert' : 'check', 16) + '</span>' +
      '<div><div class="toast__title">' + esc(title) + '</div>' +
      (message ? '<div class="toast__msg">' + esc(message) + '</div>' : '') + '</div>';
    toastRoot().appendChild(el);
    const life = ms || (kind === 'error' ? 6000 : 3800);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 220);
    }, life);
    return el;
  }

  /* Modal. Returns the body element so callers can wire their own fields. */
  function modal(opts) {
    const root = document.createElement('div');
    root.className = 'modal-root';
    root.innerHTML =
      '<div class="modal' + (opts.wide ? ' modal--wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title || 'Dialog') + '">' +
        '<div class="modal__head">' +
          '<div class="modal__title">' + esc(opts.title || '') + '</div>' +
          '<div class="spacer"></div>' +
          '<button class="btn btn--ghost btn--icon btn--sm" data-close aria-label="Close">' + icon('close', 16) + '</button>' +
        '</div>' +
        '<div class="modal__body"></div>' +
        '<div class="modal__foot"></div>' +
      '</div>';

    const body = root.querySelector('.modal__body');
    const foot = root.querySelector('.modal__foot');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    function close() {
      root.remove();
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    (opts.actions || [{ label: 'Close' }]).forEach(function (a) {
      const b = document.createElement('button');
      b.className = 'btn' + (a.variant ? ' btn--' + a.variant : '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        if (!a.onClick || a.onClick(body, close) !== false) { if (!a.keepOpen) close(); }
      });
      foot.appendChild(b);
    });

    root.querySelector('[data-close]').addEventListener('click', close);
    root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(root);

    const focusable = body.querySelector('input, select, textarea, button');
    if (focusable) focusable.focus();

    return { root, body, close };
  }

  function confirm(title, message, confirmLabel) {
    return new Promise(function (resolve) {
      let settled = false;
      modal({
        title,
        body: '<p class="dim">' + esc(message) + '</p>',
        actions: [
          { label: 'Cancel', onClick: () => { settled = true; resolve(false); } },
          { label: confirmLabel || 'Confirm', variant: 'primary', onClick: () => { settled = true; resolve(true); } }
        ],
        onClose: () => { if (!settled) resolve(false); }
      });
    });
  }

  function skeleton(rows, height) {
    let out = '';
    for (let i = 0; i < (rows || 4); i++) {
      out += '<div class="skel" style="height:' + (height || 16) + 'px;margin-bottom:10px;width:' + (100 - (i % 3) * 12) + '%"></div>';
    }
    return out;
  }

  function empty(title, body, actionHtml) {
    return '<div class="empty">' +
      '<div class="empty__mark">' + icon('inbox', 40) + '</div>' +
      '<div class="empty__title">' + esc(title) + '</div>' +
      '<p class="empty__body">' + esc(body) + '</p>' +
      (actionHtml || '') + '</div>';
  }

  function delta(value, invert) {
    if (value == null || isNaN(value)) return '<span class="delta delta--flat">—</span>';
    const good = invert ? value < 0 : value > 0;
    const cls = Math.abs(value) < 0.05 ? 'flat' : good ? 'up' : 'down';
    const arrow = Math.abs(value) < 0.05 ? '' : (value > 0 ? '▲' : '▼');
    /* The sign travels with the number. Showing the absolute value next to a
       down arrow reads as "+12% worse", which is nobody's idea of clear. */
    return '<span class="delta delta--' + cls + '">' + arrow + ' ' + BAUGMENT.util.fmt.signed(value) + '</span>';
  }

  /* Shared tooltip for every chart */
  let tipEl = null;
  function tip(text, x, y) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tip';
      document.body.appendChild(tipEl);
    }
    if (text == null) { tipEl.classList.remove('on'); return; }
    tipEl.innerHTML = text;
    tipEl.classList.add('on');
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = BAUGMENT.util.clamp(x - r.width / 2, 8, window.innerWidth - r.width - 8) + 'px';
    tipEl.style.top = Math.max(8, y - r.height - 12) + 'px';
  }

  /* Attaches drag & drop file handling to any element. */
  /* Views re-render into the same node, so guard against stacking listeners. */
  function dropTarget(el, onFiles) {
    if (el.__dropBound) { el.__dropHandler = onFiles; return; }
    el.__dropBound = true;
    el.__dropHandler = onFiles;
    onFiles = (files) => el.__dropHandler(files);

    ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); el.classList.add('drop-on');
    }));
    ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (ev === 'dragleave' && el.contains(e.relatedTarget)) return;
      el.classList.remove('drop-on');
    }));
    el.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) onFiles(Array.from(files));
    });
  }

  return { toast, modal, confirm, skeleton, empty, delta, tip, dropTarget };
})();
