// Simple masters (Buyer, Season, Currency, Item group, Item): a list of rows with a few fields each.
// Each master is described once in MASTERS; the same code lists, adds and edits all of them.
//
// Field options:
//   required, upper, min, max         text checks
//   number                            a number (above 0 when required, empty allowed otherwise)
//   options: [...]                    must be one of these values
//   ref: { table, label }             must be a row of that table in the same company; label = SQL for its name
//   unique / uniqueWith: ['col']      no two rows with the same value (optionally together with another column)
import { query } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

export const ITEM_TYPES = ['fabric', 'trims', 'packing'];
export const ITEM_NATURES = ['Main', 'Contrast', 'Lining', 'Interlining', 'Pocketing', 'Other'];

export const MASTERS = {
  buyer: {
    table: 'buyers', feature: 'masters.buyer', label: 'Buyer', order: 'name',
    fields: [
      { key: 'code', column: 'code', label: 'Short code', required: true, upper: true, max: 10, unique: true },
      { key: 'name', column: 'name', label: 'Buyer name', required: true, max: 120 },
      { key: 'country', column: 'country', label: 'Country', max: 60 }
    ]
  },
  season: {
    table: 'seasons', feature: 'masters.season', label: 'Season', order: 'name',
    fields: [
      { key: 'name', column: 'name', label: 'Season', required: true, max: 60, unique: true }
    ]
  },
  currency: {
    table: 'currencies', feature: 'masters.currency', label: 'Currency', order: 'code',
    fields: [
      { key: 'code', column: 'code', label: 'Code', required: true, upper: true, max: 3, min: 3, unique: true },
      { key: 'name', column: 'name', label: 'Currency name', required: true, max: 60 },
      { key: 'rateToInr', column: 'rate_to_inr', label: 'Rate in rupees', required: true, number: true }
    ]
  },
  item_group: {
    table: 'item_groups', feature: 'masters.item_group', label: 'Summary item', order: 'item_type, name',
    fields: [
      { key: 'itemType', column: 'item_type', label: 'Item type', required: true, options: ITEM_TYPES },
      { key: 'name', column: 'name', label: 'Summary item', required: true, upper: true, max: 120, unique: true, uniqueWith: ['item_type'] },
      { key: 'uom', column: 'uom', label: 'Usual UOM', upper: true, max: 10 }
    ]
  },
  item: {
    table: 'items', feature: 'masters.item', label: 'Item', order: 'name',
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
      { key: 'composition', column: 'composition', label: 'Composition', max: 120 }
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
    row[f.key] = v === null || v === undefined ? '' : f.number ? Number(v) : f.ref ? String(v) : v;
  }
  return row;
};

// Rows plus the choices for every dropdown field, so the screen can show names instead of ids
export async function list(m, companyId) {
  const rows = await query(`SELECT * FROM ${m.table} WHERE company_id = $1 ORDER BY is_active DESC, ${m.order}`, [companyId]);
  const refs = {};
  for (const f of m.fields.filter(x => x.ref)) {
    refs[f.key] = (await query(
      `SELECT id, ${f.ref.label} AS label, is_active FROM ${f.ref.table} WHERE company_id = $1 ORDER BY 2`, [companyId]))
      .map(r => ({ id: String(r.id), label: r.label, isActive: r.is_active }));
  }
  return { rows: rows.map(r => toRow(m, r)), refs };
}

// Checks the form and returns { column: value } ready to save
async function read(m, companyId, body, id = null) {
  const values = {};
  const problems = [];
  for (const f of m.fields) {
    let v = body[f.key];
    const empty = v === undefined || v === null || String(v).trim() === '';
    if (f.number) {
      if (empty && !f.required) { values[f.column] = null; continue; }
      v = Number(String(v ?? '').replace(/,/g, ''));
      if (!Number.isFinite(v) || v <= 0) { problems.push(`${f.label.toLowerCase()} (a number above 0)`); continue; }
    } else if (f.ref) {
      if (empty) { if (f.required) problems.push(f.label.toLowerCase()); else values[f.column] = null; continue; }
      const ok = (await query(`SELECT 1 FROM ${f.ref.table} WHERE id = $1 AND company_id = $2`, [Number(v), companyId])).length;
      if (!/^\d+$/.test(String(v)) || !ok) { problems.push(`a valid ${f.label.toLowerCase()}`); continue; }
      v = Number(v);
    } else {
      v = String(v ?? '').trim();
      if (f.upper) v = v.toUpperCase();
      if (f.required && !v) { problems.push(f.label.toLowerCase()); continue; }
      if (v && f.options && !f.options.includes(v)) { problems.push(`a valid ${f.label.toLowerCase()}`); continue; }
      if (v && f.min && v.length < f.min) { problems.push(`${f.label.toLowerCase()} (${f.min} letters)`); continue; }
      if (f.max && v.length > f.max) { problems.push(`${f.label.toLowerCase()} (up to ${f.max} characters)`); continue; }
      v = v || null;
    }
    values[f.column] = v;
  }
  if (problems.length) throw new AppError(400, `Fill in ${problems.join(', ')}.`);
  for (const f of m.fields.filter(x => x.unique && values[x.column] !== null)) {
    const withCols = f.uniqueWith || [];
    const params = [companyId, values[f.column], id, ...withCols.map(c => values[c])];
    const dup = await query(
      `SELECT 1 FROM ${m.table} WHERE company_id = $1 AND lower(${f.column}::text) = lower($2) AND ($3::bigint IS NULL OR id <> $3)
         ${withCols.map((c, i) => `AND ${c} = $${i + 4}`).join(' ')}`, params);
    if (dup.length) throw new AppError(400, `${f.label} "${values[f.column]}" already exists.`);
  }
  return values;
}

async function audit(user, action, entity, id, details) {
  await query('INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, entity, String(id), JSON.stringify(details)]);
}

export async function create(m, user, body) {
  const values = await read(m, user.companyId, body);
  const cols = Object.keys(values);
  const row = (await query(
    `INSERT INTO ${m.table} (company_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
    [user.companyId, ...cols.map(c => values[c])]))[0];
  await audit(user, 'CREATE', m.table, row.id, values);
  return toRow(m, row);
}

export async function update(m, user, id, body) {
  const values = await read(m, user.companyId, body, id);
  values.is_active = body.isActive !== false;
  const cols = Object.keys(values);
  const row = (await query(
    `UPDATE ${m.table} SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')} WHERE id = $1 AND company_id = $2 RETURNING *`,
    [id, user.companyId, ...cols.map(c => values[c])]))[0];
  if (!row) throw new AppError(404, `${m.label} not found.`);
  await audit(user, 'UPDATE', m.table, id, values);
  return toRow(m, row);
}
