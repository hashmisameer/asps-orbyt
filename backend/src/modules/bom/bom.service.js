// BOM (bill of materials): what material one order line needs, grouped by the process it is issued to.
// Lines always use the item's own issue process (detail item, else its summary item), so an item
// can't be put in the wrong section. Quantities and amounts are always worked out here on the server.
import { pool, query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

const MAX_LINES = 300;
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const idOf = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const text = (v, max = 120) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };

// Consumption + excess, and the quantity to buy for the whole order (always rounded up)
export function calcLine(consumption, excessPct, orderQty) {
  const totalAvg = round(consumption * (1 + excessPct / 100));
  return { totalAvg, requiredQty: Math.ceil(round(totalAvg * orderQty, 6)) };
}

// The process an item is issued to: its own, else its summary item's
const ITEM_PROCESS = 'COALESCE(i.process_id, g.process_id)';

export async function getProcesses(companyId) {
  return query('SELECT id, code, name FROM issue_processes WHERE company_id = $1 AND is_active ORDER BY sort_order', [companyId]);
}

// ---------- order lines with their BOM status (for the search panel) ----------
export async function listOrders(companyId, { search, status } = {}) {
  const q = String(search || '').trim();
  const st = ['none', 'draft', 'approved'].includes(status) ? status : null;
  const rows = await query(
    `SELECT l.id, l.order_no, l.total_qty, to_char(l.ex_factory_date, 'YYYY-MM-DD') AS ex_factory,
            b.name AS brand, s.code AS style_code, s.name AS style_name, c.name AS colour,
            bm.status AS bom_status, (SELECT COUNT(*) FROM bom_lines x WHERE x.bom_id = bm.id)::int AS bom_lines
       FROM order_lines l
       JOIN orders o ON o.id = l.order_id
       JOIN brands b ON b.id = o.brand_id
       JOIN styles s ON s.id = o.style_id
       JOIN colours c ON c.id = l.colour_id
       LEFT JOIN boms bm ON bm.order_line_id = l.id AND bm.company_id = l.company_id
      WHERE l.company_id = $1
        AND ($2 = '' OR l.order_no ILIKE '%' || $2 || '%' OR s.code ILIKE '%' || $2 || '%' OR s.name ILIKE '%' || $2 || '%'
             OR b.name ILIKE '%' || $2 || '%' OR l.buyer_po_no ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR COALESCE(bm.status, 'none') = $3)
      ORDER BY l.created_at DESC LIMIT 200`, [companyId, q, st]);
  return rows.map(r => ({
    orderLineId: r.id, orderNo: r.order_no, qty: r.total_qty, exFactory: r.ex_factory, brand: r.brand,
    styleCode: r.style_code, styleName: r.style_name, colour: r.colour, bomStatus: r.bom_status || 'none', bomLines: r.bom_lines
  }));
}

// Final costing for an order line (or for its style when the costing was made without an order)
async function finalCostingFor(db, companyId, orderLine) {
  return (await db.query(
    `SELECT c.id, c.costing_no, bu.name AS buyer
       FROM costings c JOIN buyers bu ON bu.id = c.buyer_id
      WHERE c.company_id = $1 AND c.costing_type = 'final' AND NOT c.is_deleted
        AND (c.order_line_id = $2 OR (c.order_line_id IS NULL AND c.style_id = $3))
      ORDER BY (c.order_line_id IS NULL), c.updated_at DESC LIMIT 1`,
    [companyId, orderLine.id, orderLine.style_id])).rows[0] || null;
}

async function orderLineInfo(db, companyId, orderLineId) {
  const r = (await db.query(
    `SELECT l.id, l.order_no, l.total_qty, l.buyer_po_no, to_char(l.ex_factory_date, 'YYYY-MM-DD') AS ex_factory,
            to_char(l.fob_date, 'YYYY-MM-DD') AS fob, o.style_id, b.name AS brand, s.code AS style_code, s.name AS style_name,
            c.name AS colour
       FROM order_lines l
       JOIN orders o ON o.id = l.order_id
       JOIN brands b ON b.id = o.brand_id
       JOIN styles s ON s.id = o.style_id
       JOIN colours c ON c.id = l.colour_id
      WHERE l.id = $1 AND l.company_id = $2`, [orderLineId, companyId])).rows[0];
  if (!r) throw new AppError(404, 'Order not found.');
  return r;
}

