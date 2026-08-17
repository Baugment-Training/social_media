/* BAUGMENT — store
   Single source of truth. Everything the views render comes from here, and
   every mutation goes back through here so persistence and re-render stay in
   one place. */

BAUGMENT.store = (function () {
  const U = BAUGMENT.util;
  const S = BAUGMENT.schema;
  const KEY = 'db';

  let db = null;
  let remoteMode = false;
  const listeners = new Set();

  /* In remote mode the store still mutates synchronously — every write also
     gets handed to BAUGMENT.remote, which sends it up in the background. */
  function useRemote(on) { remoteMode = !!on; }
  const isRemote = () => remoteMode;

  function push(collection, op, payload) {
    if (remoteMode && BAUGMENT.remote) BAUGMENT.remote.push(collection, op, payload);
  }

  /* Replaces the working set with what came back from Postgres. Settings are
     merged rather than replaced so a new local default survives an old row. */
  function hydrate(remoteData) {
    db = db || BAUGMENT.seed.build();
    Object.keys(remoteData).forEach((k) => {
      if (k === 'settings') db.settings = Object.assign({}, db.settings, remoteData[k]);
      else db[k] = remoteData[k];
    });
    db.customMetrics = db.customMetrics || [];
    db.importHistory = db.importHistory || [];
    db.media = db.media || [];
    db.ideas = db.ideas || [];
    db.followerSnapshots = db.followerSnapshots || [];
    save();
    emit();
    return db;
  }

  /* A change that arrived from another device. Applied without pushing back. */
  function applyRemote(collection, op, payload) {
    if (collection === 'settings') {
      db.settings = Object.assign({}, db.settings, payload);
      save();
      return true;
    }
    const list = db[collection];
    if (!list) return false;
    const pk = collection === 'customMetrics' ? 'key' : 'id';
    if (op === 'delete') {
      const i = list.findIndex((x) => x[pk] === payload.id);
      if (i === -1) return false;
      list.splice(i, 1);
    } else {
      const i = list.findIndex((x) => x[pk] === payload[pk]);
      if (i === -1) list.unshift(payload);
      else {
        /* Don't clobber a local-only field (media dataUrl) with a null. */
        const merged = Object.assign({}, list[i]);
        Object.keys(payload).forEach((k) => { if (payload[k] !== null || list[i][k] == null) merged[k] = payload[k]; });
        list[i] = merged;
      }
    }
    save();
    return true;
  }

  /* Global filter state — shared by every analytics surface. */
  let filters = {
    platform: 'all',
    range: '90',
    from: null,
    to: null,
    campaign: 'all',
    pillar: 'all',
    mediaType: 'all',
    contentType: 'all',
    author: 'all',
    status: 'all',
    q: ''
  };

  /* --- Lifecycle ---------------------------------------------------------- */

  function load() {
    db = BAUGMENT.persist.get(KEY, null);
    if (!db || !db.analytics) {
      db = BAUGMENT.seed.build();
      save();
    }
    /* Forward-compatible defaults for stores written by an older build. */
    db.customMetrics = db.customMetrics || [];
    db.importHistory = db.importHistory || [];
    db.media = db.media || [];
    db.ideas = db.ideas || [];
    db.followerSnapshots = db.followerSnapshots || [];
    db.settings = Object.assign({
      theme: 'dark', language: 'en', timezone: 'Asia/Jakarta', dateFormat: 'DD MMM YYYY',
      defaultPlatform: 'all', exportDelimiter: ',', exportIncludeDerived: true,
      duplicateStrategy: 'skip', livePlatforms: ['linkedin', 'instagram', 'youtube', 'tiktok']
    }, db.settings || {});
    return db;
  }

  function save() {
    const ok = BAUGMENT.persist.set(KEY, db);
    if (!ok && !save.__warned) {
      save.__warned = true;
      BAUGMENT.ui.toast('Changes are session-only', 'This browser is blocking local storage, so edits will disappear on reload.', 'warn', 7000);
    }
  }

  function reset() {
    db = BAUGMENT.seed.build();
    save();
    emit();
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { listeners.forEach((fn) => fn(db)); }
  function commit() { save(); emit(); }

  const state = () => db;

  /* --- Lookups ------------------------------------------------------------ */

  const pillar = (id) => db.pillars.find((p) => p.id === id) || null;
  const campaign = (id) => db.campaigns.find((c) => c.id === id) || null;
  const account = (id) => db.accounts.find((a) => a.id === id) || null;
  const media = (id) => db.media.find((m) => m.id === id) || null;
  const idea = (id) => db.ideas.find((x) => x.id === id) || null;
  const pillarName = (id) => (pillar(id) || {}).name || '—';
  const campaignName = (id) => (campaign(id) || {}).name || '—';

  function livePlatforms() {
    const live = db.settings.livePlatforms || [];
    return S.PLATFORMS.filter((p) => live.indexOf(p.id) !== -1);
  }

  function authors() {
    const set = new Set();
    db.analytics.forEach((r) => r.author && set.add(r.author));
    db.planner.forEach((r) => r.owner && set.add(r.owner));
    (db.ideas || []).forEach((r) => r.owner && set.add(r.owner));
    return Array.from(set).sort();
  }

  function allMetrics() {
    return S.METRICS.concat(db.customMetrics.map((m) => ({
      key: m.key, label: m.label, group: 'custom', agg: m.agg || 'sum', fmt: m.fmt || 'int', custom: true
    })));
  }

  function metricLabel(key) {
    const m = allMetrics().find((x) => x.key === key);
    return m ? m.label : key;
  }

  function formatMetric(key, v) {
    const m = allMetrics().find((x) => x.key === key);
    if (!m) return U.fmt.int(v);
    if (m.fmt === 'pct') return U.fmt.pct(v);
    if (m.fmt === 'duration') return U.fmt.duration(v);
    if (m.fmt === 'currency') return U.fmt.idr(v);
    return U.fmt.int(v);
  }

  /* --- Filters ------------------------------------------------------------ */

  function getFilters() { return Object.assign({}, filters); }

  function setFilters(patch) {
    Object.assign(filters, patch);
    if (patch.range && patch.range !== 'custom') { filters.from = null; filters.to = null; }
    emit();
  }

  function resetFilters() {
    filters = { platform: 'all', range: '90', from: null, to: null, campaign: 'all', pillar: 'all',
      mediaType: 'all', contentType: 'all', author: 'all', status: 'all', q: '' };
    emit();
  }

  /* Resolves the active filter into a concrete { from, to } pair of ISO dates. */
  function dateWindow(f) {
    f = f || filters;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (f.range === 'custom' && f.from && f.to) return { from: f.from, to: f.to };
    if (f.range === 'all') return { from: '0000-01-01', to: '9999-12-31' };
    if (f.range === 'mtd') return { from: U.iso(U.startOfMonth(today)), to: U.iso(today) };
    if (f.range === 'qtd') {
      const q = U.quarterOf(today);
      return { from: U.iso(new Date(today.getFullYear(), (q - 1) * 3, 1)), to: U.iso(today) };
    }
    if (f.range === 'ytd') return { from: U.iso(new Date(today.getFullYear(), 0, 1)), to: U.iso(today) };
    const days = parseInt(f.range, 10) || 90;
    return { from: U.iso(U.addDays(today, -(days - 1))), to: U.iso(today) };
  }

  /* Same window, shifted back by its own length — for period-on-period deltas. */
  function previousWindow(f) {
    const w = dateWindow(f);
    const from = U.parse(w.from), to = U.parse(w.to);
    if (!from || !to) return w;
    const span = Math.round((to - from) / 86400000) + 1;
    return { from: U.iso(U.addDays(from, -span)), to: U.iso(U.addDays(from, -1)) };
  }

  function matches(r, f, window) {
    if (window && (r.published_date < window.from || r.published_date > window.to)) return false;
    if (f.platform !== 'all' && r.platform !== f.platform) return false;
    if (f.campaign !== 'all' && r.campaign_id !== f.campaign) return false;
    if (f.pillar !== 'all' && r.pillar_id !== f.pillar) return false;
    if (f.mediaType !== 'all' && r.media_type !== f.mediaType) return false;
    if (f.contentType !== 'all' && r.content_type !== f.contentType) return false;
    if (f.author !== 'all' && r.author !== f.author) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = (r.caption + ' ' + r.hashtags + ' ' + r.account + ' ' + r.post_id + ' ' +
        pillarName(r.pillar_id) + ' ' + (r.campaign_id ? campaignName(r.campaign_id) : '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* The filtered analytics set every dashboard reads. */
  function rows(overrides) {
    const f = Object.assign({}, filters, overrides || {});
    const w = dateWindow(f);
    return db.analytics.filter((r) => matches(r, f, w));
  }

  function previousRows(overrides) {
    const f = Object.assign({}, filters, overrides || {});
    const w = previousWindow(f);
    return db.analytics.filter((r) => matches(r, f, w));
  }

  /* --- Aggregation -------------------------------------------------------- */

  function totals(rowset) {
    const rs = rowset || rows();
    const t = { posts: rs.length };
    allMetrics().forEach((m) => { t[m.key] = S.rollup(rs, m.key); });
    return t;
  }

  function delta(current, previous) {
    if (!previous) return current ? 100 : null;
    return ((current - previous) / previous) * 100;
  }

  /* Bucket rows onto a time axis. grain: day | week | month */
  function series(rowset, metric, grain) {
    const buckets = new Map();
    rowset.forEach((r) => {
      const d = U.parse(r.published_date);
      if (!d) return;
      let key, label;
      if (grain === 'month') { key = r.published_date.slice(0, 7); label = U.MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2); }
      else if (grain === 'week') { const s = U.startOfWeek(d); key = U.iso(s); label = d.getDate() + ' ' + U.MONTHS[d.getMonth()]; }
      else { key = r.published_date; label = d.getDate() + ' ' + U.MONTHS[d.getMonth()]; }
      if (!buckets.has(key)) buckets.set(key, { key, label, rows: [] });
      buckets.get(key).rows.push(r);
    });
    const sorted = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
    return {
      labels: sorted.map((b) => b.label),
      values: sorted.map((b) => S.rollup(b.rows, metric)),
      buckets: sorted
    };
  }

  /* Picks a sensible bucket size for the current window. */
  function grainFor(rowset) {
    const w = dateWindow();
    const from = U.parse(w.from), to = U.parse(w.to);
    let span = from && to ? Math.round((to - from) / 86400000) : 90;
    if (w.from === '0000-01-01' && rowset && rowset.length) {
      const dates = rowset.map((r) => r.published_date).sort();
      span = Math.round((U.parse(dates[dates.length - 1]) - U.parse(dates[0])) / 86400000) || 90;
    }
    return span > 200 ? 'month' : span > 60 ? 'week' : 'day';
  }

  /* --- Writes ------------------------------------------------------------- */

  function upsert(collection, record) {
    const list = db[collection];
    const i = list.findIndex((x) => x.id === record.id);
    const merged = i === -1 ? record : Object.assign({}, list[i], record);
    if (i === -1) list.unshift(record); else list[i] = merged;
    commit();
    push(collection, 'upsert', { record: merged });
    return record;
  }

  function remove(collection, id) {
    const list = db[collection];
    const i = list.findIndex((x) => x.id === id);
    if (i !== -1) {
      list.splice(i, 1);
      commit();
      push(collection, 'delete', { id });
      return true;
    }
    return false;
  }

  function addAnalytics(records) {
    db.analytics = records.concat(db.analytics);
    commit();
    push('analytics', 'upsert', { records });
  }

  function addCustomMetric(def) {
    if (db.customMetrics.some((m) => m.key === def.key)) return false;
    db.customMetrics.push(def);
    commit();
    push('customMetrics', 'upsert', { record: def });
    return true;
  }

  function removeCustomMetric(key) {
    const i = db.customMetrics.findIndex((m) => m.key === key);
    if (i === -1) return false;
    db.customMetrics.splice(i, 1);
    commit();
    push('customMetrics', 'delete', { id: key });
    return true;
  }

  function logImport(entry) {
    db.importHistory.unshift(entry);
    db.importHistory = db.importHistory.slice(0, 60);
    commit();
    push('importHistory', 'upsert', { record: entry });
  }

  function updateSettings(patch) {
    Object.assign(db.settings, patch);
    commit();
    push('settings', 'upsert', { record: db.settings });
  }

  /* --- Followers ----------------------------------------------------------- */
  /* accounts.followers is the current number; snapshots are the dated readings
     behind it. One reading per account per day — re-entering corrects it. */

  function snapshotsFor(accountId) {
    return db.followerSnapshots
      .filter((s) => s.account_id === accountId)
      .sort((a, b) => (a.captured_on < b.captured_on ? -1 : 1));
  }

  function setFollowers(accountId, count, onDate, note) {
    const acc = account(accountId);
    if (!acc) return null;
    const day = onDate || U.iso(new Date());
    const value = Math.max(0, Number(count) || 0);

    const existing = db.followerSnapshots.find((s) => s.account_id === accountId && s.captured_on === day);
    const snap = existing
      ? Object.assign({}, existing, { followers: value, note: note || existing.note || '' })
      : { id: U.uid('fs'), account_id: accountId, captured_on: day, followers: value, note: note || '', source: 'manual' };

    if (existing) db.followerSnapshots[db.followerSnapshots.indexOf(existing)] = snap;
    else db.followerSnapshots.push(snap);
    push('followerSnapshots', 'upsert', { record: snap });

    /* Only the newest reading defines "current" — back-filling an old date
       shouldn't rewrite today's number. */
    const latest = snapshotsFor(accountId).slice(-1)[0];
    if (latest && latest.captured_on === day) upsert('accounts', Object.assign({}, acc, { followers: value }));
    else commit();
    return snap;
  }

  function removeFollowerSnapshot(id) { return remove('followerSnapshots', id); }

  /* Follower change over a window, measured from readings. Returns null when
     there isn't enough history, so callers can fall back to post-level data. */
  function followerGrowth(days) {
    const cutoff = U.iso(U.addDays(new Date(), -days));
    let now = 0, then = 0, usable = false;
    db.accounts.forEach((a) => {
      const list = snapshotsFor(a.id);
      if (!list.length) return;
      const latest = list[list.length - 1];
      const before = list.filter((s) => s.captured_on <= cutoff).slice(-1)[0];
      now += latest.followers;
      if (before) { then += before.followers; usable = true; }
      else then += latest.followers;
    });
    if (!usable) return null;
    return { now, then, change: now - then, pct: then ? ((now - then) / then) * 100 : null };
  }

  function totalFollowers() {
    return db.accounts.reduce((a, x) => a + (Number(x.followers) || 0), 0);
  }

  /* Replaces an analytics row in place — used by the importer's "replace
     duplicates" path, which previously wrote straight into the array. */
  function replaceAnalytics(id, record) {
    const i = db.analytics.findIndex((x) => x.id === id);
    if (i === -1) return false;
    db.analytics[i] = Object.assign({}, record, { id });
    push('analytics', 'upsert', { record: db.analytics[i] });
    return true;
  }

  /* --- Demo data ---------------------------------------------------------- */
  /* Seeded records carry source:'seed'. Stores written before that tag existed
     are still recognised by their id shape — the seed numbers sequentially
     (ana_1, pil_20) while anything created since uses a random suffix. */
  const SEED_ID = /^(ana|plan|cmp|pil|med|idea)_\d+$/;
  const DEMO_COLLECTIONS = ['analytics', 'planner', 'ideas', 'campaigns', 'pillars', 'media', 'followerSnapshots'];

  function isDemo(rec) {
    return rec.source === 'seed' || SEED_ID.test(rec.id || '');
  }

  /* Per collection: how many rows are demo, and how many exist in total. */
  function demoCounts() {
    const out = { total: 0, demoTotal: 0 };
    DEMO_COLLECTIONS.forEach((c) => {
      const list = db[c] || [];
      const demo = list.filter(isDemo).length;
      out[c] = { total: list.length, demo, real: list.length - demo };
      out.total += list.length;
      out.demoTotal += demo;
    });
    return out;
  }

  function hasDemoData() { return demoCounts().demoTotal > 0; }

  /* mode 'demo' removes only seeded rows; 'all' empties the collection. */
  function clearData(collections, mode) {
    const removed = {};
    (collections || []).forEach((c) => {
      if (DEMO_COLLECTIONS.indexOf(c) === -1) return;
      const before = db[c].length;
      const goners = (mode === 'all' ? db[c] : db[c].filter(isDemo)).map((r) => r.id);
      db[c] = mode === 'all' ? [] : db[c].filter((r) => !isDemo(r));
      removed[c] = before - db[c].length;
      if (goners.length) push(c, 'deleteMany', { ids: goners });
    });
    /* Import history describes runs, not records — drop it only on a full wipe. */
    if (mode === 'all' && collections.indexOf('analytics') !== -1) db.importHistory = [];
    commit();
    return removed;
  }


  /* Duplicate identity: same platform + post id, or same platform + date + caption. */
  function fingerprint(r) {
    return r.post_id
      ? r.platform + '|' + String(r.post_id).trim().toLowerCase()
      : r.platform + '|' + r.published_date + '|' + String(r.caption || '').slice(0, 60).toLowerCase();
  }

  function fingerprintIndex() {
    const m = new Map();
    db.analytics.forEach((r) => m.set(fingerprint(r), r.id));
    return m;
  }

  return {
    load, save, reset, subscribe, emit, commit, state,
    pillar, campaign, account, media, idea, pillarName, campaignName, livePlatforms, authors,
    allMetrics, metricLabel, formatMetric,
    getFilters, setFilters, resetFilters, dateWindow, previousWindow, rows, previousRows, matches,
    totals, delta, series, grainFor,
    upsert, remove, addAnalytics, addCustomMetric, removeCustomMetric, logImport,
    updateSettings, replaceAnalytics,
    fingerprint, fingerprintIndex,
    snapshotsFor, setFollowers, removeFollowerSnapshot, followerGrowth, totalFollowers,
    isDemo, demoCounts, hasDemoData, clearData, DEMO_COLLECTIONS,
    useRemote, isRemote, hydrate, applyRemote
  };
})();
