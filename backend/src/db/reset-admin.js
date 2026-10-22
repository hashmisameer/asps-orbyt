// Sets the client admin's password to SEED_ADMIN_PASSWORD from backend/.env and unlocks the account.
// Company = DEFAULT_COMPANY_CODE, user = SEED_ADMIN_USERNAME.
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { env } from '../config/env.js';

async function main() {
  if (!env.seedAdminPassword || env.seedAdminPassword.length < 8) {
    throw new Error('Set SEED_ADMIN_PASSWORD (at least 8 characters) in backend/.env, then run this again.');
  }
  const hash = await bcrypt.hash(env.seedAdminPassword, 12);
  const result = await pool.query(
    `UPDATE users u SET password_hash = $3, failed_attempts = 0, locked_until = NULL, is_active = TRUE, updated_at = now()
       FROM companies c
      WHERE c.id = u.company_id AND c.code = $1 AND lower(u.username) = lower($2)
      RETURNING u.username`, [env.defaultCompanyCode, env.seedAdminUsername, hash]);
  if (!result.rows.length) throw new Error(`No user "${env.seedAdminUsername}" found in company ${env.defaultCompanyCode}.`);
  console.log(`Password for "${result.rows[0].username}" (${env.defaultCompanyCode}) set from .env and the account is unlocked.`);
  await pool.end();
}

main().catch(async (err) => { console.error(err.message); await pool.end(); process.exitCode = 1; });
