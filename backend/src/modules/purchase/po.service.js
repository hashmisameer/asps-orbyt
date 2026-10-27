// Purchase order (PO): buy the materials of approved BOMs (or any item) from one supplier.
//   - Lines usually come from approved BOMs: balance = BOM qty - qty already on other POs (cancelled ones don't count).
//   - One PO can carry several orders of the same supplier; each line says which order no. it is for.
//   - GST: CGST + SGST when the supplier is in the company's state, IGST when in another state, none for an import supplier.
//   - Approval: only when the owner switched it on for the client (function purchase.po.approval) and the PO total
//     in rupees is above the client's limit. A user who can Approve saves it straight as Open.
// The server recalculates every amount; numbers from the browser are never trusted.
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINES = 300;
export const DISPATCH_MODES = ['By sea', 'By air', 'By road', 'Courier', 'By hand'];
export const DELIVERY_TERMS = ['Ex-works', 'FOR', 'FOB', 'CIF', 'CNF', 'DDP', 'DAP'];
const STATUS_WORDS = { pending: 'Waiting for approval', open: 'Open', rejected: 'Rejected', cancelled: 'Cancelled' };

const str = (v) => (v === null || v === undefined ? '' : String(v));
const idOf = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const round = (n, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
const text = (v, max = 200) => {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};
function isDate(v) {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

async function audit(db, user, action, poId, details) {
  await db.query('INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, 'po', String(poId), JSON.stringify(details)]);
}

// ---------- GST state of the company and of a supplier address ----------
async function companyStateCode(db, companyId) {
  const c = (await db.query(
    `SELECT c.gstin, (SELECT s.gst_code FROM states s WHERE s.company_id IS NULL AND lower(s.name) = lower(c.state) AND s.gst_code IS NOT NULL LIMIT 1) AS by_name
       FROM companies c WHERE c.id = $1`, [companyId])).rows[0];
  if (c?.gstin && /^\d{2}/.test(c.gstin)) return c.gstin.slice(0, 2);
  return c?.by_name || '';
}

// Supplier addresses with what GST they lead to
async function supplierAddresses(db, companyId, supplierId) {
  const rows = (await db.query(
    `SELECT a.id, a.address_type, a.name, a.address1, a.address2, a.pincode, a.gst_code, a.is_default,
            co.code AS country_code, co.name AS country, st.name AS state, st.gst_code AS state_code, ci.name AS city, p.gst_code AS party_gst
       FROM party_addresses a JOIN parties p ON p.id = a.party_id
       JOIN countries co ON co.id = a.country_id
       LEFT JOIN states st ON st.id = a.state_id
       LEFT JOIN cities ci ON ci.id = a.city_id
      WHERE a.party_id = $1 AND p.company_id = $2
      ORDER BY (a.address_type = 'billing') DESC, a.is_default DESC, a.sort_order`, [supplierId, companyId])).rows;
  return rows.map(a => {
    const gst = a.gst_code || a.party_gst || '';
    return {
      id: str(a.id), type: a.address_type, isDefault: a.is_default,
      label: [a.address1, a.city, a.state, a.country_code !== 'IN' ? a.country : null].filter(Boolean).join(', '),
      countryCode: a.country_code, stateCode: (/^\d{2}/.test(gst) ? gst.slice(0, 2) : '') || a.state_code || ''
    };
  });
}

function gstTypeOf(address, companyCode) {
  if (!address) return 'inter';
  if (address.countryCode !== 'IN') return 'import';
  if (companyCode && address.stateCode && companyCode === address.stateCode) return 'intra';
  return 'inter';
}

// Approval is on for this client, and its limit in rupees
async function approvalSetting(db, companyId) {
  const r = (await db.query(
    `SELECT c.po_approval_limit,
            EXISTS (SELECT 1 FROM company_features cf WHERE cf.company_id = c.id AND cf.feature_code = 'purchase.po.approval') AS on
       FROM companies c WHERE c.id = $1`, [companyId])).rows[0];
  return { on: Boolean(r?.on), limit: Number(r?.po_approval_limit || 0) };
}

// ---------- lookups ----------
export async function getLookups(companyId) {
  const [suppliers, currencies, terms, groups, unit, approval, stateCode] = await Promise.all([
    query(`SELECT id, code, name, currency_id, payment_term_id, is_active FROM parties
            WHERE company_id = $1 AND party_type IN ('supplier', 'both') ORDER BY name`, [companyId]),
    query('SELECT id, code, name, rate_to_inr, is_active FROM currencies WHERE company_id = $1 ORDER BY code', [companyId]),
    query('SELECT id, name, is_active FROM payment_terms WHERE company_id = $1 ORDER BY days NULLS LAST, name', [companyId]),
    query("SELECT id, item_type, name FROM item_groups WHERE company_id = $1 AND is_active ORDER BY item_type, name", [companyId]),
    query('SELECT u.name, c.name AS company FROM units u JOIN companies c ON c.id = u.company_id WHERE u.company_id = $1 ORDER BY u.id LIMIT 1', [companyId]),
    approvalSetting({ query: (sql, p) => query(sql, p).then(rows => ({ rows })) }, companyId),
    companyStateCode({ query: (sql, p) => query(sql, p).then(rows => ({ rows })) }, companyId)
  ]);
  return {
    suppliers: suppliers.map(r => ({ id: str(r.id), code: r.code, name: r.name, currencyId: str(r.currency_id), paymentTermId: str(r.payment_term_id), isActive: r.is_active })),
    currencies: currencies.map(r => ({ id: str(r.id), code: r.code, name: r.name, rateToInr: Number(r.rate_to_inr), isActive: r.is_active })),
    paymentTerms: terms.map(r => ({ id: str(r.id), name: r.name, isActive: r.is_active })),
    itemGroups: groups.map(r => ({ id: str(r.id), name: `${r.item_type[0].toUpperCase()}${r.item_type.slice(1)} › ${r.name}` })),
    shipTo: unit[0] ? `${unit[0].company} – ${unit[0].name}` : '',
    dispatchModes: DISPATCH_MODES, deliveryTerms: DELIVERY_TERMS,
    approval, companyStateKnown: Boolean(stateCode)
  };
}

export async function getSupplier(companyId, supplierId) {
  const db = { query: (sql, p) => query(sql, p).then(rows => ({ rows })) };
  const p = (await query(`SELECT id FROM parties WHERE id = $1 AND company_id = $2 AND party_type IN ('supplier', 'both')`, [supplierId, companyId]))[0];
  if (!p) throw new AppError(404, 'Supplier not found.');
  const [addresses, code] = await Promise.all([supplierAddresses(db, companyId, supplierId), companyStateCode(db, companyId)]);
  return { addresses: addresses.map(a => ({ ...a, gstType: gstTypeOf(a, code) })) };
}

// ---------- pickers ----------
// Approved BOM lines with something still to buy. excludePoId: the PO being edited (its own qty is not "already ordered").
export async function bomLines(companyId, { search, supplierId, itemGroupId, excludePoId } = {}) {
  const q = String(search || '').trim();
  const rows = await query(
    `WITH ordered AS (
       SELECT pl.order_line_id, pl.item_id, SUM(pl.qty) AS qty
         FROM purchase_order_lines pl JOIN purchase_orders po ON po.id = pl.po_id
        WHERE po.company_id = $1 AND po.status <> 'cancelled' AND pl.order_line_id IS NOT NULL AND ($5::bigint IS NULL OR po.id <> $5)
        GROUP BY pl.order_line_id, pl.item_id)
     SELECT bl.id, ol.id AS order_line_id, ol.order_no, br.name AS buyer, s.code AS style_code,
            i.id AS item_id, i.code AS item_code, i.name AS item_name, ig.item_type, ig.name AS group_name, bl.uom, i.hsn, h.gst_rate,
            bl.required_qty, COALESCE(od.qty, 0) AS ordered, bl.budgeted_rate, bl.supplier, bl.lead_days,
            to_char(ol.ex_factory_date, 'YYYY-MM-DD') AS ex_factory,
            ($3::bigint IS NOT NULL AND bl.supplier IS NOT NULL AND EXISTS (
               SELECT 1 FROM parties p WHERE p.id = $3 AND (upper(trim(bl.supplier)) = upper(p.name) OR upper(trim(bl.supplier)) = upper(p.code)))) AS same_supplier
       FROM bom_lines bl
       JOIN boms b ON b.id = bl.bom_id AND b.status = 'approved'
       JOIN order_lines ol ON ol.id = b.order_line_id
       JOIN orders o ON o.id = ol.order_id
       JOIN brands br ON br.id = o.brand_id
       JOIN styles s ON s.id = o.style_id
       JOIN items i ON i.id = bl.item_id
       JOIN item_groups ig ON ig.id = i.group_id
       LEFT JOIN hsn_codes h ON h.company_id = b.company_id AND h.code = i.hsn
       LEFT JOIN ordered od ON od.order_line_id = ol.id AND od.item_id = bl.item_id
      WHERE b.company_id = $1 AND NOT bl.from_buyer AND bl.required_qty > COALESCE(od.qty, 0)
        AND ($2 = '' OR ol.order_no ILIKE '%' || $2 || '%' OR s.code ILIKE '%' || $2 || '%' OR i.name ILIKE '%' || $2 || '%'
             OR COALESCE(i.code, '') ILIKE '%' || $2 || '%' OR br.name ILIKE '%' || $2 || '%' OR COALESCE(bl.supplier, '') ILIKE '%' || $2 || '%')
        AND ($4::bigint IS NULL OR i.group_id = $4)
      ORDER BY same_supplier DESC, ol.ex_factory_date NULLS LAST, ol.order_no, ig.item_type, i.name
      LIMIT 300`,
    [companyId, q, idOf(supplierId), idOf(itemGroupId), idOf(excludePoId)]);
  return rows.map(r => ({
    key: `${r.order_line_id}-${r.item_id}`, orderLineId: str(r.order_line_id), orderNo: r.order_no, buyer: r.buyer, styleCode: r.style_code,
    itemId: str(r.item_id), itemCode: r.item_code || '', itemName: r.item_name, group: `${r.item_type} › ${r.group_name}`,
    uom: r.uom, hsn: r.hsn || '', gstRate: r.gst_rate === null ? null : Number(r.gst_rate),
    bomQty: Number(r.required_qty), ordered: Number(r.ordered), balance: round(Number(r.required_qty) - Number(r.ordered), 3),
    budgetedRate: Number(r.budgeted_rate), bomSupplier: r.supplier || '', exFactory: r.ex_factory, sameSupplier: r.same_supplier
  }));
}

// Any active item (for material not tied to an order)
export async function pickItems(companyId, { search, itemGroupId } = {}) {
  const q = String(search || '').trim();
  const rows = await query(
    `SELECT i.id, i.code, i.name, i.uom, i.hsn, h.gst_rate, ig.item_type, ig.name AS group_name
       FROM items i JOIN item_groups ig ON ig.id = i.group_id
       LEFT JOIN hsn_codes h ON h.company_id = i.company_id AND h.code = i.hsn
      WHERE i.company_id = $1 AND i.is_active
        AND ($2 = '' OR i.name ILIKE '%' || $2 || '%' OR COALESCE(i.code, '') ILIKE '%' || $2 || '%' OR ig.name ILIKE '%' || $2 || '%')
        AND ($3::bigint IS NULL OR i.group_id = $3)
      ORDER BY ig.item_type, ig.name, i.name LIMIT 100`, [companyId, q, idOf(itemGroupId)]);
  return rows.map(r => ({
    itemId: str(r.id), itemCode: r.code || '', itemName: r.name, uom: r.uom, hsn: r.hsn || '',
    gstRate: r.gst_rate === null ? null : Number(r.gst_rate), group: `${r.item_type} › ${r.group_name}`
  }));
}

// ---------- list ----------
export async function listPos(companyId, { search, status } = {}) {
  const q = String(search || '').trim();
  const st = Object.keys(STATUS_WORDS).includes(status) ? status : null;
  const rows = await query(
    `SELECT po.id, po.po_no, to_char(po.po_date, 'YYYY-MM-DD') AS po_date, p.name AS supplier, po.vendor_pi, cu.code AS currency,
            po.total_amount, po.status, to_char(po.delivery_date, 'YYYY-MM-DD') AS delivery_date,
            (SELECT COUNT(*) FROM purchase_order_lines x WHERE x.po_id = po.id)::int AS lines,
            (SELECT string_agg(DISTINCT ol.order_no, ', ') FROM purchase_order_lines x JOIN order_lines ol ON ol.id = x.order_line_id WHERE x.po_id = po.id) AS order_nos
       FROM purchase_orders po JOIN parties p ON p.id = po.supplier_id JOIN currencies cu ON cu.id = po.currency_id
      WHERE po.company_id = $1 AND ($3::text IS NULL OR po.status = $3)
        AND ($2 = '' OR po.po_no ILIKE '%' || $2 || '%' OR p.name ILIKE '%' || $2 || '%' OR p.code ILIKE '%' || $2 || '%'
             OR COALESCE(po.vendor_pi, '') ILIKE '%' || $2 || '%'
             OR EXISTS (SELECT 1 FROM purchase_order_lines x JOIN items i ON i.id = x.item_id
                          LEFT JOIN order_lines ol ON ol.id = x.order_line_id LEFT JOIN orders o ON o.id = ol.order_id LEFT JOIN styles s ON s.id = o.style_id
                         WHERE x.po_id = po.id AND (i.name ILIKE '%' || $2 || '%' OR ol.order_no ILIKE '%' || $2 || '%' OR s.code ILIKE '%' || $2 || '%')))
      ORDER BY po.id DESC LIMIT 300`, [companyId, q, st]);
  return rows.map(r => ({
    id: r.id, poNo: r.po_no, date: r.po_date, supplier: r.supplier, vendorPi: r.vendor_pi || '', currency: r.currency,
    total: Number(r.total_amount), status: r.status, deliveryDate: r.delivery_date, lines: r.lines, orderNos: r.order_nos || ''
  }));
}

// ---------- one PO ----------
export async function getPo(companyId, poId, db = { query: (sql, p) => query(sql, p).then(rows => ({ rows })) }) {
  const h = (await db.query(
    `SELECT po.*, to_char(po.po_date, 'YYYY-MM-DD') AS date_s, to_char(po.delivery_date, 'YYYY-MM-DD') AS delivery_s,
            p.code AS supplier_code, p.name AS supplier_name, cu.code AS currency_code,
            ua.username AS approved_by_name
       FROM purchase_orders po JOIN parties p ON p.id = po.supplier_id JOIN currencies cu ON cu.id = po.currency_id
       LEFT JOIN users ua ON ua.id = po.approved_by
      WHERE po.id = $1 AND po.company_id = $2`, [poId, companyId])).rows[0];
  if (!h) throw new AppError(404, 'Purchase order not found.');
  const lines = (await db.query(
    `SELECT pl.*, to_char(pl.delivery_date, 'YYYY-MM-DD') AS delivery_s, i.code AS item_code, i.name AS item_name,
            ol.order_no, br.name AS buyer, s.code AS style_code,
            bl.required_qty AS bom_qty,
            (SELECT COALESCE(SUM(x.qty), 0) FROM purchase_order_lines x JOIN purchase_orders y ON y.id = x.po_id
              WHERE y.status <> 'cancelled' AND y.id <> pl.po_id AND x.order_line_id = pl.order_line_id AND x.item_id = pl.item_id) AS ordered_elsewhere
       FROM purchase_order_lines pl JOIN items i ON i.id = pl.item_id
       LEFT JOIN order_lines ol ON ol.id = pl.order_line_id
       LEFT JOIN orders o ON o.id = ol.order_id
       LEFT JOIN brands br ON br.id = o.brand_id
       LEFT JOIN styles s ON s.id = o.style_id
       LEFT JOIN boms b ON b.order_line_id = pl.order_line_id
       LEFT JOIN bom_lines bl ON bl.bom_id = b.id AND bl.item_id = pl.item_id
      WHERE pl.po_id = $1 ORDER BY pl.sort_order`, [poId])).rows;
  return {
    id: h.id, poNo: h.po_no, poDate: h.date_s, supplierId: str(h.supplier_id), supplierCode: h.supplier_code, supplierName: h.supplier_name,
    billAddressId: str(h.bill_address_id), currencyId: str(h.currency_id), currencyCode: h.currency_code, conversionRate: Number(h.conversion_rate),
    paymentTermId: str(h.payment_term_id), dispatchMode: h.dispatch_mode || '', deliveryTerms: h.delivery_terms || '',
    deliveryDate: h.delivery_s || '', vendorPi: h.vendor_pi || '', remarks: h.remarks || '', gstType: h.gst_type,
    status: h.status, statusText: STATUS_WORDS[h.status], rejectReason: h.reject_reason || '', cancelReason: h.cancel_reason || '',
    approvedBy: h.approved_by_name || '', approvedAt: h.approved_at || null,
    taxable: Number(h.taxable_amount), tax: Number(h.tax_amount), total: Number(h.total_amount),
    lines: lines.map(l => ({
      id: l.id, orderLineId: str(l.order_line_id), orderNo: l.order_no || '', buyer: l.buyer || '', styleCode: l.style_code || '',
      itemId: str(l.item_id), itemCode: l.item_code || '', itemName: l.item_name, uom: l.uom, hsn: l.hsn || '',
      qty: Number(l.qty), moqExtraQty: Number(l.moq_extra_qty), rate: Number(l.rate), discountPct: Number(l.discount_pct),
      gstRate: Number(l.gst_rate), amount: Number(l.amount), taxAmount: Number(l.tax_amount), deliveryDate: l.delivery_s || '', remarks: l.remarks || '',
      bomQty: l.bom_qty === null ? null : Number(l.bom_qty), orderedElsewhere: Number(l.ordered_elsewhere)
    }))
  };
}

// ---------- save ----------
async function readPo(db, companyId, body) {
  const problems = [];
  const supplierId = idOf(body.supplierId);
  const supplier = supplierId && (await db.query(
    `SELECT id, name, is_active FROM parties WHERE id = $1 AND company_id = $2 AND party_type IN ('supplier', 'both')`, [supplierId, companyId])).rows[0];
  if (!supplier) problems.push('supplier');
  const poDate = String(body.poDate || '');
  if (!isDate(poDate)) problems.push('PO date');
  const deliveryDate = body.deliveryDate ? String(body.deliveryDate) : '';
  if (deliveryDate && !isDate(deliveryDate)) problems.push('a valid delivery date');
  const currencyId = idOf(body.currencyId);
  const currency = currencyId && (await db.query('SELECT id, code FROM currencies WHERE id = $1 AND company_id = $2', [currencyId, companyId])).rows[0];
  if (!currency) problems.push('currency');
  let conversionRate = currency?.code === 'INR' ? 1 : num(body.conversionRate);
  if (!(conversionRate > 0)) { problems.push('conversion rate (rupees for 1 unit of the currency)'); conversionRate = 1; }
  const paymentTermId = idOf(body.paymentTermId);
  if (paymentTermId && !(await db.query('SELECT 1 FROM payment_terms WHERE id = $1 AND company_id = $2', [paymentTermId, companyId])).rows.length) problems.push('a valid payment term');
  const dispatchMode = text(body.dispatchMode, 30);
  if (dispatchMode && !DISPATCH_MODES.includes(dispatchMode)) problems.push('a valid mode of dispatch');
  const deliveryTerms = text(body.deliveryTerms, 30);
  if (deliveryTerms && !DELIVERY_TERMS.includes(deliveryTerms)) problems.push('valid delivery terms');
  if (problems.length) throw new AppError(400, `Fill in ${problems.join(', ')}.`);

  // Bill address: the one picked, else the supplier's default billing address
  const addresses = await supplierAddresses(db, companyId, supplierId);
  let billAddressId = idOf(body.billAddressId);
  if (billAddressId && !addresses.some(a => Number(a.id) === billAddressId)) throw new AppError(400, 'Pick a bill address of this supplier.');
  if (!billAddressId) billAddressId = Number(addresses.find(a => a.type === 'billing')?.id || addresses[0]?.id) || null;
  const gstType = gstTypeOf(addresses.find(a => Number(a.id) === billAddressId), await companyStateCode(db, companyId));

  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (!raw.length) throw new AppError(400, 'Add at least one item.');
  if (raw.length > MAX_LINES) throw new AppError(400, `A PO can have up to ${MAX_LINES} lines.`);
  const lines = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] || {};
    const at = `Line ${i + 1}`;
    const itemId = idOf(r.itemId);
    const item = itemId && (await db.query('SELECT id, name, uom, hsn FROM items WHERE id = $1 AND company_id = $2', [itemId, companyId])).rows[0];
    if (!item) throw new AppError(400, `${at}: pick an item.`);
    const orderLineId = idOf(r.orderLineId);
    if (orderLineId && !(await db.query('SELECT 1 FROM order_lines WHERE id = $1 AND company_id = $2', [orderLineId, companyId])).rows.length) {
      throw new AppError(400, `${at} (${item.name}): the order no. is not valid.`);
    }
    const key = `${orderLineId || 0}-${itemId}`;
    if (seen.has(key)) throw new AppError(400, `${at}: ${item.name} is already in this PO${orderLineId ? ' for the same order no.' : ''}. Change the qty on that line instead.`);
    seen.add(key);
    const qty = num(r.qty);
    const moq = num(r.moqExtraQty);
    const rate = num(r.rate);
    const disc = num(r.discountPct);
    const gstRate = num(r.gstRate);
    const bad = [];
    if (!(qty > 0)) bad.push('qty above 0');
    if (!(moq >= 0)) bad.push('MOQ extra 0 or more');
    if (!(rate >= 0)) bad.push('rate 0 or more');
    if (!(disc >= 0 && disc <= 100)) bad.push('discount between 0 and 100');
    if (!(gstRate >= 0 && gstRate <= 100)) bad.push('GST % between 0 and 100');
    const lineDate = r.deliveryDate ? String(r.deliveryDate) : deliveryDate;
    if (lineDate && !isDate(lineDate)) bad.push('a valid delivery date');
    if (bad.length) throw new AppError(400, `${at} (${item.name}): ${bad.join(', ')}.`);
    const amount = round((qty + moq) * rate * (1 - disc / 100));
    const taxAmount = gstType === 'import' ? 0 : round(amount * gstRate / 100);
    lines.push({
      orderLineId, itemId, uom: text(r.uom, 10) || item.uom, hsn: text(r.hsn, 8) || item.hsn || null,
      qty: round(qty, 3), moq: round(moq, 3), rate: round(rate, 4), disc: round(disc, 3), gstRate: round(gstRate), amount, taxAmount,
      deliveryDate: lineDate || null, remarks: text(r.remarks, 200)
    });
  }
  const taxable = round(lines.reduce((a, l) => a + l.amount, 0));
  const tax = round(lines.reduce((a, l) => a + l.taxAmount, 0));
  return {
    h: {
      supplierId, poDate, deliveryDate: deliveryDate || null, currencyId, conversionRate, paymentTermId, dispatchMode, deliveryTerms,
      billAddressId, gstType, vendorPi: text(body.vendorPi, 60), remarks: text(body.remarks, 1000)
    },
    lines, taxable, tax, total: round(taxable + tax), supplierActive: supplier.is_active
  };
}

async function nextPoNo(db, companyId) {
  const fy = (await db.query('SELECT short_label FROM financial_years WHERE company_id = $1 AND is_current LIMIT 1', [companyId])).rows[0];
  if (!fy) throw new AppError(400, 'No current financial year is set for this company.');
  const r = (await db.query(
    `INSERT INTO document_series (company_id, doc_type, fy_short, prefix_key, last_number) VALUES ($1, 'PO', $2, '', 1)
     ON CONFLICT (company_id, doc_type, fy_short, prefix_key) DO UPDATE SET last_number = document_series.last_number + 1
     RETURNING last_number`, [companyId, fy.short_label])).rows[0];
  return `PO/${fy.short_label}/${String(r.last_number).padStart(4, '0')}`;
}

async function writeLines(db, poId, lines) {
  await db.query('DELETE FROM purchase_order_lines WHERE po_id = $1', [poId]);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await db.query(
      `INSERT INTO purchase_order_lines (po_id, sort_order, order_line_id, item_id, uom, hsn, qty, moq_extra_qty, rate, discount_pct, gst_rate,
                                         amount, tax_amount, delivery_date, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [poId, i + 1, l.orderLineId, l.itemId, l.uom, l.hsn, l.qty, l.moq, l.rate, l.disc, l.gstRate, l.amount, l.taxAmount, l.deliveryDate, l.remarks]);
  }
}

// Open straight away unless approval is on and the total in rupees is above the limit (approvers skip the wait)
async function statusFor(db, companyId, totalInr, canApprove) {
  const a = await approvalSetting(db, companyId);
  if (!a.on || canApprove || totalInr <= a.limit) return { status: 'open', selfApproved: a.on && canApprove && totalInr > a.limit };
  return { status: 'pending', selfApproved: false };
}

export async function createPo(user, body, { canApprove }) {
  return withTransaction(async (db) => {
    const { h, lines, taxable, tax, total, supplierActive } = await readPo(db, user.companyId, body);
    if (!supplierActive) throw new AppError(400, 'This supplier is archived (inactive). Make it active in Party master first.');
    const { status, selfApproved } = await statusFor(db, user.companyId, total * h.conversionRate, canApprove);
    const poNo = await nextPoNo(db, user.companyId);
    const id = (await db.query(
      `INSERT INTO purchase_orders (company_id, unit_id, po_no, po_date, supplier_id, bill_address_id, currency_id, conversion_rate, payment_term_id,
                                    dispatch_mode, delivery_terms, delivery_date, vendor_pi, remarks, gst_type, status,
                                    taxable_amount, tax_amount, total_amount, approved_by, approved_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $22) RETURNING id`,
      [user.companyId, user.unitId, poNo, h.poDate, h.supplierId, h.billAddressId, h.currencyId, h.conversionRate, h.paymentTermId,
        h.dispatchMode, h.deliveryTerms, h.deliveryDate, h.vendorPi, h.remarks, h.gstType, status,
        taxable, tax, total, selfApproved ? user.id : null, selfApproved ? new Date() : null, user.id])).rows[0].id;
    await writeLines(db, id, lines);
    await audit(db, user, 'CREATE', id, { poNo, lines: lines.length, total, status });
    return getPo(user.companyId, id, db);
  });
}

export async function updatePo(user, poId, body, { canApprove }) {
  return withTransaction(async (db) => {
    const old = (await db.query('SELECT id, po_no, status, supplier_id FROM purchase_orders WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [poId, user.companyId])).rows[0];
    if (!old) throw new AppError(404, 'Purchase order not found.');
    if (old.status === 'cancelled') throw new AppError(400, `${old.po_no} is cancelled and can't be changed. Duplicate it to make a new PO.`);
    const { h, lines, taxable, tax, total, supplierActive } = await readPo(db, user.companyId, body);
    if (!supplierActive && Number(old.supplier_id) !== h.supplierId) throw new AppError(400, 'This supplier is archived (inactive). Pick another one.');
    // Any change asks for approval again (when approval applies)
    const { status, selfApproved } = await statusFor(db, user.companyId, total * h.conversionRate, canApprove);
    await db.query(
      `UPDATE purchase_orders SET po_date = $3, supplier_id = $4, bill_address_id = $5, currency_id = $6, conversion_rate = $7, payment_term_id = $8,
              dispatch_mode = $9, delivery_terms = $10, delivery_date = $11, vendor_pi = $12, remarks = $13, gst_type = $14, status = $15,
              taxable_amount = $16, tax_amount = $17, total_amount = $18,
              approved_by = CASE WHEN $19 THEN $20::bigint WHEN $15 = 'pending' THEN NULL ELSE approved_by END,
              approved_at = CASE WHEN $19 THEN now() WHEN $15 = 'pending' THEN NULL ELSE approved_at END,
              reject_reason = NULL, updated_by = $20, updated_at = now()
        WHERE id = $1 AND company_id = $2`,
      [poId, user.companyId, h.poDate, h.supplierId, h.billAddressId, h.currencyId, h.conversionRate, h.paymentTermId,
        h.dispatchMode, h.deliveryTerms, h.deliveryDate, h.vendorPi, h.remarks, h.gstType, status, taxable, tax, total, selfApproved, user.id]);
    await writeLines(db, poId, lines);
    await audit(db, user, 'UPDATE', poId, { poNo: old.po_no, lines: lines.length, total, status });
    return getPo(user.companyId, poId, db);
  });
}

