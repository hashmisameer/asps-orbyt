// Sample masters for the Order entry screen (brands, categories, styles, colours, size ranges).
// Real master screens come later. Safe to run more than once: existing rows are skipped.
import { pool, withTransaction } from './pool.js';
import { env } from '../config/env.js';

const BRANDS = [['Northwind Apparel', 'NWA'], ['Urban Thread', 'UTH'], ['Coastline Kids', 'CLK']];
const CATEGORIES = { Men: ['Shirts', 'Trousers'], Women: ['Tops'], Kids: ['Sets'] };
const STYLES = [
  ['ST-2207', "Men's oxford shirt, long sleeve", 'NWA'],
  ['ST-2211', "Men's poplin shirt, short sleeve", 'NWA'],
  ['ST-2215', "Men's chino trouser", 'UTH'],
  ['ST-3104', "Women's linen top", 'UTH'],
  ['ST-4020', "Kids' cotton pyjama set", 'CLK']
];
const COLOURS = ['Navy', 'White', 'Sky blue', 'Olive', 'Black'];
const SIZE_RANGES = [
  ['S – XXL', ['S', 'M', 'L', 'XL', 'XXL']],
  ['XS – XL', ['XS', 'S', 'M', 'L', 'XL']],
  ['2Y – 12Y', ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y']],
  ['28 – 40 waist', ['28', '30', '32', '34', '36', '38', '40']]
];

async function seed() {
  await withTransaction(async (db) => {
    const company = (await db.query('SELECT id FROM companies WHERE code = $1', [env.defaultCompanyCode || 'ASPS'])).rows[0];
    if (!company) throw new Error('Company not found. Run npm run db:seed first.');
    const cid = company.id;

    const brandIds = {};
    for (const [name, initials] of BRANDS) {
      await db.query('INSERT INTO brands (company_id, name, initials) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [cid, name, initials]);
      brandIds[initials] = (await db.query('SELECT id FROM brands WHERE company_id = $1 AND initials = $2', [cid, initials])).rows[0].id;
    }

    for (const [parent, children] of Object.entries(CATEGORIES)) {
      await db.query('INSERT INTO product_categories (company_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cid, parent]);
      const pid = (await db.query('SELECT id FROM product_categories WHERE company_id = $1 AND parent_id IS NULL AND lower(name) = lower($2)', [cid, parent])).rows[0].id;
      for (const child of children) {
        await db.query('INSERT INTO product_categories (company_id, name, parent_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [cid, child, pid]);
      }
    }

    for (const [code, name, brand] of STYLES) {
      await db.query('INSERT INTO styles (company_id, code, name, brand_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [cid, code, name, brandIds[brand]]);
    }

    for (const name of COLOURS) {
      await db.query('INSERT INTO colours (company_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cid, name]);
    }

    // Sample buyers and seasons for the Costing screen (tables exist from migration 005)
    for (const [code, name, country] of [['NXT', 'Next Retail Ltd', 'United Kingdom'], ['MNS', 'Marks & Spencer', 'United Kingdom'], ['ZLD', 'Zalando SE', 'Germany']]) {
      await db.query('INSERT INTO buyers (company_id, code, name, country) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [cid, code, name, country]);
    }
    for (const name of ['Spring Summer', 'Autumn Winter', 'Holiday']) {
      await db.query('INSERT INTO seasons (company_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cid, name]);
    }

    // Sample summary items and detail items for the Costing item picker (tables from migration 006)
    const GROUPS = [
      ['fabric', 'EXPORT PURCHASE FABRIC', 'MTR', [['AS/ALGARVE/NAVY', 'Main', 58], ['AS/ALGARVE/MID GREEN', 'Main', 58], ['AS/ALGARVE+TILIA/STONE GREY', 'Contrast', 56], ['CRAIG/FABRIC', 'Lining', 44]]],
      ['fabric', 'DOMESTIC PURCHASE FABRIC', 'MTR', [['POCKETING 30S WHITE', 'Pocketing', 44], ['COTTON POPLIN 40S', 'Main', 58]]],
      ['trims', 'BUTTONS', 'PCS', [['BUTTON 18L 4 HOLE', null, null], ['BUTTON 24L SHANK', null, null]]],
      ['trims', 'LABELS', 'PCS', [['MAIN LABEL WOVEN', null, null], ['CARE LABEL PRINTED', null, null]]],
      ['packing', 'POLY BAGS', 'PCS', [['POLY BAG 12X16', null, null]]],
      ['packing', 'CARTONS', 'PCS', [['CARTON 5 PLY 60X40X40', null, null]]]
    ];
    for (const [type, gname, uom, items] of GROUPS) {
      // Issue process from the item type: fabric -> cutting, trims -> stitching, packing -> finishing
      const processCode = { fabric: 'cutting', trims: 'stitching', packing: 'finishing' }[type];
      await db.query(
        `INSERT INTO item_groups (company_id, item_type, name, uom, process_id)
         VALUES ($1, $2, $3, $4, (SELECT id FROM issue_processes WHERE company_id = $1 AND code = $5))
         ON CONFLICT DO NOTHING`, [cid, type, gname, uom, processCode]);
      const gid = (await db.query('SELECT id FROM item_groups WHERE company_id = $1 AND item_type = $2 AND lower(name) = lower($3)', [cid, type, gname])).rows[0].id;
      for (const [name, nature, width] of items) {
        await db.query('INSERT INTO items (company_id, group_id, name, uom, item_nature, width) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
          [cid, gid, name, uom, nature, width]);
      }
    }

    for (const [name, sizes] of SIZE_RANGES) {
      await db.query('INSERT INTO size_ranges (company_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cid, name]);
      const rid = (await db.query('SELECT id FROM size_ranges WHERE company_id = $1 AND lower(name) = lower($2)', [cid, name])).rows[0].id;
      for (let i = 0; i < sizes.length; i++) {
        await db.query('INSERT INTO size_range_sizes (size_range_id, size_label, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [rid, sizes[i], i + 1]);
      }
    }
  });
  console.log('Sample order masters are ready (brands, categories, styles, colours, size ranges, buyers, seasons, items).');
  await pool.end();
}

seed().catch(async (err) => {
  console.error(err.message);
  process.exitCode = 1;
  await pool.end();
});
