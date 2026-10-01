import { getDb } from './db.js';
import { userIdFromRequest } from './auth.js';
import { ok, badRequest, unauthorized, notFound, isUuid, readBody } from './http.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import classRoutes from './routes/classes.js';
import transactionRoutes from './routes/transactions.js';
import goalRoutes from './routes/goals.js';
import syncRoutes from './routes/sync.js';

// All routes live in one Vercel function (the Hobby plan caps functions per
// deployment), so this is the whole router. Paths are relative to /api.
// Routes require a signed-in user unless they set auth: false.
const ROUTES = [
  { method: 'GET', path: '/health', auth: false, handler: async () => ok({ status: 'ok' }) },
  ...authRoutes,
  ...profileRoutes,
  ...classRoutes,
  ...transactionRoutes,
  ...goalRoutes,
  ...syncRoutes,
].map((route) => ({ ...route, segments: route.path.split('/').filter(Boolean) }));

// Returns params for a match, or null. Every :param is an id, and a non-UUID
// id never matches — same as the old API's {id:guid} route constraints.
function match(route, segments) {
  if (route.segments.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < segments.length; i++) {
    const expected = route.segments[i];
    if (expected.startsWith(':')) {
      if (!isUuid(segments[i])) return null;
      params[expected.slice(1)] = segments[i].toLowerCase();
    } else if (expected !== segments[i]) {
      return null;
    }
  }
  return params;
}

// A result is { status, body } (sent as JSON) or { status, headers, raw }
// for the rare non-JSON response, like the mobile sign-in page.
function send(res, { status, body, headers, raw }) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers ?? {})) res.setHeader(k, v);
  if (raw !== undefined) return res.end(raw);
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    // On Vercel, vercel.json rewrites /api/<path> to this function with the
    // path in ?route=; in dev, the path is still on the URL itself.
    const route = url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/?/, '');
    url.searchParams.delete('route');
    const segments = route.split('/').filter(Boolean);

    const candidates = ROUTES.map((r) => ({ r, params: match(r, segments) })).filter((c) => c.params);
    if (candidates.length === 0) return send(res, notFound());
    const found = candidates.find((c) => c.r.method === req.method);
    if (!found) return send(res, { status: 405 });

    let userId = null;
    if (found.r.auth !== false) {
      userId = await userIdFromRequest(req);
      if (!userId) return send(res, unauthorized());
    }

    let body = null;
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        body = await readBody(req);
      } catch {
        return send(res, badRequest('Request body is not valid JSON.'));
      }
      if (body === null || typeof body !== 'object') return send(res, badRequest('Request body is required.'));
    }

    const db = await getDb();
    const result = await found.r.handler({ db, userId, params: found.params, query: url.searchParams, body, req });
    send(res, result);
  } catch (err) {
    console.error(err);
    send(res, { status: 500, body: 'Internal server error.' });
  }
}
