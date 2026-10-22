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

    for (const [name, sizes] of SIZE_RANGES) {
      await db.query('INSERT INTO size_ranges (company_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cid, name]);
      const rid = (await db.query('SELECT id FROM size_ranges WHERE company_id = $1 AND lower(name) = lower($2)', [cid, name])).rows[0].id;
      for (let i = 0; i < sizes.length; i++) {
        await db.query('INSERT INTO size_range_sizes (size_range_id, size_label, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [rid, sizes[i], i + 1]);
      }
    }
  });
  console.log('Sample order masters are ready (brands, categories, styles, colours, size ranges).');
  await pool.end();
}

seed().catch(async (err) => {
  console.error(err.message);
  process.exitCode = 1;
  await pool.end();
});
