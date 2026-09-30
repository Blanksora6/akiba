import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';

const ISSUER = 'AkibaApi';
const AUDIENCE = 'AkibaClients';
const EXPIRY = '30d';

// Public value (it's also in the browser bundle), so a default is fine;
// override with GOOGLE_CLIENT_ID if the OAuth client ever changes.
const DEFAULT_GOOGLE_CLIENT_ID = '781209907525-b2rq9lioerpkia275bg1kn6ingm6b62c.apps.googleusercontent.com';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function signingKey() {
  const key = process.env.JWT_SIGNING_KEY;
  if (!key) throw new Error('JWT_SIGNING_KEY is not set (Vercel env vars, or .env.local for dev).');
  return new TextEncoder().encode(key);
}

// Checks the ID token Google Identity Services handed the client — signature
// against Google's public keys, plus issuer and audience. Throws if invalid.
export async function verifyGoogleIdToken(idToken) {
  const { payload } = await jwtVerify(idToken, googleKeys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID,
  });
  return payload; // sub, email, name
}

// Our own token: after sign-in, the client never talks to Google again —
// every request authenticates against this.
export function issueToken(userId) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(signingKey());
}

// Returns the user id from a valid "Bearer <token>" header, or null.
export async function userIdFromRequest(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(match[1], signingKey(), { issuer: ISSUER, audience: AUDIENCE });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
