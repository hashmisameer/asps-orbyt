// /api/links : flow strip and the right-hand Linked / Last changes panel
import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { getUserAccess } from '../access/access.service.js';
import * as links from './links.service.js';

export const linksRouter = Router();
linksRouter.use(requireAuth);

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}
// The user must be able to open at least one of these screens
function canView(...features) {
  return async (req, _res, next) => {
    try {
      const { permissions } = await getUserAccess(req.user.id, req.user.companyId);
      if (!features.some(f => (permissions[f] || []).includes('view'))) throw new AppError(403, "You don't have access to this screen. Ask your administrator.");
      next();
    } catch (e) { next(e); }
  };
}

const ORDER_SCREENS = ['order.entry', 'order.costing', 'order.bom'];
linksRouter.get('/order-line/:id', canView(...ORDER_SCREENS), asyncHandler(async (req, res) => res.json(await links.orderLineFlow(req.user.companyId, idParam(req.params.id)))));
linksRouter.get('/order/:id', canView(...ORDER_SCREENS), asyncHandler(async (req, res) => res.json(await links.orderFlow(req.user.companyId, idParam(req.params.id)))));
linksRouter.get('/party/:id', canView('masters.party'), asyncHandler(async (req, res) => res.json(await links.partyLinks(req.user.companyId, idParam(req.params.id)))));
linksRouter.get('/brand/:id', canView('masters.brand'), asyncHandler(async (req, res) => res.json(await links.brandLinks(req.user.companyId, idParam(req.params.id)))));
linksRouter.get('/history/:entity/:id', asyncHandler(async (req, res, next) => {
  const feature = links.HISTORY_FEATURE[req.params.entity];
  if (!feature) throw new AppError(404, 'Not found.');
  return canView(feature)(req, res, async (err) => {
    if (err) return next(err);
    try { res.json(await links.history(req.user.companyId, req.params.entity, idParam(req.params.id))); } catch (e) { next(e); }
  });
}));
