// Checks the owner login and the client admin login against the passwords in backend/.env.
// Never prints a password: only whether it matches, its length, and lock status.
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { env } from '../config/env.js';

async function check(label, row, password, envName) {
  console.log(`\n${label}`);
  if (!row) { console.log('  Login does not exist in the database.'); return; }
  console.log(`  Username in database : ${row.username}`);
  console.log(`  Active               : ${row.is_active ? 'yes' : 'NO'}`);
  const locked = row.locked_until && new Date(row.locked_until) > new Date();
  console.log(`  Locked               : ${locked ? `YES, until ${new Date(row.locked_until).toLocaleTimeString('en-IN')}` : 'no'}`);
  console.log(`  ${envName} in .env : ${password ? `${password.length} characters` : 'EMPTY'}`);
  if (password) console.log(`  .env password matches: ${(await bcrypt.compare(password, row.password_hash)) ? 'YES' : 'NO'}`);
  if (/#/.test(password)) console.log('  Note: the password has #. Wrap it in double quotes in .env, e.g. NAME="abc#123"');
}

async function main() {
  const owner = (await pool.query(
    'SELECT username, password_hash, is_active, locked_until FROM platform_admins WHERE lower(username) = lower($1)', [env.ownerUsername])).rows[0];
  await check(`OWNER CONSOLE  (/owner, user "${env.ownerUsername}")`, owner, env.ownerPassword, 'OWNER_PASSWORD     ');

  const admin = (await pool.query(
    `SELECT u.username, u.password_hash, u.is_active, u.locked_until
       FROM users u JOIN companies c ON c.id = u.company_id
      WHERE c.code = $1 AND lower(u.username) = lower($2)`, [env.defaultCompanyCode, env.seedAdminUsername])).rows[0];
  await check(`CLIENT ERP  (company ${env.defaultCompanyCode}, user "${env.seedAdminUsername}")`, admin, env.seedAdminPassword, 'SEED_ADMIN_PASSWORD');
  console.log('\nIf "matches" is NO: run `npm run seed:owner` (owner) or `npm run reset-admin` (client admin) to set the password from .env.');
  await pool.end();
}

main().catch(async (err) => { console.error(err.message); await pool.end(); process.exitCode = 1; });
