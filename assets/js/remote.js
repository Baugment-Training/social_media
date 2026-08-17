/* BAUGMENT — remote
   The Supabase adapter. Everything the app does stays synchronous against the
   in-memory store; this module keeps that store and Postgres in agreement.

   Shape of it:
     boot     → pullAll() fills the store from Postgres
     edit     → store mutates immediately, push() sends it up in the background
     realtime → a colleague's change patches the store and re-renders
     offline  → failed pushes queue and retry, so a dropped wifi loses nothing

   The views never learn any of this happened. */

BAUGMENT.remote = (function () {
  const U = BAUGMENT.util;

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  let client = null;
  let channel = null;
  let refreshTimer = null;
  let status = 'offline';        /* offline | connecting | ready | syncing | error */
  let lastSync = null;
  let lastError = null;
  const watchers = new Set();

  /* --- Table map ---------------------------------------------------------- */
  /* `cols` is a whitelist: anything not listed never leaves the browser, which
     is what keeps a stray local field from breaking an insert. `map` renames
     where the JS name and the SQL name differ — `start`/`end` are reserved
     words in Postgres, so they become starts_on/ends_on. */
  const TABLES = {
    accounts: { table: 'accounts', pk: 'id',
      cols: ['id', 'platform', 'handle', 'name', 'followers', 'source'] },

    pillars: { table: 'pillars', pk: 'id',
      cols: ['id', 'name', 'description', 'color', 'target_share', 'source'] },

    campaigns: { table: 'campaigns', pk: 'id',
      cols: ['id', 'name', 'objective', 'start', 'end', 'budget', 'platforms',
        'kpi_metric', 'kpi_target', 'status', 'owner', 'notes', 'source'],
      map: { start: 'starts_on', end: 'ends_on' } },

    analytics: { table: 'analytics', pk: 'id',
      cols: ['id', 'platform', 'account_id', 'account', 'post_id', 'post_url', 'caption',
        'media_type', 'content_type', 'status', 'published_date', 'published_time',
        'pillar_id', 'campaign_id', 'author', 'impressions', 'reach', 'views', 'video_views',
        'watch_time', 'avg_watch_time', 'likes', 'comments', 'shares', 'saves', 'reactions',
        'replies', 'bookmarks', 'link_clicks', 'profile_visits', 'followers_gained',
        'followers_lost', 'utm_source', 'utm_medium', 'utm_campaign', 'hashtags', 'mentions',
        'location', 'notes', 'custom', 'source', 'imported_at'] },

    planner: { table: 'planner', pk: 'id',
      cols: ['id', 'title', 'caption', 'platform', 'media_type', 'publish_date', 'publish_time',
        'objective', 'audience', 'cta', 'hashtags', 'keywords', 'thumbnail_id', 'owner', 'reviewer',
        'priority', 'status', 'pillar_id', 'campaign_id', 'notes', 'source'] },

    ideas: { table: 'ideas', pk: 'id',
      cols: ['id', 'title', 'notes', 'status', 'potential', 'origin', 'platform',
        'pillar_id', 'campaign_id', 'tags', 'source_url', 'owner', 'created_on',
        'updated_on', 'promoted_to', 'source'] },

    /* dataUrl is deliberately absent — base64 image blobs don't belong in a
       row, and pushing them would blow past the request size limit. */
    media: { table: 'media', pk: 'id',
      cols: ['id', 'name', 'kind', 'tags', 'category', 'size', 'width', 'height', 'hue',
        'uploaded', 'storage_path', 'source'] },

    customMetrics: { table: 'custom_metrics', pk: 'key',
      cols: ['key', 'label', 'agg', 'fmt'] },

    followerSnapshots: { table: 'follower_snapshots', pk: 'id',
      cols: ['id', 'account_id', 'captured_on', 'followers', 'note', 'source'] },

    importHistory: { table: 'import_history', pk: 'id',
      cols: ['id', 'at', 'file', 'format', 'total', 'added', 'replaced', 'skipped',
        'warnings', 'strategy'] }
  };

  const COLLECTIONS = Object.keys(TABLES);

  /* Empty strings become NULL for date columns — Postgres rejects '' as a date
     and the browser hands us '' whenever a date field was left blank. */
  const DATE_COLS = { published_date: 1, publish_date: 1, starts_on: 1, ends_on: 1, uploaded: 1,
    at: 1, imported_at: 1, captured_on: 1, created_on: 1, updated_on: 1 };

  function toRow(collection, rec) {
    const def = TABLES[collection];
    const row = {};
    def.cols.forEach((c) => {
      const target = (def.map && def.map[c]) || c;
      let v = rec[c];
      if (v === undefined) v = null;
      if (DATE_COLS[target] && (v === '' || v === undefined)) v = null;
      row[target] = v;
    });
    return row;
  }

  function fromRow(collection, row) {
    const def = TABLES[collection];
    const rec = {};
    def.cols.forEach((c) => {
      const source = (def.map && def.map[c]) || c;
      rec[c] = row[source] === null ? (typeof def.defaults === 'object' ? def.defaults[c] : null) : row[source];
    });
    /* Numeric columns come back as strings from PostgREST on some types. */
    if (collection === 'analytics') {
      BAUGMENT.exporter && null;
      rec.custom = rec.custom || {};
      Object.keys(rec).forEach((k) => {
        if (typeof rec[k] === 'string' && /^-?\d+(\.\d+)?$/.test(rec[k]) && k !== 'post_id' && k !== 'published_time') {
          const n = Number(rec[k]);
          if (!isNaN(n) && ['impressions', 'reach', 'views', 'video_views', 'watch_time', 'avg_watch_time',
            'likes', 'comments', 'shares', 'saves', 'reactions', 'replies', 'bookmarks', 'link_clicks',
            'profile_visits', 'followers_gained', 'followers_lost'].indexOf(k) !== -1) rec[k] = n;
        }
      });
    }
    if (collection === 'campaigns') {
      rec.platforms = Array.isArray(rec.platforms) ? rec.platforms : [];
      rec.budget = rec.budget == null ? null : Number(rec.budget);
      rec.kpi_target = Number(rec.kpi_target) || 0;
    }
    if (collection === 'pillars') rec.target_share = Number(rec.target_share) || 0;
    if (collection === 'accounts') rec.followers = Number(rec.followers) || 0;
    if (collection === 'media') rec.tags = Array.isArray(rec.tags) ? rec.tags : [];
    if (collection === 'ideas') rec.tags = Array.isArray(rec.tags) ? rec.tags : [];
    if (collection === 'followerSnapshots') rec.followers = Number(rec.followers) || 0;
    return rec;
  }

  /* --- Status ------------------------------------------------------------- */

  function setStatus(next, err) {
    status = next;
    lastError = err || null;
    if (next === 'ready') lastSync = Date.now();
    watchers.forEach((fn) => { try { fn(state()); } catch (e) { /* a watcher must never break sync */ } });
  }

  function state() {
    return { status, lastSync, lastError, queued: queue().length, configured: BAUGMENT.config.isConfigured() };
  }

  function onStatus(fn) { watchers.add(fn); return () => watchers.delete(fn); }

  /* --- SDK loading -------------------------------------------------------- */

  let sdkPromise = null;
  function loadSDK() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.onload = () => (window.supabase && window.supabase.createClient)
        ? resolve(window.supabase)
        : reject(new Error('The Supabase library loaded but looks wrong.'));
      s.onerror = () => reject(new Error('Couldn\'t reach the Supabase library. Check your connection.'));
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  async function connect() {
    if (client) return client;
    if (!BAUGMENT.config.isConfigured()) throw new Error('No Supabase project is configured.');
    setStatus('connecting');
    const sdk = await loadSDK();
    client = sdk.createClient(BAUGMENT.config.url(), BAUGMENT.config.anonKey(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
        storageKey: 'baugment.supabase.auth' },
      realtime: { params: { eventsPerSecond: 4 } }
    });
    return client;
  }

  function raw() { return client; }
  const configured = () => BAUGMENT.config.isConfigured();
  const isLive = () => !!client && status !== 'offline';

  /* --- Reading ------------------------------------------------------------ */

  /* PostgREST caps a response at 1000 rows by default, so page through. */
  async function fetchAll(collection) {
    const def = TABLES[collection];
    const PAGE = 1000;
    let from = 0, out = [];
    for (;;) {
      const { data, error } = await client.from(def.table).select('*').range(from, from + PAGE - 1);
      if (error) throw error;
      out = out.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
      if (from > 200000) break;              /* a sanity stop, not a real limit */
    }
    return out.map((r) => fromRow(collection, r));
  }

  async function pullAll() {
    setStatus('syncing');
    try {
      const result = {};
      for (const c of COLLECTIONS) result[c] = await fetchAll(c);

      const { data: settingsRow, error: sErr } = await client
        .from('app_settings').select('data').eq('id', 'app').maybeSingle();
      if (sErr) throw sErr;
      result.settings = (settingsRow && settingsRow.data) || {};

      setStatus('ready');
      return result;
    } catch (err) {
      setStatus('error', describe(err));
      throw err;
    }
  }

  /* --- Writing ------------------------------------------------------------ */

  const QUEUE_KEY = 'pushQueue';
  const queue = () => BAUGMENT.persist.get(QUEUE_KEY, []);
  const setQueue = (q) => BAUGMENT.persist.set(QUEUE_KEY, q.slice(-500));

  function enqueue(job) {
    const q = queue();
    /* Collapse repeated edits to the same record — only the last one matters. */
    const key = job.collection + '|' + job.op + '|' + (job.id || (job.record && job.record[TABLES[job.collection] ? TABLES[job.collection].pk : 'id']));
    const filtered = q.filter((j) => j.key !== key);
    filtered.push(Object.assign({ key, at: Date.now() }, job));
    setQueue(filtered);
    watchers.forEach((fn) => fn(state()));
  }

  async function runJob(job) {
    if (job.collection === 'settings') {
      const { error } = await client.from('app_settings')
        .upsert({ id: 'app', data: job.record }, { onConflict: 'id' });
      if (error) throw error;
      return;
    }
    const def = TABLES[job.collection];
    if (!def) return;
    if (job.op === 'delete') {
      const { error } = await client.from(def.table).delete().eq(def.pk, job.id);
      if (error) throw error;
      return;
    }
    if (job.op === 'deleteMany') {
      if (!job.ids || !job.ids.length) return;
      for (let i = 0; i < job.ids.length; i += 200) {
        const { error } = await client.from(def.table).delete().in(def.pk, job.ids.slice(i, i + 200));
        if (error) throw error;
      }
      return;
    }
    const records = job.records || [job.record];
    const rows = records.map((r) => toRow(job.collection, r));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await client.from(def.table)
        .upsert(rows.slice(i, i + 500), { onConflict: def.pk });
      if (error) throw error;
    }
  }

  let flushing = false;
  async function flush() {
    if (flushing || !client || !queue().length) return;
    flushing = true;
    setStatus('syncing');
    try {
      let q = queue();
      while (q.length) {
        const job = q[0];
        await runJob(job);
        q = queue().filter((j) => j.key !== job.key || j.at !== job.at);
        setQueue(q);
      }
      setStatus('ready');
    } catch (err) {
      setStatus('error', describe(err));
    } finally {
      flushing = false;
    }
  }

  /* Fire-and-forget from the caller's point of view — the store never waits. */
  function push(collection, op, payload) {
    if (!configured()) return;
    enqueue(Object.assign({ collection, op }, payload));
    flush();
  }

  function describe(err) {
    if (!err) return 'Unknown error';
    const msg = err.message || String(err);
    if (/JWT|token|not authenticated|401/i.test(msg)) return 'Your session expired. Sign in again.';
    if (/row-level security|violates row-level/i.test(msg)) return 'The database refused the write. Check the RLS policies in schema.sql.';
    if (/relation .* does not exist|42P01/i.test(msg)) return 'A table is missing. Run supabase/schema.sql in the SQL editor.';
    if (/column .* does not exist|42703/i.test(msg)) return 'A column is missing. Re-run supabase/schema.sql — it may be an older version.';
    if (/Failed to fetch|NetworkError|ERR_/i.test(msg)) return 'No connection to Supabase. Changes are queued and will send when you\'re back.';
    return msg;
  }

  /* --- Bulk operations ----------------------------------------------------- */

  /* Sends everything in the local store up. Used by the migration button and
     by "reset to demo data" while connected. */
  async function replaceAll(db, opts) {
    opts = opts || {};
    setStatus('syncing');
    try {
      for (const c of COLLECTIONS) {
        const def = TABLES[c];
        if (opts.wipe) {
          const { error } = await client.from(def.table).delete().neq(def.pk, '\u0000__never__');
          if (error) throw error;
        }
        const list = db[c] || [];
        if (!list.length) continue;
        const rows = list.map((r) => toRow(c, r));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await client.from(def.table)
            .upsert(rows.slice(i, i + 500), { onConflict: def.pk });
          if (error) throw error;
          if (opts.onProgress) opts.onProgress(c, Math.min(rows.length, i + 500), rows.length);
        }
      }
      const { error } = await client.from('app_settings')
        .upsert({ id: 'app', data: db.settings || {} }, { onConflict: 'id' });
      if (error) throw error;
      setStatus('ready');
      return true;
    } catch (err) {
      setStatus('error', describe(err));
      throw err;
    }
  }

  async function counts() {
    const out = {};
    for (const c of COLLECTIONS) {
      const { count, error } = await client.from(TABLES[c].table)
        .select('*', { count: 'exact', head: true });
      out[c] = error ? null : count;
    }
    return out;
  }

  /* --- Realtime ------------------------------------------------------------ */

  function subscribe(onChange) {
    if (!client || !BAUGMENT.config.REALTIME) return;
    if (channel) { client.removeChannel(channel); channel = null; }

    channel = client.channel('baugment-sync');
    COLLECTIONS.forEach((c) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: TABLES[c].table }, (payload) => {
        try {
          if (payload.eventType === 'DELETE') {
            const id = payload.old && payload.old[TABLES[c].pk];
            if (id) onChange(c, 'delete', { id });
          } else {
            onChange(c, 'upsert', fromRow(c, payload.new));
          }
        } catch (e) { /* one malformed event must not kill the channel */ }
      });
    });
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
      if (payload.new && payload.new.data) onChange('settings', 'upsert', payload.new.data);
    });

    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') setStatus('ready');
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('error', 'Live updates dropped. Reconnecting…');
    });
  }

  function startRefresh(fn) {
    if (refreshTimer) clearInterval(refreshTimer);
    const secs = BAUGMENT.config.REFRESH_SECONDS;
    if (!secs) return;
    refreshTimer = setInterval(() => {
      if (document.hidden) return;
      flush();
      fn();
    }, secs * 1000);
  }

  function teardown() {
    if (channel && client) client.removeChannel(channel);
    channel = null;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    setStatus('offline');
  }

  /* --- Diagnostics --------------------------------------------------------- */

  /* Used by Settings → Connection to tell "wrong key" apart from "no tables"
     apart from "RLS is off and your data is public". */
  async function diagnose() {
    const out = { reachable: false, authenticated: false, tables: {}, rlsWarning: false, message: '' };
    try {
      await connect();
      out.reachable = true;
      const { data: sess } = await client.auth.getSession();
      out.authenticated = !!(sess && sess.session);
      for (const c of COLLECTIONS.concat(['settings'])) {
        const table = c === 'settings' ? 'app_settings' : TABLES[c].table;
        const { error, count } = await client.from(table).select('*', { count: 'exact', head: true });
        out.tables[table] = error ? { ok: false, error: error.message } : { ok: true, count };
      }
      /* An anonymous client that can still read rows means RLS isn't doing its
         job — worth shouting about, because the site is public. */
      if (!out.authenticated && Object.keys(out.tables).some((t) => out.tables[t].ok && out.tables[t].count > 0)) {
        out.rlsWarning = true;
      }
    } catch (err) {
      out.message = describe(err);
    }
    return out;
  }

  return {
    connect, raw, configured, isLive, state, onStatus, setStatus,
    pullAll, fetchAll, push, flush, queue, replaceAll, counts,
    subscribe, startRefresh, teardown, diagnose, describe,
    TABLES, COLLECTIONS, toRow, fromRow
  };
})();
