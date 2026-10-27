// Brand master: brand code (goes into the order no., e.g. ORD/26-27/NWA/0001), name, buyer, currency, export flag.
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

const text = (v, max = 200) => {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};
const id = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const str = (v) => (v === null || v === undefined ? '' : String(v));

// Buyers (Party master, type Buyer or Both) and currencies for the dropdowns
export async function getLookups(companyId) {
  const [buyers, currencies] = await Promise.all([
    query(`SELECT id, code, name, currency_id, is_export FROM parties
            WHERE company_id = $1 AND is_active AND party_type IN ('buyer', 'both') ORDER BY name`, [companyId]),
    query('SELECT id, code, name FROM currencies WHERE company_id = $1 AND is_active ORDER BY code', [companyId])
  ]);
  return {
    buyers: buyers.map(b => ({ id: str(b.id), code: b.code, name: b.name, currencyId: str(b.currency_id), isExport: b.is_export })),
    currencies: currencies.map(c => ({ id: str(c.id), code: c.code, name: c.name }))
  };
}

export async function listBrands(companyId, { search = '' } = {}) {
  const q = String(search).trim();
  const rows = await query(
    `SELECT b.id, b.initials, b.name, b.is_export, b.is_active, p.name AS buyer, cur.code AS currency,
            (SELECT COUNT(*) FROM orders o WHERE o.brand_id = b.id)::int AS orders
       FROM brands b
       LEFT JOIN parties p ON p.id = b.buyer_id
       LEFT JOIN currencies cur ON cur.id = b.currency_id
      WHERE b.company_id = $1
        AND ($2 = '' OR b.name ILIKE '%' || $2 || '%' OR b.initials ILIKE '%' || $2 || '%' OR p.name ILIKE '%' || $2 || '%')
      ORDER BY b.is_active DESC, b.name LIMIT 300`, [companyId, q]);
  return rows.map(r => ({
    id: r.id, code: r.initials, name: r.name, buyer: r.buyer || '', currency: r.currency || '',
    isExport: r.is_export, isActive: r.is_active, orders: r.orders
  }));
}

export async function getBrand(companyId, brandId) {
  const b = (await query(
    `SELECT b.*, u.full_name AS updated_name,
            (SELECT COUNT(*) FROM orders o WHERE o.brand_id = b.id)::int AS orders
       FROM brands b LEFT JOIN users u ON u.id = COALESCE(b.updated_by, b.created_by)
      WHERE b.id = $1 AND b.company_id = $2`, [brandId, companyId]))[0];
  if (!b) throw new AppError(404, 'Brand not found.');
  return {
    id: b.id, code: b.initials, name: b.name, buyerId: str(b.buyer_id), currencyId: str(b.currency_id),
    isExport: b.is_export, isActive: b.is_active, orders: b.orders, updatedBy: b.updated_name || '', updatedAt: b.updated_at
  };
}

async function read(companyId, body, brandId = null) {
  const h = {
    code: text(body.code, 5)?.toUpperCase().replace(/\s/g, '') || null,
    name: text(body.name, 120),
    buyerId: id(body.buyerId),
    currencyId: id(body.currencyId),
    isExport: body.isExport === true,
    isActive: body.isActive !== false
  };
  const problems = [];
  if (!h.code) problems.push('brand code');
  else if (!/^[A-Z0-9]{2,5}$/.test(h.code)) problems.push('brand code (2 to 5 letters or numbers)');
  if (!h.name) problems.push('brand name');
  if (!h.buyerId || !(await query(`SELECT 1 FROM parties WHERE id = $1 AND company_id = $2 AND party_type IN ('buyer', 'both')`,
    [h.buyerId, companyId])).length) problems.push('buyer');
  if (h.currencyId && !(await query('SELECT 1 FROM currencies WHERE id = $1 AND company_id = $2', [h.currencyId, companyId])).length) problems.push('a valid currency');
  if (problems.length) throw new AppError(400, `Fill in ${problems.join(', ')}.`);

  const dupCode = await query('SELECT name FROM brands WHERE company_id = $1 AND initials = $2 AND ($3::bigint IS NULL OR id <> $3)', [companyId, h.code, brandId]);
  if (dupCode.length) throw new AppError(400, `Brand code ${h.code} is already used by ${dupCode[0].name}.`);
  const dupName = await query('SELECT initials FROM brands WHERE company_id = $1 AND lower(name) = lower($2) AND ($3::bigint IS NULL OR id <> $3)', [companyId, h.name, brandId]);
  if (dupName.length) throw new AppError(400, `A brand named "${h.name}" already exists (${dupName[0].initials}).`);
  return h;
}

async function audit(db, user, action, brandId, details) {
  await db.query('INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, 'brands', String(brandId), JSON.stringify(details)]);
}

export async function createBrand(user, body) {
  const h = await read(user.companyId, body);
  const brandId = await withTransaction(async (db) => {
    const bid = (await db.query(
      `INSERT INTO brands (company_id, initials, name, buyer_id, currency_id, is_export, is_active, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
      [user.companyId, h.code, h.name, h.buyerId, h.currencyId, h.isExport, h.isActive, user.id])).rows[0].id;
    await audit(db, user, 'CREATE', bid, h);
    return bid;
  });
  return getBrand(user.companyId, brandId);
}

export async function updateBrand(user, brandId, body) {
  const before = await getBrand(user.companyId, brandId);
  const h = await read(user.companyId, body, brandId);
  // The code is part of every order number of this brand, so it can't change once orders exist
  if (h.code !== before.code && before.orders > 0) {
    throw new AppError(400, `Brand code ${before.code} is already in ${before.orders} order number${before.orders === 1 ? '' : 's'}, so it can't be changed.`);
  }
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE brands SET initials = $3, name = $4, buyer_id = $5, currency_id = $6, is_export = $7, is_active = $8,
              updated_by = $9, updated_at = now()
        WHERE id = $1 AND company_id = $2`,
      [brandId, user.companyId, h.code, h.name, h.buyerId, h.currencyId, h.isExport, h.isActive, user.id]);
    await audit(db, user, 'UPDATE', brandId, h);
  });
  return getBrand(user.companyId, brandId);
}

// Delete a brand nothing uses yet (no order, no style); otherwise it can only be archived (Active off)
export async function deleteBrand(user, brandId) {
  return withTransaction(async (db) => {
    const b = (await db.query('SELECT initials, name FROM brands WHERE id = $1 AND company_id = $2 FOR UPDATE', [brandId, user.companyId])).rows[0];
    if (!b) throw new AppError(404, 'Brand not found.');
    const u = (await db.query(
      `SELECT (SELECT COUNT(*) FROM orders WHERE brand_id = $1)::int AS orders,
              (SELECT COUNT(*) FROM styles WHERE brand_id = $1)::int AS styles`, [brandId])).rows[0];
    const used = [u.orders && `${u.orders} order${u.orders === 1 ? '' : 's'}`, u.styles && `${u.styles} style${u.styles === 1 ? '' : 's'}`].filter(Boolean);
    if (used.length) throw new AppError(400, `Brand ${b.initials} is used in ${used.join(' and ')}, so it can't be deleted. Archive it instead (Active off).`);
    await db.query('DELETE FROM brands WHERE id = $1', [brandId]);
    await audit(db, user, 'DELETE', brandId, { code: b.initials, name: b.name });
    return { ok: true, code: b.initials };
  });
}
