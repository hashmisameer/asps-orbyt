// Creates the first company, unit, financial year, Admin role and admin user.
// Safe to run more than once: it skips anything that already exists.
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';
import { env } from '../config/env.js';

async function seed() {
  if (!env.seedAdminPassword || env.seedAdminPassword.length < 8) {
    throw new Error('Set SEED_ADMIN_PASSWORD (at least 8 characters) in backend/.env before seeding.');
  }

  await withTransaction(async (db) => {
    const code = env.defaultCompanyCode || 'ASPS';
    const company = (await db.query(
      `INSERT INTO companies (code, name, legal_name)
       VALUES ($1, 'ASPS International LLP', 'ASPS International LLP')
       ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
       RETURNING id`, [code])).rows[0];

    const unit = (await db.query(
      `INSERT INTO units (company_id, code, name) VALUES ($1, 'NOIDA1', 'Noida unit')
       ON CONFLICT (company_id, code) DO UPDATE SET code = EXCLUDED.code
       RETURNING id`, [company.id])).rows[0];

    await db.query(
      `INSERT INTO financial_years (company_id, label, short_label, start_date, end_date, is_current)
       VALUES ($1, '2026-27', '26-27', '2026-04-01', '2027-03-31', TRUE)
       ON CONFLICT (company_id, label) DO NOTHING`, [company.id]);

    // First company gets every module and every screen/report; the owner can switch them off later
    await db.query(
      `INSERT INTO company_modules (company_id, module_code, enabled)
       SELECT $1, code, TRUE FROM modules
       ON CONFLICT DO NOTHING`, [company.id]);
    await db.query(
      `INSERT INTO company_features (company_id, feature_code)
       SELECT $1, code FROM features
       ON CONFLICT DO NOTHING`, [company.id]);

    const role = (await db.query(
      `INSERT INTO roles (company_id, name, is_admin) VALUES ($1, 'Admin', TRUE)
       ON CONFLICT (company_id, name) DO UPDATE SET is_admin = TRUE
       RETURNING id`, [company.id])).rows[0];

    const existing = await db.query(
      'SELECT id FROM users WHERE company_id = $1 AND lower(username) = lower($2)',
      [company.id, env.seedAdminUsername]);
    if (existing.rows.length) {
      console.log(`User "${env.seedAdminUsername}" already exists, left unchanged.`);
    } else {
      const hash = await bcrypt.hash(env.seedAdminPassword, 12);
      await db.query(
        `INSERT INTO users (company_id, role_id, default_unit_id, username, full_name, designation, password_hash)
         VALUES ($1, $2, $3, $4, 'Administrator', 'System admin', $5)`,
        [company.id, role.id, unit.id, env.seedAdminUsername, hash]);
      console.log(`Created admin user "${env.seedAdminUsername}". Change the password after first login.`);
    }
    console.log(`Company ${code} is ready.`);
  });
  await pool.end();
}

seed().catch(async (err) => {
  console.error(err.message);
  process.exitCode = 1;
  await pool.end();
});
