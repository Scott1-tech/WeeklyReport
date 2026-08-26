import { getPool, ensureSchema, sendJson } from './_db.js';

// Visit /api/health directly in a browser — no DevTools needed. Reports
// whether the database is reachable and how many rows each table has, or
// the exact error if something's wrong. Meant purely as a diagnostic aid
// while setting up DATABASE_URL; safe to leave in place afterward.
export default async function handler(req, res) {
  const report = { hasDatabaseUrl: Boolean(process.env.DATABASE_URL) };

  try {
    await ensureSchema();
    report.schema = 'ok';
  } catch (err) {
    report.schema = 'failed';
    report.schemaError = err.message;
    await sendJson(res, 500, report);
    return;
  }

  const pool = getPool();

  try {
    const drivers = await pool.query('SELECT COUNT(*)::int AS count FROM drivers');
    report.drivers = { ok: true, count: drivers.rows[0].count };
  } catch (err) {
    report.drivers = { ok: false, error: err.message };
  }

  try {
    const trucks = await pool.query('SELECT COUNT(*)::int AS count FROM trucks');
    report.trucks = { ok: true, count: trucks.rows[0].count };
  } catch (err) {
    report.trucks = { ok: false, error: err.message };
  }

  report.pool = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };

  const allOk = report.drivers.ok && report.trucks.ok;
  await sendJson(res, allOk ? 200 : 500, report);
}
