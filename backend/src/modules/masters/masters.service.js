// Simple masters: a list of rows with a few fields each.
//   Basic masters screen (feature masters.basic): Colour, Size range (with its sizes), UOM, Season, Currency
//   Own screens: Item group, Item
// Each master is described once in MASTERS; the same code lists, adds, edits and deletes all of them.
//
// Field options:
//   required, upper, min, max         text checks
//   number                            a number (above 0 when required, empty allowed otherwise)
//   bool                              true / false
//   integer                           whole number (with number)
//   check(value)                      returns an error message, or nothing when the value is fine
// usage: SQL counting where a row (alias t) is used; a used row can only be switched off, not deleted.
//   options: [...]                    must be one of these values
//   ref: { table, label }             must be a row of that table in the same company; label = SQL for its name
//   unique / uniqueWith: ['col']      no two rows with the same value (optionally together with another column)
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

export const ITEM_TYPES = ['fabric', 'trims', 'packing'];
export const ITEM_NATURES = ['Main', 'Contrast', 'Lining', 'Interlining', 'Pocketing', 'Other'];

// A plain year: 2026
function checkYear(v) {
  if (!/^\d{4}$/.test(v)) return 'Write the year like 2026.';
  if (Number(v) < 2000 || Number(v) > 2100) return `${v} is not a valid year.`;
  return null;
}

// HSN code: 4, 6 or 8 digits
function checkHsn(v) {
  return /^(\d{4}|\d{6}|\d{8})$/.test(v) ? null : `HSN ${v} should be 4, 6 or 8 digits.`;
}

