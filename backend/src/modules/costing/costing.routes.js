// /api/costing : Costing screen (feature order.costing)
import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { can, getUserAccess } from '../access/access.service.js';
import * as costing from './costing.service.js';

const FEATURE = 'order.costing';
export const costingRouter = Router();
costingRouter.use(requireAuth);

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}
async function canApprove(req) {
  const { permissions } = await getUserAccess(req.user.id, req.user.companyId);
  return (permissions[FEATURE] || []).includes('approve');
}

costingRouter.get('/lookups', can(FEATURE, 'view'), asyncHandler(async (req, res) => {
  res.json(await costing.getLookups(req.user.companyId));
}));
// Item picker for fabric / trims / packing
costingRouter.get('/items', can(FEATURE, 'view'), asyncHandler(async (req, res) => {
  res.json(await costing.pickItems(req.user.companyId, req.query));
}));
costingRouter.get('/', can(FEATURE, 'view'), asyncHandler(async (req, res) => {
  res.json(await costing.listCostings(req.user.companyId, { search: req.query.search, type: req.query.type }));
}));
costingRouter.get('/:id', can(FEATURE, 'view'), asyncHandler(async (req, res) => {
  res.json(await costing.getCosting(req.user.companyId, idParam(req.params.id)));
}));
costingRouter.get('/:id/revisions/:rev', can(FEATURE, 'view'), asyncHandler(async (req, res) => {
  res.json(await costing.getRevision(req.user.companyId, idParam(req.params.id), idParam(req.params.rev)));
}));
costingRouter.post('/', can(FEATURE, 'create'), asyncHandler(async (req, res) => {
  res.status(201).json(await costing.createCosting(req.user, req.body || {}, { canApprove: await canApprove(req) }));
}));
costingRouter.put('/:id', can(FEATURE, 'edit'), asyncHandler(async (req, res) => {
  res.json(await costing.updateCosting(req.user, idParam(req.params.id), req.body || {}, { canApprove: await canApprove(req) }));
}));
costingRouter.delete('/:id', can(FEATURE, 'edit'), asyncHandler(async (req, res) => {
  res.json(await costing.deleteCosting(req.user, idParam(req.params.id)));
}));
