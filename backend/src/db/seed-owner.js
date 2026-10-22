// Creates the ORBYT owner (super admin) login from OWNER_USERNAME / OWNER_PASSWORD in backend/.env.
// Run again after changing OWNER_PASSWORD to set the new password.
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { env } from '../config/env.js';

async function seedOwner() {
  if (!env.ownerPassword || env.ownerPassword.length < 10) {
    throw new Error('Set OWNER_PASSWORD (at least 10 characters) in backend/.env, then run this again.');
  }
  const hash = await bcrypt.hash(env.ownerPassword, 12);
  const existing = (await pool.query('SELECT id FROM platform_admins WHERE lower(username) = lower($1)', [env.ownerUsername])).rows[0];
  if (existing) {
    await pool.query(
      'UPDATE platform_admins SET password_hash = $2, full_name = $3, is_active = TRUE, failed_attempts = 0, locked_until = NULL WHERE id = $1',
      [existing.id, hash, env.ownerName]);
    console.log(`Owner login "${env.ownerUsername}" updated with the password from .env.`);
  } else {
    await pool.query('INSERT INTO platform_admins (username, full_name, password_hash) VALUES ($1, $2, $3)',
      [env.ownerUsername, env.ownerName, hash]);
    console.log(`Owner login "${env.ownerUsername}" created. Open the app at /owner to sign in.`);
  }
  await pool.end();
}

seedOwner().catch(async (err) => {
  console.error(err.message);
  await pool.end();
  process.exitCode = 1;
});