// ---------- read ----------
export async function getBom(companyId, orderLineId, db = pool) {
  const ol = await orderLineInfo(db, companyId, orderLineId);
  const costing = await finalCostingFor(db, companyId, ol);
  const bom = (await db.query(
    `SELECT b.*, ua.username AS approved_by_name, uu.username AS updated_by_name
       FROM boms b LEFT JOIN users ua ON ua.id = b.approved_by LEFT JOIN users uu ON uu.id = b.updated_by
      WHERE b.company_id = $1 AND b.order_line_id = $2`, [companyId, orderLineId])).rows[0];
  let lines = [];
  if (bom) {
    lines = (await db.query(
      `SELECT bl.*, i.name AS item_name, i.code AS item_code, g.name AS group_name
         FROM bom_lines bl JOIN items i ON i.id = bl.item_id JOIN item_groups g ON g.id = i.group_id
        WHERE bl.bom_id = $1 ORDER BY bl.process_id, bl.sort_order`, [bom.id])).rows;
  }
  const n = (v) => (v === null || v === undefined ? '' : Number(v));
  return {
    order: {
      orderLineId: ol.id, orderNo: ol.order_no, qty: ol.total_qty, buyerPo: ol.buyer_po_no || '', exFactory: ol.ex_factory, fob: ol.fob,
      brand: ol.brand, styleCode: ol.style_code, styleName: ol.style_name, colour: ol.colour
    },
    finalCosting: costing ? { id: costing.id, costingNo: costing.costing_no, buyer: costing.buyer } : null,
    bom: bom ? {
      id: bom.id, status: bom.status, remarks: bom.remarks || '', costingId: bom.costing_id,
      approvedBy: bom.approved_by_name, approvedAt: bom.approved_at, updatedBy: bom.updated_by_name, updatedAt: bom.updated_at,
      lines: lines.map(l => ({
        id: l.id, processId: l.process_id, itemId: l.item_id, item: l.item_name, itemCode: l.item_code || '', groupName: l.group_name,
        uom: l.uom, consumption: n(l.consumption), excessPct: n(l.excess_pct), totalAvg: n(l.total_avg), orderQty: l.order_qty,
        requiredQty: n(l.required_qty), costingRate: n(l.costing_rate), budgetedRate: n(l.budgeted_rate),
        supplier: l.supplier || '', leadDays: n(l.lead_days), fromBuyer: l.from_buyer
      }))
    } : null
  };
}

// ---------- item picker: detail items, filtered by process ----------
export async function pickItems(companyId, { processId, groupId, nature, search }) {
  const q = String(search || '').trim();
  const params = [companyId, idOf(processId), idOf(groupId), nature || null, q];
  const where = `i.company_id = $1 AND i.is_active
       AND ($2::bigint IS NULL OR ${ITEM_PROCESS} = $2) AND ($3::bigint IS NULL OR i.group_id = $3)
       AND ($4::text IS NULL OR i.item_nature = $4)
       AND ($5 = '' OR i.name ILIKE '%' || $5 || '%' OR i.code ILIKE '%' || $5 || '%' OR g.name ILIKE '%' || $5 || '%')`;
  const total = (await query(`SELECT COUNT(*)::int AS n FROM items i JOIN item_groups g ON g.id = i.group_id WHERE ${where}`, params))[0].n;
  const rows = await query(
    `SELECT i.id, i.name, i.code, i.uom, i.item_nature, g.id AS group_id, g.name AS group_name, ${ITEM_PROCESS} AS process_id
       FROM items i JOIN item_groups g ON g.id = i.group_id WHERE ${where} ORDER BY i.name LIMIT 300`, params);
  const groups = await query(
    `SELECT g.id, g.name FROM item_groups g
      WHERE g.company_id = $1 AND g.is_active AND ($2::bigint IS NULL OR g.process_id = $2
            OR EXISTS (SELECT 1 FROM items i WHERE i.group_id = g.id AND i.process_id = $2))
      ORDER BY g.name`, [companyId, idOf(processId)]);
  return {
    groups, total,
    rows: rows.map(r => ({ itemId: r.id, name: r.name, code: r.code || '', uom: r.uom, itemNature: r.item_nature || '', groupId: r.group_id, group: r.group_name, processId: r.process_id }))
  };
}