export const MASTERS = {
  colour: {
    table: 'colours', feature: 'masters.basic', label: 'Colour', order: 'name',
    usage: '(SELECT COUNT(*) FROM order_lines x WHERE x.colour_id = t.id) + (SELECT COUNT(*) FROM costings x WHERE x.colour_id = t.id)',
    fields: [
      { key: 'name', column: 'name', label: 'Colour name', required: true, max: 60, unique: true }
    ]
  },
  size_range: {
    table: 'size_ranges', feature: 'masters.basic', label: 'Size range', order: 'name', hasSizes: true,
    usage: '(SELECT COUNT(*) FROM order_lines x WHERE x.size_range_id = t.id) + (SELECT COUNT(*) FROM costings x WHERE x.size_range_id = t.id)',
    fields: [
      { key: 'name', column: 'name', label: 'Size range', required: true, max: 40, unique: true }
    ]
  },
  payment_term: {
    table: 'payment_terms', feature: 'masters.basic', label: 'Payment term', order: 'days NULLS LAST, name',
    usage: '(SELECT COUNT(*) FROM parties x WHERE x.payment_term_id = t.id)',
    fields: [
      { key: 'name', column: 'name', label: 'Payment term', required: true, max: 60, unique: true },
      { key: 'days', column: 'days', label: 'Days', number: true, integer: true, zeroOk: true }
    ]
  },
  uom: {
    table: 'uoms', feature: 'masters.basic', label: 'UOM', order: 'code',
    usage: '(SELECT COUNT(*) FROM items x WHERE x.company_id = t.company_id AND upper(x.uom) = upper(t.code))'
      + ' + (SELECT COUNT(*) FROM item_groups x WHERE x.company_id = t.company_id AND upper(x.uom) = upper(t.code))',
    fields: [
      { key: 'code', column: 'code', label: 'Code', required: true, upper: true, max: 10, unique: true },
      { key: 'name', column: 'name', label: 'Name', required: true, max: 40 },
      { key: 'allowDecimals', column: 'allow_decimals', label: 'Decimals allowed', bool: true }
    ]
  },
  year: {
    table: 'years', feature: 'masters.basic', label: 'Year', order: 'priority NULLS LAST, name DESC',
    usage: '(SELECT COUNT(*) FROM costings x WHERE x.year_id = t.id)',
    fields: [
      { key: 'name', column: 'name', label: 'Year', required: true, max: 10, unique: true, check: checkYear },
      { key: 'priority', column: 'priority', label: 'Priority', number: true, integer: true, uniqueAtEnd: true }
    ]
  },
  // GST % of each HSN code: a PO line takes it from the item's HSN
  hsn: {
    table: 'hsn_codes', feature: 'masters.basic', label: 'HSN code', order: 'code',
    usage: '(SELECT COUNT(*) FROM items x WHERE x.company_id = t.company_id AND x.hsn = t.code)',
    fields: [
      { key: 'code', column: 'code', label: 'HSN code', required: true, max: 8, unique: true, check: checkHsn },
      { key: 'description', column: 'description', label: 'Description', max: 150 },
      { key: 'gstRate', column: 'gst_rate', label: 'GST %', required: true, number: true, zeroOk: true, maxValue: 100 }
    ]
  },
  product_group: {
    table: 'product_groups', feature: 'masters.basic', label: 'Product group', order: 'name',
    usage: '(SELECT COUNT(*) FROM styles x WHERE x.product_group_id = t.id)',
    fields: [
      { key: 'name', column: 'name', label: 'Product group', required: true, upper: true, max: 60, unique: true }
    ]
  },
  product_class: {
    table: 'product_classes', feature: 'masters.basic', label: 'Product class', order: 'name',
    usage: '(SELECT COUNT(*) FROM styles x WHERE x.product_class_id = t.id)',
    fields: [
      { key: 'name', column: 'name', label: 'Product class', required: true, upper: true, max: 60, unique: true }
    ]
  },
  // Product category screen: one style (Style no. + description) with its group, class, season and year
  style: {
    table: 'styles', feature: 'masters.product_category', label: 'Style', order: 'code', nameColumn: 'code', deleteFeature: 'masters.product_category.delete',
    usage: '(SELECT COUNT(*) FROM orders x WHERE x.style_id = t.id) + (SELECT COUNT(*) FROM costings x WHERE x.style_id = t.id)',
    fields: [
      { key: 'code', column: 'code', label: 'Style no.', required: true, upper: true, max: 40, unique: true },
      { key: 'name', column: 'name', label: 'Style description', required: true, upper: true, max: 150 },
      { key: 'productGroupId', column: 'product_group_id', label: 'Product group', required: true, ref: { table: 'product_groups', label: 'name' } },
      { key: 'productClassId', column: 'product_class_id', label: 'Product class', required: true, ref: { table: 'product_classes', label: 'name' } },
      { key: 'seasonId', column: 'season_id', label: 'Season', required: true, ref: { table: 'seasons', label: 'name' } },
      { key: 'yearId', column: 'year_id', label: 'Year', required: true, ref: { table: 'years', label: 'name', order: 'priority NULLS LAST, name DESC' } },
      { key: 'brandId', column: 'brand_id', label: 'Brand', ref: { table: 'brands', label: "name || ' (' || initials || ')'" } },
      { key: 'sizeRangeId', column: 'size_range_id', label: 'Size range', ref: { table: 'size_ranges', label: 'name' } },
      { key: 'uomId', column: 'uom_id', label: 'UOM', ref: { table: 'uoms', label: "code || ' – ' || name" } },
      { key: 'hsn', column: 'hsn', label: 'HSN code', upper: true, max: 12 }
    ]
  },
  season: {
    table: 'seasons', feature: 'masters.basic', label: 'Season', order: 'name',
    usage: '(SELECT COUNT(*) FROM costings x WHERE x.season_id = t.id)',
    fields: [
      { key: 'name', column: 'name', label: 'Season', required: true, max: 60, unique: true }
    ]
  },
  currency: {
    table: 'currencies', feature: 'masters.basic', label: 'Currency', order: 'code',
    usage: '(SELECT COUNT(*) FROM costings x WHERE x.currency_id = t.id) + (SELECT COUNT(*) FROM costing_lines x WHERE x.currency_id = t.id)'
      + ' + (SELECT COUNT(*) FROM parties x WHERE x.currency_id = t.id) + (SELECT COUNT(*) FROM brands x WHERE x.currency_id = t.id)',
    fields: [
      { key: 'code', column: 'code', label: 'Code', required: true, upper: true, max: 3, min: 3, unique: true },
      { key: 'name', column: 'name', label: 'Currency name', required: true, max: 60 },
      { key: 'rateToInr', column: 'rate_to_inr', label: 'Rate in rupees', required: true, number: true }
    ]
  },
  item_group: {
    table: 'item_groups', feature: 'masters.item_group', label: 'Summary item', order: 'item_type, name', deleteFeature: 'masters.item_group.delete',
    usage: '(SELECT COUNT(*) FROM items x WHERE x.group_id = t.id) + (SELECT COUNT(*) FROM costing_lines x WHERE x.item_group_id = t.id)',
    fields: [
      { key: 'itemType', column: 'item_type', label: 'Item type', required: true, options: ITEM_TYPES },
      { key: 'name', column: 'name', label: 'Summary item', required: true, upper: true, max: 120, unique: true, uniqueWith: ['item_type'] },
      { key: 'uom', column: 'uom', label: 'Usual UOM', upper: true, max: 10 },
      { key: 'processId', column: 'process_id', label: 'Issue process', required: true,
        ref: { table: 'issue_processes', label: 'name' } }
    ]
  },
  item: {
    table: 'items', feature: 'masters.item', label: 'Item', order: 'name', deleteFeature: 'masters.item.delete',
    usage: '(SELECT COUNT(*) FROM costing_lines x WHERE x.item_id = t.id) + (SELECT COUNT(*) FROM bom_lines x WHERE x.item_id = t.id)',
    fields: [
      { key: 'groupId', column: 'group_id', label: 'Summary item', required: true,
        ref: { table: 'item_groups', label: "initcap(item_type) || ' › ' || name", extra: 'item_type' } },
      { key: 'code', column: 'code', label: 'Item code', upper: true, max: 40, unique: true },
      { key: 'name', column: 'name', label: 'Item name', required: true, upper: true, max: 150, unique: true },
      { key: 'uom', column: 'uom', label: 'UOM', required: true, upper: true, max: 10 },
      { key: 'itemNature', column: 'item_nature', label: 'Item nature', options: ITEM_NATURES },
      { key: 'hsn', column: 'hsn', label: 'HSN', max: 12 },
      { key: 'width', column: 'width', label: 'Width', number: true },
      { key: 'gsm', column: 'gsm', label: 'GSM', number: true },
      { key: 'composition', column: 'composition', label: 'Composition', max: 120 },
      // Empty = same process as its summary item
      { key: 'processId', column: 'process_id', label: 'Issue process', ref: { table: 'issue_processes', label: 'name' } }
    ]
  }
};

