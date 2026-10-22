import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/errors.js';
import { getCompanyState, getUserAccess, BLOCKED_MESSAGE } from '../access/access.service.js';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const BAD_LOGIN = 'User ID or password is wrong.';

async function audit(companyId, userId, action, details) {
  await query(
    'INSERT INTO audit_log (company_id, user_id, action, entity, details) VALUES ($1, $2, $3, $4, $5)',
    [companyId, userId, action, 'session', details ? JSON.stringify(details) : null]);
}

export async function login({ username, password, companyCode }) {
  if (!username || !password) throw new AppError(400, 'Enter your user ID and password.');

  const code = companyCode || env.defaultCompanyCode;
  const company = (await query('SELECT id, is_active, status FROM companies WHERE code = $1', [code]))[0];
  if (!company || !company.is_active) throw new AppError(401, BAD_LOGIN);
  if (company.status !== 'active') throw new AppError(403, BLOCKED_MESSAGE);

  const user = (await query(
    `SELECT id, password_hash, is_active, failed_attempts, locked_until, default_unit_id
       FROM users
      WHERE company_id = $1 AND (lower(username) = lower($2) OR lower(email) = lower($2))`,
    [company.id, username.trim()]))[0];

  // Same message whether the user exists or not, so nobody can guess user IDs.
  if (!user || !user.is_active) {
    await audit(company.id, null, 'LOGIN_FAILED', { username });
    throw new AppError(401, BAD_LOGIN);
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(423, `Too many wrong attempts. Try again after ${LOCK_MINUTES} minutes or contact your administrator.`);
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await query(
      `UPDATE users SET failed_attempts = $2,
              locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE NULL END
        WHERE id = $1`,
      [user.id, lock ? 0 : attempts, lock, String(LOCK_MINUTES)]);
    await audit(company.id, user.id, 'LOGIN_FAILED', { attempts });
    if (lock) throw new AppError(423, `Too many wrong attempts. Your account is locked for ${LOCK_MINUTES} minutes.`);
    throw new AppError(401, BAD_LOGIN);
  }

  await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
  await audit(company.id, user.id, 'LOGIN');

  const token = jwt.sign(
    { sub: String(user.id), cid: String(company.id), uid: user.default_unit_id ? String(user.default_unit_id) : null },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn });

  return { token, session: await getSession(user.id, company.id) };
}

// Everything the screen needs after login: who the user is and where they work.
export async function getSession(userId, companyId) {
  const row = (await query(
    `SELECT u.id, u.username, u.full_name, u.designation, r.name AS role, r.is_admin,
            c.id AS company_id, c.code AS company_code, c.name AS company_name, c.logo_url,
            un.id AS unit_id, un.name AS unit_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       JOIN companies c ON c.id = u.company_id
       LEFT JOIN units un ON un.id = u.default_unit_id
      WHERE u.id = $1 AND u.company_id = $2 AND u.is_active`,
    [userId, companyId]))[0];
  if (!row) throw new AppError(401, 'Your account is not active. Contact your administrator.');

  const fy = (await query(
    'SELECT label, short_label FROM financial_years WHERE company_id = $1 AND is_current LIMIT 1', [companyId]))[0];
  const state = await getCompanyState(companyId);
  if (state.blocked) throw new AppError(403, BLOCKED_MESSAGE);
  // Only the modules, screens and reports this user may open (the rest never reach the browser)
  const access = await getUserAccess(userId, companyId);

  return {
    user: { id: row.id, username: row.username, fullName: row.full_name, designation: row.designation, role: row.role, isAdmin: row.is_admin },
    company: { id: row.company_id, code: row.company_code, name: row.company_name, logoUrl: row.logo_url },
    unit: row.unit_id ? { id: row.unit_id, name: row.unit_name } : null,
    financialYear: fy ? { label: fy.label, short: fy.short_label } : null,
    licence: state.licence,
    menu: access.menu,                  // modules -> groups -> screens/reports
    permissions: access.permissions     // e.g. { 'order.entry': ['view', 'create', 'edit'] }
  };
}

export async function logout(userId, companyId) {
  await audit(companyId, userId, 'LOGOUT');
}