// ---------- items of the Final costing, ready to add (nothing is saved here) ----------
export async function fromCosting(companyId, orderLineId) {
  const ol = await orderLineInfo(pool, companyId, orderLineId);
  const costing = await finalCostingFor(pool, companyId, ol);
  if (!costing) throw new AppError(400, 'This order has no Final costing yet. Save its costing as Final first.');
  const rows = await query(
    `SELECT cl.item_id, cl.item, cl.section, cl.uom, cl.consumption, cl.wastage_pct, cl.rate, cl.exchange_rate, cl.exclude_material,
            i.name AS item_name, i.uom AS item_uom, g.name AS group_name, ${ITEM_PROCESS} AS process_id
       FROM costing_lines cl
       LEFT JOIN items i ON i.id = cl.item_id
       LEFT JOIN item_groups g ON g.id = i.group_id
      WHERE cl.costing_id = $1 AND cl.section IN ('fabric', 'trims', 'packing')
      ORDER BY cl.section, cl.sort_order`, [costing.id]);
  const lines = [];
  const skipped = [];
  for (const r of rows) {
    if (r.exclude_material) { skipped.push(`${r.item} (marked "exclude material" in costing)`); continue; }
    if (!r.item_id) { skipped.push(`${r.item} (summary item: pick the exact item with "+ Add items")`); continue; }
    if (!r.process_id) { skipped.push(`${r.item_name} (no issue process: set it on its summary item)`); continue; }
    lines.push({
      itemId: r.item_id, item: r.item_name, groupName: r.group_name, processId: Number(r.process_id), uom: r.uom || r.item_uom,
      consumption: Number(r.consumption), excessPct: Number(r.wastage_pct),
      costingRate: round(Number(r.rate) * Number(r.exchange_rate)), budgetedRate: round(Number(r.rate) * Number(r.exchange_rate))
    });
  }
  return { costing: { id: costing.id, costingNo: costing.costing_no }, lines, skipped };
}

