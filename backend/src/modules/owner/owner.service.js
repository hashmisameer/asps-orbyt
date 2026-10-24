// Owner console (ORBYT super admin): client companies, their licence, and which
// modules, screens and reports each client gets. Only platform_admins reach this code.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/errors.js';
import { expiringAddons } from '../access/access.service.js';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const BAD_LOGIN = 'User ID or password is wrong.';

async function ownerAudit(db, ownerId, companyId, action, details) {
  await db.query(
    `INSERT INTO audit_log (platform_admin_id, company_id, action, entity, entity_id, details)
     VALUES ($1, $2, $3, 'company', $4, $5)`,
    [ownerId, companyId, action, companyId ? String(companyId) : null, details ? JSON.stringify(details) : null]);
}
const dbq = { query: (text, params) => query(text, params).then(rows => ({ rows })) };

// ---------- Sign in ----------
export async function ownerLogin({ username, password }) {
  if (!username || !password) throw new AppError(400, 'Enter your user ID and password.');
  const admin = (await query(
    `SELECT id, username, full_name, password_hash, is_active, failed_attempts, locked_until
       FROM platform_admins WHERE lower(username) = lower($1)`, [String(username).trim()]))[0];
  if (!admin || !admin.is_active) throw new AppError(401, BAD_LOGIN);
  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    throw new AppError(423, `Too many wrong attempts. Try again after ${LOCK_MINUTES} minutes.`);
  }
  if (!(await bcrypt.compare(password, admin.password_hash))) {
    const attempts = admin.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await query(
      `UPDATE platform_admins SET failed_attempts = $2,
              locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE NULL END
        WHERE id = $1`, [admin.id, lock ? 0 : attempts, lock, String(LOCK_MINUTES)]);
    await ownerAudit(dbq, admin.id, null, 'OWNER_LOGIN_FAILED', { attempts });
    if (lock) throw new AppError(423, `Too many wrong attempts. Locked for ${LOCK_MINUTES} minutes.`);
    throw new AppError(401, BAD_LOGIN);
  }
  await query('UPDATE platform_admins SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [admin.id]);
  await ownerAudit(dbq, admin.id, null, 'OWNER_LOGIN');
  const token = jwt.sign({ sub: String(admin.id), scope: 'owner' }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  return { token, owner: { id: admin.id, username: admin.username, fullName: admin.full_name } };
}

// ---------- Catalogue: every module with its screens, functions, reports and tools ----------
const money = (v) => (v === null || v === undefined ? null : Number(v));

export async function getCatalog() {
  const mods = await query('SELECT code, name, always_on, is_addon, price, price_per FROM modules ORDER BY sort_order');
  const feats = await query(
    'SELECT code, parent_code, module_code, group_name, name, kind, is_addon, price, price_per FROM features ORDER BY sort_order');
  return mods.map(m => ({
    code: m.code, name: m.name, alwaysOn: m.always_on,
    isAddon: m.is_addon, price: money(m.price), pricePer: m.price_per,
    features: feats.filter(f => f.module_code === m.code)
      .map(f => ({
        code: f.code, parent: f.parent_code, name: f.name, kind: f.kind, group: f.group_name,
        isAddon: f.is_addon, price: money(f.price), pricePer: f.price_per
      }))
  }));
}

// Owner > Catalogue & prices: make a module or feature Base or Add-on, and set its default price
export async function updateCatalogItem(owner, level, code, body) {
  const table = level === 'modules' ? 'modules' : level === 'features' ? 'features' : null;
  if (!table) throw new AppError(404, 'Not found.');
  const before = (await query(`SELECT name, is_addon, price, price_per FROM ${table} WHERE code = $1`, [code]))[0];
  if (!before) throw new AppError(404, 'Not found.');
  if (table === 'modules' && code === 'admin') throw new AppError(400, 'Admin is always part of the licence.');
  const isAddon = body.isAddon === true;
  const pricePer = body.pricePer === 'year' ? 'year' : 'month';
  let price = null;
  if (isAddon) {
    price = Number(String(body.price ?? '').replace(/,/g, ''));
    if (!Number.isFinite(price) || price < 0) throw new AppError(400, 'Enter a price of 0 or more for this add-on.');
  }
  await withTransaction(async (db) => {
    await db.query(`UPDATE ${table} SET is_addon = $2, price = $3, price_per = $4 WHERE code = $1`, [code, isAddon, price, pricePer]);
    // Base -> Add-on: clients that already have it keep it till their licence date (or a year), so nothing vanishes today
    if (isAddon && !before.is_addon) {
      const link = table === 'modules'
        ? { t: 'company_modules', col: 'module_code', extra: 'AND x.enabled' }
        : { t: 'company_features', col: 'feature_code', extra: '' };
      await db.query(
        `UPDATE ${link.t} x SET paid_till = COALESCE(c.licence_valid_till, CURRENT_DATE + 365)
           FROM companies c WHERE c.id = x.company_id AND x.${link.col} = $1 AND x.paid_till IS NULL ${link.extra}`, [code]);
    }
    await ownerAudit(db, owner.id, null, 'CATALOGUE_PRICE_CHANGED', {
      code, name: before.name,
      from: { isAddon: before.is_addon, price: money(before.price), per: before.price_per },
      to: { isAddon, price, per: pricePer }
    });
  });
  return getCatalog();
}

// ---------- Clients ----------
export async function listCompanies() {
  const rows = await query(
    `SELECT c.id, c.code, c.name, c.city, c.status, c.max_users,
            to_char(c.licence_valid_till, 'YYYY-MM-DD') AS licence_valid_till,
            (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.is_active)::int AS users_used,
            (SELECT COUNT(*) FROM company_modules cm JOIN modules m ON m.code = cm.module_code
              WHERE cm.company_id = c.id AND cm.enabled AND NOT m.always_on)::int AS modules_on
       FROM companies c ORDER BY c.name`);
  const expiring = {};
  for (const r of rows) expiring[r.id] = (await expiringAddons(r.id)).length;
  return rows.map(r => ({
    id: r.id, code: r.code, name: r.name, city: r.city, status: r.status, maxUsers: r.max_users,
    licenceValidTill: r.licence_valid_till, usersUsed: r.users_used, modulesOn: r.modules_on,
    addonsExpiring: expiring[r.id]
  }));
}

export async function getCompany(id) {
  const c = (await query(
    `SELECT id, code, name, gstin, address_line, city, state, pin, country,
            contact_name, contact_designation, contact_mobile, contact_email,
            to_char(licence_valid_till, 'YYYY-MM-DD') AS licence_valid_till, max_users, status
       FROM companies WHERE id = $1`, [id]))[0];
  if (!c) throw new AppError(404, 'Client not found.');
  const modRows = await query(
    `SELECT module_code AS code, to_char(paid_till, 'YYYY-MM-DD') AS paid_till, price
       FROM company_modules WHERE company_id = $1 AND enabled`, [id]);
  const featRows = await query(
    `SELECT feature_code AS code, to_char(paid_till, 'YYYY-MM-DD') AS paid_till, price
       FROM company_features WHERE company_id = $1`, [id]);
  const modules = modRows.map(r => r.code);
  const features = featRows.map(r => r.code);
  // Paid till date and special price per ticked item (only items that have one)
  const addons = {};
  for (const r of [...modRows, ...featRows]) {
    if (r.paid_till || r.price !== null) addons[r.code] = { paidTill: r.paid_till || '', price: money(r.price) };
  }
  const admin = (await query(
    `SELECT u.username FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.company_id = $1 AND r.is_admin ORDER BY u.id LIMIT 1`, [id]))[0];
  const usersUsed = (await query('SELECT COUNT(*)::int AS n FROM users WHERE company_id = $1 AND is_active', [id]))[0].n;
  return {
    id: c.id, code: c.code, name: c.name, gstin: c.gstin || '', addressLine: c.address_line || '',
    city: c.city || '', state: c.state || '', pin: c.pin || '', country: c.country || '',
    contactName: c.contact_name || '', contactDesignation: c.contact_designation || '',
    contactMobile: c.contact_mobile || '', contactEmail: c.contact_email || '',
    licenceValidTill: c.licence_valid_till || '', maxUsers: c.max_users, status: c.status,
    adminUsername: admin?.username || '', usersUsed, modules, features, addons
  };
}

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

// Checks the form and returns tidy values, or throws one message listing what is wrong.
function readDetails(body, isNew) {
  const d = {
    name: clean(body.name), gstin: clean(body.gstin).toUpperCase(), addressLine: clean(body.addressLine),
    city: clean(body.city), state: clean(body.state), pin: clean(body.pin), country: clean(body.country) || 'India',
    contactName: clean(body.contactName), contactDesignation: clean(body.contactDesignation),
    contactMobile: clean(body.contactMobile), contactEmail: clean(body.contactEmail),
    licenceValidTill: clean(body.licenceValidTill), maxUsers: Number(body.maxUsers),
    status: clean(body.status) || 'active'
  };
  const problems = [];
  if (!d.name) problems.push('company name');
  if (!d.addressLine) problems.push('address');
  if (!d.contactName) problems.push('contact name');
  if (!Number.isInteger(d.maxUsers) || d.maxUsers < 1) problems.push('max users (1 or more)');
  if (d.licenceValidTill && !/^\d{4}-\d{2}-\d{2}$/.test(d.licenceValidTill)) problems.push('a valid licence date');
  if (!['active', 'suspended'].includes(d.status)) problems.push('status');
  if (d.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.contactEmail)) problems.push('a valid contact email');
  if (isNew) {
    d.code = clean(body.code).toUpperCase();
    d.adminUsername = clean(body.adminUsername);
    d.adminPassword = String(body.adminPassword || '');
    if (!/^[A-Z0-9]{2,10}$/.test(d.code)) problems.push('short code (2 to 10 letters or numbers)');
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(d.adminUsername)) problems.push('client admin login (3 to 30 letters, numbers, . _ -)');
    if (d.adminPassword.length < 8) problems.push('client admin password (at least 8 characters)');
  }
  if (problems.length) throw new AppError(400, `Fill in ${problems.join(', ')}.`);
  return d;
}