// ---------- approve / reject / cancel / delete ----------
async function lockPo(db, companyId, poId) {
  const r = (await db.query('SELECT id, po_no, status FROM purchase_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [poId, companyId])).rows[0];
  if (!r) throw new AppError(404, 'Purchase order not found.');
  return r;
}

export async function approvePo(user, poId) {
  return withTransaction(async (db) => {
    const r = await lockPo(db, user.companyId, poId);
    if (r.status !== 'pending') throw new AppError(400, `${r.po_no} is not waiting for approval.`);
    await db.query(`UPDATE purchase_orders SET status = 'open', approved_by = $2, approved_at = now(), reject_reason = NULL, updated_at = now() WHERE id = $1`, [poId, user.id]);
    await audit(db, user, 'APPROVE', poId, { poNo: r.po_no });
    return getPo(user.companyId, poId, db);
  });
}

export async function rejectPo(user, poId, reason) {
  const why = text(reason, 300);
  if (!why) throw new AppError(400, 'Write why the PO is rejected.');
  return withTransaction(async (db) => {
    const r = await lockPo(db, user.companyId, poId);
    if (r.status !== 'pending') throw new AppError(400, `${r.po_no} is not waiting for approval.`);
    await db.query(`UPDATE purchase_orders SET status = 'rejected', reject_reason = $2, updated_at = now() WHERE id = $1`, [poId, why]);
    await audit(db, user, 'REJECT', poId, { poNo: r.po_no, reason: why });
    return getPo(user.companyId, poId, db);
  });
}

export async function cancelPo(user, poId, reason) {
  return withTransaction(async (db) => {
    const r = await lockPo(db, user.companyId, poId);
    if (r.status === 'cancelled') throw new AppError(400, `${r.po_no} is already cancelled.`);
    const why = text(reason, 300);
    await db.query(`UPDATE purchase_orders SET status = 'cancelled', cancel_reason = $2, updated_by = $3, updated_at = now() WHERE id = $1`, [poId, why, user.id]);
    await audit(db, user, 'CANCEL', poId, { poNo: r.po_no, reason: why });
    return getPo(user.companyId, poId, db);
  });
}

// Delete a PO (nothing has been received against it yet). Its number is not given out again.
export async function deletePo(user, poId) {
  return withTransaction(async (db) => {
    const r = await lockPo(db, user.companyId, poId);
    await db.query('DELETE FROM purchase_orders WHERE id = $1', [poId]);
    await audit(db, user, 'DELETE', poId, { poNo: r.po_no });
    return { ok: true, poNo: r.po_no };
  });
}
