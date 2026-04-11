/**
 * auth.js — Firebase Authentication (Google + Email magic link)
 *
 * Setup (one-time, 5 minutes):
 *   1. Go to https://console.firebase.google.com → New project
 *   2. Authentication → Get started → Sign-in method
 *      Enable: Google  ✓   Email/Passwordless link  ✓
 *   3. Project Settings → Your apps → Add web app → copy config below
 *   4. Authentication → Settings → Authorised domains → add your domain
 *
 * Until configured: runs in demo mode (bypass login, no real auth).
 *
 * Events fired on window:
 *   nexai:auth-ready  { user }   fired once on page load
 *   nexai:auth-change { user }   fired on every sign-in / sign-out
 */

// ── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};
// ─────────────────────────────────────────────────────────

const EMAIL_KEY = 'nexai_email_signin';

let _auth         = null;
let _helpers      = {};
let _currentUser  = null;
let _ready        = false;
let _demo         = false;

// ── Bootstrap Firebase once ───────────────────────────────

async function boot() {
  if (_ready) return;

  // Demo mode if config is not set
  if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.info('[Auth] Firebase not configured → demo mode');
    _demo  = true;
    _ready = true;
    _dispatch(null);
    return;
  }

  try {
    const [appMod, authMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
    ]);

    const app = appMod.initializeApp(FIREBASE_CONFIG);
    _auth     = authMod.getAuth(app);

    _helpers = {
      GoogleAuthProvider:     authMod.GoogleAuthProvider,
      signInWithPopup:        authMod.signInWithPopup,
      sendSignInLinkToEmail:  authMod.sendSignInLinkToEmail,
      isSignInWithEmailLink:  authMod.isSignInWithEmailLink,
      signInWithEmailLink:    authMod.signInWithEmailLink,
      fbSignOut:              authMod.signOut,
    };

    // Complete email link sign-in if returning from email
    if (_helpers.isSignInWithEmailLink(_auth, window.location.href)) {
      const email = localStorage.getItem(EMAIL_KEY);
      if (email) {
        try {
          await _helpers.signInWithEmailLink(_auth, email, window.location.href);
          localStorage.removeItem(EMAIL_KEY);
          window.history.replaceState({}, '', window.location.pathname);
        } catch (e) {
          console.warn('[Auth] Email link completion failed:', e.message);
        }
      }
    }

    // Auth state listener
    authMod.onAuthStateChanged(_auth, user => {
      _currentUser = user;
      if (!_ready) { _ready = true; _dispatchReady(user); }
      else _dispatch(user);
    });

  } catch (err) {
    console.error('[Auth] Firebase load error:', err.message);
    _demo  = true;
    _ready = true;
    _dispatch(null);
  }
}

function _dispatch(user) {
  window.dispatchEvent(new CustomEvent('nexai:auth-change', { detail: { user } }));
}
function _dispatchReady(user) {
  window.dispatchEvent(new CustomEvent('nexai:auth-ready',  { detail: { user } }));
  _dispatch(user);
}

// ── Public API ────────────────────────────────────────────

/** Kick off auth system — call at app start */
export function initAuth() { boot(); }

/** Current signed-in user or null */
export function getUser() { return _currentUser; }

/** Open Google sign-in popup */
export async function signInGoogle() {
  await boot();
  if (_demo) { _demoLogin('Google User', 'demo@gmail.com'); return; }
  const p = new _helpers.GoogleAuthProvider();
  p.addScope('email');
  return _helpers.signInWithPopup(_auth, p);
}

/**
 * Send magic login link to email
 * @param {string} email
 */
export async function sendEmailLink(email) {
  await boot();
  if (_demo) {
    setTimeout(() => _demoLogin(email.split('@')[0], email), 1200);
    return;
  }
  localStorage.setItem(EMAIL_KEY, email);
  return _helpers.sendSignInLinkToEmail(_auth, email, {
    url:             window.location.origin + window.location.pathname,
    handleCodeInApp: true,
  });
}

/** Sign out current user */
export async function signOut() {
  await boot();
  if (_demo) { _currentUser = null; _dispatch(null); return; }
  if (_auth) return _helpers.fbSignOut(_auth);
}

// ── Demo login (no Firebase config) ──────────────────────

function _demoLogin(name, email) {
  _currentUser = {
    uid:         'demo_' + btoa(email).replace(/[^a-z0-9]/gi, '').slice(0, 10),
    displayName: name,
    email,
    photoURL:    null,
    isDemo:      true,
  };
  _dispatch(_currentUser);
}
