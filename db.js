import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 🔍 Log every query for debugging
const originalQuery = pool.query.bind(pool);
pool.query = async (...args) => {
  const [sql, params] = args;
  console.debug('🧠 Executing query:', sql);
  console.debug('📦 With params:', params);
  return originalQuery(...args);
};

export default pool;
