// Party master: buyers and suppliers (or both) with their billing and shipping addresses.
// The server checks everything again (GST format, state/city belong together, one default per address type),
// so wrong data can't be saved from the browser.
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../middleware/errors.js';

export const PARTY_TYPES = ['buyer', 'supplier', 'both'];
const ADDRESS_TYPES = ['billing', 'shipping'];
const MAX_ADDRESSES = 50;
// GSTIN: 2-digit state code, 10-character PAN, entity number, Z, check character (e.g. 09AAACA1234F1Z5)
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const text = (v, max = 200) => {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};
const id = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const str = (v) => (v === null || v === undefined ? '' : String(v));

// ---------- Dropdown lists ----------
// Built-in states/cities plus the ones this client added
export async function getLookups(companyId) {
  const [currencies, countries, states, cities] = await Promise.all([
    query('SELECT id, code, name FROM currencies WHERE company_id = $1 AND is_active ORDER BY code', [companyId]),
    query('SELECT id, code, name FROM countries ORDER BY name'),
    query('SELECT id, country_id, gst_code, name FROM states WHERE company_id IS NULL OR company_id = $1 ORDER BY name', [companyId]),
    query('SELECT id, country_id, state_id, name FROM cities WHERE company_id IS NULL OR company_id = $1 ORDER BY name', [companyId])
  ]);
  return {
    currencies: currencies.map(r => ({ id: str(r.id), code: r.code, name: r.name })),
    countries: countries.map(r => ({ id: str(r.id), code: r.code, name: r.name })),
    states: states.map(r => ({ id: str(r.id), countryId: str(r.country_id), gstCode: r.gst_code || '', name: r.name })),
    cities: cities.map(r => ({ id: str(r.id), countryId: str(r.country_id), stateId: str(r.state_id), name: r.name }))
  };
}

// Add a city (any country) or a state (not India – Indian states are built in) typed on the screen
export async function addPlace(user, kind, body) {
  const name = text(body.name, 80);
  const countryId = id(body.countryId);
  if (!name) throw new AppError(400, `Type the ${kind} name.`);
  const country = countryId && (await query('SELECT id, code FROM countries WHERE id = $1', [countryId]))[0];
  if (!country) throw new AppError(400, 'Pick the country first.');
  const clean = name.replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (kind === 'state') {
    if (country.code === 'IN') throw new AppError(400, 'All Indian states are already in the list.');
    const same = (await query(
      'SELECT id, country_id, gst_code, name FROM states WHERE country_id = $1 AND (company_id IS NULL OR company_id = $2) AND lower(name) = lower($3)',
      [countryId, user.companyId, clean]))[0];
    const r = same || (await query('INSERT INTO states (country_id, company_id, name) VALUES ($1, $2, $3) RETURNING id, country_id, gst_code, name',
      [countryId, user.companyId, clean]))[0];
    return { id: str(r.id), countryId: str(r.country_id), gstCode: r.gst_code || '', name: r.name };
  }

  const stateId = id(body.stateId);
  if (stateId && !(await query('SELECT 1 FROM states WHERE id = $1 AND country_id = $2 AND (company_id IS NULL OR company_id = $3)',
    [stateId, countryId, user.companyId])).length) throw new AppError(400, 'Pick a state of this country.');
  if (!stateId && country.code === 'IN') throw new AppError(400, 'Pick the state first.');
  const same = (await query(
    `SELECT id, country_id, state_id, name FROM cities
      WHERE country_id = $1 AND COALESCE(state_id, 0) = COALESCE($2::bigint, 0) AND (company_id IS NULL OR company_id = $3) AND lower(name) = lower($4)`,
    [countryId, stateId, user.companyId, clean]))[0];
  const r = same || (await query('INSERT INTO cities (country_id, state_id, company_id, name) VALUES ($1, $2, $3, $4) RETURNING id, country_id, state_id, name',
    [countryId, stateId, user.companyId, clean]))[0];
  return { id: str(r.id), countryId: str(r.country_id), stateId: str(r.state_id), name: r.name };
}