// Keeps only modules and features that exist, features whose module is switched on,
// and functions/reports whose screen is ticked too. Every ticked add-on needs a paid till date.
async function readAccess(body) {
  const catalog = await getCatalog();
  const wanted = new Set(Array.isArray(body.modules) ? body.modules : []);
  const modules = catalog.filter(m => m.alwaysOn || wanted.has(m.code)).map(m => m.code);
  const allFeatures = catalog.flatMap(m => m.features);
  const allowedFeatures = new Set(catalog.filter(m => modules.includes(m.code)).flatMap(m => m.features.map(f => f.code)));
  const alwaysOnFeatures = catalog.filter(m => m.alwaysOn).flatMap(m => m.features.map(f => f.code));
  let features = [...new Set([...(Array.isArray(body.features) ? body.features : []), ...alwaysOnFeatures])]
    .filter(f => allowedFeatures.has(f));
  // Drop children whose screen is not ticked (repeat for deeper levels)
  const parentOf = Object.fromEntries(allFeatures.map(f => [f.code, f.parent]));
  for (let i = 0; i < 5; i++) features = features.filter(f => !parentOf[f] || features.includes(parentOf[f]));

  // Paid till and special price, only for ticked add-ons
  const given = body.addons && typeof body.addons === 'object' ? body.addons : {};
  const addons = {};
  const missing = [];
  const bad = [];
  const ticked = [
    ...catalog.filter(m => modules.includes(m.code) && m.isAddon && !m.alwaysOn),
    ...allFeatures.filter(f => features.includes(f.code) && f.isAddon)
  ];
  for (const item of ticked) {
    const g = given[item.code] || {};
    const paidTill = clean(g.paidTill);
    if (!paidTill) { missing.push(item.name); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidTill) || Number.isNaN(Date.parse(paidTill))) { bad.push(`a valid paid till date for ${item.name}`); continue; }
    let price = null;
    if (clean(g.price) !== '') {
      price = Number(clean(g.price).replace(/,/g, ''));
      if (!Number.isFinite(price) || price < 0) { bad.push(`a price of 0 or more for ${item.name}`); continue; }
      if (price === item.price) price = null;          // same as the catalogue: no special price
    }
    addons[item.code] = { paidTill, price };
  }
  if (missing.length) throw new AppError(400, `Enter the paid till date for: ${missing.join(', ')}.`);
  if (bad.length) throw new AppError(400, `Fill in ${bad.join(', ')}.`);
  return { catalog, modules, features, addons };
}

