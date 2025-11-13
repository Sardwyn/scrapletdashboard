// /db.js
import pg from 'pg';

// Lazy init so dotenv in index.js has time to run
let pool = null;

function redact(s = '') {
  return s.replace(/(:\/\/[^:]+:)([^@]+)@/, '$1***@');
}

function getConnString() {
  return process.env.DASHBOARD_DATABASE_URL || process.env.DATABASE_URL || '';
}

export function getPool() {
  if (!pool) {
    const cs = getConnString();
    if (!cs) throw new Error('DATABASE_URL not set (checked DASHBOARD_DATABASE_URL, DATABASE_URL)');
    console.log('🧠 DB config:', redact(cs));
    pool = new pg.Pool({ connectionString: cs, ssl: false });
  }
  return pool;
}

export async function query(sql, params) {
  return getPool().query(sql, params);
}

export default { query };
