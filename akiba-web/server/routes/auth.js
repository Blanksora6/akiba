import { randomUUID } from 'node:crypto';
import { verifyGoogleIdToken, issueToken } from '../auth.js';
import { ok, badRequest, unauthorized } from '../http.js';

// Where the phone app listens for the sign-in result (registered by the
// app's WebAuthenticator callback activity).
const MOBILE_CALLBACK = 'akiba://auth';

// Verifies a Google ID token, finds or creates the matching user, and issues
// our own JWT. Throws if the Google token is invalid.
async function signInWithGoogle(db, idToken) {
  const google = await verifyGoogleIdToken(idToken);

  // Upsert keyed on google_id; RETURNING gives back the existing row when
  // the user already exists, so this is one round trip either way.
  const [user] = await db.query(
    `INSERT INTO users (id, google_id, email, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_id) DO UPDATE SET google_id = EXCLUDED.google_id
     RETURNING id, email, display_name AS "displayName"`,
    [randomUUID(), google.sub, google.email ?? '', google.name ?? google.email ?? ''],
  );

  const token = await issueToken(user.id);
  return { token, userId: user.id, email: user.email, displayName: user.displayName };
}

function cookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// The last page the phone's browser tab shows. It hands the result to the app
// through the akiba:// scheme. Done from the page (with a button fallback)
// rather than a bare 302, because Chrome can refuse to open an app from a
// redirect that has no user tap behind it.
function returnToAppPage(fields) {
  // encodeURIComponent, not URLSearchParams: the app's parser doesn't turn
  // "+" back into a space, which would mangle names like "Samson Sitati".
  const fragment = Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const url = `${MOBILE_CALLBACK}#${fragment}`;
  const attr = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const ok = !fields.error;
  return {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    raw: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Akiba</title>
<body style="background:#0E1512;color:#EDE8DC;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;gap:16px;text-align:center;padding:0 24px">
<p>${ok ? 'Signed in — returning to Akiba…' : 'Sign-in failed. Return to the app and try again.'}</p>
<a href="${attr}" style="background:#C9A227;color:#0E1512;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">Open Akiba</a>
<script>location.replace(${JSON.stringify(url)});</script>
</body>`,
  };
}

export default [
  // POST /api/auth/google — the only open data route, since it's the one that
  // issues tokens. Verifies the Google ID token, finds or creates the user,
  // and returns our own JWT.
  {
    method: 'POST', path: '/auth/google', auth: false,
    async handler({ db, body }) {
      if (typeof body?.idToken !== 'string') return badRequest('idToken is required.');
      try {
        return ok(await signInWithGoogle(db, body.idToken));
      } catch {
        return unauthorized();
      }
    },
  },

  // POST /api/auth/google/mobile — the phone app's sign-in. The app opens
  // /mobile-login.html in a browser tab; Google's button there runs in
  // redirect mode and form-POSTs the ID token here (this URL must be listed
  // under the OAuth client's Authorized redirect URIs). Google also sets a
  // g_csrf_token cookie that must match the posted field.
  {
    method: 'POST', path: '/auth/google/mobile', auth: false,
    async handler({ db, body, req }) {
      const csrf = cookie(req, 'g_csrf_token');
      if (!csrf || csrf !== body?.g_csrf_token || typeof body?.credential !== 'string') {
        return returnToAppPage({ error: 'invalid_request' });
      }
      try {
        return returnToAppPage(await signInWithGoogle(db, body.credential));
      } catch {
        return returnToAppPage({ error: 'invalid_token' });
      }
    },
  },
];
