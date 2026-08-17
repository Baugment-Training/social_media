/* BAUGMENT — authentication

   Scope note, stated plainly because it matters: BAUGMENT ships as a static
   front end with no server, so this gate is an access control for a shared
   internal screen, not a security boundary. Credentials live in this browser.
   Anyone with the device and developer tools can read them. If BAUGMENT ever
   holds data that needs protecting, move verification behind a real API —
   the interfaces below are shaped so only `verify` and `setPassword` change.

   The user table is a list from the start so adding a second account later is
   a data change rather than a rewrite. */

BAUGMENT.auth = (function () {
  const U = BAUGMENT.util;
  const USERS_KEY = 'users';
  const SESSION_KEY = 'session';

  const DEFAULT_USER = {
    id: 'usr_admin',
    username: 'admin',
    displayName: 'Baugment Admin',
    role: 'owner',
    createdAt: new Date().toISOString(),
    /* Set on first run from the documented starting password. */
    salt: null,
    hash: null,
    mustChange: false
  };

  const FIRST_RUN_PASSWORD = 'beandaugment';

  function randomSalt() {
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /* SHA-256 where the browser offers it (https and localhost), with a clearly
     weaker fallback for insecure contexts like opening the file directly. */
  async function digest(password, salt) {
    const material = salt + ':' + password + ':baugment';
    if (window.crypto && window.crypto.subtle && window.isSecureContext) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
      return 'sha256$' + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < material.length; i++) {
      const c = material.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
    }
    return 'weak$' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  async function users() {
    let list = BAUGMENT.persist.get(USERS_KEY, null);
    if (!list || !list.length) {
      const u = Object.assign({}, DEFAULT_USER);
      u.salt = randomSalt();
      u.hash = await digest(FIRST_RUN_PASSWORD, u.salt);
      list = [u];
      BAUGMENT.persist.set(USERS_KEY, list);
    }
    return list;
  }

  function saveUsers(list) { BAUGMENT.persist.set(USERS_KEY, list); }

  function find(list, username) {
    const n = String(username || '').trim().toLowerCase();
    return list.find((u) => u.username.toLowerCase() === n) || null;
  }

  /* --- Session ------------------------------------------------------------ */

  const DAY = 86400000;

  function session() {
    const s = BAUGMENT.persist.get(SESSION_KEY, null);
    if (!s) return null;
    if (s.expires && Date.now() > s.expires) { BAUGMENT.persist.remove(SESSION_KEY); return null; }
    return s;
  }

  function startSession(user, remember) {
    BAUGMENT.persist.set(SESSION_KEY, {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      startedAt: Date.now(),
      expires: Date.now() + (remember ? 30 * DAY : 12 * 3600000),
      remember: !!remember
    });
  }

  function logout() { BAUGMENT.persist.remove(SESSION_KEY); }

  /* --- Public API --------------------------------------------------------- */

  async function login(username, password, remember) {
    const list = await users();
    const user = find(list, username);
    /* Same message either way so the form doesn't confirm which usernames exist. */
    const fail = { ok: false, error: 'That username and password don\'t match. Check both and try again.' };
    if (!user) { await digest(password, 'decoy'); return fail; }
    const hash = await digest(password, user.salt);
    if (hash !== user.hash) return fail;
    startSession(user, remember);
    return { ok: true, user };
  }

  function validatePassword(pw) {
    const issues = [];
    if (!pw || pw.length < 8) issues.push('at least 8 characters');
    if (!/[a-z]/.test(pw || '')) issues.push('a lowercase letter');
    if (!/[0-9]/.test(pw || '')) issues.push('a number');
    return issues;
  }

  function strength(pw) {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 14) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(4, s);
  }

  async function changePassword(currentPw, nextPw) {
    const s = session();
    if (!s) return { ok: false, error: 'Your session expired. Sign in again to change the password.' };
    const list = await users();
    const user = list.find((u) => u.id === s.userId);
    if (!user) return { ok: false, error: 'That account no longer exists.' };

    const currentHash = await digest(currentPw, user.salt);
    if (currentHash !== user.hash) return { ok: false, error: 'The current password is wrong.' };

    const issues = validatePassword(nextPw);
    if (issues.length) return { ok: false, error: 'The new password needs ' + issues.join(', ') + '.' };
    if (currentPw === nextPw) return { ok: false, error: 'The new password has to differ from the current one.' };

    user.salt = randomSalt();
    user.hash = await digest(nextPw, user.salt);
    user.mustChange = false;
    user.passwordChangedAt = new Date().toISOString();
    saveUsers(list);
    startSession(user, s.remember);
    return { ok: true };
  }

  async function currentUser() {
    const s = session();
    if (!s) return null;
    const list = await users();
    return list.find((u) => u.id === s.userId) || null;
  }

  /* Adding accounts is already supported; there's just no UI for it yet. */
  async function createUser(username, password, displayName, role) {
    const list = await users();
    if (find(list, username)) return { ok: false, error: 'That username is taken.' };
    const issues = validatePassword(password);
    if (issues.length) return { ok: false, error: 'The password needs ' + issues.join(', ') + '.' };
    const salt = randomSalt();
    list.push({
      id: U.uid('usr'), username: String(username).trim(), displayName: displayName || username,
      role: role || 'editor', createdAt: new Date().toISOString(),
      salt, hash: await digest(password, salt), mustChange: true
    });
    saveUsers(list);
    return { ok: true };
  }

  /* =======================================================================
     Supabase mode
     -----------------------------------------------------------------------
     Once a Supabase project is configured, the local password table stops
     being the gate — real accounts live in Supabase Auth, RLS decides what
     each one can touch, and the identifier becomes an email address.

     The local mode above stays for offline use and for opening the files
     straight from disk. `mode()` picks between them.
     ======================================================================= */

  function mode() {
    return (BAUGMENT.config && BAUGMENT.config.isConfigured()) ? 'supabase' : 'local';
  }

  /* The rest of the app reads sessions synchronously, so the resolved session
     is cached here and `session()` stays sync in both modes. */
  let cached = null;

  function shapeSupabaseSession(s) {
    if (!s || !s.user) return null;
    const u = s.user;
    const name = (u.user_metadata && (u.user_metadata.display_name || u.user_metadata.full_name)) ||
      (u.email || '').split('@')[0];
    return {
      userId: u.id,
      username: u.email || u.id,
      displayName: name,
      role: (u.app_metadata && u.app_metadata.role) || (u.user_metadata && u.user_metadata.role) || 'editor',
      email: u.email,
      startedAt: Date.now(),
      expires: s.expires_at ? s.expires_at * 1000 : Date.now() + 3600000,
      remote: true
    };
  }

  /* Resolves the session once at boot. Everything after reads the cache. */
  async function init() {
    if (mode() === 'local') { cached = session(); return cached; }
    try {
      const client = await BAUGMENT.remote.connect();
      const { data } = await client.auth.getSession();
      cached = shapeSupabaseSession(data && data.session);
      client.auth.onAuthStateChange((event, s) => {
        cached = shapeSupabaseSession(s);
        if (event === 'SIGNED_OUT') window.location.replace('index.html');
      });
      return cached;
    } catch (err) {
      /* A configured-but-unreachable project shouldn't lock anyone out of a
         local session they already have. */
      cached = session();
      return cached;
    }
  }

  function activeSession() { return mode() === 'supabase' ? cached : session(); }

  async function loginRemote(email, password, remember) {
    try {
      const client = await BAUGMENT.remote.connect();
      const { data, error } = await client.auth.signInWithPassword({
        email: String(email || '').trim(), password
      });
      if (error) {
        const m = error.message || '';
        if (/Invalid login/i.test(m)) return { ok: false, error: 'That email and password don\'t match. Check both and try again.' };
        if (/Email not confirmed/i.test(m)) return { ok: false, error: 'That account hasn\'t been confirmed yet. Confirm it in Supabase → Authentication → Users.' };
        return { ok: false, error: m };
      }
      cached = shapeSupabaseSession(data.session);
      return { ok: true, user: cached };
    } catch (err) {
      return { ok: false, error: BAUGMENT.remote.describe(err) };
    }
  }

  async function logoutRemote() {
    try {
      const client = await BAUGMENT.remote.connect();
      await client.auth.signOut();
    } catch (e) { /* signing out locally is what matters */ }
    cached = null;
    BAUGMENT.persist.remove('pushQueue');
  }

  async function changePasswordRemote(currentPw, nextPw) {
    const s = activeSession();
    if (!s) return { ok: false, error: 'Your session expired. Sign in again to change the password.' };
    const issues = validatePassword(nextPw);
    if (issues.length) return { ok: false, error: 'The new password needs ' + issues.join(', ') + '.' };
    if (currentPw === nextPw) return { ok: false, error: 'The new password has to differ from the current one.' };
    try {
      const client = await BAUGMENT.remote.connect();
      /* Supabase doesn't require the old password, but asking for it stops an
         unlocked laptop turning into a hijacked account. */
      const { error: reauth } = await client.auth.signInWithPassword({ email: s.email, password: currentPw });
      if (reauth) return { ok: false, error: 'The current password is wrong.' };
      const { error } = await client.auth.updateUser({ password: nextPw });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: BAUGMENT.remote.describe(err) };
    }
  }

  /* --- Mode-aware public API ---------------------------------------------- */

  async function loginAny(identifier, password, remember) {
    return mode() === 'supabase'
      ? loginRemote(identifier, password, remember)
      : login(identifier, password, remember);
  }

  async function logoutAny() {
    if (mode() === 'supabase') await logoutRemote();
    logout();
  }

  async function changePasswordAny(cur, next) {
    return mode() === 'supabase' ? changePasswordRemote(cur, next) : changePassword(cur, next);
  }

  /* Bounces to the login page if there's no session. */
  async function requireSession(redirectTo) {
    const s = await init();
    if (!s) { window.location.replace(redirectTo || 'index.html'); return null; }
    return s;
  }

  return {
    mode, init,
    login: loginAny, logout: logoutAny, changePassword: changePasswordAny,
    session: activeSession, currentUser, createUser,
    validatePassword, strength, requireSession, users, FIRST_RUN_PASSWORD,
    localLogin: login, localSession: session
  };
})();
