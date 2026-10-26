// What a record is linked to, and what happened to it – for the "flow" strip and the right-hand panel.
//   Flow:     order line -> Final costing -> BOM -> purchase (purchase comes with the Purchase module)
//   History:  the latest audit entries of one record, in words a user can read
import { query } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

const ymd = (d) => (d ? new Date(d).toLocaleDateString('en-CA') : null);

// Costing and BOM state of some order lines (one query each, works for one line or a whole order)
async function linesState(companyId, lineIds) {
  if (!lineIds.length) return {};
  const costings = await query(
    `SELECT DISTINCT ON (order_line_id) order_line_id, id, costing_no, costing_type, revision
       FROM costings
      WHERE company_id = $1 AND NOT is_deleted AND order_line_id = ANY($2::bigint[])
      ORDER BY order_line_id, (costing_type = 'final') DESC, updated_at DESC`, [companyId, lineIds]);
  const boms = await query(
    `SELECT b.order_line_id, b.id, b.status, (SELECT COUNT(*) FROM bom_lines l WHERE l.bom_id = b.id)::int AS lines
       FROM boms b WHERE b.company_id = $1 AND b.order_line_id = ANY($2::bigint[])`, [companyId, lineIds]);
  const out = Object.fromEntries(lineIds.map(id => [id, { costing: null, bom: null }]));
  for (const c of costings) {
    out[c.order_line_id].costing = { id: c.id, costingNo: c.costing_no, type: c.costing_type, revision: c.revision };
  }
  for (const b of boms) out[b.order_line_id].bom = { id: b.id, status: b.status, lines: b.lines };
  return out;
}

// Flow of one order line (Costing and BOM screens)
export async function orderLineFlow(companyId, lineId) {
  const l = (await query(
    `SELECT l.id, l.order_id, l.order_no, l.total_qty, l.ex_factory_date, p.name AS buyer
       FROM order_lines l JOIN orders o ON o.id = l.order_id
       JOIN brands b ON b.id = o.brand_id LEFT JOIN parties p ON p.id = b.buyer_id
      WHERE l.id = $1 AND l.company_id = $2`, [lineId, companyId]))[0];
  if (!l) throw new AppError(404, 'Order line not found.');
  const st = (await linesState(companyId, [Number(l.id)]))[l.id];
  return {
    line: { id: l.id, orderId: l.order_id, orderNo: l.order_no, qty: l.total_qty, exFactory: ymd(l.ex_factory_date), buyer: l.buyer || '' },
    costing: st.costing, bom: st.bom
  };
}

// Flow of a whole order (Order entry): every line with its costing and BOM
export async function orderFlow(companyId, orderId) {
  const lines = await query(
    `SELECT id, line_no, order_no, total_qty, ex_factory_date FROM order_lines
      WHERE order_id = $1 AND company_id = $2 ORDER BY line_no`, [orderId, companyId]);
  if (!lines.length) throw new AppError(404, 'Order not found.');
  const st = await linesState(companyId, lines.map(l => Number(l.id)));
  return {
    lines: lines.map(l => ({
      id: l.id, lineNo: l.line_no, orderNo: l.order_no, qty: l.total_qty, exFactory: ymd(l.ex_factory_date),
      costing: st[l.id].costing, bom: st[l.id].bom
    }))
  };
}

