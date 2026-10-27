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
// Basic masters: save the whole list of one master at once
// Changes and deletes need Edit; new rows need Create
const batchGuard = (req, res, next) => {
  const b = req.body || {};
  const save = Array.isArray(b.save) ? b.save : [];
  const needEdit = (Array.isArray(b.remove) && b.remove.length > 0) || save.some(r => r && r.id);
  const needCreate = save.some(r => r && !r.id);
  const checks = [...(needEdit ? ['edit'] : []), ...(needCreate ? ['create'] : []), 'view'];
  const run = (i) => (i >= checks.length ? next() : guard(checks[i])(req, res, (err) => (err ? next(err) : run(i + 1))));
  run(0);
};
mastersRouter.post('/:kind/batch', batchGuard, asyncHandler(async (req, res) => {
  res.json(await masters.saveBatch(req.master, req.user, req.body || {}));
}));
mastersRouter.put('/:kind/:id', guard('edit'), asyncHandler(async (req, res) => {
  res.json(await masters.update(req.master, req.user, idParam(req.params.id), req.body || {}));
}));
// Screens with their own Delete function (Product category, Item, Summary item) also need that function
const deleteGuard = (req, res, next) => (req.master.deleteFeature ? can(req.master.deleteFeature, 'view')(req, res, next) : next());
mastersRouter.delete('/:kind/:id', guard('edit'), deleteGuard, asyncHandler(async (req, res) => {
  res.json(await masters.remove(req.master, req.user, idParam(req.params.id)));
}));
