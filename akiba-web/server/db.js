// Two interchangeable backends behind the same tiny interface:
//   query(text, params) -> rows
//   batch([{ text, params }]) -> runs all statements in one transaction
// Production (Vercel) uses Neon Postgres over HTTP via DATABASE_URL. Locally
// and in tests, with no DATABASE_URL, it falls back to PGlite — real Postgres
// compiled to WASM, running in-process — so no database server or account is
// needed to develop.

// Every statement is idempotent, so it's safe to run on every cold start —
// that's what keeps a fresh Neon database from needing a separate migrate step.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id uuid PRIMARY KEY,
     google_id text NOT NULL UNIQUE,
     email text NOT NULL,
     display_name text NOT NULL,
     nickname text,
     currency text NOT NULL DEFAULT 'KES',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  // The "class" level of the two-tier category system — Groceries, Desktop setup, etc.
  `CREATE TABLE IF NOT EXISTS classes (
     id uuid PRIMARY KEY,
     user_id uuid NOT NULL REFERENCES users(id),
     name text NOT NULL,
     color_hex text NOT NULL DEFAULT '#4FAE8E',
     monthly_limit numeric(18,2) NOT NULL DEFAULT 0,
     updated_at timestamptz NOT NULL,
     is_deleted boolean NOT NULL DEFAULT false
   )`,
  // The "subject" level — onions, chips, monitor stand. Owned through its class.
  `CREATE TABLE IF NOT EXISTS subjects (
     id uuid PRIMARY KEY,
     class_id uuid NOT NULL REFERENCES classes(id),
     name text NOT NULL,
     updated_at timestamptz NOT NULL,
     is_deleted boolean NOT NULL DEFAULT false
   )`,
  // Positive amount = income, negative = expense.
  `CREATE TABLE IF NOT EXISTS transactions (
     id uuid PRIMARY KEY,
     user_id uuid NOT NULL REFERENCES users(id),
     subject_id uuid NOT NULL REFERENCES subjects(id),
     amount numeric(18,2) NOT NULL,
     note text,
     occurred_at timestamptz NOT NULL,
     updated_at timestamptz NOT NULL,
     is_deleted boolean NOT NULL DEFAULT false
   )`,
  // One-off purchases set target_date; recurring ones set is_recurring + interval_months.
  `CREATE TABLE IF NOT EXISTS goals (
     id uuid PRIMARY KEY,
     user_id uuid NOT NULL REFERENCES users(id),
     class_id uuid NOT NULL REFERENCES classes(id),
     name text NOT NULL,
     price numeric(18,2) NOT NULL,
     target_date timestamptz,
     is_recurring boolean NOT NULL DEFAULT false,
     interval_months integer,
     is_purchased boolean NOT NULL DEFAULT false,
     updated_at timestamptz NOT NULL,
     is_deleted boolean NOT NULL DEFAULT false
   )`,
  `CREATE INDEX IF NOT EXISTS classes_user_idx ON classes (user_id)`,
  `CREATE INDEX IF NOT EXISTS subjects_class_idx ON subjects (class_id)`,
  `CREATE INDEX IF NOT EXISTS transactions_user_occurred_idx ON transactions (user_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS goals_user_idx ON goals (user_id)`,
];

async function connect() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return {
      query: (text, params = []) => sql.query(text, params),
      batch: (statements) => sql.transaction(statements.map((s) => sql.query(s.text, s.params ?? []))),
    };
  }

  // Never silently fall back to a throwaway database in production.
  if (process.env.VERCEL) throw new Error('DATABASE_URL is not set — connect Neon to this Vercel project.');

  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || undefined; // undefined = in-memory (tests)
  if (dir) (await import('node:fs')).mkdirSync(dir, { recursive: true }); // PGlite won't create parents
  const pg = new PGlite(dir);
  return {
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    batch: (statements) => pg.transaction(async (tx) => {
      for (const s of statements) await tx.query(s.text, s.params ?? []);
    }),
  };
}

// Cached on globalThis rather than a module variable so Vite's dev-server
// module reloads reuse the one open database instead of opening a second
// PGlite on the same directory.
export function getDb() {
  globalThis.__akibaDb ??= connect()
    .then(async (db) => {
      await db.batch(SCHEMA.map((text) => ({ text })));
      return db;
    })
    .catch((err) => {
      globalThis.__akibaDb = undefined; // let the next request retry
      throw err;
    });
  return globalThis.__akibaDb;
}
