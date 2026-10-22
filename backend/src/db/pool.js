// One shared connection pool to PostgreSQL for the whole app.
import pg from 'pg';
import { env } from '../config/env.js';

// IDs are BIGINT in the database; return them as normal numbers instead of strings.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

// Small helper: run a query and get the rows back.
export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

// Run several queries as one unit: either all succeed or none are saved.
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