async function saveAccess(db, companyId, catalog, modules, features, addons) {
  for (const m of catalog) {
    const a = addons[m.code] || {};
    await db.query(
      `INSERT INTO company_modules (company_id, module_code, enabled, paid_till, price) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, module_code) DO UPDATE SET enabled = EXCLUDED.enabled, paid_till = EXCLUDED.paid_till, price = EXCLUDED.price`,
      [companyId, m.code, modules.includes(m.code), a.paidTill || null, a.price ?? null]);
  }
  await db.query('DELETE FROM company_features WHERE company_id = $1 AND NOT (feature_code = ANY($2::text[]))', [companyId, features]);
  for (const code of features) {
    const a = addons[code] || {};
    await db.query(
      `INSERT INTO company_features (company_id, feature_code, paid_till, price) VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, feature_code) DO UPDATE SET paid_till = EXCLUDED.paid_till, price = EXCLUDED.price`,
      [companyId, code, a.paidTill || null, a.price ?? null]);
  }
}

const detailParams = (d) => [d.name, d.gstin || null, d.addressLine, d.city || null, d.state || null, d.pin || null, d.country,
  d.contactName, d.contactDesignation || null, d.contactMobile || null, d.contactEmail || null,
  d.licenceValidTill || null, d.maxUsers, d.status];

