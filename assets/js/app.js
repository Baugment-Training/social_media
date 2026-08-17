/* BAUGMENT — shell
   Hash router, nav rail, topbar, the shared filter bar, and global search.
   Views register themselves on BAUGMENT.views and are rendered into #content. */

BAUGMENT.views = BAUGMENT.views || {};

BAUGMENT.app = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const store = BAUGMENT.store;
  const icon = BAUGMENT.icon.render;
  const esc = U.esc;

  const NAV = [
    { group: 'Measure', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'analytics', label: 'Analytics', icon: 'analytics' },
      { id: 'reports', label: 'Reports', icon: 'reports' }
    ] },
    { group: 'Plan', items: [
      { id: 'ideas', label: 'Idea Bank', icon: 'bulb' },
      { id: 'calendar', label: 'Content Calendar', icon: 'calendar' },
      { id: 'planner', label: 'Content Planner', icon: 'planner' },
      { id: 'pillars', label: 'Content Pillars', icon: 'pillars' },
      { id: 'campaigns', label: 'Campaigns', icon: 'campaign' },
      { id: 'media', label: 'Media Library', icon: 'media' }
    ] },
    { group: 'Data', items: [
      { id: 'import', label: 'Import Data', icon: 'upload' },
      { id: 'export', label: 'Export Data', icon: 'download' },
      { id: 'settings', label: 'Settings', icon: 'settings' }
    ] }
  ];

  let current = 'dashboard';
  let session = null;

  /* --- Theme -------------------------------------------------------------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeBtn');
    if (btn) {
      btn.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 16);
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  function toggleTheme() {
    const next = store.state().settings.theme === 'dark' ? 'light' : 'dark';
    store.updateSettings({ theme: next });
    applyTheme(next);
  }

  /* --- Chrome ------------------------------------------------------------- */

  function railHtml() {
    const db = store.state();
    const counts = {
      ideas: (db.ideas || []).filter((i) => i.status !== 'used' && i.status !== 'parked').length,
      calendar: db.planner.filter((p) => p.status === 'scheduled').length,
      planner: db.planner.length,
      campaigns: db.campaigns.filter((c) => c.status === 'active').length,
      media: db.media.length,
      pillars: db.pillars.length
    };

    const groups = NAV.map((g) =>
      '<div class="navgroup"><div class="navgroup__label">' + esc(g.group) + '</div>' +
      g.items.map((it) =>
        '<button class="nav__item" data-route="' + it.id + '"' + (current === it.id ? ' aria-current="page"' : '') + '>' +
        icon(it.icon, 17) + '<span>' + esc(it.label) + '</span>' +
        (counts[it.id] ? '<span class="nav__count">' + counts[it.id] + '</span>' : '') +
        '</button>').join('') + '</div>').join('');

    /* The wordmark reduced to its initial for the 38px slot — the full
       lockup is unreadable at this size, and it's set live rather than
       shipped as an image so it recolours with the theme. */
    const mark = '<span class="brandmark" aria-hidden="true">B</span>';

    return '<div class="rail__head">' + mark +
      '<div><div class="rail__wordmark">Baug<b>ment</b></div>' +
      '<div class="rail__sub">Content &amp; Analytics</div></div></div>' +
      '<nav class="rail__scroll" aria-label="Sections">' + groups + '</nav>' +
      '<div class="rail__foot">' +
        '<span class="avatar">' + esc((session.displayName || 'A').slice(0, 1).toUpperCase()) + '</span>' +
        '<div style="min-width:0"><div class="tiny" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          esc(session.displayName || session.username) + '</div>' +
          '<div class="mono mute" style="font-size:10px">' + esc(session.role) + '</div></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn--ghost btn--icon btn--sm" id="logoutBtn" aria-label="Sign out">' + icon('logout', 15) + '</button>' +
      '</div>';
  }

  /* Reads the sync state and turns it into one honest chip. Local-only mode
     says so plainly rather than pretending nothing is wrong. */
  function syncChipHtml() {
    if (!BAUGMENT.config.isConfigured()) {
      return '<button class="btn btn--sm" id="syncChip" title="This browser is the only copy of your data" ' +
        'style="border-color:var(--gold);color:var(--gold)">' + icon('alert', 13) + ' This device only</button>';
    }
    const st = BAUGMENT.remote.state();
    const look = {
      ready:      ['accent', 'check',   'Synced'],
      syncing:    ['sky',    'refresh', 'Syncing…'],
      connecting: ['sky',    'refresh', 'Connecting…'],
      error:      ['rose',   'alert',   st.queued ? st.queued + ' queued' : 'Sync problem'],
      offline:    ['gold',   'alert',   'Offline']
    }[st.status] || ['gold', 'alert', 'Offline'];
    const when = st.lastSync ? ' · ' + U.fmt.relative(new Date(st.lastSync).toISOString()) : '';
    const title = st.lastError ? st.lastError : 'Shared database' + (when ? ', last synced' + when : '');
    return '<button class="btn btn--sm" id="syncChip" title="' + esc(title) + '" ' +
      'style="border-color:var(--' + look[0] + ');color:var(--' + look[0] + ')">' +
      icon(look[1], 13) + ' ' + esc(look[2]) + '</button>';
  }

  function topbarHtml() {
    /* Only shown while seeded records are still in the store — it's the
       signpost to the control that removes them. */
    const demo = store.hasDemoData()
      ? '<button class="btn btn--sm" id="demoChip" title="Showing generated demo data — click to remove it" ' +
        'style="border-color:var(--gold);color:var(--gold)">' + icon('alert', 13) + ' Demo data</button>'
      : '';

    return '<button class="btn btn--ghost btn--icon rail-toggle" id="railToggle" aria-label="Open navigation">' + icon('menu', 18) + '</button>' +
      '<div class="search"><label class="sr-only" for="globalSearch">Search everything</label>' +
        icon('search', 15) +
        '<input class="input" id="globalSearch" type="search" placeholder="Search posts, campaigns, pillars, hashtags…" autocomplete="off">' +
      '</div>' +
      '<div class="spacer"></div>' +
      demo + syncChipHtml() +
      '<span class="chip mono" title="Jakarta local time">' + icon('clock', 12) + '<span id="wibClock">—</span> WIB</span>' +
      '<button class="btn btn--ghost btn--icon" id="themeBtn" aria-label="Switch theme">' + icon('moon', 16) + '</button>';
  }

  function wireTopbar() {
    const theme = document.getElementById('themeBtn');
    if (theme) theme.addEventListener('click', toggleTheme);
    const toggle = document.getElementById('railToggle');
    if (toggle) toggle.addEventListener('click', openRail);
    const chip = document.getElementById('demoChip');
    if (chip) chip.addEventListener('click', () => { window.location.hash = '#/settings?tab=data'; render(); });
    const sync = document.getElementById('syncChip');
    if (sync) sync.addEventListener('click', () => { window.location.hash = '#/settings?tab=connection'; render(); });

    const search = document.getElementById('globalSearch');
    if (!search) return;
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && search.value.trim().length > 1) showSearch(search.value.trim());
      if (e.key === 'Escape') search.blur();
    });
  }

  /* Repainted on every route change so the demo chip disappears the moment
     the data behind it does. */
  function paintTopbar() {
    const bar = document.getElementById('topbar');
    if (!bar) return;
    const previous = document.getElementById('globalSearch');
    const kept = previous ? previous.value : '';
    bar.innerHTML = topbarHtml();
    wireTopbar();
    const search = document.getElementById('globalSearch');
    if (search) search.value = kept;
    applyTheme(store.state().settings.theme);
    startClock();
  }

  /* --- Global filter bar --------------------------------------------------- */

  function filterBarHtml() {
    const f = store.getFilters();
    const db = store.state();
    const opt = (v, label, sel) => '<option value="' + esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + esc(label) + '</option>';

    const platforms = [opt('all', 'All platforms', f.platform)]
      .concat(store.livePlatforms().map((p) => opt(p.id, p.name, f.platform))).join('');
    const ranges = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 180 days'],
      ['mtd', 'Month to date'], ['qtd', 'Quarter to date'], ['ytd', 'Year to date'], ['365', 'Last 12 months'],
      ['all', 'All time'], ['custom', 'Custom range']]
      .map((r) => opt(r[0], r[1], f.range)).join('');
    const campaigns = [opt('all', 'All campaigns', f.campaign)]
      .concat(db.campaigns.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => opt(c.id, c.name, f.campaign))).join('');
    const pillars = [opt('all', 'All pillars', f.pillar)]
      .concat(db.pillars.map((p) => opt(p.id, p.name, f.pillar))).join('');
    const mediaTypes = [opt('all', 'All media types', f.mediaType)]
      .concat(S.MEDIA_TYPES.map((m) => opt(m, m, f.mediaType))).join('');
    const contentTypes = [opt('all', 'All content types', f.contentType)]
      .concat(S.CONTENT_TYPES.map((m) => opt(m, m, f.contentType))).join('');
    const auth = [opt('all', 'All authors', f.author)]
      .concat(store.authors().map((a) => opt(a, a, f.author))).join('');

    const custom = f.range === 'custom'
      ? '<input class="input" type="date" data-filter="from" value="' + esc(f.from || '') + '" aria-label="From date">' +
        '<input class="input" type="date" data-filter="to" value="' + esc(f.to || '') + '" aria-label="To date">'
      : '';

    return '<div class="filters no-print" id="filterBar">' +
      '<select class="select" data-filter="range" aria-label="Date range">' + ranges + '</select>' + custom +
      '<select class="select" data-filter="platform" aria-label="Platform">' + platforms + '</select>' +
      '<select class="select" data-filter="campaign" aria-label="Campaign">' + campaigns + '</select>' +
      '<select class="select" data-filter="pillar" aria-label="Content pillar">' + pillars + '</select>' +
      '<select class="select" data-filter="mediaType" aria-label="Media type">' + mediaTypes + '</select>' +
      '<select class="select" data-filter="contentType" aria-label="Content type">' + contentTypes + '</select>' +
      '<select class="select" data-filter="author" aria-label="Author">' + auth + '</select>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn--ghost btn--sm" id="clearFilters">Clear</button>' +
      '</div>';
  }

  function wireFilterBar(root) {
    root.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('change', () => {
        const patch = {};
        patch[el.getAttribute('data-filter')] = el.value || null;
        store.setFilters(patch);
        render();
      });
    });
    const clear = root.querySelector('#clearFilters');
    if (clear) clear.addEventListener('click', () => { store.resetFilters(); render(); });
  }

  /* --- Router -------------------------------------------------------------- */

  function routeFromHash() {
    const h = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return BAUGMENT.views[h] ? h : 'dashboard';
  }

  function go(route) {
    if (window.location.hash === '#/' + route) render();
    else window.location.hash = '#/' + route;
  }

  function render() {
    /* A realtime event can land before boot finishes, or after a sign-out has
       cleared the session. Neither should throw — just skip the paint. */
    if (!session) session = BAUGMENT.auth.session();
    if (!session || !document.getElementById('rail')) return;

    current = routeFromHash();
    const view = BAUGMENT.views[current];

    paintTopbar();
    document.getElementById('rail').innerHTML = railHtml();
    document.querySelectorAll('#rail [data-route]').forEach((b) =>
      b.addEventListener('click', () => { go(b.getAttribute('data-route')); closeRail(); }));
    const out = document.getElementById('logoutBtn');
    if (out) out.addEventListener('click', signOut);

    document.title = view.title + ' · BAUGMENT';

    const main = document.getElementById('main');
    main.innerHTML =
      '<div class="view">' +
        '<header class="view__head">' +
          '<div><div class="eyebrow">' + esc(view.eyebrow || 'Baugment') + '</div>' +
          '<h1 class="view__title">' + esc(view.title) + '</h1>' +
          (view.lede ? '<p class="view__lede">' + esc(view.lede) + '</p>' : '') + '</div>' +
          '<div class="row no-print" id="viewActions">' + (view.actions ? view.actions() : '') + '</div>' +
        '</header>' +
        (view.filters ? filterBarHtml() : '') +
        '<div id="content"></div>' +
      '</div>';

    const content = document.getElementById('content');
    if (view.filters) wireFilterBar(main);
    if (view.wireActions) view.wireActions(document.getElementById('viewActions'));

    try {
      view.render(content);
    } catch (err) {
      console.error(err);
      content.innerHTML = '<div class="card"><div class="card__body">' +
        BAUGMENT.ui.empty('This view didn\'t load', 'Something in the data didn\'t match what the view expected. Reloading usually clears it; the console has the detail.') +
        '</div></div>';
    }
    BAUGMENT.charts.bind(content);
    main.scrollTop = 0;
  }

  /* --- Global search -------------------------------------------------------- */

  function globalSearch(q) {
    const db = store.state();
    const n = q.toLowerCase();
    const hits = [];
    const add = (kind, label, sub, route, action) => hits.push({ kind, label, sub, route, action });

    db.analytics.forEach((r) => {
      if (hits.length > 400) return;
      if ((r.caption + ' ' + r.hashtags + ' ' + r.post_id + ' ' + r.account).toLowerCase().indexOf(n) !== -1) {
        add('Post', r.caption.slice(0, 90), S.platform(r.platform).name + ' · ' + U.fmt.date(r.published_date), 'analytics');
      }
    });
    db.planner.forEach((p) => {
      if ((p.title + ' ' + p.caption + ' ' + p.hashtags + ' ' + p.keywords).toLowerCase().indexOf(n) !== -1) {
        add('Planned', p.title, S.platform(p.platform).name + ' · ' + U.fmt.date(p.publish_date), 'planner');
      }
    });
    db.campaigns.forEach((c) => {
      if ((c.name + ' ' + c.objective).toLowerCase().indexOf(n) !== -1) add('Campaign', c.name, c.objective + ' · ' + c.status, 'campaigns');
    });
    db.pillars.forEach((p) => {
      if ((p.name + ' ' + p.description).toLowerCase().indexOf(n) !== -1) add('Pillar', p.name, p.description.slice(0, 70), 'pillars');
    });
    (db.ideas || []).forEach((i) => {
      if ((i.title + ' ' + i.notes + ' ' + (i.tags || []).join(' ') + ' ' + i.origin).toLowerCase().indexOf(n) !== -1) {
        add('Idea', i.title, S.IDEA_STATUS_LABEL[i.status] + ' · ' + i.origin, 'ideas');
      }
    });
    db.media.forEach((m) => {
      if ((m.name + ' ' + m.tags.join(' ') + ' ' + m.category).toLowerCase().indexOf(n) !== -1) add('Media', m.name, m.category, 'media');
    });
    db.accounts.forEach((a) => {
      if ((a.handle + ' ' + a.name).toLowerCase().indexOf(n) !== -1) add('Account', a.handle, S.platform(a.platform).name, 'settings');
    });
    return hits;
  }

  function showSearch(q) {
    const hits = globalSearch(q);
    const byKind = U.groupBy(hits, (h) => h.kind);
    let body;
    if (!hits.length) {
      body = BAUGMENT.ui.empty('Nothing matches "' + q + '"',
        'Try a menu item, a hashtag, a campaign name, or part of a caption.');
    } else {
      body = '<p class="tiny mute" style="margin-bottom:12px">' + hits.length + ' match' + (hits.length === 1 ? '' : 'es') +
        (hits.length > 200 ? ' — showing the first few per section' : '') + '</p>';
      byKind.forEach((list, kind) => {
        body += '<div style="margin-bottom:18px"><div class="eyebrow" style="margin-bottom:8px">' + esc(kind) + ' · ' + list.length + '</div>' +
          list.slice(0, 6).map((h) =>
            '<button class="btn btn--ghost" data-goto="' + h.route + '" style="width:100%;justify-content:flex-start;height:auto;padding:8px 10px;text-align:left">' +
            '<span style="display:block;min-width:0"><span style="display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            esc(h.label) + '</span><span class="tiny mute">' + esc(h.sub) + '</span></span></button>').join('') +
          '</div>';
      });
    }

    const m = BAUGMENT.ui.modal({ title: 'Search results', body, wide: true, actions: [{ label: 'Close' }] });
    m.body.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      store.setFilters({ q });
      m.close();
      go(b.getAttribute('data-goto'));
    }));
  }

  /* --- Misc chrome --------------------------------------------------------- */

  function closeRail() {
    document.getElementById('rail').classList.remove('is-open');
    const s = document.querySelector('.scrim');
    if (s) s.remove();
  }

  function openRail() {
    document.getElementById('rail').classList.add('is-open');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.addEventListener('click', closeRail);
    document.body.appendChild(scrim);
  }

  async function signOut() {
    const ok = await BAUGMENT.ui.confirm('Sign out of BAUGMENT?', 'You\'ll need the password again to get back in.', 'Sign out');
    if (!ok) return;
    BAUGMENT.auth.logout();
    window.location.replace('index.html');
  }

  let clockTimer = null;
  function startClock() {
    const el = document.getElementById('wibClock');
    if (!el) return;
    if (clockTimer) clearInterval(clockTimer);
    const tick = () => {
      el.textContent = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit'
      });
    };
    tick();
    clockTimer = setInterval(tick, 30000);
  }

  /* --- Boot ---------------------------------------------------------------- */

  function bootScreen(message, detail) {
    document.getElementById('main').innerHTML =
      '<div class="view" style="display:grid;place-items:center;min-height:60vh;text-align:center">' +
      '<div><div style="margin:0 auto 18px;width:34px;height:34px;color:var(--accent)">' + icon('refresh', 34) + '</div>' +
      '<div class="display" style="font-size:var(--step-2)">' + esc(message) + '</div>' +
      '<p class="tiny mute" style="margin-top:8px">' + esc(detail || '') + '</p></div></div>';
  }

  /* A change from another device. Patch the store, then repaint — unless a
     modal is open, in which case the user is mid-edit and having the page
     redraw under them would be worse than being one beat behind. */
  let pendingRepaint = false;
  function onRemoteChange(collection, op, payload) {
    if (!store.applyRemote(collection, op, payload)) return;
    if (document.querySelector('.modal-root')) { pendingRepaint = true; return; }
    softRender();
  }

  const softRender = U.debounce(() => {
    if (document.querySelector('.modal-root')) { pendingRepaint = true; return; }
    pendingRepaint = false;
    render();
  }, 400);

  /* Modals close often; this is the cheapest place to catch up. */
  function watchModalClose() {
    const obs = new MutationObserver(() => {
      if (pendingRepaint && !document.querySelector('.modal-root')) softRender();
    });
    obs.observe(document.body, { childList: true });
  }

  const SYNC_COLLECTIONS = ['analytics', 'planner', 'ideas', 'campaigns', 'pillars', 'media', 'accounts', 'customMetrics'];

  function countRecords(bag) {
    return SYNC_COLLECTIONS.reduce((a, c) => a + ((bag && bag[c]) ? bag[c].length : 0), 0);
  }

  /* Records the user actually made — demo rows don't count as work worth
     protecting, and every device starts with a pile of them. */
  function countLocalWork() {
    const db = store.state();
    return SYNC_COLLECTIONS.reduce((a, c) =>
      a + (db[c] || []).filter((r) => !store.isDemo(r)).length, 0);
  }

  /* The first connection is the one moment where hydrating could destroy
     work: Supabase is empty, this browser isn't, and a plain pull would
     replace real records with nothing. Ask instead of guessing. */
  function firstConnectPrompt(localCount) {
    return new Promise((resolve) => {
      let answered = false;
      const done = (choice) => { if (!answered) { answered = true; resolve(choice); } };
      BAUGMENT.ui.modal({
        title: 'This device has data the database doesn\'t',
        body:
          '<p style="line-height:1.7;margin-bottom:14px">The Supabase project is connected and empty, but this ' +
          'browser holds <b>' + U.fmt.int(localCount) + '</b> record' + (localCount === 1 ? '' : 's') +
          ' you created here — pillars, campaigns, posts, ideas, imports.</p>' +
          '<p class="tiny mute" style="line-height:1.7;margin-bottom:14px">Loading the empty database over the top ' +
          'would replace them. Push them up instead and they become the shared starting point for every device.</p>' +
          '<p class="tiny mute" style="line-height:1.7">Either way a snapshot is kept, and you can restore it later ' +
          'from Settings → Connection.</p>',
        actions: [
          { label: 'Start empty instead', onClick: () => done('empty') },
          { label: 'Push this device\'s data up', variant: 'primary', onClick: () => done('push') }
        ],
        onClose: () => done('push')     /* the safe default if they dismiss it */
      });
    });
  }

  async function connectRemote() {
    bootScreen('Connecting to Supabase', 'Loading the shared database for Baugment');
    try {
      await BAUGMENT.remote.connect();
      bootScreen('Loading your data', 'Pulling records from the shared database');
      const data = await BAUGMENT.remote.pullAll();

      /* Always keep a copy of what this browser held before the first sync. */
      if (!BAUGMENT.persist.get('preSyncBackup', null)) {
        BAUGMENT.persist.set('preSyncBackup', { at: new Date().toISOString(), db: store.state() });
      }

      if (countRecords(data) === 0 && countLocalWork() > 0) {
        const choice = await firstConnectPrompt(countLocalWork());
        if (choice === 'push') {
          bootScreen('Sending your data up', 'Writing this device\'s records to Supabase');
          await BAUGMENT.remote.replaceAll(store.state(), {});
          store.useRemote(true);
          BAUGMENT.remote.subscribe(onRemoteChange);
          BAUGMENT.remote.onStatus(() => { if (document.getElementById('topbar')) paintTopbar(); });
          BAUGMENT.ui.toast('Your data is now shared', U.fmt.int(countLocalWork()) +
            ' records are in Supabase. Sign in on another device and they\'ll be there.', 'success', 8000);
          return true;
        }
      }

      store.useRemote(true);
      store.hydrate(data);
      BAUGMENT.remote.subscribe(onRemoteChange);
      BAUGMENT.remote.startRefresh(async () => {
        try { store.hydrate(await BAUGMENT.remote.pullAll()); softRender(); } catch (e) { /* retried next tick */ }
      });
      BAUGMENT.remote.onStatus(() => { const bar = document.getElementById('topbar'); if (bar) paintTopbar(); });
      BAUGMENT.remote.flush();
      return true;
    } catch (err) {
      /* Fall back to whatever is cached locally rather than showing nothing —
         but say so loudly, because edits made now won't reach anyone else. */
      store.load();
      store.useRemote(false);
      BAUGMENT.ui.toast('Working offline', BAUGMENT.remote.describe(err) +
        ' Your edits are saved on this device and will send when the connection is back.', 'warn', 9000);
      return false;
    }
  }

  async function boot() {
    session = await BAUGMENT.auth.requireSession('index.html');
    if (!session) return;

    store.load();
    applyTheme(store.state().settings.theme);
    watchModalClose();

    if (BAUGMENT.config.isConfigured()) await connectRemote();

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const search = document.getElementById('globalSearch');
        if (search) { search.focus(); search.select(); }
      }
    });

    window.addEventListener('hashchange', render);
    if (!window.location.hash) window.location.hash = '#/dashboard';
    render();
  }

  return { boot, render, softRender, go, applyTheme, filterBarHtml, paintTopbar,
    connectRemote, onRemoteChange, countRecords, countLocalWork, NAV };
})();
