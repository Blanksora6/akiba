// Result helpers mirror the ASP.NET Results.* the old API used, so status
// codes and bodies stay what the client already expects.
export const ok = (body) => ({ status: 200, body });
export const created = (body) => ({ status: 201, body });
export const noContent = () => ({ status: 204 });
export const badRequest = (body) => ({ status: 400, body });
export const unauthorized = () => ({ status: 401 });
export const notFound = (body) => ({ status: 404, body });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Returns a Date, null for a missing value, or undefined for garbage input.
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function toNumber(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// JSON, or a form post (Google's redirect-mode sign-in) as a plain object.
// Vercel pre-parses both onto req.body; Vite's dev server doesn't, so fall
// back to reading the raw stream. Throws on malformed JSON.
export async function readBody(req) {
  const isForm = (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
  let text;
  if (req.body !== undefined) {
    if (typeof req.body !== 'string') return req.body;
    text = req.body;
  } else {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    text = Buffer.concat(chunks).toString('utf8');
  }
  if (!text) return null;
  return isForm ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text);
}