export function masterFor(kind) {
  const m = MASTERS[kind];
  if (!m) throw new AppError(404, 'Not found.');
  return m;
}

const toRow = (m, r) => {
  const row = { id: r.id, isActive: r.is_active };
  for (const f of m.fields) {
    const v = r[f.column];
    row[f.key] = f.bool ? v !== false : v === null || v === undefined ? '' : f.number ? Number(v) : f.ref ? String(v) : v;
  }
  if (m.usage) row.usedIn = Number(r.used_in || 0);
  if (m.hasSizes) row.sizes = r.sizes || [];
  return row;
};

// Sizes of the given size ranges, in their order: { rangeId: ['S', 'M', …] }
async function sizesOf(ids, db = { query: (t, p) => query(t, p).then(rows => ({ rows })) }) {
  if (!ids.length) return {};
  const rows = (await db.query(
    'SELECT size_range_id, size_label FROM size_range_sizes WHERE size_range_id = ANY($1::bigint[]) ORDER BY size_range_id, sort_order', [ids])).rows;
  const out = {};
  for (const r of rows) (out[r.size_range_id] = out[r.size_range_id] || []).push(r.size_label);
  return out;
}

// Sizes from the screen: trimmed, at least one, no repeats
function readSizes(body) {
  const list = (Array.isArray(body.sizes) ? body.sizes : []).map(x => String(x ?? '').trim()).filter(Boolean);
  if (!list.length) throw new AppError(400, 'Add at least one size to the size range.');
  const seen = new Set();
  for (const x of list) {
    if (x.length > 10) throw new AppError(400, `Size "${x}" is too long (up to 10 characters).`);
    if (seen.has(x.toUpperCase())) throw new AppError(400, `Size "${x}" is in the list twice.`);
    seen.add(x.toUpperCase());
  }
  return list;
}

async function saveSizes(db, rangeId, sizes) {
  // A size already filled in an order line can't be taken out of its range
  const used = (await db.query(
    `SELECT DISTINCT s.size_label FROM order_line_sizes s JOIN order_lines l ON l.id = s.order_line_id
      WHERE l.size_range_id = $1`, [rangeId])).rows.map(r => r.size_label);
  const missing = used.filter(u => !sizes.some(x => x.toUpperCase() === u.toUpperCase()));
  if (missing.length) throw new AppError(400, `Size ${missing.join(', ')} is used in orders, so it can't be removed from this size range.`);
  await db.query('DELETE FROM size_range_sizes WHERE size_range_id = $1', [rangeId]);
  for (let i = 0; i < sizes.length; i++) {
    await db.query('INSERT INTO size_range_sizes (size_range_id, size_label, sort_order) VALUES ($1, $2, $3)', [rangeId, sizes[i], i + 1]);
  }
}