// ---------- List (Search F3) ----------
export async function listParties(companyId, { search = '', type = '' } = {}) {
  const q = String(search).trim();
  const t = PARTY_TYPES.includes(type) ? type : null;
  const rows = await query(
    `SELECT p.id, p.code, p.name, p.short_code, p.party_type, p.gst_code, p.is_export, p.is_active, cur.code AS currency,
            ci.name AS city, co.name AS country,
            (SELECT COUNT(*) FROM party_addresses a WHERE a.party_id = p.id)::int AS addresses
       FROM parties p
       JOIN currencies cur ON cur.id = p.currency_id
       LEFT JOIN party_addresses a ON a.party_id = p.id AND a.address_type = 'billing' AND a.is_default
       LEFT JOIN cities ci ON ci.id = a.city_id
       LEFT JOIN countries co ON co.id = a.country_id
      WHERE p.company_id = $1
        AND ($2 = '' OR p.name ILIKE '%' || $2 || '%' OR p.code ILIKE '%' || $2 || '%' OR p.short_code ILIKE '%' || $2 || '%'
             OR p.gst_code ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR p.party_type = $3 OR ($3 <> 'both' AND p.party_type = 'both'))
      ORDER BY p.is_active DESC, p.name LIMIT 300`, [companyId, q, t]);
  return rows.map(r => ({
    id: r.id, code: r.code, name: r.name, shortCode: r.short_code || '', type: r.party_type, gstCode: r.gst_code || '',
    isExport: r.is_export, isActive: r.is_active, currency: r.currency, city: r.city || '', country: r.country || '', addresses: r.addresses
  }));
}

// ---------- One party ----------
export async function getParty(companyId, partyId) {
  const p = (await query(
    `SELECT p.*, cu.full_name AS created_name, uu.full_name AS updated_name
       FROM parties p LEFT JOIN users cu ON cu.id = p.created_by LEFT JOIN users uu ON uu.id = p.updated_by
      WHERE p.id = $1 AND p.company_id = $2`, [partyId, companyId]))[0];
  if (!p) throw new AppError(404, 'Party not found.');
  const addresses = await query('SELECT * FROM party_addresses WHERE party_id = $1 ORDER BY sort_order', [partyId]);
  return {
    id: p.id, code: p.code, name: p.name, shortCode: p.short_code || '', type: p.party_type, gstCode: p.gst_code || '',
    currencyId: str(p.currency_id), isExport: p.is_export, generalTypeMapping: p.general_type_mapping, isActive: p.is_active,
    updatedBy: p.updated_name || p.created_name || '', updatedAt: p.updated_at,
    addresses: addresses.map(a => ({
      id: a.id, type: a.address_type, name: a.name, address1: a.address1, address2: a.address2 || '', address3: a.address3 || '',
      countryId: str(a.country_id), stateId: str(a.state_id), cityId: str(a.city_id), pincode: a.pincode || '', phone: a.phone || '',
      email: a.email || '', contactPerson: a.contact_person || '', gstCode: a.gst_code || '', isDefault: a.is_default
    }))
  };
}

