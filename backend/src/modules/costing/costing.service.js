// Costing: the cost of one garment, built from eight tabs (fabric, trims, packing, CMT, ...).
// The server always recalculates every amount, so totals can't be tampered with from the browser.
import { pool, query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

export const SECTIONS = ['fabric', 'trims', 'packing', 'cmt', 'value_addition', 'expenses', 'management', 'other_receivable'];
const MATERIAL = ['fabric', 'trims', 'packing'];       // these use consumption + wastage
const TYPES = ['initial', 'final', 'actual'];
const MODES = ['sea', 'air'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINES = 200;

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const id = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const text = (v, max = 200) => {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};
function isDate(v) {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// One grid line: work out average qty and the rupee amount for one garment
export function calcLine(section, l) {
  const consumption = num(l.consumption);
  const wastage = MATERIAL.includes(section) ? num(l.wastagePct) : 0;
  const greige = section === 'fabric' ? num(l.greigeRate) : 0;
  const process = section === 'fabric' ? num(l.processRate) : 0;
  const rate = section === 'fabric' ? greige + process : num(l.rate);
  const exchange = num(l.exchangeRate) || 1;
  const avgQty = MATERIAL.includes(section) ? consumption * (1 + wastage / 100) : consumption;
  return { consumption, wastage, greige, process, rate, exchange, avgQty: round(avgQty), amount: round(avgQty * rate * exchange) };
}

// Totals per tab, base amount (one garment, rupees) and total amount (all pieces)
export function calcTotals(lines, orderQty) {
  const tabs = Object.fromEntries(SECTIONS.map(s => [s, 0]));
  for (const l of lines) tabs[l.section] = round(tabs[l.section] + l.amount);
  const base = round(SECTIONS.filter(s => s !== 'other_receivable').reduce((a, s) => a + tabs[s], 0) - tabs.other_receivable);
  return { tabs, base, total: round(base * orderQty, 2) };
}

// ---------- dropdown data ----------
export async function getLookups(companyId) {
  const [buyers, styles, seasons, currencies, colours, ranges, lines] = await Promise.all([
    query('SELECT id, code, name FROM buyers WHERE company_id = $1 AND is_active ORDER BY name', [companyId]),
    query('SELECT id, code, name FROM styles WHERE company_id = $1 AND is_active ORDER BY code', [companyId]),
    query('SELECT id, name FROM seasons WHERE company_id = $1 AND is_active ORDER BY name', [companyId]),
    query('SELECT id, code, name, rate_to_inr FROM currencies WHERE company_id = $1 AND is_active ORDER BY code', [companyId]),
    query('SELECT id, name FROM colours WHERE company_id = $1 AND is_active ORDER BY name', [companyId]),
    query('SELECT id, name FROM size_ranges WHERE company_id = $1 AND is_active ORDER BY name', [companyId]),
    query(
      `SELECT l.id, l.order_no, o.style_id, l.colour_id, l.size_range_id, l.total_qty, l.dispatch_mode,
              to_char(l.fob_date, 'YYYY-MM-DD') AS fob_date
         FROM order_lines l JOIN orders o ON o.id = l.order_id
        WHERE l.company_id = $1 ORDER BY l.created_at DESC LIMIT 1000`, [companyId])
  ]);
  const year = new Date().getFullYear();
  return {
    buyers, styles, seasons, colours, sizeRanges: ranges,
    currencies: currencies.map(c => ({ id: c.id, code: c.code, name: c.name, rate: Number(c.rate_to_inr) })),
    orderLines: lines.map(l => ({
      id: l.id, orderNo: l.order_no, styleId: l.style_id, colourId: l.colour_id, sizeRangeId: l.size_range_id,
      qty: l.total_qty, shipMode: l.dispatch_mode, deliveryDate: l.fob_date
    })),
    years: [year - 1, year, year + 1, year + 2]
  };
}

// ---------- item picker ----------
// mode 'summary' lists summary items (groups); 'detail' lists detail items, optionally of one group
export async function pickItems(companyId, { section, mode, groupId, nature, search }) {
  if (!MATERIAL.includes(section)) throw new AppError(400, 'Items are picked only for fabric, trims and packing.');
  const q = String(search || '').trim();
  const groups = (await query(
    `SELECT id, name, uom FROM item_groups WHERE company_id = $1 AND item_type = $2 AND is_active ORDER BY name`,
    [companyId, section])).map(g => ({ id: g.id, name: g.name, uom: g.uom || '' }));
  if (mode === 'summary') {
    const rows = groups.filter(g => !q || g.name.toLowerCase().includes(q.toLowerCase()));
    return { groups, total: rows.length, rows: rows.map(g => ({ key: `g${g.id}`, groupId: g.id, itemId: null, name: g.name, group: 'Summary item', uom: g.uom, itemNature: '' })) };
  }
  const params = [companyId, section, id(groupId), nature || null, q];
  const where = `i.company_id = $1 AND g.item_type = $2 AND i.is_active
       AND ($3::bigint IS NULL OR i.group_id = $3) AND ($4::text IS NULL OR i.item_nature = $4)
       AND ($5 = '' OR i.name ILIKE '%' || $5 || '%' OR i.code ILIKE '%' || $5 || '%')`;
  const total = (await query(`SELECT COUNT(*)::int AS n FROM items i JOIN item_groups g ON g.id = i.group_id WHERE ${where}`, params))[0].n;
  const rows = await query(
    `SELECT i.id, i.name, i.code, i.uom, i.item_nature, i.width, g.id AS group_id, g.name AS group_name
       FROM items i JOIN item_groups g ON g.id = i.group_id WHERE ${where} ORDER BY i.name LIMIT 300`, params);
  return {
    groups, total,
    rows: rows.map(r => ({ key: `i${r.id}`, itemId: r.id, groupId: r.group_id, name: r.name, code: r.code || '', group: r.group_name,
      uom: r.uom, itemNature: r.item_nature || '', width: r.width === null ? '' : Number(r.width) }))
  };
}

// ---------- read ----------
export async function listCostings(companyId, filters = {}) {
  const q = String(filters.search || '').trim();
  const type = TYPES.includes(filters.type) ? filters.type : null;
  const rows = await query(
    `SELECT c.id, c.costing_no, c.revision, c.costing_type, to_char(c.costing_date, 'YYYY-MM-DD') AS costing_date,
            b.name AS buyer, s.code AS style_code, l.order_no, c.order_qty, c.base_amount, c.total_amount, cur.code AS currency,
            c.conversion_rate
       FROM costings c
       JOIN buyers b ON b.id = c.buyer_id
       JOIN styles s ON s.id = c.style_id
       JOIN currencies cur ON cur.id = c.currency_id
       LEFT JOIN order_lines l ON l.id = c.order_line_id
      WHERE c.company_id = $1 AND NOT c.is_deleted
        AND ($3::text IS NULL OR c.costing_type = $3)
        AND ($2 = '' OR c.costing_no ILIKE '%' || $2 || '%' OR b.name ILIKE '%' || $2 || '%'
             OR s.code ILIKE '%' || $2 || '%' OR l.order_no ILIKE '%' || $2 || '%' OR c.description ILIKE '%' || $2 || '%')
      ORDER BY c.updated_at DESC LIMIT 100`, [companyId, q, type]);
  return rows.map(r => ({
    id: r.id, costingNo: r.costing_no, revision: r.revision, type: r.costing_type, date: r.costing_date,
    buyer: r.buyer, styleCode: r.style_code, orderNo: r.order_no || '', orderQty: r.order_qty,
    baseAmount: Number(r.base_amount), totalAmount: Number(r.total_amount), currency: r.currency,
    baseInCurrency: round(Number(r.base_amount) / Number(r.conversion_rate))
  }));
}

export async function getCosting(companyId, costingId, db = pool) {
  const c = (await db.query(
    `SELECT c.*, to_char(c.costing_date, 'YYYY-MM-DD') AS date_s, to_char(c.delivery_date, 'YYYY-MM-DD') AS delivery_s,
            l.order_no, u.username AS updated_by_name
       FROM costings c
       LEFT JOIN order_lines l ON l.id = c.order_line_id
       LEFT JOIN users u ON u.id = c.updated_by
      WHERE c.id = $1 AND c.company_id = $2 AND NOT c.is_deleted`, [costingId, companyId])).rows[0];
  if (!c) throw new AppError(404, 'Costing not found.');
  const lines = (await db.query(
    `SELECT l.*, g.name AS group_name FROM costing_lines l
       LEFT JOIN items i ON i.id = l.item_id
       LEFT JOIN item_groups g ON g.id = COALESCE(i.group_id, l.item_group_id)
      WHERE l.costing_id = $1 ORDER BY l.section, l.sort_order`, [costingId])).rows;
  const revisions = (await db.query(
    `SELECT r.revision, r.saved_at, u.username FROM costing_revisions r LEFT JOIN users u ON u.id = r.saved_by
      WHERE r.costing_id = $1 ORDER BY r.revision DESC`, [costingId])).rows;
  const n = (v) => (v === null || v === undefined ? '' : Number(v));
  return {
    id: c.id, costingNo: c.costing_no, revision: c.revision, costingDate: c.date_s, type: c.costing_type,
    description: c.description || '', buyerId: c.buyer_id, styleId: c.style_id, orderLineId: c.order_line_id,
    orderNo: c.order_no || '', deliveryDate: c.delivery_s || '', sizeRangeId: c.size_range_id || '', orderQty: c.order_qty,
    shipMode: c.ship_mode, seasonId: c.season_id || '', year: c.year || '', colourId: c.colour_id || '',
    currencyId: c.currency_id, conversionRate: Number(c.conversion_rate), baseAmount: Number(c.base_amount),
    totalAmount: Number(c.total_amount), remarks: c.remarks || '', updatedBy: c.updated_by_name, updatedAt: c.updated_at,
    lines: lines.map(l => ({
      id: l.id, section: l.section, itemId: l.item_id || '', itemGroupId: l.item_group_id || '', groupName: l.group_name || '',
      itemType: l.item_type || '', item: l.item || '', description: l.description || '',
      uom: l.uom || '', itemNature: l.item_nature || '', excludeMaterial: l.exclude_material, cutWidth: n(l.cut_width),
      consumption: n(l.consumption), wastagePct: n(l.wastage_pct), avgQty: n(l.avg_qty), greigeRate: n(l.greige_rate),
      processRate: n(l.process_rate), rate: n(l.rate), currencyId: l.currency_id || '', exchangeRate: n(l.exchange_rate), amount: n(l.amount)
    })),
    revisions: revisions.map(r => ({ revision: r.revision, savedAt: r.saved_at, savedBy: r.username }))
  };
}

export async function getRevision(companyId, costingId, revision) {
  const r = (await query(
    `SELECT r.snapshot FROM costing_revisions r JOIN costings c ON c.id = r.costing_id
      WHERE r.costing_id = $1 AND r.revision = $2 AND c.company_id = $3`, [costingId, revision, companyId]))[0];
  if (!r) throw new AppError(404, 'Revision not found.');
  return r.snapshot;
}

// ---------- checks before saving ----------
async function belongs(db, table, companyId, rowId) {
  if (!rowId) return false;
  return (await db.query(`SELECT 1 FROM ${table} WHERE id = $1 AND company_id = $2`, [rowId, companyId])).rows.length > 0;
}

async function readCosting(db, companyId, body) {
  const h = {
    type: body.type, description: text(body.description, 500), buyerId: id(body.buyerId), styleId: id(body.styleId),
    orderLineId: id(body.orderLineId), deliveryDate: body.deliveryDate || null, sizeRangeId: id(body.sizeRangeId),
    orderQty: num(body.orderQty), shipMode: body.shipMode, seasonId: id(body.seasonId), year: id(body.year),
    colourId: id(body.colourId), currencyId: id(body.currencyId), conversionRate: num(body.conversionRate),
    remarks: text(body.remarks, 1000)
  };

  // An order line fixes the style and the quantity
  if (h.orderLineId) {
    const ol = (await db.query(
      `SELECT l.id, o.style_id, l.total_qty FROM order_lines l JOIN orders o ON o.id = l.order_id
        WHERE l.id = $1 AND l.company_id = $2`, [h.orderLineId, companyId])).rows[0];
    if (!ol) throw new AppError(400, 'Pick a valid order no.');
    h.styleId = ol.style_id;
    h.orderQty = ol.total_qty;
  }

  const missing = [];
  if (!TYPES.includes(h.type)) missing.push('costing type');
  if (!(await belongs(db, 'buyers', companyId, h.buyerId))) missing.push('buyer');
  if (!(await belongs(db, 'styles', companyId, h.styleId))) missing.push('style no.');
  if (!Number.isInteger(h.orderQty) || h.orderQty <= 0) missing.push('order qty');
  if (!MODES.includes(h.shipMode)) missing.push('ship mode');
  if (!(await belongs(db, 'currencies', companyId, h.currencyId))) missing.push('currency');
  if (!(h.conversionRate > 0)) missing.push('conversion rate');
  if (missing.length) throw new AppError(400, `Fill in ${missing.join(', ')}.`);
  if (h.deliveryDate && !isDate(h.deliveryDate)) throw new AppError(400, 'Delivery date is not a valid date.');
  if (h.sizeRangeId && !(await belongs(db, 'size_ranges', companyId, h.sizeRangeId))) throw new AppError(400, 'Pick a valid size range.');
  if (h.seasonId && !(await belongs(db, 'seasons', companyId, h.seasonId))) throw new AppError(400, 'Pick a valid season.');
  if (h.colourId && !(await belongs(db, 'colours', companyId, h.colourId))) throw new AppError(400, 'Pick a valid colour.');
  if (h.year && (h.year < 2000 || h.year > 2100)) throw new AppError(400, 'Pick a valid year.');

  // Grid lines: skip rows that are completely empty, check the numbers in the rest
  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (raw.length > MAX_LINES) throw new AppError(400, `A costing can have up to ${MAX_LINES} lines.`);
  const counters = Object.fromEntries(SECTIONS.map(s => [s, 0]));
  const lines = [];
  for (const l of raw) {
    if (!SECTIONS.includes(l.section)) continue;
    const c = calcLine(l.section, l);
    const hasText = text(l.item) || text(l.description);
    if (!hasText && !c.amount && !c.consumption) continue;
    const tab = TAB_NAMES[l.section];
    const row = ++counters[l.section];
    if ([c.consumption, c.wastage, c.greige, c.process, c.rate, c.exchange].some(Number.isNaN)) {
      throw new AppError(400, `${tab}, line ${row}: numbers only in qty, wastage, rate and exchange rate.`);
    }
    if ([c.consumption, c.wastage, c.greige, c.process, c.rate].some(v => v < 0) || c.exchange <= 0) {
      throw new AppError(400, `${tab}, line ${row}: amounts can't be below 0.`);
    }
    if (!hasText) throw new AppError(400, `${tab}, line ${row}: fill in the item or description.`);
    // A picked item: take its name (and group) from the item master, not from the browser
    let itemId = MATERIAL.includes(l.section) ? id(l.itemId) : null;
    let itemGroupId = MATERIAL.includes(l.section) ? id(l.itemGroupId) : null;
    let itemName = text(l.item);
    if (itemId) {
      const it = (await db.query(
        `SELECT i.name, i.group_id FROM items i JOIN item_groups g ON g.id = i.group_id
          WHERE i.id = $1 AND i.company_id = $2 AND g.item_type = $3`, [itemId, companyId, l.section])).rows[0];
      if (!it) throw new AppError(400, `${tab}, line ${row}: the item is not a ${tab.toLowerCase()} item of this company.`);
      itemName = it.name; itemGroupId = it.group_id;
    } else if (itemGroupId) {
      const g = (await db.query('SELECT name FROM item_groups WHERE id = $1 AND company_id = $2 AND item_type = $3', [itemGroupId, companyId, l.section])).rows[0];
      if (!g) throw new AppError(400, `${tab}, line ${row}: pick a valid summary item.`);
      itemName = g.name;
    }
    const currencyId = id(l.currencyId);
    if (currencyId && !(await belongs(db, 'currencies', companyId, currencyId))) throw new AppError(400, `${tab}, line ${row}: pick a valid currency.`);
    lines.push({
      section: l.section, sortOrder: row, itemId, itemGroupId, itemType: text(l.itemType, 60), item: itemName, description: text(l.description, 300),
      uom: text(l.uom, 20), itemNature: text(l.itemNature, 40), excludeMaterial: l.section === 'fabric' && !!l.excludeMaterial,
      cutWidth: l.section === 'fabric' && l.cutWidth !== '' && l.cutWidth !== null && l.cutWidth !== undefined ? num(l.cutWidth) : null,
      currencyId, ...c
    });
  }
  return { h, lines, totals: calcTotals(lines, h.orderQty) };
}

export const TAB_NAMES = {
  fabric: 'Fabric', trims: 'Trims', packing: 'Packing', cmt: 'CMT cost', value_addition: 'Value addition',
  expenses: 'Expenses', management: 'Management cost', other_receivable: 'Other receivable'
};

async function writeLines(db, costingId, lines) {
  await db.query('DELETE FROM costing_lines WHERE costing_id = $1', [costingId]);
  for (const l of lines) {
    await db.query(
      `INSERT INTO costing_lines (costing_id, section, sort_order, item_id, item_group_id, item_type, item, description, uom, item_nature, exclude_material,
                                  cut_width, consumption, wastage_pct, avg_qty, greige_rate, process_rate, rate, currency_id, exchange_rate, amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [costingId, l.section, l.sortOrder, l.itemId, l.itemGroupId, l.itemType, l.item, l.description, l.uom, l.itemNature, l.excludeMaterial,
        l.cutWidth, l.consumption, l.wastage, l.avgQty, l.greige, l.process, l.rate, l.currencyId, l.exchange, l.amount]);
  }
}

async function snapshot(db, user, companyId, costingId) {
  const full = await getCosting(companyId, costingId, db);
  delete full.revisions;
  await db.query('INSERT INTO costing_revisions (costing_id, revision, saved_by, snapshot) VALUES ($1, $2, $3, $4)',
    [costingId, full.revision, user.id, JSON.stringify(full)]);
}

async function audit(db, user, action, costingId, details) {
  await db.query('INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, 'costing', String(costingId), JSON.stringify(details)]);
}

// Turns "only one Final" database errors into a plain message
function finalClash(err) {
  if (err.code === '23505' && /costings_one_final/.test(err.constraint || '')) {
    return new AppError(400, 'There is already a Final costing for this order no. (or for this style, when no order is picked). Change that one to Actual first.');
  }
  return err;
}

async function nextCostingNo(db, companyId) {
  const fy = (await db.query('SELECT short_label FROM financial_years WHERE company_id = $1 AND is_current LIMIT 1', [companyId])).rows[0];
  if (!fy) throw new AppError(400, 'No current financial year is set for this company.');
  const r = (await db.query(
    `INSERT INTO document_series (company_id, doc_type, fy_short, prefix_key, last_number) VALUES ($1, 'CST', $2, '', 1)
     ON CONFLICT (company_id, doc_type, fy_short, prefix_key) DO UPDATE SET last_number = document_series.last_number + 1
     RETURNING last_number`, [companyId, fy.short_label])).rows[0];
  return `CST/${fy.short_label}/${String(r.last_number).padStart(4, '0')}`;
}

// ---------- save ----------
// canApprove: only users with Approve permission may mark a costing Final
export async function createCosting(user, body, { canApprove }) {
  try {
    return await withTransaction(async (db) => {
      const { h, lines, totals } = await readCosting(db, user.companyId, body);
      if (h.type === 'final' && !canApprove) throw new AppError(403, 'You need Approve permission on Costing to save it as Final.');
      const costingNo = await nextCostingNo(db, user.companyId);
      const costingId = (await db.query(
        `INSERT INTO costings (company_id, costing_no, revision, costing_date, costing_type, description, buyer_id, style_id, order_line_id,
                               delivery_date, size_range_id, order_qty, ship_mode, season_id, year, colour_id, currency_id, conversion_rate,
                               base_amount, total_amount, remarks, created_by, updated_by)
         VALUES ($1, $2, 1, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20)
         RETURNING id`,
        [user.companyId, costingNo, h.type, h.description, h.buyerId, h.styleId, h.orderLineId, h.deliveryDate, h.sizeRangeId,
          h.orderQty, h.shipMode, h.seasonId, h.year, h.colourId, h.currencyId, h.conversionRate, totals.base, totals.total,
          h.remarks, user.id])).rows[0].id;
      await writeLines(db, costingId, lines);
      await snapshot(db, user, user.companyId, costingId);
      await audit(db, user, 'CREATE', costingId, { costingNo, type: h.type, base: totals.base });
      return getCosting(user.companyId, costingId, db);
    });
  } catch (err) {
    throw finalClash(err);
  }
}

export async function updateCosting(user, costingId, body, { canApprove }) {
  try {
    return await withTransaction(async (db) => {
      const before = (await db.query(
        'SELECT costing_type, revision FROM costings WHERE id = $1 AND company_id = $2 AND NOT is_deleted FOR UPDATE',
        [costingId, user.companyId])).rows[0];
      if (!before) throw new AppError(404, 'Costing not found.');
      const { h, lines, totals } = await readCosting(db, user.companyId, body);
      if (before.costing_type === 'final' && h.type === 'initial') throw new AppError(400, 'A Final costing can only be changed to Actual.');
      if (before.costing_type === 'actual' && h.type !== 'actual') throw new AppError(400, 'An Actual costing stays Actual.');
      if ((h.type === 'final' || before.costing_type === 'final') && !canApprove) {
        throw new AppError(403, 'You need Approve permission on Costing to save or change a Final costing.');
      }
      await db.query(
        `UPDATE costings SET revision = revision + 1, costing_date = CURRENT_DATE, costing_type = $3, description = $4, buyer_id = $5,
                style_id = $6, order_line_id = $7, delivery_date = $8, size_range_id = $9, order_qty = $10, ship_mode = $11,
                season_id = $12, year = $13, colour_id = $14, currency_id = $15, conversion_rate = $16, base_amount = $17,
                total_amount = $18, remarks = $19, updated_by = $20, updated_at = now()
          WHERE id = $1 AND company_id = $2`,
        [costingId, user.companyId, h.type, h.description, h.buyerId, h.styleId, h.orderLineId, h.deliveryDate, h.sizeRangeId,
          h.orderQty, h.shipMode, h.seasonId, h.year, h.colourId, h.currencyId, h.conversionRate, totals.base, totals.total,
          h.remarks, user.id]);
      await writeLines(db, costingId, lines);
      await snapshot(db, user, user.companyId, costingId);
      await audit(db, user, 'UPDATE', costingId, { revision: before.revision + 1, type: h.type, base: totals.base });
      return getCosting(user.companyId, costingId, db);
    });
  } catch (err) {
    throw finalClash(err);
  }
}

// Final costings can't be deleted: change them to Actual first
export async function deleteCosting(user, costingId) {
  return withTransaction(async (db) => {
    const c = (await db.query('SELECT costing_no, costing_type FROM costings WHERE id = $1 AND company_id = $2 AND NOT is_deleted FOR UPDATE',
      [costingId, user.companyId])).rows[0];
    if (!c) throw new AppError(404, 'Costing not found.');
    if (c.costing_type === 'final') throw new AppError(400, "A Final costing can't be deleted. Save it as Actual first, then delete.");
    await db.query('UPDATE costings SET is_deleted = TRUE, updated_by = $3, updated_at = now() WHERE id = $1 AND company_id = $2',
      [costingId, user.companyId, user.id]);
    await audit(db, user, 'DELETE', costingId, { costingNo: c.costing_no, type: c.costing_type });
    return { ok: true };
  });
}
