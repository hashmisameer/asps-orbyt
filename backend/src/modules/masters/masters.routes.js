// /api/masters/:kind  (kind = colour, size_range, uom, year, season, currency, item_group, item)
import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { can } from '../access/access.service.js';
import * as masters from './masters.service.js';

export const mastersRouter = Router();
mastersRouter.use(requireAuth);

// Checks the permission of the master named in the URL
const guard = (action) => (req, res, next) => {
  try {
    req.master = masters.masterFor(req.params.kind);
  } catch (err) {
    return next(err);
  }
  return can(req.master.feature, action)(req, res, next);
};

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}

mastersRouter.get('/:kind', guard('view'), asyncHandler(async (req, res) => {
  res.json(await masters.list(req.master, req.user.companyId));
}));
mastersRouter.post('/:kind', guard('create'), asyncHandler(async (req, res) => {
  res.status(201).json(await masters.create(req.master, req.user, req.body || {}));
}));
mastersRouter.put('/:kind/:id', guard('edit'), asyncHandler(async (req, res) => {
  res.json(await masters.update(req.master, req.user, idParam(req.params.id), req.body || {}));
}));
mastersRouter.delete('/:kind/:id', guard('edit'), asyncHandler(async (req, res) => {
  res.json(await masters.remove(req.master, req.user, idParam(req.params.id)));
}));
