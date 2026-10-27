// Order entry: business rules and database work.
// Every query filters by company_id so one company never sees another's data.
import { pool, query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

const DEVIATIONS = ['2', '5', 'open'];
const MODES = ['sea', 'air'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- helpers ----------

function isDate(v) {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isInteger(n) ? n : NaN;
}

async function currentFy(db, companyId) {
  const fy = (await db.query('SELECT short_label FROM financial_years WHERE company_id = $1 AND is_current LIMIT 1', [companyId])).rows[0];
  if (!fy) throw new AppError(400, 'No current financial year is set for this company.');
  return fy.short_label;
}

// Size ranges with their sizes: { [id]: { id, name, sizes: ['S','M',...] } }
async function sizeRangeMap(db, companyId) {
  const rows = (await db.query(
    `SELECT r.id, r.name, s.size_label
       FROM size_ranges r JOIN size_range_sizes s ON s.size_range_id = r.id
      WHERE r.company_id = $1 AND r.is_active
      ORDER BY r.id, s.sort_order`, [companyId])).rows;
  const map = {};
  for (const r of rows) {
    if (!map[r.id]) map[r.id] = { id: r.id, name: r.name, sizes: [] };
    map[r.id].sizes.push(r.size_label);
  }
  return map;
}

async function existsFor(db, table, companyId, id) {
  if (!Number.isInteger(id)) return false;
  return (await db.query(`SELECT 1 FROM ${table} WHERE id = $1 AND company_id = $2 AND is_active`, [id, companyId])).rows.length > 0;
}

// Works out the size quantities and total for one line.
// With a size range: total = sum of sizes. Without: total comes from totalQty.
function sizesAndTotal(label, sizeRangeId, sizes, totalQty, ranges) {
  if (sizeRangeId) {
    const range = ranges[sizeRangeId];
    if (!range) throw new AppError(400, `${label}: pick a valid size range.`);
    const clean = {};
    for (const [size, raw] of Object.entries(sizes || {})) {
      if (!range.sizes.includes(size)) throw new AppError(400, `${label}: size ${size} is not in ${range.name}.`);
      const q = toInt(raw);
      if (q === null) continue;
      if (Number.isNaN(q) || q < 0) throw new AppError(400, `${label}: size ${size} needs a whole number.`);
      clean[size] = q;
    }
    const total = Object.values(clean).reduce((a, b) => a + b, 0);
    if (total <= 0) throw new AppError(400, `${label}: enter qty for at least one size.`);
    return { sizes: clean, total };
  }
  const t = toInt(totalQty);
  if (t === null || Number.isNaN(t) || t <= 0) throw new AppError(400, `${label}: enter the total qty.`);
  return { sizes: {}, total: t };
}

// Checks one new line and returns clean values ready to save.
async function checkNewLine(db, companyId, line, index, ranges) {
  const label = `Line ${index + 1}`;
  const missing = [];
  if (!isDate(line.lineDate)) missing.push('date');
  if (!MODES.includes(line.dispatchMode)) missing.push('dispatch mode');
  if (!(await existsFor(db, 'colours', companyId, toInt(line.colourId)))) missing.push('colour');
  if (!isDate(line.exFactoryDate)) missing.push('ex-factory date');
  if (!isDate(line.fobDate)) missing.push('FOB date');
  if (missing.length) throw new AppError(400, `${label}: fill in ${missing.join(', ')}.`);
  if (line.exFactoryDate > line.fobDate) throw new AppError(400, `${label}: ex-factory date must be on or before the FOB date.`);

  const sizeRangeId = line.sizeRangeId ? toInt(line.sizeRangeId) : null;
  const { sizes, total } = sizesAndTotal(label, sizeRangeId, line.sizes, line.totalQty, ranges);
  return {
    lineDate: line.lineDate,
    dispatchMode: line.dispatchMode,
    buyerPoNo: (line.buyerPoNo || '').trim() || null,
    colourId: toInt(line.colourId),
    sizeRangeId,
    sizes,
    total,
    exFactoryDate: line.exFactoryDate,
    fobDate: line.fobDate
  };
}

// Next order number for a brand: ORD/26-27/NWA/0001. Safe when two people save at once.
async function takeOrderNumber(db, companyId, fy, initials) {
  const r = (await db.query(
    `INSERT INTO document_series (company_id, doc_type, fy_short, prefix_key, last_number)
     VALUES ($1, 'ORD', $2, $3, 1)
     ON CONFLICT (company_id, doc_type, fy_short, prefix_key)
     DO UPDATE SET last_number = document_series.last_number + 1
     RETURNING last_number`, [companyId, fy, initials])).rows[0];
  return `ORD/${fy}/${initials}/${String(r.last_number).padStart(4, '0')}`;
}

async function insertLine(db, user, orderId, lineNo, orderNo, l) {
  const id = (await db.query(
    `INSERT INTO order_lines (company_id, order_id, line_no, order_no, line_date, dispatch_mode, buyer_po_no, colour_id,
                              size_range_id, total_qty, ex_factory_date, fob_date, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13) RETURNING id`,
    [user.companyId, orderId, lineNo, orderNo, l.lineDate, l.dispatchMode, l.buyerPoNo, l.colourId,
      l.sizeRangeId, l.total, l.exFactoryDate, l.fobDate, user.id])).rows[0].id;
  for (const [size, qty] of Object.entries(l.sizes)) {
    await db.query('INSERT INTO order_line_sizes (order_line_id, size_label, qty) VALUES ($1, $2, $3)', [id, size, qty]);
  }
}

async function audit(db, user, action, entityId, details) {
  await db.query(
    'INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, 'order', String(entityId), details ? JSON.stringify(details) : null]);
}

// ---------- public functions ----------

export async function getLookups(companyId) {
  const [brands, styles, colours] = await Promise.all([
    query('SELECT id, name, initials FROM brands WHERE company_id = $1 AND is_active ORDER BY name', [companyId]),
    // A style brings its Product group and Product class (from the Product category screen)
    query(`SELECT s.id, s.code, s.name, s.brand_id, g.name AS group_name, k.name AS class_name
             FROM styles s LEFT JOIN product_groups g ON g.id = s.product_group_id LEFT JOIN product_classes k ON k.id = s.product_class_id
            WHERE s.company_id = $1 AND s.is_active ORDER BY s.code`, [companyId]),
    query('SELECT id, name FROM colours WHERE company_id = $1 AND is_active ORDER BY name', [companyId])
  ]);
  const ranges = await sizeRangeMap(pool, companyId);
  const fy = (await query('SELECT label, short_label FROM financial_years WHERE company_id = $1 AND is_current LIMIT 1', [companyId]))[0];
  return {
    brands,
    styles: styles.map(s => ({ id: s.id, code: s.code, name: s.name, brandId: s.brand_id, productGroup: s.group_name || '', productClass: s.class_name || '' })),
    colours,
    sizeRanges: Object.values(ranges),
    financialYear: fy ? { label: fy.label, short: fy.short_label } : null
  };
}

// Preview only: shows the next numbers without reserving them.
export async function previewNumbers(companyId, brandId, count) {
  const brand = (await query('SELECT initials FROM brands WHERE id = $1 AND company_id = $2', [brandId, companyId]))[0];
  if (!brand) throw new AppError(400, 'Pick a valid brand.');
  const fy = (await query('SELECT short_label FROM financial_years WHERE company_id = $1 AND is_current LIMIT 1', [companyId]))[0];
  if (!fy) throw new AppError(400, 'No current financial year is set for this company.');
  const row = (await query(
    `SELECT last_number FROM document_series WHERE company_id = $1 AND doc_type = 'ORD' AND fy_short = $2 AND prefix_key = $3`,
    [companyId, fy.short_label, brand.initials]))[0];
  const last = row ? row.last_number : 0;
  const n = Math.min(Math.max(count, 1), 200);
  return Array.from({ length: n }, (_, i) => `ORD/${fy.short_label}/${brand.initials}/${String(last + i + 1).padStart(4, '0')}`);
}

export async function createOrder(user, body) {
  return withTransaction(async (db) => {
    const brandId = toInt(body.brandId);
    const styleId = toInt(body.styleId);
    const missing = [];
    if (!(await existsFor(db, 'brands', user.companyId, brandId))) missing.push('brand');
    // Product group and class come with the style, so the order doesn't ask for a category
    if (!(await existsFor(db, 'styles', user.companyId, styleId))) missing.push('style');
    if (!DEVIATIONS.includes(String(body.allowedDeviation))) missing.push('allowed deviation');
    if (missing.length) throw new AppError(400, `Order header: fill in ${missing.join(', ')}.`);

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) throw new AppError(400, 'Add at least one order line.');

    const ranges = await sizeRangeMap(db, user.companyId);
    const clean = [];
    for (let i = 0; i < lines.length; i++) clean.push(await checkNewLine(db, user.companyId, lines[i] || {}, i, ranges));

    const fy = await currentFy(db, user.companyId);
    const initials = (await db.query('SELECT initials FROM brands WHERE id = $1', [brandId])).rows[0].initials;

    const orderId = (await db.query(
      `INSERT INTO orders (company_id, unit_id, brand_id, style_id, allowed_deviation, remarks, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
      [user.companyId, user.unitId, brandId, styleId, String(body.allowedDeviation), (body.remarks || '').trim() || null, user.id])).rows[0].id;

    for (let i = 0; i < clean.length; i++) {
      const orderNo = await takeOrderNumber(db, user.companyId, fy, initials);
      await insertLine(db, user, orderId, i + 1, orderNo, clean[i]);
    }
    await audit(db, user, 'CREATE', orderId, { lines: clean.length });
    return orderId;
  }).then(id => getOrder(user.companyId, id));
}

export async function addLines(user, orderId, body) {
  await withTransaction(async (db) => {
    const order = (await db.query(
      `SELECT o.id, b.initials FROM orders o JOIN brands b ON b.id = o.brand_id
        WHERE o.id = $1 AND o.company_id = $2 FOR UPDATE OF o`, [orderId, user.companyId])).rows[0];
    if (!order) throw new AppError(404, 'Order not found.');
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) throw new AppError(400, 'Add at least one order line.');

    const maxNo = (await db.query('SELECT COALESCE(MAX(line_no), 0) AS n FROM order_lines WHERE order_id = $1', [orderId])).rows[0].n;
    const ranges = await sizeRangeMap(db, user.companyId);
    const clean = [];
    for (let i = 0; i < lines.length; i++) clean.push(await checkNewLine(db, user.companyId, lines[i] || {}, maxNo + i, ranges));

    const fy = await currentFy(db, user.companyId);
    for (let i = 0; i < clean.length; i++) {
      const orderNo = await takeOrderNumber(db, user.companyId, fy, order.initials);
      await insertLine(db, user, orderId, maxNo + i + 1, orderNo, clean[i]);
    }
    await db.query('UPDATE orders SET updated_by = $2, updated_at = now() WHERE id = $1', [orderId, user.id]);
    await audit(db, user, 'ADD_LINES', orderId, { lines: clean.length });
  });
  return getOrder(user.companyId, orderId);
}

// After save only buyer PO, size range, sizes and (without a size range) total qty can change.
const EDITABLE = ['buyerPoNo', 'sizeRangeId', 'sizes', 'totalQty'];

export async function updateLine(user, orderId, lineId, body) {
  const extra = Object.keys(body || {}).filter(k => !EDITABLE.includes(k));
  if (extra.length) throw new AppError(400, 'After saving, only buyer PO no., size range and quantities can be changed.');

  await withTransaction(async (db) => {
    const line = (await db.query(
      `SELECT id, line_no, buyer_po_no, size_range_id, total_qty FROM order_lines
        WHERE id = $1 AND order_id = $2 AND company_id = $3 FOR UPDATE`, [lineId, orderId, user.companyId])).rows[0];
    if (!line) throw new AppError(404, 'Order line not found.');
    const label = `Line ${line.line_no}`;

    const buyerPoNo = 'buyerPoNo' in body ? ((body.buyerPoNo || '').trim() || null) : line.buyer_po_no;
    const sizeRangeId = 'sizeRangeId' in body ? (body.sizeRangeId ? toInt(body.sizeRangeId) : null) : line.size_range_id;

    let sizes = body.sizes;
    if (sizeRangeId && sizes === undefined && sizeRangeId === line.size_range_id) {
      const rows = (await db.query('SELECT size_label, qty FROM order_line_sizes WHERE order_line_id = $1', [lineId])).rows;
      sizes = Object.fromEntries(rows.map(r => [r.size_label, r.qty]));
    }
    const totalIn = 'totalQty' in body ? body.totalQty : line.total_qty;
    const ranges = await sizeRangeMap(db, user.companyId);
    const result = sizesAndTotal(label, sizeRangeId, sizes, totalIn, ranges);

    await db.query(
      `UPDATE order_lines SET buyer_po_no = $2, size_range_id = $3, total_qty = $4, updated_by = $5, updated_at = now() WHERE id = $1`,
      [lineId, buyerPoNo, sizeRangeId, result.total, user.id]);
    await db.query('DELETE FROM order_line_sizes WHERE order_line_id = $1', [lineId]);
    for (const [size, qty] of Object.entries(result.sizes)) {
      await db.query('INSERT INTO order_line_sizes (order_line_id, size_label, qty) VALUES ($1, $2, $3)', [lineId, size, qty]);
    }
    await audit(db, user, 'UPDATE_LINE', orderId, { lineId: Number(lineId), fields: Object.keys(body) });
  });
  return getOrder(user.companyId, orderId);
}

export async function getOrder(companyId, orderId) {
  const o = (await query(
    `SELECT o.id, o.brand_id, b.name AS brand_name, b.initials, o.product_category_id, o.style_id,
            s.code AS style_code, s.name AS style_name, o.allowed_deviation, o.remarks, o.status,
            o.created_at, o.updated_at, cu.username AS created_by, g.name AS group_name, k.name AS class_name,
            CASE WHEN pc.id IS NULL THEN c.name ELSE pc.name || ' › ' || c.name END AS old_category
       FROM orders o
       JOIN brands b ON b.id = o.brand_id
       JOIN styles s ON s.id = o.style_id
       LEFT JOIN product_groups g ON g.id = s.product_group_id
       LEFT JOIN product_classes k ON k.id = s.product_class_id
       LEFT JOIN product_categories c ON c.id = o.product_category_id
       LEFT JOIN product_categories pc ON pc.id = c.parent_id
       LEFT JOIN users cu ON cu.id = o.created_by
      WHERE o.id = $1 AND o.company_id = $2`, [orderId, companyId]))[0];
  if (!o) throw new AppError(404, 'Order not found.');

  const lines = await query(
    `SELECT l.id, l.line_no, l.order_no, to_char(l.line_date, 'YYYY-MM-DD') AS line_date, l.dispatch_mode, l.buyer_po_no,
            l.colour_id, c.name AS colour_name, l.size_range_id, r.name AS size_range_name, l.total_qty,
            to_char(l.ex_factory_date, 'YYYY-MM-DD') AS ex_factory_date, to_char(l.fob_date, 'YYYY-MM-DD') AS fob_date
       FROM order_lines l
       JOIN colours c ON c.id = l.colour_id
       LEFT JOIN size_ranges r ON r.id = l.size_range_id
      WHERE l.order_id = $1
      ORDER BY l.line_no`, [orderId]);
  const sizeRows = lines.length ? await query(
    `SELECT z.order_line_id, z.size_label, z.qty
       FROM order_line_sizes z
       JOIN order_lines l ON l.id = z.order_line_id
       LEFT JOIN size_range_sizes rs ON rs.size_range_id = l.size_range_id AND rs.size_label = z.size_label
      WHERE l.order_id = $1
      ORDER BY rs.sort_order`, [orderId]) : [];

  return {
    id: o.id,
    brandId: o.brand_id, brandName: o.brand_name, brandInitials: o.initials,
    productCategoryId: o.product_category_id,
    productGroup: o.group_name || '', productClass: o.class_name || '', oldCategory: o.old_category || '',
    styleId: o.style_id, styleCode: o.style_code, styleName: o.style_name,
    allowedDeviation: o.allowed_deviation, remarks: o.remarks, status: o.status,
    createdBy: o.created_by, createdAt: o.created_at, updatedAt: o.updated_at,
    totalQty: lines.reduce((a, l) => a + l.total_qty, 0),
    lines: lines.map(l => ({
      id: l.id, lineNo: l.line_no, orderNo: l.order_no, lineDate: l.line_date, dispatchMode: l.dispatch_mode,
      buyerPoNo: l.buyer_po_no || '', colourId: l.colour_id, colourName: l.colour_name,
      sizeRangeId: l.size_range_id, sizeRangeName: l.size_range_name, totalQty: l.total_qty,
      sizes: Object.fromEntries(sizeRows.filter(z => z.order_line_id === l.id).map(z => [z.size_label, z.qty])),
      exFactoryDate: l.ex_factory_date, fobDate: l.fob_date
    }))
  };
}

// Saved orders for the Search panel.
// `search` matches order no., buyer PO, brand or style; brandId / categoryId / styleId narrow the list.
const optionalId = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);

export async function listOrders(companyId, filters = {}) {
  const q = String(filters.search || '').trim();
  const brandId = optionalId(filters.brandId);
  const categoryId = optionalId(filters.categoryId);
  const styleId = optionalId(filters.styleId);
  // Quick filters of the Orders list: leaving within 90 days, lines without a Final costing, BOMs not approved
  const view = ['soon', 'nocosting', 'bompending'].includes(filters.view) ? filters.view : '';
  const limit = Math.min(Number(filters.limit) || 50, 300);
  const rows = await query(
    `SELECT * FROM (
     SELECT o.id, o.brand_id, b.name AS brand, s.code AS style_code, s.name AS style_name,
            COALESCE(NULLIF(concat_ws(' › ', g.name, k.name), ''),
                     CASE WHEN pc.id IS NULL THEN c.name ELSE pc.name || ' › ' || c.name END) AS category,
            COUNT(l.id)::int AS lines, COALESCE(SUM(l.total_qty), 0)::int AS total_qty,
            MIN(l.order_no) AS first_order_no, MAX(l.order_no) AS last_order_no,
            STRING_AGG(DISTINCT l.buyer_po_no, ', ') AS buyer_pos,
            to_char(MIN(l.ex_factory_date), 'YYYY-MM-DD') AS first_ex_factory,
            MIN(l.ex_factory_date) AS first_ex_date,
            (SELECT COUNT(DISTINCT k.order_line_id) FROM costings k JOIN order_lines x ON x.id = k.order_line_id
              WHERE x.order_id = o.id AND NOT k.is_deleted AND k.costing_type <> 'initial')::int AS final_lines,
            (SELECT COUNT(*) FROM boms m JOIN order_lines x ON x.id = m.order_line_id
              WHERE x.order_id = o.id AND m.status = 'approved')::int AS bom_approved,
            o.created_at
       FROM orders o
       JOIN brands b ON b.id = o.brand_id
       JOIN styles s ON s.id = o.style_id
       LEFT JOIN product_categories c ON c.id = o.product_category_id
       LEFT JOIN product_categories pc ON pc.id = c.parent_id
       LEFT JOIN product_groups g ON g.id = s.product_group_id
       LEFT JOIN product_classes k ON k.id = s.product_class_id
       LEFT JOIN order_lines l ON l.order_id = o.id
      WHERE o.company_id = $1
        AND ($3::bigint IS NULL OR o.brand_id = $3)
        AND ($4::bigint IS NULL OR o.product_category_id = $4)
        AND ($5::bigint IS NULL OR o.style_id = $5)
        AND ($2 = '' OR EXISTS (
              SELECT 1 FROM order_lines x
               WHERE x.order_id = o.id AND (x.order_no ILIKE '%' || $2 || '%' OR x.buyer_po_no ILIKE '%' || $2 || '%'))
             OR b.name ILIKE '%' || $2 || '%' OR s.code ILIKE '%' || $2 || '%' OR s.name ILIKE '%' || $2 || '%'
             OR g.name ILIKE '%' || $2 || '%' OR k.name ILIKE '%' || $2 || '%')
      GROUP BY o.id, b.name, s.code, s.name, c.name, pc.id, pc.name, g.name, k.name
     ) t
     WHERE ($6 = '' OR ($6 = 'soon' AND first_ex_date <= CURRENT_DATE + 90)
                    OR ($6 = 'nocosting' AND final_lines < lines)
                    OR ($6 = 'bompending' AND bom_approved < lines))
     ORDER BY ${view === 'soon' ? 'first_ex_date ASC' : 'created_at DESC'}
     LIMIT $7`, [companyId, q, brandId, categoryId, styleId, view, limit]);
  return rows.map(r => ({
    id: r.id, brandId: r.brand_id, brand: r.brand, category: r.category, styleCode: r.style_code, styleName: r.style_name,
    lines: r.lines, totalQty: r.total_qty,
    orderNos: r.first_order_no === r.last_order_no ? r.first_order_no : `${r.first_order_no} – ${r.last_order_no.split('/').pop()}`,
    buyerPos: r.buyer_pos || '', firstExFactory: r.first_ex_factory, createdAt: r.created_at,
    finalLines: r.final_lines, bomApproved: r.bom_approved
  }));
}

// Orders list, one row per order no. (order line): what you open is exactly that order no.
// view: 'soon' = ex-factory within 90 days, 'nocosting' = no Final costing yet, 'bompending' = BOM not approved yet
export async function listOrderLines(companyId, filters = {}) {
  const q = String(filters.search || '').trim();
  const view = ['soon', 'nocosting', 'bompending'].includes(filters.view) ? filters.view : '';
  const limit = Math.min(Number(filters.limit) || 300, 500);
  const rows = await query(
    `SELECT * FROM (
     SELECT l.id, l.order_id, l.order_no, l.buyer_po_no, l.total_qty, l.ex_factory_date, l.created_at,
            to_char(l.ex_factory_date, 'YYYY-MM-DD') AS ex_factory,
            o.brand_id, b.name AS brand, s.code AS style_code, s.name AS style_name, c.name AS colour,
            COALESCE(NULLIF(concat_ws(' › ', g.name, k.name), ''),
                     CASE WHEN pp.id IS NULL THEN pc.name ELSE pp.name || ' › ' || pc.name END) AS category,
            (SELECT k2.costing_type FROM costings k2 WHERE k2.order_line_id = l.id AND NOT k2.is_deleted
              ORDER BY (k2.costing_type = 'final') DESC, k2.updated_at DESC LIMIT 1) AS costing_type,
            (SELECT m.status FROM boms m WHERE m.order_line_id = l.id) AS bom_status
       FROM order_lines l
       JOIN orders o ON o.id = l.order_id
       JOIN brands b ON b.id = o.brand_id
       JOIN styles s ON s.id = o.style_id
       JOIN colours c ON c.id = l.colour_id
       LEFT JOIN product_groups g ON g.id = s.product_group_id
       LEFT JOIN product_classes k ON k.id = s.product_class_id
       LEFT JOIN product_categories pc ON pc.id = o.product_category_id
       LEFT JOIN product_categories pp ON pp.id = pc.parent_id
      WHERE l.company_id = $1
        AND ($2 = '' OR l.order_no ILIKE '%' || $2 || '%' OR l.buyer_po_no ILIKE '%' || $2 || '%' OR b.name ILIKE '%' || $2 || '%'
             OR s.code ILIKE '%' || $2 || '%' OR s.name ILIKE '%' || $2 || '%' OR g.name ILIKE '%' || $2 || '%' OR k.name ILIKE '%' || $2 || '%')
     ) t
     WHERE ($3 = '' OR ($3 = 'soon' AND ex_factory_date <= CURRENT_DATE + 90)
                    OR ($3 = 'nocosting' AND COALESCE(costing_type, 'initial') = 'initial')
                    OR ($3 = 'bompending' AND COALESCE(bom_status, '') <> 'approved'))
     ORDER BY ${view === 'soon' ? 'ex_factory_date ASC' : 'created_at DESC, order_no DESC'}
     LIMIT $4`, [companyId, q, view, limit]);
  return rows.map(r => ({
    lineId: r.id, orderId: r.order_id, orderNo: r.order_no, buyerPo: r.buyer_po_no || '', qty: r.total_qty, exFactory: r.ex_factory,
    brandId: r.brand_id, brand: r.brand, styleCode: r.style_code, styleName: r.style_name, colour: r.colour, category: r.category || '',
    costing: r.costing_type || '', bom: r.bom_status || ''
  }));
}
