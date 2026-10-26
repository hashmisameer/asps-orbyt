// Brand master: brand code (goes into the order no., e.g. ORD/26-27/NWA/0001), brand name, buyer, currency, export flag.
// Same look and keys as Party master: + New (F2), Search (F3), Save (Ctrl+S).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import SidePanel from '../components/SidePanel.jsx';

const blank = () => ({ code: '', name: '', buyerId: '', currencyId: '', isExport: false, isActive: true });

function BrandSearch({ onOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    let stop = false;
    const t = setTimeout(() => {
      api(`/brands?${new URLSearchParams(search ? { search } : {})}`)
        .then(r => { if (!stop) { setRows(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [search]);

  return (
    <div className="find-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="find-panel" role="dialog" aria-label="Search brands" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="find-head"><h2>Search brands</h2><button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="find-filters" style={{ gridTemplateColumns: '1fr auto' }}>
          <label className="f"><span>Brand code, brand name or buyer</span>
            <input ref={box} className="inp" placeholder="Type to search" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <button type="button" className="tb find-clear" disabled={!search} onClick={() => setSearch('')}>Clear</button>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="find-list">
          <table className="og find-table">
            <thead><tr><th>Brand code</th><th>Brand name</th><th>Buyer</th><th>Currency</th><th className="num">Orders</th><th>Status</th></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={6} className="empty-row">Loading…</td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={6} className="empty-row">{search ? 'No brand matches.' : 'No brands saved yet.'}</td></tr>}
              {rows && rows.map(r => (
                <tr key={r.id} className="find-row" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.id); }}>
                  <td className="order-no">{r.code}</td>
                  <td>{r.name}{r.isExport && <span className="chip chip-grey" style={{ marginLeft: 6 }}>Export</span>}</td>
                  <td>{r.buyer || <span className="field-bad">Buyer not set</span>}</td>
                  <td>{r.currency || '—'}</td>
                  <td className="num">{r.orders}</td>
                  <td>{r.isActive ? <span className="chip chip-teal">Active</span> : <span className="chip chip-grey">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ margin: 0 }}>Click a brand or press Enter to open it. Esc closes this panel.</p>
      </section>
    </div>
  );
}

export default function BrandMaster({ active, session, onGo }) {
  const allowed = session?.permissions?.['masters.brand'] || [];
  const [lookups, setLookups] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(blank());
  const [findOpen, setFindOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { api('/brands/lookups').then(setLookups).catch(e => setLoadError(e.message)); }, []);

  // Orders of this brand (right-hand panel)
  const [links, setLinks] = useState(null);
  useEffect(() => {
    if (!saved) { setLinks(null); return undefined; }
    let stop = false;
    api(`/links/brand/${saved.id}`).then(l => { if (!stop) setLinks(l); }).catch(() => { if (!stop) setLinks(null); });
    return () => { stop = true; };
  }, [saved]);

  const canSave = saved ? allowed.includes('edit') : allowed.includes('create');
  const codeLocked = saved && saved.orders > 0;
  const set = (patch) => { setMessage(''); setDirty(true); setForm(f => ({ ...f, ...patch })); };

  function startNew() {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setSaved(null); setForm(blank()); setError(''); setMessage(''); setDirty(false);
  }
  function load(b) {
    setSaved(b);
    setForm({ code: b.code, name: b.name, buyerId: b.buyerId, currencyId: b.currencyId, isExport: b.isExport, isActive: b.isActive });
    setDirty(false);
  }
  async function openBrand(id) {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setFindOpen(false); setError(''); setMessage('');
    try { load(await api(`/brands/${id}`)); } catch (e) { setError(e.message); }
  }
  async function save() {
    if (!canSave || busy) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const b = saved ? await api(`/brands/${saved.id}`, { method: 'PUT', body: form }) : await api('/brands', { method: 'POST', body: form });
      load(b);
      setMessage(saved ? `${b.code} saved.` : `Brand ${b.code} created.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  // Picking the buyer fills currency and export from Party master (can still be changed)
  function pickBuyer(value) {
    const b = lookups.buyers.find(x => x.id === value);
    set({ buyerId: value, ...(b && !form.currencyId ? { currencyId: b.currencyId } : {}), ...(b && !saved ? { isExport: b.isExport } : {}) });
  }

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

  if (loadError) return <div className="screen"><div className="alert alert-error" role="alert">{loadError}</div></div>;
  if (!lookups) return <div className="screen"><p className="hint">Loading…</p></div>;

  const status = saved ? (form.isActive ? ['ACTIVE', 'chip-teal'] : ['INACTIVE', 'chip-grey']) : ['NEW', 'chip-grey'];

  return (
    <div className="screen brand-screen">
      {findOpen && <BrandSearch onOpen={openBrand} onClose={() => setFindOpen(false)} />}
      <div className="screen-head">
        <h1 className="screen-title">Brand master{saved && <span className="doc-no">{saved.code}</span>}</h1>
        <span className={`chip ${status[1]}`}>{status[0]}</span>
        {dirty && <span className="chip chip-grey">UNSAVED CHANGES</span>}
        <span className="hint" style={{ marginLeft: 'auto' }}>
          {saved?.updatedBy ? `Last saved by ${saved.updatedBy} · ${new Date(saved.updatedAt).toLocaleString('en-IN')}` : <>Fields marked <span className="req">*</span> are required</>}
        </span>
      </div>
      <div className="toolbar">
        <button type="button" className="tb" onClick={startNew}>+ New <kbd className="tb-kbd">F2</kbd></button>
        <button type="button" className="tb" onClick={() => setFindOpen(true)}>Search <kbd className="tb-kbd">F3</kbd></button>
        <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <div className="page-cols">
      <div className="page-main">
      <section className="panel">
        <div className="panel-head">Brand details</div>
        <div className="form-grid party-head">
          <label className="f" title={codeLocked ? 'This code is already in order numbers, so it can\'t be changed' : '2 to 5 letters or numbers'}>
            <span>Brand code <span className="req">*</span></span>
            <input className="inp" value={form.code} maxLength={5} placeholder="e.g. NWA" disabled={codeLocked}
              onChange={e => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
            {codeLocked && <span className="field-hint">Locked – used in {saved.orders} order{saved.orders === 1 ? '' : 's'}</span>}
          </label>
          <label className="f"><span>Brand name <span className="req">*</span></span>
            <input className="inp" value={form.name} maxLength={120} onChange={e => set({ name: e.target.value })} />
          </label>
          <label className="f"><span>Buyer <span className="req">*</span></span>
            <select className="inp" value={form.buyerId} onChange={e => pickBuyer(e.target.value)}>
              <option value="">Select buyer</option>
              {lookups.buyers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
            <span className="field-hint">{lookups.buyers.length ? ' ' : 'Add the buyer in Party master first'}</span>
          </label>
          <label className="f"><span>Currency</span>
            <select className="inp" value={form.currencyId} onChange={e => set({ currencyId: e.target.value })}>
              <option value="">Select currency</option>
              {lookups.currencies.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
            </select>
          </label>
          <div className="f party-checks-wrap" style={{ gridColumn: 'span 4' }}>
            <div className="party-checks">
              <label><input type="checkbox" checked={form.isExport} onChange={e => set({ isExport: e.target.checked })} /> Is export brand</label>
              {saved && <label title="Inactive brands stay in old orders but can't be picked for new ones"><input type="checkbox" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })} /> Active</label>}
            </div>
          </div>
        </div>
      </section>
      </div>
      {saved && (
        <SidePanel entity="brands" entityId={saved.id} refreshKey={saved}
          linked={[
            ...(form.buyerId ? [{ label: 'Buyer', value: lookups.buyers.find(b => b.id === form.buyerId)?.name || '—', tone: 'ok', onClick: () => onGo('party', { partyId: Number(form.buyerId) }) }] : []),
            ...(links ? [
              { label: 'Orders', value: links.orders || '—' },
              { label: 'Order lines', value: links.orderLines || '—' },
              { label: 'Total qty', value: links.qty ? `${links.qty.toLocaleString('en-IN')} pcs` : '—' }
            ] : [])
          ]} />
      )}
      </div>
    </div>
  );
}
