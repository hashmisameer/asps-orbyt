// /api/bom : BOM screen (feature order.bom). The BOM of an order line is addressed by the order line id.
import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { can } from '../access/access.service.js';
import * as bom from './bom.service.js';
import { query } from '../../db/pool.js';

const FEATURE = 'order.bom';
export const bomRouter = Router();
bomRouter.use(requireAuth);

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}

bomRouter.get('/processes', can(FEATURE, 'view'), asyncHandler(async (req, res) => res.json(await bom.getProcesses(req.user.companyId))));
bomRouter.get('/orders', can(FEATURE, 'view'), asyncHandler(async (req, res) => {
  res.json(await bom.listOrders(req.user.companyId, { search: req.query.search, status: req.query.status }));
}));
bomRouter.get('/items', can(FEATURE, 'view'), asyncHandler(async (req, res) => res.json(await bom.pickItems(req.user.companyId, req.query))));
bomRouter.get('/order/:id', can(FEATURE, 'view'), asyncHandler(async (req, res) => {
  res.json(await bom.getBom(req.user.companyId, idParam(req.params.id)));
}));
// Items of the order's Final costing, to add to the screen (nothing is saved)
bomRouter.get('/order/:id/from-costing', can(FEATURE, 'view'), can('order.bom.from_costing', 'view'), asyncHandler(async (req, res) => {
  res.json(await bom.fromCosting(req.user.companyId, idParam(req.params.id)));
}));
// Saving needs Create permission the first time and Edit after that
bomRouter.put('/order/:id', asyncHandler(async (req, res, next) => {
  const r = await query('SELECT 1 FROM boms WHERE company_id = $1 AND order_line_id = $2', [req.user.companyId, idParam(req.params.id)]);
  return can(FEATURE, r.length ? 'edit' : 'create')(req, res, next);
}), asyncHandler(async (req, res) => {
  res.json(await bom.saveBom(req.user, idParam(req.params.id), req.body || {}));
}));
// Delete a draft BOM (approved ones are reopened first)
bomRouter.delete('/order/:id', can(FEATURE, 'edit'), can('order.bom.delete', 'view'), asyncHandler(async (req, res) => {
  res.json(await bom.deleteBom(req.user, idParam(req.params.id)));
}));
bomRouter.post('/order/:id/approve', can(FEATURE, 'approve'), can('order.bom.approve', 'view'), asyncHandler(async (req, res) => {
  res.json(await bom.setStatus(req.user, idParam(req.params.id), 'approved'));
}));
bomRouter.post('/order/:id/reopen', can(FEATURE, 'approve'), can('order.bom.approve', 'view'), asyncHandler(async (req, res) => {
  res.json(await bom.setStatus(req.user, idParam(req.params.id), 'draft'));
}));
