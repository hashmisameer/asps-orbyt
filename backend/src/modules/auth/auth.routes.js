import { Router } from 'express';
import { asyncHandler } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { login, getSession, logout } from './auth.service.js';

export const authRouter = Router();

// POST /api/auth/login  { username, password, companyCode? }
authRouter.post('/login', asyncHandler(async (req, res) => {
  const { username, password, companyCode } = req.body || {};
  res.json(await login({ username, password, companyCode }));
}));

// GET /api/auth/me  -> current user, company, unit, FY and enabled modules
authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json(await getSession(req.user.id, req.user.companyId));
}));

// POST /api/auth/logout  -> records the logout in the audit log
authRouter.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await logout(req.user.id, req.user.companyId);
  res.json({ ok: true });
}));