// Financial year running today (April to March), e.g. 2026-27
function currentFinancialYear() {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const two = (n) => String(n % 100).padStart(2, '0');
  return { label: `${y}-${two(y + 1)}`, short: `${two(y)}-${two(y + 1)}`, start: `${y}-04-01`, end: `${y + 1}-03-31` };
}

export async function createCompany(owner, body) {
  const d = readDetails(body, true);
  const { catalog, modules, features, addons } = await readAccess(body);
  if ((await query('SELECT 1 FROM companies WHERE code = $1', [d.code])).length) {
    throw new AppError(400, `Short code ${d.code} is already used by another client.`);
  }
  const hash = await bcrypt.hash(d.adminPassword, 12);
  return withTransaction(async (db) => {
    const id = (await db.query(
      `INSERT INTO companies (name, gstin, address_line, city, state, pin, country,
                              contact_name, contact_designation, contact_mobile, contact_email,
                              licence_valid_till, max_users, status, code, legal_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $1) RETURNING id`,
      [...detailParams(d), d.code])).rows[0].id;
    const unitId = (await db.query(`INSERT INTO units (company_id, code, name) VALUES ($1, 'MAIN', 'Main unit') RETURNING id`, [id])).rows[0].id;
    const fy = currentFinancialYear();
    await db.query(
      `INSERT INTO financial_years (company_id, label, short_label, start_date, end_date, is_current) VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [id, fy.label, fy.short, fy.start, fy.end]);
    await saveAccess(db, id, catalog, modules, features, addons);
    await db.query(
      `INSERT INTO issue_processes (company_id, code, name, sort_order)
       VALUES ($1, 'cutting', 'Cutting', 1), ($1, 'stitching', 'Stitching', 2), ($1, 'finishing', 'Finishing', 3)`, [id]);
    await db.query(
      `INSERT INTO currencies (company_id, code, name, rate_to_inr)
       VALUES ($1, 'INR', 'Indian rupee', 1), ($1, 'USD', 'US dollar', 84), ($1, 'EUR', 'Euro', 91), ($1, 'GBP', 'British pound', 109)`, [id]);
    const roleId = (await db.query(`INSERT INTO roles (company_id, name, is_admin, description) VALUES ($1, 'Admin', TRUE, 'Company head: manages users and roles') RETURNING id`, [id])).rows[0].id;
    await db.query(
      `INSERT INTO users (company_id, role_id, default_unit_id, username, full_name, designation, password_hash)
       VALUES ($1, $2, $3, $4, 'Administrator', 'Company admin', $5)`,
      [id, roleId, unitId, d.adminUsername, hash]);
    await ownerAudit(db, owner.id, id, 'CLIENT_CREATED', { code: d.code, name: d.name, modules, features: features.length });
    return { id };
  });
}

export async function updateCompany(owner, id, body) {
  const before = await getCompany(id);
  const d = readDetails(body, false);
  const { catalog, modules, features, addons } = await readAccess(body);
  if (d.maxUsers < before.usersUsed) {
    throw new AppError(400, `This client already has ${before.usersUsed} active users. Max users can't be lower than that.`);
  }
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE companies SET name = $1, gstin = $2, address_line = $3, city = $4, state = $5, pin = $6, country = $7,
              contact_name = $8, contact_designation = $9, contact_mobile = $10, contact_email = $11,
              licence_valid_till = $12, max_users = $13, status = $14, updated_at = now()
        WHERE id = $15`, [...detailParams(d), id]);
    await saveAccess(db, id, catalog, modules, features, addons);

    // Record only what changed, in words the owner can read later
    const changes = {};
    const on = modules.filter(m => !before.modules.includes(m));
    const off = before.modules.filter(m => !modules.includes(m));
    const fOn = features.filter(f => !before.features.includes(f));
    const fOff = before.features.filter(f => !features.includes(f));
    if (on.length) changes.modulesOn = on;
    if (off.length) changes.modulesOff = off;
    if (fOn.length) changes.screensOn = fOn;
    if (fOff.length) changes.screensOff = fOff;
    // Paid till dates and special prices that changed
    const addonChanges = [...new Set([...Object.keys(addons), ...Object.keys(before.addons)])]
      .filter(code => modules.includes(code) || features.includes(code))
      .map(code => ({ code, from: before.addons[code] || null, to: addons[code] || null }))
      .filter(c => (c.from?.paidTill || '') !== (c.to?.paidTill || '') || (c.from?.price ?? null) !== (c.to?.price ?? null));
    if (addonChanges.length) changes.addons = addonChanges;
    for (const k of ['name', 'licenceValidTill', 'maxUsers', 'status']) {
      if (String(before[k]) !== String(d[k])) changes[k] = { from: before[k], to: d[k] };
    }
    const otherDetails = ['gstin', 'addressLine', 'city', 'state', 'pin', 'country', 'contactName', 'contactDesignation', 'contactMobile', 'contactEmail']
      .filter(k => String(before[k]) !== String(d[k]));
    if (otherDetails.length) changes.detailsChanged = otherDetails;
    if (Object.keys(changes).length) await ownerAudit(db, owner.id, id, 'CLIENT_UPDATED', changes);
  });
  return getCompany(id);
}

export async function resetAdminPassword(owner, id, password) {
  if (String(password || '').length < 8) throw new AppError(400, 'The new password must have at least 8 characters.');
  const admin = (await query(
    `SELECT u.id, u.username FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.company_id = $1 AND r.is_admin ORDER BY u.id LIMIT 1`, [id]))[0];
  if (!admin) throw new AppError(404, 'This client has no admin user.');
  const hash = await bcrypt.hash(String(password), 12);
  await withTransaction(async (db) => {
    await db.query('UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = NULL, is_active = TRUE, updated_at = now() WHERE id = $1', [admin.id, hash]);
    await ownerAudit(db, owner.id, id, 'CLIENT_ADMIN_PASSWORD_RESET', { username: admin.username });
  });
  return { username: admin.username };
}

// ---------- Owner audit log ----------
export async function listOwnerAudit() {
  const rows = await query(
    `SELECT a.id, a.action, a.details, a.created_at, p.username AS owner, c.name AS company
       FROM audit_log a
       JOIN platform_admins p ON p.id = a.platform_admin_id
       LEFT JOIN companies c ON c.id = a.company_id
      WHERE a.platform_admin_id IS NOT NULL
      ORDER BY a.created_at DESC LIMIT 200`);
  return rows.map(r => ({ id: r.id, action: r.action, details: r.details, at: r.created_at, owner: r.owner, company: r.company }));
}
