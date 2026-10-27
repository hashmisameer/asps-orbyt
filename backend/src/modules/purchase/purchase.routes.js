// /api/purchase : Purchase module (Purchase order now; Indent and GRN later)
import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { can, getUserAccess } from '../access/access.service.js';
import * as po from './po.service.js';

const PO = 'purchase.po';
export const purchaseRouter = Router();
purchaseRouter.use(requireAuth);

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}
async function canApprove(req) {
  const { permissions } = await getUserAccess(req.user.id, req.user.companyId);
  return (permissions[PO] || []).includes('approve');
}

purchaseRouter.get('/po/lookups', can(PO, 'view'), asyncHandler(async (req, res) => res.json(await po.getLookups(req.user.companyId))));
purchaseRouter.get('/po/supplier/:id', can(PO, 'view'), asyncHandler(async (req, res) => res.json(await po.getSupplier(req.user.companyId, idParam(req.params.id)))));
// Pickers: approved BOM lines still to buy, and any item
purchaseRouter.get('/po/bom-lines', can(PO, 'view'), asyncHandler(async (req, res) => res.json(await po.bomLines(req.user.companyId, req.query))));
purchaseRouter.get('/po/items', can(PO, 'view'), asyncHandler(async (req, res) => res.json(await po.pickItems(req.user.companyId, req.query))));

purchaseRouter.get('/po', can(PO, 'view'), asyncHandler(async (req, res) => res.json(await po.listPos(req.user.companyId, req.query))));
purchaseRouter.get('/po/:id', can(PO, 'view'), asyncHandler(async (req, res) => res.json(await po.getPo(req.user.companyId, idParam(req.params.id)))));
purchaseRouter.post('/po', can(PO, 'create'), asyncHandler(async (req, res) => {
  res.status(201).json(await po.createPo(req.user, req.body || {}, { canApprove: await canApprove(req) }));
}));
purchaseRouter.put('/po/:id', can(PO, 'edit'), asyncHandler(async (req, res) => {
  res.json(await po.updatePo(req.user, idParam(req.params.id), req.body || {}, { canApprove: await canApprove(req) }));
}));
purchaseRouter.post('/po/:id/approve', can(PO, 'approve'), asyncHandler(async (req, res) => res.json(await po.approvePo(req.user, idParam(req.params.id)))));
purchaseRouter.post('/po/:id/reject', can(PO, 'approve'), asyncHandler(async (req, res) => res.json(await po.rejectPo(req.user, idParam(req.params.id), (req.body || {}).reason))));
purchaseRouter.post('/po/:id/cancel', can(PO, 'edit'), asyncHandler(async (req, res) => res.json(await po.cancelPo(req.user, idParam(req.params.id), (req.body || {}).reason))));
purchaseRouter.delete('/po/:id', can(PO, 'edit'), can('purchase.po.delete', 'view'), asyncHandler(async (req, res) => res.json(await po.deletePo(req.user, idParam(req.params.id)))));
