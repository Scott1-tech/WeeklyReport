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
      max: 3
    });
  }
  return pool;
}

// Creates the drivers/trucks tables on first use so there is no manual
// migration step — connect DATABASE_URL and the schema bootstraps itself.
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
    `);
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
