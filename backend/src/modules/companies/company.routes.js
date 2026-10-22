import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';

export const companyRouter = Router();

// GET /api/companies/public?code=ASPS
// Only the name and logo, so the login screen can show which workspace it is.
companyRouter.get('/public', asyncHandler(async (req, res) => {
  const code = req.query.code || env.defaultCompanyCode;
  const row = (await query('SELECT code, name, logo_url FROM companies WHERE code = $1 AND is_active', [code]))[0];
  if (!row) throw new AppError(404, 'Workspace not found.');
  res.json({ code: row.code, name: row.name, logoUrl: row.logo_url });
}));
