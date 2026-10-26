// Party master: one buyer or supplier (or both) with any number of billing and shipping addresses.
// Country -> State -> City: each list shows only the places inside the one picked before it.
// A new city (or a state outside India) can be typed and added right in the grid.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import PartySearch, { TYPE_NAMES } from './PartySearch.jsx';
import SidePanel from '../components/SidePanel.jsx';

let nextKey = 1;
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const NEW = '__new';

const blankHeader = (inrId = '') => ({
  code: '', name: '', type: '', gstCode: '', currencyId: inrId, isExport: false, generalTypeMapping: false, isActive: true
});
const blankAddress = (prev, partyName, indiaId) => ({
  key: nextKey++, type: prev ? 'shipping' : 'billing', name: prev?.name || partyName || '', address1: '', address2: '', address3: '',
  countryId: prev?.countryId || indiaId || '', stateId: '', cityId: '', pincode: '', phone: '', email: '', contactPerson: '', gstCode: '', isDefault: false
});

export default function PartyMaster({ active, session, onNotice, request }) {
  const allowed = session?.permissions?.['masters.party'] || [];
  const has = (code) => Boolean(session?.permissions?.[code]);
  const [lookups, setLookups] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(null);           // party as last saved (null = new)
  const [header, setHeader] = useState(blankHeader());
  const [addresses, setAddresses] = useState([]);
  const [adding, setAdding] = useState(null);         // { key, kind: 'city' | 'state', text } while typing a new place
  const [findOpen, setFindOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  const inr = lookups?.currencies.find(c => c.code === 'INR');
  const india = lookups?.countries.find(c => c.code === 'IN');
  useEffect(() => {
    api('/parties/lookups').then(l => {
      setLookups(l);
      setHeader(blankHeader(l.currencies.find(c => c.code === 'INR')?.id || ''));
    }).catch(e => setLoadError(e.message));
  }, []);

  // What uses this party (right-hand panel)
  const [links, setLinks] = useState(null);
  useEffect(() => {
    if (!saved) { setLinks(null); return undefined; }
    let stop = false;
    api(`/links/party/${saved.id}`).then(l => { if (!stop) setLinks(l); }).catch(() => { if (!stop) setLinks(null); });
    return () => { stop = true; };
  }, [saved]);
  // Opened from another screen (e.g. the buyer of a brand)
  useEffect(() => {
    if (request?.partyId && lookups) openParty(request.partyId);
  }, [request?.n, lookups]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = saved ? allowed.includes('edit') : allowed.includes('create');
  const setH = (patch) => { setMessage(''); setDirty(true); setHeader(h => ({ ...h, ...patch })); };
  const setA = (key, patch) => { setMessage(''); setDirty(true); setAddresses(as => as.map(a => (a.key === key ? { ...a, ...patch } : a))); };

  function startNew() {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setSaved(null); setHeader(blankHeader(inr?.id || '')); setAddresses([]); setError(''); setMessage(''); setDirty(false);
  }
  function load(p) {
    setSaved(p);
    setHeader({ code: p.code, name: p.name, type: p.type, gstCode: p.gstCode, currencyId: p.currencyId,
      isExport: p.isExport, generalTypeMapping: p.generalTypeMapping, isActive: p.isActive });
    setAddresses(p.addresses.map(a => ({ ...a, key: nextKey++ })));
    setDirty(false);
  }
  async function openParty(id) {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setFindOpen(false); setError(''); setMessage('');
    try { load(await api(`/parties/${id}`)); } catch (e) { setError(e.message); }
  }

  async function save() {
    if (!canSave || busy) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const body = { ...header, addresses: addresses.map(({ key, ...a }) => a) };
      const p = saved ? await api(`/parties/${saved.id}`, { method: 'PUT', body }) : await api('/parties', { method: 'POST', body });
      load(p);
      setMessage(saved ? `${p.code} saved.` : `Party ${p.code} created.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // F2 new, F3 search, Ctrl+S save – only while this tab is the one on screen
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); startNew(); }
      if (e.key === 'F3') { e.preventDefault(); setFindOpen(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- header helpers ----------
  function toggleExport(on) {
    // An export party usually pays in a foreign currency: move off rupees once
    const usd = lookups.currencies.find(c => c.code === 'USD');
    setH({ isExport: on, ...(on && header.currencyId === inr?.id && usd ? { currencyId: usd.id } : {}) });
  }
  const headerGstBad = header.gstCode && !GST_RE.test(header.gstCode);

  // ---------- address helpers ----------
  const statesOf = (countryId) => lookups.states.filter(s => s.countryId === countryId);
  const citiesOf = (a) => lookups.cities.filter(c => c.countryId === a.countryId && (!a.stateId || !c.stateId || c.stateId === a.stateId));
  function addAddress() {
    setDirty(true);
    setAddresses(as => [...as, blankAddress(as[as.length - 1], header.name, india?.id)]);
  }
  function setDefault(a, on) {
    setDirty(true); setMessage('');
    // Only one default per address type: ticking one unticks the others of that type
    setAddresses(as => as.map(x => (x.key === a.key ? { ...x, isDefault: on } : on && x.type === a.type ? { ...x, isDefault: false } : x)));
  }
  function gstBlur(a) {
    const g = a.gstCode.trim().toUpperCase();
    if (g !== a.gstCode) setA(a.key, { gstCode: g });
    if (!a.stateId && GST_RE.test(g)) {
      const st = lookups.states.find(s => s.gstCode === g.slice(0, 2));
      if (st) setA(a.key, { gstCode: g, stateId: st.id, countryId: st.countryId });
    }
  }
  async function savePlace() {
    const { key, kind, text } = adding;
    const a = addresses.find(x => x.key === key);
    if (!text.trim()) { setAdding(null); return; }
    try {
      const place = await api(`/parties/places/${kind}`, { method: 'POST', body: { name: text, countryId: a.countryId, stateId: a.stateId } });
      setLookups(l => (kind === 'city'
        ? { ...l, cities: l.cities.some(c => c.id === place.id) ? l.cities : [...l.cities, place].sort((x, y) => x.name.localeCompare(y.name)) }
        : { ...l, states: l.states.some(s => s.id === place.id) ? l.states : [...l.states, place].sort((x, y) => x.name.localeCompare(y.name)) }));
      setA(key, kind === 'city' ? { cityId: place.id } : { stateId: place.id, cityId: '' });
      setAdding(null);
    } catch (e) {
      setError(e.message);
    }
  }

  // A State or City cell: a dropdown with "+ New …" at the end, which turns into a small text box
  function placeCell(a, kind) {
    if (adding && adding.key === a.key && adding.kind === kind) {
      return (
        <input className="ci" autoFocus placeholder={`New ${kind}, then Enter`} value={adding.text}
          onChange={e => setAdding({ ...adding, text: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePlace(); } if (e.key === 'Escape') setAdding(null); }}
          onBlur={() => (adding.text.trim() ? savePlace() : setAdding(null))} />
      );
    }
    const isIndia = a.countryId === india?.id;
    const list = kind === 'state' ? statesOf(a.countryId) : citiesOf(a);
    const canAdd = a.countryId && (kind === 'city' ? (!isIndia || a.stateId) : !isIndia);
    const value = kind === 'state' ? a.stateId : a.cityId;
    return (
      <select className="ci" aria-label={kind === 'state' ? 'State' : 'City'} value={value} disabled={!a.countryId}
        onChange={e => {
          if (e.target.value === NEW) { setAdding({ key: a.key, kind, text: '' }); return; }
          setA(a.key, kind === 'state' ? { stateId: e.target.value, cityId: '' } : { cityId: e.target.value });
        }}>
        <option value="">{kind === 'city' && isIndia && !a.stateId ? 'Pick state first' : `Select ${kind}`}</option>
        {list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        {canAdd && <option value={NEW}>+ New {kind}…</option>}
      </select>
    );
  }

  if (loadError) return <div className="screen"><div className="alert alert-error" role="alert">{loadError}</div></div>;
  if (!lookups) return <div className="screen"><p className="hint">Loading…</p></div>;

  const status = saved ? (header.isActive ? ['ACTIVE', 'chip-teal'] : ['INACTIVE', 'chip-grey']) : ['NEW', 'chip-grey'];
  const typeCount = (t) => addresses.filter(a => a.type === t).length;

  return (
    <div className="screen party-screen">
      {findOpen && <PartySearch onOpen={openParty} onClose={() => setFindOpen(false)} />}

      <div className="screen-head">
        <h1 className="screen-title">Party master{saved && <span className="doc-no">{saved.code}</span>}</h1>
        <span className={`chip ${status[1]}`}>{status[0]}</span>
        {dirty && <span className="chip chip-grey">UNSAVED CHANGES</span>}
        <span className="hint" style={{ marginLeft: 'auto' }}>
          {saved ? `Last saved by ${saved.updatedBy} · ${new Date(saved.updatedAt).toLocaleString('en-IN')}` : <>Fields marked <span className="req">*</span> are required</>}
        </span>
      </div>

      <div className="toolbar">
        <button type="button" className="tb" onClick={startNew}>+ New <kbd className="tb-kbd">F2</kbd></button>
        <button type="button" className="tb" onClick={() => setFindOpen(true)}>Search <kbd className="tb-kbd">F3</kbd></button>
        <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
        {has('masters.party.import_excel') && (
          <>
            <span className="tb-sep" aria-hidden="true" />
            <button type="button" className="tb tb-soon" title="Coming in a later phase" onClick={() => onNotice?.('Excel import of parties is coming in a later phase.')}>Import from Excel</button>
          </>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <div className="page-cols">
      <div className="page-main">
      <section className="panel">
        <div className="panel-head">Party details</div>
        <div className="form-grid party-head">
          <label className="f"><span>Party code <span className="req">*</span></span>
            <input className="inp" value={header.code} maxLength={20} placeholder="e.g. HM" onChange={e => setH({ code: e.target.value.toUpperCase().replace(/\s/g, '') })} />
          </label>
          <label className="f"><span>Party name <span className="req">*</span></span>
            <input className="inp" value={header.name} maxLength={150} onChange={e => setH({ name: e.target.value })} />
          </label>
          <label className="f"><span>Party type <span className="req">*</span></span>
            <select className="inp" value={header.type} onChange={e => setH({ type: e.target.value })}>
              <option value="">Select party type</option>
              {Object.entries(TYPE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="f"><span>Currency <span className="req">*</span></span>
            <select className="inp" value={header.currencyId} onChange={e => setH({ currencyId: e.target.value })}>
              <option value="">Select currency</option>
              {lookups.currencies.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
            </select>
          </label>
          <label className="f"><span>GST code</span>
            <input className={`inp ${headerGstBad ? 'inp-bad' : ''}`} value={header.gstCode} maxLength={15} placeholder="15 characters, e.g. 09AAACA1234F1Z5"
              onChange={e => setH({ gstCode: e.target.value.toUpperCase().replace(/\s/g, '') })} />
            <span className={headerGstBad ? 'field-bad' : 'field-hint'}>{headerGstBad ? 'GST code has 15 characters, e.g. 09AAACA1234F1Z5' : header.isExport ? 'Not needed for an export party' : ' '}</span>
          </label>
          <div className="f party-checks-wrap"><span>&nbsp;</span>
            <div className="party-checks">
              <label><input type="checkbox" checked={header.isExport} onChange={e => toggleExport(e.target.checked)} /> Is export party</label>
              <label><input type="checkbox" checked={header.generalTypeMapping} onChange={e => setH({ generalTypeMapping: e.target.checked })} /> General type mapping</label>
              {saved && <label title="Inactive parties stay in old records but can't be picked in new ones"><input type="checkbox" checked={header.isActive} onChange={e => setH({ isActive: e.target.checked })} /> Active</label>}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head panel-head-row">
          <span>Addresses · {addresses.length}{addresses.length > 0 && ` (${typeCount('billing')} billing, ${typeCount('shipping')} shipping)`}</span>
          <span className="hint">Tick "Default" for the billing and the shipping address other screens should pick first</span>
        </div>
        <div className="grid-scroll party-grid">
            <table className="og">
              <thead>
                <tr>
                  <th className="stick"><button type="button" className="add-btn" onClick={addAddress} aria-label="Add address" title="Add address">+</button></th><th>Address type <span className="req">*</span></th><th>Party name</th>
                  <th>Address 1 <span className="req">*</span></th><th>Address 2</th><th>Address 3</th>
                  <th>Country <span className="req">*</span></th><th>State</th><th>City</th><th>Pincode</th><th>Phone</th><th>Email</th>
                  <th>Contact person</th><th>GST code</th><th>Default</th>
                </tr>
              </thead>
              <tbody>
                {addresses.length === 0 && (
                  <tr><td className="stick" /><td colSpan={14} className="empty-row party-empty">No address yet. Click + to add one.</td></tr>
                )}
                {addresses.map((a, i) => {
                  const gstBad = a.gstCode && !GST_RE.test(a.gstCode);
                  return (
                    <tr key={a.key}>
                      <td className="stick">
                        <span className="party-no">
                          <button type="button" className="row-del" aria-label={`Delete address ${i + 1}`} title="Delete address"
                            onClick={() => { setDirty(true); setAddresses(as => as.filter(x => x.key !== a.key)); }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                          </button>{i + 1}
                        </span>
                      </td>
                      <td><select className="ci" aria-label="Address type" value={a.type} onChange={e => setA(a.key, { type: e.target.value, isDefault: false })}>
                        <option value="billing">Billing</option><option value="shipping">Shipping</option></select></td>
                      <td><input className="ci w-name" aria-label="Party name on address" value={a.name} placeholder={header.name || 'Same as party name'} onChange={e => setA(a.key, { name: e.target.value })} /></td>
                      <td><input className="ci w-adr" aria-label="Address 1" value={a.address1} onChange={e => setA(a.key, { address1: e.target.value })} /></td>
                      <td><input className="ci w-adr" aria-label="Address 2" value={a.address2} onChange={e => setA(a.key, { address2: e.target.value })} /></td>
                      <td><input className="ci w-adr" aria-label="Address 3" value={a.address3} onChange={e => setA(a.key, { address3: e.target.value })} /></td>
                      <td><select className="ci w-place" aria-label="Country" value={a.countryId} onChange={e => setA(a.key, { countryId: e.target.value, stateId: '', cityId: '' })}>
                        <option value="">Select country</option>{lookups.countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                      <td className="w-place">{placeCell(a, 'state')}</td>
                      <td className="w-place">{placeCell(a, 'city')}</td>
                      <td><input className="ci w-pin" aria-label="Pincode" value={a.pincode} maxLength={12} onChange={e => setA(a.key, { pincode: e.target.value })} /></td>
                      <td><input className="ci w-phone" aria-label="Phone" value={a.phone} onChange={e => setA(a.key, { phone: e.target.value })} /></td>
                      <td><input className="ci w-mail" aria-label="Email" type="email" value={a.email} onChange={e => setA(a.key, { email: e.target.value })} /></td>
                      <td><input className="ci w-person" aria-label="Contact person" value={a.contactPerson} onChange={e => setA(a.key, { contactPerson: e.target.value })} /></td>
                      <td><input className={`ci w-gst ${gstBad ? 'inp-bad' : ''}`} aria-label="GST code" value={a.gstCode} maxLength={15} title={gstBad ? 'GST code has 15 characters' : 'State is filled from the first 2 digits'}
                        onChange={e => setA(a.key, { gstCode: e.target.value.toUpperCase().replace(/\s/g, '') })} onBlur={() => gstBlur(a)} /></td>
                      <td className="party-def">
                        <label><input type="checkbox" checked={a.isDefault} aria-label={`Default ${a.type} address`} onChange={e => setDefault(a, e.target.checked)} />
                          {a.isDefault && <span className="chip chip-teal">{a.type === 'billing' ? 'Billing' : 'Shipping'}</span>}</label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        <p className="hint party-foot">If no address of a type is ticked as default, the first one becomes the default on save.</p>
      </section>
      </div>
      {saved && (
        <SidePanel entity="parties" entityId={saved.id} refreshKey={saved}
          linked={links ? [
            { label: 'Brands', value: links.brands ? `${links.brands} brand${links.brands === 1 ? '' : 's'}` : '—' },
            { label: 'Costings (as buyer)', value: links.costings || '—' },
            { label: 'Order lines', value: links.orderLines || '—' }
          ] : []} />
      )}
      </div>
    </div>
  );
}