// Rows plus the choices for every dropdown field, so the screen can show names instead of ids
export async function list(m, companyId) {
  const rows = await query(
    `SELECT t.*${m.usage ? `, (${m.usage}) AS used_in` : ''} FROM ${m.table} t WHERE t.company_id = $1 ORDER BY t.is_active DESC, ${m.order.split(', ').map(c => `t.${c}`).join(', ')}`,
    [companyId]);
  if (m.hasSizes) {
    const sizes = await sizesOf(rows.map(r => r.id));
    for (const r of rows) r.sizes = sizes[r.id] || [];
  }
  const refs = {};
  for (const f of m.fields.filter(x => x.ref)) {
    refs[f.key] = (await query(
      `SELECT id, ${f.ref.label} AS label, is_active FROM ${f.ref.table} WHERE company_id = $1 ORDER BY ${f.ref.order || '2'}`, [companyId]))
      .map(r => ({ id: String(r.id), label: r.label, isActive: r.is_active }));
  }
  return { rows: rows.map(r => toRow(m, r)), refs };
}

// Pool as a "db" (same shape as a transaction client)
const poolDb = { query: (t, p) => query(t, p).then(rows => ({ rows })) };

// Checks the form and returns { column: value } ready to save
async function read(m, companyId, body, id = null, db = poolDb) {
  const values = {};
  const problems = [];
  for (const f of m.fields) {
    let v = body[f.key];
    const empty = v === undefined || v === null || String(v).trim() === '';
    if (f.bool) { values[f.column] = v !== false && v !== 'false'; continue; }
    if (f.number) {
      if (empty && !f.required) { values[f.column] = null; continue; }
      if (empty) { problems.push(f.label.toLowerCase()); continue; }
      v = Number(String(v ?? '').replace(/,/g, ''));
      if (!Number.isFinite(v) || v < 0 || (v === 0 && !f.zeroOk)) { problems.push(`${f.label.toLowerCase()} (a number above 0)`); continue; }
      if (f.integer && !Number.isInteger(v)) { problems.push(`${f.label.toLowerCase()} (a whole number)`); continue; }
      if (f.maxValue !== undefined && v > f.maxValue) { problems.push(`${f.label.toLowerCase()} (${f.maxValue} or less)`); continue; }
    } else if (f.ref) {
      if (empty) { if (f.required) problems.push(f.label.toLowerCase()); else values[f.column] = null; continue; }
      const ok = (await db.query(`SELECT 1 FROM ${f.ref.table} WHERE id = $1 AND company_id = $2`, [Number(v), companyId])).rows.length;
      if (!/^\d+$/.test(String(v)) || !ok) { problems.push(`a valid ${f.label.toLowerCase()}`); continue; }
      v = Number(v);
    } else {
      v = String(v ?? '').trim();
      if (f.upper) v = v.toUpperCase();
      if (f.required && !v) { problems.push(f.label.toLowerCase()); continue; }
      if (v && f.options && !f.options.includes(v)) { problems.push(`a valid ${f.label.toLowerCase()}`); continue; }
      if (v && f.min && v.length < f.min) { problems.push(`${f.label.toLowerCase()} (${f.min} letters)`); continue; }
      if (f.max && v.length > f.max) { problems.push(`${f.label.toLowerCase()} (up to ${f.max} characters)`); continue; }
      if (v && f.check) { const msg = f.check(v); if (msg) throw new AppError(400, msg); }
      v = v || null;
    }
    values[f.column] = v;
  }
  if (problems.length) throw new AppError(400, `Fill in ${problems.join(', ')}.`);
  for (const f of m.fields.filter(x => x.unique && values[x.column] !== null)) {
    const withCols = f.uniqueWith || [];
    const params = [companyId, values[f.column], id, ...withCols.map(c => values[c])];
    const dup = (await db.query(
      `SELECT 1 FROM ${m.table} WHERE company_id = $1 AND lower(${f.column}::text) = lower($2) AND ($3::bigint IS NULL OR id <> $3)
         ${withCols.map((c, i) => `AND ${c} = $${i + 4}`).join(' ')}`, params)).rows;
    if (dup.length) throw new AppError(400, `${f.label} "${values[f.column]}" already exists.`);
  }
  return values;
}

// Fields that must differ between rows, checked once everything is written (so two rows can swap, e.g. priority 1 <-> 2)
async function checkUniqueAtEnd(m, db, companyId) {
  for (const f of m.fields.filter(x => x.uniqueAtEnd)) {
    const clash = (await db.query(
      `SELECT ${f.column} AS v, string_agg(${m.nameColumn || 'name'}, ' and ' ORDER BY ${m.nameColumn || 'name'}) AS names
         FROM ${m.table} WHERE company_id = $1 AND ${f.column} IS NOT NULL
        GROUP BY ${f.column} HAVING COUNT(*) > 1 ORDER BY 1 LIMIT 1`, [companyId])).rows[0];
    if (clash) {
      throw new AppError(400, `${f.label} ${clash.v} is given to both ${clash.names}. Give each ${m.label.toLowerCase()} a different ${f.label.toLowerCase()} (or leave it empty), then save.`);
    }
  }
}

