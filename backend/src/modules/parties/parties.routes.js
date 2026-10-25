// /api/parties : Party master (feature masters.party)
import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { can, getUserAccess } from '../access/access.service.js';
import * as parties from './parties.service.js';

const FEATURE = 'masters.party';
export const partiesRouter = Router();
partiesRouter.use(requireAuth);

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'Not found.');
  return n;
}

partiesRouter.get('/lookups', can(FEATURE, 'view'), asyncHandler(async (req, res) => res.json(await parties.getLookups(req.user.companyId))));
// A new city or state typed on the screen: anyone who may add or change parties may add one
partiesRouter.post('/places/:kind', can(FEATURE, 'view'), asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  if (!['city', 'state'].includes(kind)) throw new AppError(404, 'Not found.');
  const { permissions } = await getUserAccess(req.user.id, req.user.companyId);
  const actions = permissions[FEATURE] || [];
  if (!actions.includes('create') && !actions.includes('edit')) throw new AppError(403, "You don't have permission to add a city or state. Ask your administrator.");
  res.status(201).json(await parties.addPlace(req.user, kind, req.body || {}));
}));
partiesRouter.get('/', can(FEATURE, 'view'), asyncHandler(async (req, res) => res.json(await parties.listParties(req.user.companyId, req.query))));
partiesRouter.get('/:id', can(FEATURE, 'view'), asyncHandler(async (req, res) => res.json(await parties.getParty(req.user.companyId, idParam(req.params.id)))));
partiesRouter.post('/', can(FEATURE, 'create'), asyncHandler(async (req, res) => res.status(201).json(await parties.createParty(req.user, req.body || {}))));
partiesRouter.put('/:id', can(FEATURE, 'edit'), asyncHandler(async (req, res) => res.json(await parties.updateParty(req.user, idParam(req.params.id), req.body || {}))));
