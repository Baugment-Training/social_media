/* BAUGMENT — connection config
   ==========================================================================
   THIS FILE IS COMMITTED TO THE REPO ON PURPOSE.

   BAUGMENT is a static site. There's no server to read environment variables,
   so the connection details have to travel with the code — otherwise a second
   device wouldn't know where the database is and you'd be back to per-device
   data. Fill these two lines in, commit, push.

   Leave them empty and BAUGMENT runs in local-only mode: everything works,
   but the data lives in one browser and goes no further.

   PROJECT URL
     It's just your project ref as a subdomain:
         https://<project-id>.supabase.co
     The project id is on Settings → General ("Project ID"), and the full URL
     is also shown on Settings → Data API.

   KEY — Settings → API Keys
     Supabase is part-way through renaming these, so you may see either:
       • "Publishable key"  → sb_publishable_xxx   ← prefer this one
       • "anon" / "public"  → eyJhbGciOi...        ← legacy, on the
                                                     "Legacy API Keys" tab
     Both work identically here: low privilege, RLS still applies. The legacy
     anon key is being deprecated at the end of 2026, so use the publishable
     key on a new project.

   Either one is DESIGNED to be public — it identifies your project, it does
   not grant access. What grants access is Row Level Security, and the
   policies in supabase/schema.sql require a signed-in user for every read
   and every write. Run that file before you go live.

   NEVER put a `sb_secret_xxx` or `service_role` key here. Those bypass RLS
   entirely and would hand your database to anyone who opened DevTools.
   ========================================================================== */

window.BAUGMENT = window.BAUGMENT || {};

BAUGMENT.config = (function () {

  const SUPABASE_URL = 'https://lvvgjtpitngorrfszpsu.supabase.co/rest/v1/';        /* e.g. 'https://abcdefghijkl.supabase.co' */
  const SUPABASE_ANON_KEY = 'sb_publishable_PUmt0Nu79eilE7kLUIAl6g_zM3kNIV_';   /* e.g. 'sb_publishable_...' */

  /* Realtime keeps every open BAUGMENT tab in step. Turn it off if you'd
     rather poll, or if your Supabase plan's connection count is tight. */
  const REALTIME = true;

  /* How often to re-pull everything as a safety net, in seconds. 0 disables. */
  const REFRESH_SECONDS = 180;

  /* A device-local override, so you can point a single browser at a staging
     project from Settings → Connection without touching the repo. */
  function override() {
    return BAUGMENT.persist ? BAUGMENT.persist.get('connection', null) : null;
  }

  function url() { const o = override(); return (o && o.url) || SUPABASE_URL || ''; }
  function anonKey() { const o = override(); return (o && o.anonKey) || SUPABASE_ANON_KEY || ''; }
  function isOverridden() { const o = override(); return !!(o && o.url); }
  function inRepo() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); }

  function isConfigured() {
    return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url().replace(/\/$/, '')) && anonKey().length > 20;
  }

  function setOverride(u, k) {
    BAUGMENT.persist.set('connection', { url: (u || '').trim().replace(/\/$/, ''), anonKey: (k || '').trim() });
  }

  function clearOverride() { BAUGMENT.persist.remove('connection'); }

  /* The project ref is the subdomain — handy for showing which project a
     browser is pointed at without printing the whole key. */
  function projectRef() {
    const m = url().match(/^https:\/\/([a-z0-9-]+)\.supabase\./i);
    return m ? m[1] : '';
  }

  /* A secret key in a browser is the one mistake that actually matters here,
     so it gets checked in both formats — the new sb_secret_ prefix and the
     legacy service_role JWT, whose role is readable straight from the payload. */
  function looksLikeSecret(key) {
    const k = String(key || '').trim();
    if (/^sb_secret_/i.test(k)) return true;
    if (/service_role/i.test(k)) return true;
    const parts = k.split('.');
    if (parts.length === 3) {
      try {
        const body = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (body && body.role && body.role !== 'anon') return true;
      } catch (e) { /* not a JWT we can read; the prefix checks stand */ }
    }
    return false;
  }

  /* 'publishable' | 'legacy-anon' | 'secret' | 'unknown' */
  function keyKind(key) {
    const k = String(key == null ? anonKey() : key).trim();
    if (!k) return 'unknown';
    if (looksLikeSecret(k)) return 'secret';
    if (/^sb_publishable_/i.test(k)) return 'publishable';
    if (/^eyJ/.test(k)) return 'legacy-anon';
    return 'unknown';
  }

  return { url, anonKey, isConfigured, isOverridden, inRepo, setOverride, clearOverride, projectRef,
    looksLikeSecret, keyKind, REALTIME, REFRESH_SECONDS };
})();