// What uses a party / a brand (right-hand "Linked" panel of the masters)
export async function partyLinks(companyId, partyId) {
  const r = (await query(
    `SELECT (SELECT COUNT(*) FROM brands WHERE company_id = $1 AND buyer_id = $2)::int AS brands,
            (SELECT COUNT(*) FROM costings WHERE company_id = $1 AND buyer_id = $2 AND NOT is_deleted)::int AS costings,
            (SELECT COUNT(*) FROM order_lines l JOIN orders o ON o.id = l.order_id JOIN brands b ON b.id = o.brand_id
              WHERE l.company_id = $1 AND b.buyer_id = $2)::int AS order_lines`, [companyId, partyId]))[0];
  return { brands: r.brands, costings: r.costings, orderLines: r.order_lines };
}
export async function brandLinks(companyId, brandId) {
  const r = (await query(
    `SELECT (SELECT COUNT(*) FROM orders WHERE company_id = $1 AND brand_id = $2)::int AS orders,
            (SELECT COUNT(*) FROM order_lines l JOIN orders o ON o.id = l.order_id WHERE l.company_id = $1 AND o.brand_id = $2)::int AS order_lines,
            (SELECT COALESCE(SUM(l.total_qty), 0) FROM order_lines l JOIN orders o ON o.id = l.order_id WHERE l.company_id = $1 AND o.brand_id = $2)::int AS qty`,
    [companyId, brandId]))[0];
  return { orders: r.orders, orderLines: r.order_lines, qty: r.qty };
}

// ---------- History ----------
// entity in the audit log -> screen a user must be able to open to read it
export const HISTORY_FEATURE = { order: 'order.entry', costing: 'order.costing', bom: 'order.bom', parties: 'masters.party', brands: 'masters.brand' };
const TYPE = { initial: 'Initial', final: 'Final', actual: 'Actual' };

function words(entity, action, d = {}, lineNos = {}) {
  if (entity === 'order') {
    if (action === 'CREATE') return `Order created · ${d.lines} line${d.lines === 1 ? '' : 's'}`;
    if (action === 'UPDATE_LINE') {
      const f = (d.fields || []).map(x => ({ buyerPoNo: 'buyer PO', sizeRangeId: 'size range', sizes: 'sizes', exFactoryDate: 'ex-factory', fobDate: 'FOB' }[x] || x));
      return `Line ${lineNos[d.lineId] || ''} changed${f.length ? `: ${f.join(', ')}` : ''}`.replace('Line  ', 'Line ');
    }
    if (action === 'ADD_LINES') return `${d.lines} line${d.lines === 1 ? '' : 's'} added`;
  }
  if (entity === 'costing') {
    if (action === 'CREATE') return `Costing created · ${TYPE[d.type] || ''}`;
    if (action === 'UPDATE') return `Saved revision ${d.revision} · ${TYPE[d.type] || ''}`;
    if (action === 'DELETE') return 'Costing deleted';
  }
  if (entity === 'bom') {
    if (action === 'CREATE') return `BOM created · ${d.lines} item${d.lines === 1 ? '' : 's'}`;
    if (action === 'UPDATE') return `BOM saved · ${d.lines} item${d.lines === 1 ? '' : 's'}`;
    if (action === 'APPROVE') return 'Approved and locked';
    if (action === 'REOPEN') return 'Reopened for changes';
  }
  if (action === 'CREATE') return 'Created';
  if (action === 'UPDATE') return d.active === false ? 'Saved · made inactive' : 'Saved';
  return action.toLowerCase().replace(/_/g, ' ');
}

export async function history(companyId, entity, entityId, limit = 8) {
  if (!HISTORY_FEATURE[entity]) throw new AppError(404, 'Not found.');
  const rows = await query(
    `SELECT a.action, a.details, a.created_at, u.full_name, u.username
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.company_id = $1 AND a.entity = $2 AND a.entity_id = $3
      ORDER BY a.created_at DESC LIMIT $4`, [companyId, entity, String(entityId), limit]);
  // Line numbers for "Line 2 changed" in orders
  let lineNos = {};
  if (entity === 'order') {
    const ids = rows.map(r => r.details?.lineId).filter(Boolean);
    if (ids.length) {
      lineNos = Object.fromEntries((await query('SELECT id, line_no FROM order_lines WHERE id = ANY($1::bigint[])', [ids])).map(r => [r.id, r.line_no]));
    }
  }
  return rows.map(r => ({ who: r.username || r.full_name || 'system', at: r.created_at, text: words(entity, r.action, r.details || {}, lineNos) }));
}
