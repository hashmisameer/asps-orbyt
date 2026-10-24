// Works out what a signed-in user may see and do.
//
//   1. The owner (super admin) decides which modules and screens a company gets.
//   2. The company admin decides what each role may do inside those screens.
//   3. A user gets their role's permissions. Admin roles get everything the company has.
//
// Anything the company does not have is left out completely, so it never reaches the screen.
import { query } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

export const WARN_DAYS = 15;   // show a licence warning this many days before it ends

const fmtDate = (d) => (d ? d.split('-').reverse().join('-') : '');

// Licence and status of the company
export async function getCompanyState(companyId) {
  const row = (await query(
    `SELECT is_active, status, to_char(licence_valid_till, 'YYYY-MM-DD') AS valid_till,
            (licence_valid_till - CURRENT_DATE) AS days_left
       FROM companies WHERE id = $1`, [companyId]))[0];
  if (!row) throw new AppError(401, 'Sign in to continue.');
  const daysLeft = row.valid_till ? Number(row.days_left) : null;
  return {
    blocked: !row.is_active || row.status !== 'active',
    licence: {
      validTill: row.valid_till,
      daysLeft,
      expired: daysLeft !== null && daysLeft < 0,
      warn: daysLeft !== null && daysLeft >= 0 && daysLeft <= WARN_DAYS
    }
  };
}

export const BLOCKED_MESSAGE = "Your company's ORBYT access is paused. Contact ORBYT support.";

// Every screen/report this user may open, with the actions allowed on each.
export async function getUserAccess(userId, companyId) {
  const user = (await query(
    `SELECT u.role_id, r.is_admin
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND u.company_id = $2 AND u.is_active`, [userId, companyId]))[0];
  if (!user) throw new AppError(401, 'Your account is not active. Contact your administrator.');

  // Features the company has: always-on modules, plus modules and screens the owner switched on
  const rows = await query(
    `SELECT f.code, f.module_code, m.name AS module_name, f.group_name, f.name, f.kind, f.actions,
            rp.actions AS role_actions
       FROM features f
       JOIN modules m ON m.code = f.module_code
       LEFT JOIN company_modules cm ON cm.company_id = $1 AND cm.module_code = f.module_code
       LEFT JOIN company_features cf ON cf.company_id = $1 AND cf.feature_code = f.code
       LEFT JOIN role_permissions rp ON rp.role_id = $2 AND rp.feature_code = f.code
      WHERE m.always_on OR (cm.enabled AND cf.feature_code IS NOT NULL)
      ORDER BY m.sort_order, f.sort_order`, [companyId, user.role_id]);

  const permissions = {};
  const menu = [];
  for (const r of rows) {
    const actions = user.is_admin ? r.actions : (r.role_actions || []).filter(a => r.actions.includes(a));
    if (!actions.includes('view')) continue;     // no view = the screen is hidden
    permissions[r.code] = actions;
    if (r.kind === 'tool') continue;             // top bar icons: in permissions, never in the menu

    let mod = menu.find(m => m.code === r.module_code);
    if (!mod) { mod = { code: r.module_code, name: r.module_name, groups: [] }; menu.push(mod); }
    let group = mod.groups.find(g => g.title === r.group_name);
    if (!group) { group = { title: r.group_name, items: [] }; mod.groups.push(group); }
    group.items.push({ code: r.code, name: r.name, kind: r.kind });
  }
  return { isAdmin: user.is_admin, permissions, menu };
}

// Route guard: can('order.entry', 'create') lets the request through only if this user may do that.
export function can(featureCode, action) {
  return async (req, _res, next) => {
    try {
      const state = await getCompanyState(req.user.companyId);
      if (state.blocked) throw new AppError(403, BLOCKED_MESSAGE);
      const { permissions } = await getUserAccess(req.user.id, req.user.companyId);
      const allowed = permissions[featureCode] || [];
      if (!allowed.includes(action)) {
        throw new AppError(403, allowed.length
          ? `You don't have permission to ${action} here. Ask your administrator.`
          : "You don't have access to this screen. Ask your administrator.");
      }
      if (state.licence.expired && !['view', 'export'].includes(action)) {
        throw new AppError(403, `Your ORBYT licence ended on ${fmtDate(state.licence.validTill)}. You can still view data, but saving is paused. Contact ORBYT support to renew.`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