// ---------- Checks ----------
async function read(companyId, body, partyId = null) {
  const problems = [];   // things to fill in
  const wrong = [];      // things that don't fit together
  const h = {
    name: text(body.name, 150),
    shortCode: text(body.shortCode, 10)?.toUpperCase() || null,
    type: String(body.type || ''),
    gstCode: text(body.gstCode, 15)?.toUpperCase().replace(/\s/g, '') || null,
    currencyId: id(body.currencyId),
    isExport: body.isExport === true,
    generalTypeMapping: body.generalTypeMapping === true,
    isActive: body.isActive !== false
  };
  if (!h.name) problems.push('party name');
  if (!PARTY_TYPES.includes(h.type)) problems.push('party type');
  if (!h.currencyId || !(await query('SELECT 1 FROM currencies WHERE id = $1 AND company_id = $2', [h.currencyId, companyId])).length) problems.push('currency');
  if (h.shortCode && !/^[A-Z0-9]{1,10}$/.test(h.shortCode)) problems.push('short code (letters and numbers only)');
  if (h.gstCode && !GSTIN.test(h.gstCode)) problems.push('a valid GST code (15 characters, e.g. 09AAACA1234F1Z5)');

  const [countries, states, cities] = await Promise.all([
    query('SELECT id, code FROM countries'),
    query('SELECT id, country_id, gst_code, name FROM states WHERE company_id IS NULL OR company_id = $1', [companyId]),
    query('SELECT id, country_id, state_id FROM cities WHERE company_id IS NULL OR company_id = $1', [companyId])
  ]);
  const countryById = new Map(countries.map(c => [Number(c.id), c]));
  const stateById = new Map(states.map(s => [Number(s.id), s]));
  const stateByGst = new Map(states.filter(s => s.gst_code).map(s => [s.gst_code, s]));
  const cityById = new Map(cities.map(c => [Number(c.id), c]));

  const list = Array.isArray(body.addresses) ? body.addresses : [];
  if (list.length > MAX_ADDRESSES) throw new AppError(400, `A party can have up to ${MAX_ADDRESSES} addresses.`);
  const addresses = [];
  list.forEach((a, i) => {
    const row = `address ${i + 1}`;
    const r = {
      type: String(a.type || ''), name: text(a.name, 150), address1: text(a.address1), address2: text(a.address2), address3: text(a.address3),
      countryId: id(a.countryId), stateId: id(a.stateId), cityId: id(a.cityId), pincode: text(a.pincode, 12),
      phone: text(a.phone, 30), email: text(a.email, 120), contactPerson: text(a.contactPerson, 80),
      gstCode: text(a.gstCode, 15)?.toUpperCase().replace(/\s/g, '') || null, isDefault: a.isDefault === true
    };
    const miss = [];
    if (!ADDRESS_TYPES.includes(r.type)) miss.push('address type');
    if (!r.name) miss.push('party name');
    if (!r.address1) miss.push('address 1');
    const country = r.countryId && countryById.get(r.countryId);
    if (!country) miss.push('country');
    if (miss.length) { problems.push(`${miss.join(', ')} in ${row}`); return; }
    if (r.gstCode) {
      if (!GSTIN.test(r.gstCode)) { problems.push(`a valid GST code in ${row}`); return; }
      // GST code tells the state: fill it in, or check it matches
      const gstState = stateByGst.get(r.gstCode.slice(0, 2));
      if (!r.stateId && gstState) r.stateId = Number(gstState.id);
      else if (gstState && r.stateId !== Number(gstState.id)) {
        wrong.push(`In ${row}, GST code ${r.gstCode} belongs to ${gstState.name}, not the state picked.`); return;
      }
    }
    const state = r.stateId && stateById.get(r.stateId);
    if (r.stateId && (!state || Number(state.country_id) !== r.countryId)) { problems.push(`a state of the picked country in ${row}`); return; }
    const city = r.cityId && cityById.get(r.cityId);
    if (r.cityId && (!city || Number(city.country_id) !== r.countryId || (r.stateId && city.state_id && Number(city.state_id) !== r.stateId))) {
      problems.push(`a city of the picked state in ${row}`); return;
    }
    if (country.code === 'IN' && r.pincode && !/^\d{6}$/.test(r.pincode)) { problems.push(`a 6-digit pincode in ${row}`); return; }
    if (r.email && !EMAIL.test(r.email)) { problems.push(`a valid email in ${row}`); return; }
    addresses.push(r);
  });
  if (problems.length || wrong.length) {
    throw new AppError(400, [problems.length ? `Fill in ${problems.join('; ')}.` : '', ...wrong].filter(Boolean).join(' '));
  }

  // One default per address type; if none is ticked, the first address of that type becomes the default
  for (const t of ADDRESS_TYPES) {
    const ofType = addresses.filter(a => a.type === t);
    const defaults = ofType.filter(a => a.isDefault);
    if (defaults.length > 1) throw new AppError(400, `Only one ${t} address can be the default. Untick the others.`);
    if (ofType.length && !defaults.length) ofType[0].isDefault = true;
  }

  // No two parties with the same name or short code
  const dupName = await query('SELECT code FROM parties WHERE company_id = $1 AND lower(name) = lower($2) AND ($3::bigint IS NULL OR id <> $3)',
    [companyId, h.name, partyId]);
  if (dupName.length) throw new AppError(400, `A party named "${h.name}" already exists (${dupName[0].code}).`);
  if (h.shortCode) {
    const dupCode = await query('SELECT name FROM parties WHERE company_id = $1 AND lower(short_code) = lower($2) AND ($3::bigint IS NULL OR id <> $3)',
      [companyId, h.shortCode, partyId]);
    if (dupCode.length) throw new AppError(400, `Short code ${h.shortCode} is already used by ${dupCode[0].name}.`);
  }
  return { h, addresses };
}

