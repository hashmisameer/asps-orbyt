// /api/owner/... : the ORBYT owner console. Only owner (super admin) logins get past requireOwner.
import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireOwner } from '../../middleware/owner.js';
import * as owner from './owner.service.js';

export const ownerRouter = Router();

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}

ownerRouter.post('/login', asyncHandler(async (req, res) => {
  res.json(await owner.ownerLogin(req.body || {}));
}));

ownerRouter.use(requireOwner);

ownerRouter.get('/me', (req, res) => res.json({ owner: req.owner }));
ownerRouter.get('/catalog', asyncHandler(async (_req, res) => res.json(await owner.getCatalog())));
// Base or Add-on and default price: PUT /catalog/modules/production or /catalog/features/order.costing
ownerRouter.put('/catalog/:level/:code', asyncHandler(async (req, res) => {
  res.json(await owner.updateCatalogItem(req.owner, req.params.level, req.params.code, req.body || {}));
}));
ownerRouter.get('/companies', asyncHandler(async (_req, res) => res.json(await owner.listCompanies())));
ownerRouter.post('/companies', asyncHandler(async (req, res) => {
  res.status(201).json(await owner.createCompany(req.owner, req.body || {}));
}));
ownerRouter.get('/companies/:id', asyncHandler(async (req, res) => {
  res.json(await owner.getCompany(idParam(req.params.id)));
}));
ownerRouter.put('/companies/:id', asyncHandler(async (req, res) => {
  res.json(await owner.updateCompany(req.owner, idParam(req.params.id), req.body || {}));
}));
ownerRouter.post('/companies/:id/reset-admin-password', asyncHandler(async (req, res) => {
  res.json(await owner.resetAdminPassword(req.owner, idParam(req.params.id), (req.body || {}).password));
}));
ownerRouter.get('/audit', asyncHandler(async (_req, res) => res.json(await owner.listOwnerAudit())));
