// Checks the owner (super admin) login token. Client user tokens are refused here,
// and owner tokens are refused everywhere else (see auth.js), so the two never mix.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errors.js';
import { query } from '../db/pool.js';

export async function requireOwner(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'Sign in to continue.'));
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return next(new AppError(401, 'Your session expired. Sign in again.'));
  }
  if (payload.scope !== 'owner') return next(new AppError(401, 'Sign in to the owner console to continue.'));
  try {
    const admin = (await query('SELECT id, username, full_name FROM platform_admins WHERE id = $1 AND is_active', [Number(payload.sub)]))[0];
    if (!admin) return next(new AppError(401, 'Sign in to the owner console to continue.'));
    req.owner = { id: admin.id, username: admin.username, fullName: admin.full_name };
    next();
  } catch (err) {
    next(err);
  }
}
