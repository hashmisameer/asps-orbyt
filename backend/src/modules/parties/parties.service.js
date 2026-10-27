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
// PAN: 5 letters, 4 digits, 1 letter (e.g. AAACA1234F); it is also characters 3-12 of the GST code
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const MAX_CONTACTS = 20;

const text = (v, max = 200) => {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};
const id = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const str = (v) => (v === null || v === undefined ? '' : String(v));

// ---------- Dropdown lists ----------
// Built-in states/cities plus the ones this client added
export async function getLookups(companyId) {
  const [currencies, countries, states, cities, terms] = await Promise.all([
    query('SELECT id, code, name FROM currencies WHERE company_id = $1 AND is_active ORDER BY code', [companyId]),
    query('SELECT id, code, name FROM countries ORDER BY name'),
    query('SELECT id, country_id, gst_code, name FROM states WHERE company_id IS NULL OR company_id = $1 ORDER BY name', [companyId]),
    query('SELECT id, country_id, state_id, name FROM cities WHERE company_id IS NULL OR company_id = $1 ORDER BY name', [companyId]),
    query('SELECT id, name, is_active FROM payment_terms WHERE company_id = $1 ORDER BY days NULLS LAST, name', [companyId])
  ]);
  return {
    paymentTerms: terms.map(r => ({ id: str(r.id), name: r.name, isActive: r.is_active })),
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
    `SELECT p.id, p.code, p.name, p.party_type, p.gst_code, p.is_export, p.is_active, cur.code AS currency,
            ci.name AS city, co.name AS country,
            (SELECT COUNT(*) FROM party_addresses a WHERE a.party_id = p.id)::int AS addresses
       FROM parties p
       JOIN currencies cur ON cur.id = p.currency_id
       LEFT JOIN party_addresses a ON a.party_id = p.id AND a.address_type = 'billing' AND a.is_default
       LEFT JOIN cities ci ON ci.id = a.city_id
       LEFT JOIN countries co ON co.id = a.country_id
      WHERE p.company_id = $1
        AND ($2 = '' OR p.name ILIKE '%' || $2 || '%' OR p.code ILIKE '%' || $2 || '%' OR p.gst_code ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR p.party_type = $3 OR ($3 <> 'both' AND p.party_type = 'both'))
      ORDER BY p.is_active DESC, p.name LIMIT 300`, [companyId, q, t]);
  return rows.map(r => ({
    id: r.id, code: r.code, name: r.name, type: r.party_type, gstCode: r.gst_code || '',
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
  const [addresses, contacts, brands] = await Promise.all([
    query('SELECT * FROM party_addresses WHERE party_id = $1 ORDER BY sort_order', [partyId]),
    query('SELECT * FROM party_contacts WHERE party_id = $1 ORDER BY sort_order', [partyId]),
    // Brands are made in Brand master with this party as buyer; shown here only to look at
    query(`SELECT b.id, b.initials, b.name, b.is_active, (SELECT COUNT(*) FROM orders o WHERE o.brand_id = b.id)::int AS orders
             FROM brands b WHERE b.company_id = $1 AND b.buyer_id = $2 ORDER BY b.name`, [companyId, partyId])
  ]);
  return {
    id: p.id, code: p.code, name: p.name, type: p.party_type, gstCode: p.gst_code || '',
    currencyId: str(p.currency_id), isExport: p.is_export, generalTypeMapping: p.general_type_mapping, isActive: p.is_active,
    pan: p.pan || '', paymentTermId: str(p.payment_term_id), creditLimit: p.credit_limit === null ? '' : String(Number(p.credit_limit)),
    applyGst: p.apply_gst, holdPayment: p.hold_payment, holdReason: p.hold_reason || '',
    contacts: contacts.map(c => ({ id: c.id, name: c.name, designation: c.designation || '', phone: c.phone || '', email: c.email || '' })),
    brands: brands.map(b => ({ id: b.id, code: b.initials, name: b.name, orders: b.orders, isActive: b.is_active })),
    updatedBy: p.updated_name || p.created_name || '', updatedAt: p.updated_at,
    addresses: addresses.map(a => ({
      id: a.id, type: a.address_type, name: a.name, address1: a.address1, address2: a.address2 || '', address3: a.address3 || '',
      countryId: str(a.country_id), stateId: str(a.state_id), cityId: str(a.city_id), pincode: a.pincode || '', phone: a.phone || '',
      email: a.email || '', contactPerson: a.contact_person || '', gstCode: a.gst_code || '', isDefault: a.is_default,
      distanceKm: a.distance_km === null ? '' : String(a.distance_km)
    }))
  };
}

// ---------- Checks ----------
async function read(companyId, body, partyId = null) {
  const problems = [];   // things to fill in
  const wrong = [];      // things that don't fit together
  const h = {
    code: text(body.code, 20)?.toUpperCase().replace(/\s/g, '') || null,
    name: text(body.name, 150),
    type: String(body.type || ''),
    gstCode: text(body.gstCode, 15)?.toUpperCase().replace(/\s/g, '') || null,
    currencyId: id(body.currencyId),
    isExport: body.isExport === true,
    generalTypeMapping: body.generalTypeMapping === true,
    isActive: body.isActive !== false,
    pan: text(body.pan, 10)?.toUpperCase().replace(/\s/g, '') || null,
    paymentTermId: id(body.paymentTermId),
    creditLimit: String(body.creditLimit ?? '').trim() === '' ? null : Number(String(body.creditLimit).replace(/,/g, '')),
    applyGst: body.applyGst === true,
    holdPayment: body.holdPayment === true,
    holdReason: text(body.holdReason, 300)
  };
  if (!h.code) problems.push('party code');
  else if (!/^[A-Z0-9/_-]{1,20}$/.test(h.code)) problems.push('party code (letters, numbers, - / _ only)');
  if (!h.name) problems.push('party name');
  if (!PARTY_TYPES.includes(h.type)) problems.push('party type');
  if (!h.currencyId || !(await query('SELECT 1 FROM currencies WHERE id = $1 AND company_id = $2', [h.currencyId, companyId])).length) problems.push('currency');
  if (h.gstCode && !GSTIN.test(h.gstCode)) problems.push('a valid GST code (15 characters, e.g. 09AAACA1234F1Z5)');
  // PAN: taken from the GST code when left empty; if both are given they must match
  if (!h.pan && h.gstCode && GSTIN.test(h.gstCode)) h.pan = h.gstCode.slice(2, 12);
  if (h.pan && !PAN.test(h.pan)) problems.push('a valid PAN number (10 characters, e.g. AAACA1234F)');
  else if (h.pan && h.gstCode && GSTIN.test(h.gstCode) && h.gstCode.slice(2, 12) !== h.pan) {
    wrong.push(`PAN ${h.pan} doesn't match the GST code (its PAN part is ${h.gstCode.slice(2, 12)}).`);
  }
  if (h.paymentTermId && !(await query('SELECT 1 FROM payment_terms WHERE id = $1 AND company_id = $2', [h.paymentTermId, companyId])).length) {
    problems.push('a valid payment term');
  }
  if (h.creditLimit !== null && !(Number.isFinite(h.creditLimit) && h.creditLimit >= 0)) problems.push('credit limit (a number, 0 or more)');
  if (h.holdPayment && !h.holdReason) problems.push('reason for payment hold');
  if (!h.holdPayment) h.holdReason = null;

  // Contact persons: empty rows are skipped; a row with anything typed needs a name
  const contactList = Array.isArray(body.contacts) ? body.contacts : [];
  if (contactList.length > MAX_CONTACTS) throw new AppError(400, `A party can have up to ${MAX_CONTACTS} contact persons.`);
  const contacts = [];
  contactList.forEach((c, i) => {
    const r = { name: text(c.name, 80), designation: text(c.designation, 60), phone: text(c.phone, 30), email: text(c.email, 120) };
    if (!r.name && !r.designation && !r.phone && !r.email) return;
    if (!r.name) { problems.push(`name of contact person ${i + 1}`); return; }
    if (r.email && !EMAIL.test(r.email)) { problems.push(`a valid email for contact person ${i + 1}`); return; }
    contacts.push(r);
  });

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
      // Party name on the address: the party's own name unless something else is typed
      type: String(a.type || ''), name: text(a.name, 150) || h.name, address1: text(a.address1), address2: text(a.address2), address3: text(a.address3),
      countryId: id(a.countryId), stateId: id(a.stateId), cityId: id(a.cityId), pincode: text(a.pincode, 12),
      phone: text(a.phone, 30), email: text(a.email, 120), contactPerson: text(a.contactPerson, 80),
      gstCode: text(a.gstCode, 15)?.toUpperCase().replace(/\s/g, '') || null, isDefault: a.isDefault === true,
      distanceKm: String(a.distanceKm ?? '').trim() === '' ? null : Number(a.distanceKm)
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
    if (r.distanceKm !== null && !(Number.isInteger(r.distanceKm) && r.distanceKm >= 0)) { problems.push(`distance in km (whole number) in ${row}`); return; }
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

  // No two parties with the same code or name
  const dupCodeRow = await query('SELECT name FROM parties WHERE company_id = $1 AND lower(code) = lower($2) AND ($3::bigint IS NULL OR id <> $3)',
    [companyId, h.code, partyId]);
  if (dupCodeRow.length) throw new AppError(400, `Party code ${h.code} is already used by ${dupCodeRow[0].name}.`);
  const dupName = await query('SELECT code FROM parties WHERE company_id = $1 AND lower(name) = lower($2) AND ($3::bigint IS NULL OR id <> $3)',
    [companyId, h.name, partyId]);
  if (dupName.length) throw new AppError(400, `A party named "${h.name}" already exists (${dupName[0].code}).`);
  return { h, addresses, contacts };
}

async function saveContacts(db, partyId, contacts) {
  await db.query('DELETE FROM party_contacts WHERE party_id = $1', [partyId]);
  let i = 0;
  for (const c of contacts) {
    i += 1;
    await db.query('INSERT INTO party_contacts (party_id, sort_order, name, designation, phone, email) VALUES ($1, $2, $3, $4, $5, $6)',
      [partyId, i, c.name, c.designation, c.phone, c.email]);
  }
}

async function saveAddresses(db, partyId, addresses) {
  await db.query('DELETE FROM party_addresses WHERE party_id = $1', [partyId]);
  let i = 0;
  for (const a of addresses) {
    i += 1;
    await db.query(
      `INSERT INTO party_addresses (party_id, sort_order, address_type, name, address1, address2, address3, country_id, state_id, city_id,
                                    pincode, phone, email, contact_person, gst_code, is_default, distance_km)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [partyId, i, a.type, a.name, a.address1, a.address2, a.address3, a.countryId, a.stateId, a.cityId,
        a.pincode, a.phone, a.email, a.contactPerson, a.gstCode, a.isDefault, a.distanceKm]);
  }
}

async function audit(db, user, action, partyId, details) {
  await db.query('INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.companyId, user.id, action, 'parties', String(partyId), JSON.stringify(details)]);
}

export async function createParty(user, body) {
  const { h, addresses, contacts } = await read(user.companyId, body);
  const partyId = await withTransaction(async (db) => {
    const code = h.code;
    const pid = (await db.query(
      `INSERT INTO parties (company_id, code, name, party_type, gst_code, currency_id, is_export, general_type_mapping, is_active, created_by, updated_by,
                            pan, payment_term_id, credit_limit, apply_gst, hold_payment, hold_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [user.companyId, code, h.name, h.type, h.gstCode, h.currencyId, h.isExport, h.generalTypeMapping, h.isActive, user.id,
        h.pan, h.paymentTermId, h.creditLimit, h.applyGst, h.holdPayment, h.holdReason])).rows[0].id;
    await saveAddresses(db, pid, addresses);
    await saveContacts(db, pid, contacts);
    await audit(db, user, 'CREATE', pid, { code, name: h.name, type: h.type, addresses: addresses.length });
    return pid;
  });
  return getParty(user.companyId, partyId);
}

export async function updateParty(user, partyId, body) {
  const { h, addresses, contacts } = await read(user.companyId, body, partyId);
  await withTransaction(async (db) => {
    const r = await db.query(
      `UPDATE parties SET code = $3, name = $4, party_type = $5, gst_code = $6, currency_id = $7, is_export = $8,
              general_type_mapping = $9, is_active = $10, updated_by = $11, updated_at = now(),
              pan = $12, payment_term_id = $13, credit_limit = $14, apply_gst = $15, hold_payment = $16, hold_reason = $17
        WHERE id = $1 AND company_id = $2`,
      [partyId, user.companyId, h.code, h.name, h.type, h.gstCode, h.currencyId, h.isExport, h.generalTypeMapping, h.isActive, user.id,
        h.pan, h.paymentTermId, h.creditLimit, h.applyGst, h.holdPayment, h.holdReason]);
    if (!r.rowCount) throw new AppError(404, 'Party not found.');
    // A party used as buyer in a costing must stay a buyer
    if (h.type === 'supplier') {
      const used = await db.query('SELECT costing_no FROM costings WHERE buyer_id = $1 AND NOT is_deleted LIMIT 1', [partyId]);
      if (used.rows.length) throw new AppError(400, `This party is the buyer in costing ${used.rows[0].costing_no}, so it can't be only a Supplier. Use "Both".`);
    }
    await saveAddresses(db, partyId, addresses);
    await saveContacts(db, partyId, contacts);
    await audit(db, user, 'UPDATE', partyId, { name: h.name, type: h.type, addresses: addresses.length, active: h.isActive });
  });
  return getParty(user.companyId, partyId);
}

// Delete a party nothing uses yet (no brand, no costing); otherwise it can only be archived (Active off)
export async function deleteParty(user, partyId) {
  return withTransaction(async (db) => {
    const p = (await db.query('SELECT code, name FROM parties WHERE id = $1 AND company_id = $2 FOR UPDATE', [partyId, user.companyId])).rows[0];
    if (!p) throw new AppError(404, 'Party not found.');
    const u = (await db.query(
      `SELECT (SELECT COUNT(*) FROM brands WHERE buyer_id = $1)::int AS brands,
              (SELECT COUNT(*) FROM costings WHERE buyer_id = $1)::int AS costings`, [partyId])).rows[0];
    const used = [u.brands && `${u.brands} brand${u.brands === 1 ? '' : 's'}`, u.costings && `${u.costings} costing${u.costings === 1 ? '' : 's'}`].filter(Boolean);
    if (used.length) throw new AppError(400, `Party ${p.code} is used in ${used.join(' and ')}, so it can't be deleted. Archive it instead (Active off).`);
    await db.query('DELETE FROM party_addresses WHERE party_id = $1', [partyId]);
    await db.query('DELETE FROM parties WHERE id = $1', [partyId]);
    await audit(db, user, 'DELETE', partyId, { code: p.code, name: p.name });
    return { ok: true, code: p.code };
  });
}
