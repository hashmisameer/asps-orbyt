// Checks the login token sent by the frontend and puts the user on req.user.
// Every protected route uses this, and every query then filters by req.user.companyId.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'Sign in to continue.'));
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.scope === 'owner') return next(new AppError(401, 'Sign in to continue.'));   // owner tokens only open the owner console
    req.user = { id: Number(payload.sub), companyId: Number(payload.cid), unitId: payload.uid ? Number(payload.uid) : null };
    next();
  } catch {
    next(new AppError(401, 'Your session expired. Sign in again.'));
  }
}
