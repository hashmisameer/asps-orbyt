// /api/brands : Brand master (feature masters.brand)
import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { can } from '../access/access.service.js';
import * as brands from './brands.service.js';

const FEATURE = 'masters.brand';
export const brandsRouter = Router();
brandsRouter.use(requireAuth);

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}

brandsRouter.get('/lookups', can(FEATURE, 'view'), asyncHandler(async (req, res) => res.json(await brands.getLookups(req.user.companyId))));
brandsRouter.get('/', can(FEATURE, 'view'), asyncHandler(async (req, res) => res.json(await brands.listBrands(req.user.companyId, req.query))));
brandsRouter.get('/:id', can(FEATURE, 'view'), asyncHandler(async (req, res) => res.json(await brands.getBrand(req.user.companyId, idParam(req.params.id)))));
brandsRouter.post('/', can(FEATURE, 'create'), asyncHandler(async (req, res) => res.status(201).json(await brands.createBrand(req.user, req.body || {}))));
brandsRouter.put('/:id', can(FEATURE, 'edit'), asyncHandler(async (req, res) => res.json(await brands.updateBrand(req.user, idParam(req.params.id), req.body || {}))));
