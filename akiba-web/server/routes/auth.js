import { randomUUID } from 'node:crypto';
import { verifyGoogleIdToken, issueToken } from '../auth.js';
import { ok, badRequest, unauthorized } from '../http.js';

export default [
  // POST /api/auth/google — the only open data route, since it's the one that
  // issues tokens. Verifies the Google ID token, finds or creates the user,
  // and returns our own JWT.
  {
    method: 'POST', path: '/auth/google', auth: false,
    async handler({ db, body }) {
      if (typeof body?.idToken !== 'string') return badRequest('idToken is required.');

      let google;
      try {
        google = await verifyGoogleIdToken(body.idToken);
      } catch {
        return unauthorized();
      }

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
      return ok({ token, userId: user.id, email: user.email, displayName: user.displayName });
    },
  },
];
