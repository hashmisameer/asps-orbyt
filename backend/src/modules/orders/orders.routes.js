import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import * as orders from './orders.service.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}

// Dropdown data for the Order entry screen
ordersRouter.get('/lookups', asyncHandler(async (req, res) => {
  res.json(await orders.getLookups(req.user.companyId));
}));

// Preview of the next order numbers for a brand (does not reserve them)
ordersRouter.get('/next-numbers', asyncHandler(async (req, res) => {
  const brandId = idParam(req.query.brandId);
  const count = Number(req.query.count) || 1;
  res.json({ numbers: await orders.previewNumbers(req.user.companyId, brandId, count) });
}));

ordersRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await orders.listOrders(req.user.companyId));
}));

ordersRouter.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(await orders.createOrder(req.user, req.body || {}));
}));

ordersRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(await orders.getOrder(req.user.companyId, idParam(req.params.id)));
}));

// Add more lines to a saved order
ordersRouter.post('/:id/lines', asyncHandler(async (req, res) => {
  res.status(201).json(await orders.addLines(req.user, idParam(req.params.id), req.body || {}));
}));

// Change a saved line (only buyer PO, size range and quantities)
ordersRouter.patch('/:id/lines/:lineId', asyncHandler(async (req, res) => {
  res.json(await orders.updateLine(req.user, idParam(req.params.id), idParam(req.params.lineId), req.body || {}));
}));

// Saved lines are kept for the record; cancelling comes in a later phase
ordersRouter.delete('/:id/lines/:lineId', asyncHandler(async () => {
  throw new AppError(400, "Saved lines can't be deleted.");
}));