async function nextCode(db, companyId) {
  const r = (await db.query(
    `INSERT INTO document_series (company_id, doc_type, fy_short, prefix_key, last_number) VALUES ($1, 'PTY', '-', '', 1)
     ON CONFLICT (company_id, doc_type, fy_short, prefix_key) DO UPDATE SET last_number = document_series.last_number + 1
     RETURNING last_number`, [companyId])).rows[0];
  return `PTY-${String(r.last_number).padStart(4, '0')}`;
}

async function saveAddresses(db, partyId, addresses) {
  await db.query('DELETE FROM party_addresses WHERE party_id = $1', [partyId]);
  let i = 0;
  for (const a of addresses) {
    i += 1;
    await db.query(
      `INSERT INTO party_addresses (party_id, sort_order, address_type, name, address1, address2, address3, country_id, state_id, city_id,
                                    pincode, phone, email, contact_person, gst_code, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [partyId, i, a.type, a.name, a.address1, a.address2, a.address3, a.countryId, a.stateId, a.cityId,
        a.pincode, a.phone, a.email, a.contactPerson, a.gstCode, a.isDefault]);
  }
}

async function audit(db, user, action, partyId, details) {
  await db.query('INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, 'parties', String(partyId), JSON.stringify(details)]);
}

export async function createParty(user, body) {
  const { h, addresses } = await read(user.companyId, body);
  const partyId = await withTransaction(async (db) => {
    const code = await nextCode(db, user.companyId);
    const pid = (await db.query(
      `INSERT INTO parties (company_id, code, name, short_code, party_type, gst_code, currency_id, is_export, general_type_mapping, is_active, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id`,
      [user.companyId, code, h.name, h.shortCode, h.type, h.gstCode, h.currencyId, h.isExport, h.generalTypeMapping, h.isActive, user.id])).rows[0].id;
    await saveAddresses(db, pid, addresses);
    await audit(db, user, 'CREATE', pid, { code, name: h.name, type: h.type, addresses: addresses.length });
    return pid;
  });
  return getParty(user.companyId, partyId);
}

export async function updateParty(user, partyId, body) {
  const { h, addresses } = await read(user.companyId, body, partyId);
  await withTransaction(async (db) => {
    const r = await db.query(
      `UPDATE parties SET name = $3, short_code = $4, party_type = $5, gst_code = $6, currency_id = $7, is_export = $8,
              general_type_mapping = $9, is_active = $10, updated_by = $11, updated_at = now()
        WHERE id = $1 AND company_id = $2`,
      [partyId, user.companyId, h.name, h.shortCode, h.type, h.gstCode, h.currencyId, h.isExport, h.generalTypeMapping, h.isActive, user.id]);
    if (!r.rowCount) throw new AppError(404, 'Party not found.');
    // A party used as buyer in a costing must stay a buyer
    if (h.type === 'supplier') {
      const used = await db.query('SELECT costing_no FROM costings WHERE buyer_id = $1 AND NOT is_deleted LIMIT 1', [partyId]);
      if (used.rows.length) throw new AppError(400, `This party is the buyer in costing ${used.rows[0].costing_no}, so it can't be only a Supplier. Use "Both".`);
    }
    await saveAddresses(db, partyId, addresses);
    await audit(db, user, 'UPDATE', partyId, { name: h.name, type: h.type, addresses: addresses.length, active: h.isActive });
  });
  return getParty(user.companyId, partyId);
}