async function audit(db, user, action, entity, id, details) {
  await db.query('INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, entity, String(id), JSON.stringify(details)]);
}

// ---------- write one row (inside a transaction) ----------
async function createIn(db, m, user, body) {
  const values = await read(m, user.companyId, body, null, db);
  const sizes = m.hasSizes ? readSizes(body) : null;
  const cols = Object.keys(values);
  const r = (await db.query(
    `INSERT INTO ${m.table} (company_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
    [user.companyId, ...cols.map(c => values[c])])).rows[0];
  if (sizes) { await saveSizes(db, r.id, sizes); r.sizes = sizes; }
  await audit(db, user, 'CREATE', m.table, r.id, sizes ? { ...values, sizes } : values);
  return r;
}

async function updateIn(db, m, user, id, body) {
  const values = await read(m, user.companyId, body, id, db);
  values.is_active = body.isActive !== false;
  const sizes = m.hasSizes ? readSizes(body) : null;
  const cols = Object.keys(values);
  const r = (await db.query(
    `UPDATE ${m.table} SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')} WHERE id = $1 AND company_id = $2 RETURNING *`,
    [id, user.companyId, ...cols.map(c => values[c])])).rows[0];
  if (!r) throw new AppError(404, `${m.label} not found.`);
  if (sizes) { await saveSizes(db, r.id, sizes); r.sizes = sizes; }
  await audit(db, user, 'UPDATE', m.table, id, sizes ? { ...values, sizes } : values);
  return r;
}

// Delete a row that nothing uses yet; a used row can only be switched off (Active)
async function removeIn(db, m, user, id) {
  if (!m.usage) throw new AppError(400, `${m.label} rows can't be deleted. Switch off Active instead.`);
  const r = (await db.query(
    `SELECT t.id, (${m.usage}) AS used_in FROM ${m.table} t WHERE t.id = $1 AND t.company_id = $2`, [id, user.companyId])).rows[0];
  if (!r) throw new AppError(404, `${m.label} not found.`);
  if (Number(r.used_in) > 0) {
    throw new AppError(400, `This ${m.label.toLowerCase()} is used in ${r.used_in} record${Number(r.used_in) === 1 ? '' : 's'}, so it can't be deleted. Switch off Active instead.`);
  }
  await db.query(`DELETE FROM ${m.table} WHERE id = $1 AND company_id = $2`, [id, user.companyId]);
  await audit(db, user, 'DELETE', m.table, id, {});
}

// ---------- API ----------
export async function create(m, user, body) {
  const row = await withTransaction(async (db) => {
    const r = await createIn(db, m, user, body);
    await checkUniqueAtEnd(m, db, user.companyId);
    return r;
  });
  return toRow(m, row);
}

export async function update(m, user, id, body) {
  const row = await withTransaction(async (db) => {
    const r = await updateIn(db, m, user, id, body);
    await checkUniqueAtEnd(m, db, user.companyId);
    return r;
  });
  return toRow(m, row);
}

export async function remove(m, user, id) {
  await withTransaction(db => removeIn(db, m, user, id));
  return { ok: true };
}

// Save a whole list at once (Basic masters "Save"): deletes, changes and new rows in one go – all or nothing.
// body = { remove: [id, …], save: [{ id?, …fields }, …] }
export async function saveBatch(m, user, body) {
  const removeIds = (Array.isArray(body.remove) ? body.remove : []).map(Number).filter(n => Number.isInteger(n) && n > 0);
  const rows = Array.isArray(body.save) ? body.save : [];
  if (rows.length > 500) throw new AppError(400, 'Save up to 500 rows at a time.');
  await withTransaction(async (db) => {
    for (const id of removeIds) await removeIn(db, m, user, id);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      try {
        if (r.id) await updateIn(db, m, user, Number(r.id), r);
        else await createIn(db, m, user, r);
      } catch (err) {
        // Say which row, e.g. "Row 3 (2027-28): …"
        const name = r.name || r.code || '';
        if (err instanceof AppError) err.message = `Row ${r.rowNo || i + 1}${name ? ` (${name})` : ''}: ${err.message}`;
        throw err;
      }
    }
    await checkUniqueAtEnd(m, db, user.companyId);
  });
  return list(m, user.companyId);
}
