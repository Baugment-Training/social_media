/* BAUGMENT — media files
   ==========================================================================
   Media *records* live in Postgres like everything else. Media *bytes* can't:
   a base64 image in a table row blows past the request size limit, and a
   handful of them would blow past the browser's 5 MB localStorage quota too.
   So the bytes get their own two-tier home:

     IndexedDB   — a per-device cache. Survives refresh, works offline, has
                   no practical size limit. This is what the thumbnail reads
                   first, so previews paint instantly and without a network.

     Supabase    — a Storage bucket, so a file uploaded on the office PC is
      Storage      there on the laptop. The row's `storage_path` column is the
                   pointer; the column has existed since the first schema and
                   this module is what finally fills it in.

   Order of resolution when a thumbnail is needed:
     local blob → signed URL from Storage (and warm the local cache) → nothing.

   "Nothing" is a real state, not a bug: seeded demo records never had a file,
   and any record uploaded before this module existed lost its bytes on the
   first refresh. Both are shown honestly rather than papered over.
   ========================================================================== */

BAUGMENT.mediaFiles = (function () {

  const DB_NAME = 'baugment-media';
  const STORE = 'files';
  const BUCKET = 'baugment-media';
  const SIGNED_TTL = 3600;                 /* seconds */
  const MAX_BYTES = 25 * 1024 * 1024;      /* refuse politely above this */

  /* --- IndexedDB ----------------------------------------------------------- */

  let dbPromise = null;

  function idb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('This browser has no IndexedDB.')); return; }
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB is blocked in this browser.'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked in this browser.'));
    });
    return dbPromise;
  }

  /* Every cache call is best-effort: private mode and locked-down browsers
     block IndexedDB, and a missing cache should degrade to a network fetch,
     never to a broken page. */
  function withStore(mode, fn) {
    return idb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const cacheGet = (id) => withStore('readonly', (s) => s.get(id)).catch(() => null);
  const cachePut = (id, blob, name) =>
    withStore('readwrite', (s) => s.put({ id, blob, type: blob.type || '', name: name || '', at: Date.now() }))
      .catch(() => null);
  const cacheDel = (id) => withStore('readwrite', (s) => s.delete(id)).catch(() => null);
  const cacheKeys = () => withStore('readonly', (s) => s.getAllKeys()).catch(() => []);

  async function cacheSize() {
    try {
      const all = await withStore('readonly', (s) => s.getAll());
      return (all || []).reduce((a, r) => a + ((r.blob && r.blob.size) || 0), 0);
    } catch (e) { return 0; }
  }

  /* --- Object URLs --------------------------------------------------------- */
  /* One URL per record per session. Revoked only when the bytes change, so a
     re-render doesn't leak a new URL every time. */

  const urls = new Map();

  function objectUrl(id, blob) {
    if (urls.has(id)) return urls.get(id);
    const u = URL.createObjectURL(blob);
    urls.set(id, u);
    return u;
  }

  function forget(id) {
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  }

  /* --- Supabase Storage ---------------------------------------------------- */

  async function client() {
    if (!BAUGMENT.config.isConfigured()) return null;
    try { return await BAUGMENT.remote.connect(); } catch (e) { return null; }
  }

  const shared = () => BAUGMENT.config.isConfigured();

  function extOf(name) {
    const m = String(name || '').match(/\.([a-z0-9]{1,6})$/i);
    return m ? '.' + m[1].toLowerCase() : '';
  }

  /* Stores the bytes locally, then pushes them up if a project is connected.
     Returns the storage path to write onto the record, or null when the file
     only made it as far as this device. */
  async function upload(record, file) {
    if (file.size > MAX_BYTES) {
      throw new Error(file.name + ' is ' + (file.size / 1048576).toFixed(1) +
        ' MB. The limit is ' + (MAX_BYTES / 1048576) + ' MB per file.');
    }

    forget(record.id);
    await cachePut(record.id, file, record.name || file.name);

    const c = await client();
    if (!c) return null;

    const path = record.id + extOf(record.name || file.name);
    const { error } = await c.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600'
    });
    if (error) throw describeStorage(error);
    return path;
  }

  /* The URL a thumbnail should use, or null if this record has no bytes
     anywhere. Never throws — callers render a fallback on null. */
  async function url(record) {
    if (!record) return null;

    /* Uploaded in this same session, before any of the below ran. */
    if (record.dataUrl) return record.dataUrl;

    const hit = await cacheGet(record.id);
    if (hit && hit.blob) return objectUrl(record.id, hit.blob);

    if (!record.storage_path) return null;
    const c = await client();
    if (!c) return null;

    try {
      const { data, error } = await c.storage.from(BUCKET)
        .createSignedUrl(record.storage_path, SIGNED_TTL);
      if (error || !data || !data.signedUrl) return null;

      /* Warm the local cache in the background so the next refresh is instant
         and works with the wifi off. A failure here changes nothing. */
      fetch(data.signedUrl)
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => { if (b) cachePut(record.id, b, record.name); })
        .catch(() => {});

      return data.signedUrl;
    } catch (e) { return null; }
  }

  /* True when the record has bytes somewhere we can reach. Used to tell a
     decorative demo tile apart from a file that genuinely went missing. */
  async function has(record) {
    if (!record) return false;
    if (record.dataUrl) return true;
    const hit = await cacheGet(record.id);
    if (hit && hit.blob) return true;
    return !!record.storage_path;
  }

  async function remove(record) {
    if (!record) return;
    forget(record.id);
    await cacheDel(record.id);
    if (!record.storage_path) return;
    const c = await client();
    if (!c) return;
    try { await c.storage.from(BUCKET).remove([record.storage_path]); } catch (e) { /* the row is gone either way */ }
  }

  /* Storage errors are worth translating — "Bucket not found" is the one
     everybody hits, and the fix is a single SQL file. */
  function describeStorage(err) {
    const msg = (err && (err.message || err.error)) || String(err);
    if (/bucket not found/i.test(msg)) {
      return new Error('The "' + BUCKET + '" storage bucket does not exist yet. ' +
        'Run supabase/media-storage.sql in the Supabase SQL editor once, then try again.');
    }
    if (/row-level security|not authorized|403/i.test(msg)) {
      return new Error('Supabase Storage refused the upload. Run supabase/media-storage.sql — ' +
        'it creates the bucket policies that allow signed-in users to write.');
    }
    if (/payload too large|413/i.test(msg)) return new Error('That file is larger than the bucket allows.');
    return new Error(msg);
  }

  return { upload, url, has, remove, forget, cacheKeys, cacheSize, BUCKET, MAX_BYTES, shared };
})();