// ---------- save ----------
async function audit(db, user, action, bomId, details) {
  await db.query('INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, 'bom', String(bomId), JSON.stringify(details)]);
}

export async function saveBom(user, orderLineId, body) {
  return withTransaction(async (db) => {
    const ol = await orderLineInfo(db, user.companyId, orderLineId);
    const existing = (await db.query('SELECT id, status FROM boms WHERE company_id = $1 AND order_line_id = $2 FOR UPDATE',
      [user.companyId, orderLineId])).rows[0];
    if (existing?.status === 'approved') throw new AppError(400, 'This BOM is approved. Reopen it before making changes.');
    const costing = await finalCostingFor(db, user.companyId, ol);

    const raw = Array.isArray(body.lines) ? body.lines : [];
    if (raw.length > MAX_LINES) throw new AppError(400, `A BOM can have up to ${MAX_LINES} lines.`);
    const itemIds = [...new Set(raw.map(l => idOf(l.itemId)).filter(Boolean))];
    const items = itemIds.length ? (await db.query(
      `SELECT i.id, i.name, i.uom, ${ITEM_PROCESS} AS process_id FROM items i JOIN item_groups g ON g.id = i.group_id
        WHERE i.company_id = $1 AND i.id = ANY($2::bigint[])`, [user.companyId, itemIds])).rows : [];
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    const costRates = costing ? Object.fromEntries((await db.query(
      `SELECT item_id, MAX(rate * exchange_rate) AS r FROM costing_lines WHERE costing_id = $1 AND item_id IS NOT NULL GROUP BY item_id`,
      [costing.id])).rows.map(r => [r.item_id, Number(r.r)])) : {};

    const seen = new Set();
    const counters = {};
    const lines = [];
    for (const [i, l] of raw.entries()) {
      const item = byId[idOf(l.itemId)];
      const label = item ? item.name : `Line ${i + 1}`;
      if (!item) throw new AppError(400, `Line ${i + 1}: pick a valid item.`);
      if (!item.process_id) throw new AppError(400, `${label}: this item has no issue process. Set it on its summary item first.`);
      if (seen.has(item.id)) throw new AppError(400, `${label} is added twice. Keep it once.`);
      seen.add(item.id);
      const consumption = num(l.consumption);
      const excess = num(l.excessPct);
      const budgeted = num(l.budgetedRate);
      const lead = l.leadDays === '' || l.leadDays === null || l.leadDays === undefined ? null : num(l.leadDays);
      if ([consumption, excess, budgeted].some(Number.isNaN) || (lead !== null && (Number.isNaN(lead) || !Number.isInteger(lead)))) {
        throw new AppError(400, `${label}: numbers only in consumption, excess %, rate and lead days.`);
      }
      if (consumption <= 0) throw new AppError(400, `${label}: enter the consumption per garment.`);
      if (excess < 0 || budgeted < 0 || (lead !== null && lead < 0)) throw new AppError(400, `${label}: values can't be below 0.`);
      const costingRate = costRates[item.id] ?? null;
      if (costingRate !== null && budgeted > round(costingRate) + 0.0001) {
        throw new AppError(400, `${label}: budgeted rate ${budgeted} is above the costing rate ${round(costingRate)}. Lower it, or revise the costing.`);
      }
      const { totalAvg, requiredQty } = calcLine(consumption, excess, ol.total_qty);
      counters[item.process_id] = (counters[item.process_id] || 0) + 1;
      lines.push({
        processId: item.process_id, itemId: item.id, sortOrder: counters[item.process_id], uom: text(l.uom, 20) || item.uom,
        consumption, excess, totalAvg, requiredQty, costingRate, budgeted, supplier: text(l.supplier), lead, fromBuyer: !!l.fromBuyer
      });
    }

    let bomId = existing?.id;
    if (bomId) {
      await db.query('UPDATE boms SET costing_id = $2, remarks = $3, updated_by = $4, updated_at = now() WHERE id = $1',
        [bomId, costing?.id || null, text(body.remarks, 1000), user.id]);
    } else {
      bomId = (await db.query(
        `INSERT INTO boms (company_id, order_line_id, costing_id, remarks, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
        [user.companyId, orderLineId, costing?.id || null, text(body.remarks, 1000), user.id])).rows[0].id;
    }
    await db.query('DELETE FROM bom_lines WHERE bom_id = $1', [bomId]);
    for (const l of lines) {
      await db.query(
        `INSERT INTO bom_lines (bom_id, process_id, item_id, sort_order, uom, consumption, excess_pct, total_avg, order_qty, required_qty,
                                costing_rate, budgeted_rate, supplier, lead_days, from_buyer)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [bomId, l.processId, l.itemId, l.sortOrder, l.uom, l.consumption, l.excess, l.totalAvg, ol.total_qty, l.requiredQty,
          l.costingRate, l.budgeted, l.supplier, l.lead, l.fromBuyer]);
    }
    await audit(db, user, existing ? 'UPDATE' : 'CREATE', bomId, { orderNo: ol.order_no, lines: lines.length });
    return getBom(user.companyId, orderLineId, db);
  });
}

export async function setStatus(user, orderLineId, status) {
  return withTransaction(async (db) => {
    const b = (await db.query('SELECT id, status FROM boms WHERE company_id = $1 AND order_line_id = $2 FOR UPDATE',
      [user.companyId, orderLineId])).rows[0];
    if (!b) throw new AppError(400, 'Save the BOM first.');
    if (status === 'approved') {
      const n = (await db.query('SELECT COUNT(*)::int AS n FROM bom_lines WHERE bom_id = $1', [b.id])).rows[0].n;
      if (!n) throw new AppError(400, 'Add at least one item before approving.');
      await db.query("UPDATE boms SET status = 'approved', approved_by = $2, approved_at = now(), updated_by = $2, updated_at = now() WHERE id = $1", [b.id, user.id]);
    } else {
      await db.query("UPDATE boms SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_by = $2, updated_at = now() WHERE id = $1", [b.id, user.id]);
    }
    await audit(db, user, status === 'approved' ? 'APPROVE' : 'REOPEN', b.id, {});
    return getBom(user.companyId, orderLineId, db);
  });
}
