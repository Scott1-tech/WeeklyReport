import pg from 'pg';

const { Pool } = pg;

let pool;
let schemaReady;

function getConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Missing DATABASE_URL environment variable. Set it to your Postgres connection string (see DEPLOY.md).'
    );
  }
  return url;
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
      // Neon / most hosted free-tier Postgres providers require SSL and use
      // certificates that aren't in Node's default trust store.
      ssl: { rejectUnauthorized: false },
      // Each API route is its own serverless function with its own pool, and
      // a free-tier Postgres has a small total connection cap — keep each
      // pool's footprint minimal so five routes' worth of pools can't exhaust
      // it between them. (If DATABASE_URL is the *unpooled* Neon connection
      // string rather than the "-pooler" one, this cap is easy to hit even
      // at max:1 per route under bursty traffic — see DEPLOY.md.)
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000
    });
    // A Pool emits 'error' for problems on an already-idle client (e.g. the
    // server closing a connection between requests). Without a listener,
    // Node treats that as an unhandled error; with one, the pool just drops
    // that client and issues a new one on the next query.
    pool.on('error', (err) => {
      console.error('[db] idle client error', err);
    });
  }
  return pool;
}

// Creates the drivers/trucks tables on first use so there is no manual
// migration step — connect DATABASE_URL and the schema bootstraps itself.
//
// The bootstrap query is cached in `schemaReady` so concurrent requests on
// the same warm serverless instance don't all race to run it. But a naive
// cache would also cache a *failed* attempt (e.g. a transient connection
// hiccup) forever — every request on that instance would keep failing until
// it happened to cold-start again. Clearing the cache on failure lets the
// very next request retry instead of being stuck.
export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active',
        hire_date DATE,
        tenure_days INTEGER,
        term_date DATE,
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS trucks (
        id SERIAL PRIMARY KEY,
        unit TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active',
        status_date DATE,
        notes TEXT NOT NULL DEFAULT '',
        assigned_driver TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `).catch((err) => {
      schemaReady = undefined; // don't cache a failure — retry on the next request
      throw err;
    });
  }
  await schemaReady;
}

export async function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

export async function sendError(res, status, err) {
  console.error(err);
  await sendJson(res, status, { error: err.message || String(err) });
}
