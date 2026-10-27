// Brand master: brand code (goes into the order no., e.g. ORD/26-27/NWA/0001), brand name, buyer, currency, export flag.
// Opens on All brands (list); click a brand for its form. Keys: New (F2), All brands (F3), Save (Ctrl+S).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import RecordList from '../components/RecordList.jsx';
import Chatter from '../components/Chatter.jsx';
import { ControlPanel, StatusBar, Field, AllButton, ActionMenu } from '../components/RecordBar.jsx';

const blank = () => ({ code: '', name: '', buyerId: '', currencyId: '', isExport: false, isActive: true });

export default function BrandMaster({ active, session, onGo, onNotice, request }) {
  const allowed = session?.permissions?.['masters.brand'] || [];
  const has = (code) => Boolean(session?.permissions?.[code]);
  const [lookups, setLookups] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(blank());
  const [mode, setMode] = useState(() => (allowed.includes('create') ? 'form' : 'list')); // opens on a new brand; 'list' = All brands
  const [listState, setListState] = useState({ search: '', filter: '' });
  const [lastOpened, setLastOpened] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { api('/brands/lookups').then(setLookups).catch(e => setLoadError(e.message)); }, []);
  // Opened from another screen (e.g. the Brand field of an order)
  useEffect(() => { if (request?.brandId) openBrand(request.brandId); }, [request?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = saved ? allowed.includes('edit') : allowed.includes('create');
  const codeLocked = saved && saved.orders > 0;
  const set = (patch) => { setMessage(''); setDirty(true); setForm(f => ({ ...f, ...patch })); };

  function startNew() {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setSaved(null); setForm(blank()); setError(''); setMessage(''); setDirty(false);
    setMode('form');
  }
  function backToList() {
    if (dirty && !window.confirm('Discard the changes on this screen and go back to the list?')) return;
    setLastOpened(saved?.id || null);
    setSaved(null); setForm(blank()); setError(''); setMessage(''); setDirty(false);
    setMode('list');
  }
  function load(b) {
    setSaved(b);
    setForm({ code: b.code, name: b.name, buyerId: b.buyerId, currencyId: b.currencyId, isExport: b.isExport, isActive: b.isActive });
    setDirty(false);
  }
  async function openBrand(id) {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setError(''); setMessage('');
    try { load(await api(`/brands/${id}`)); setMode('form'); } catch (e) { setError(e.message); }
  }
  async function save() {
    if (!canSave || busy) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const b = saved ? await api(`/brands/${saved.id}`, { method: 'PUT', body: form }) : await api('/brands', { method: 'POST', body: form });
      load(b);
      setMessage(saved ? `Brand ${b.code} saved.` : `Brand ${b.code} created.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  // ---------- ⚙ Action menu ----------
  function duplicate() {
    if (dirty && !window.confirm('Discard the changes on this screen and make a copy?')) return;
    const from = saved;
    setSaved(null); setForm(f => ({ ...f, code: '', name: `${f.name} (COPY)`, isActive: true }));
    setDirty(true); setError('');
    setMessage(`Copy of ${from.code}. Give it its own brand code and name, then Save.`);
  }
  async function setArchived(off) {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setError(''); setMessage('');
    try {
      load(await api(`/brands/${saved.id}`, { method: 'PUT', body: { ...form, isActive: !off } }));
      setMessage(off ? `Brand ${saved.code} archived. It stays in old orders but can't be picked for new ones.` : `Brand ${saved.code} is active again.`);
    } catch (e) { setError(e.message); }
  }
  async function remove() {
    if (!window.confirm(`Delete brand ${saved.code} · ${saved.name}? This can't be undone.`)) return;
    setError(''); setMessage('');
    try {
      await api(`/brands/${saved.id}`, { method: 'DELETE' });
      const no = saved.code;
      setDirty(false); setSaved(null); setForm(blank()); setLastOpened(null); setMode('list');
      onNotice?.(`Brand ${no} deleted.`);
    } catch (e) { setError(e.message); }
  }
  // Picking the buyer fills currency and export from Party master (can still be changed)
  function pickBuyer(value) {
    const b = lookups.buyers.find(x => x.id === value);
    set({ buyerId: value, ...(b && !form.currencyId ? { currencyId: b.currencyId } : {}), ...(b && !saved ? { isExport: b.isExport } : {}) });
  }

  useEffect(() => {
    if (!active || mode !== 'form') return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); startNew(); }
      if (e.key === 'F3') { e.preventDefault(); backToList(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loadError) return <div className="screen"><div className="alert alert-error" role="alert">{loadError}</div></div>;
  if (!lookups) return <div className="screen"><p className="hint">Loading…</p></div>;

  if (mode === 'list') {
    return (
      <>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <RecordList title="Brands" active={active} state={listState} setState={setListState} highlightId={lastOpened}
          onNew={allowed.includes('create') ? startNew : null}
          onOpen={(id, ids) => { openBrand(id); }}
          placeholder="Search brand code, brand name or buyer…"
          emptyText="No brands yet. Click New to add the first one."
          fetchRows={({ search }) => api(`/brands?${new URLSearchParams(search ? { search } : {})}`)}
          columns={[
            { label: 'Brand code', cls: 'order-no', cell: r => r.code },
            { label: 'Brand name', cell: r => <>{r.name}{r.isExport && <span className="o-pill no" style={{ marginLeft: 6 }}>Export</span>}</> },
            { label: 'Buyer', cell: r => r.buyer || <span className="field-bad">Buyer not set</span> },
            { label: 'Currency', cell: r => r.currency || '—' },
            { label: 'Orders', num: true, cell: r => r.orders },
            { label: 'Status', cell: r => <span className={`o-pill ${r.isActive ? 'ok' : 'no'}`}>{r.isActive ? 'Active' : 'Inactive'}</span> }
          ]} />
      </>
    );
  }

  const title = saved ? `${saved.code} · ${saved.name}` : 'New brand';
  const buyer = lookups.buyers.find(b => b.id === form.buyerId);

  return (
    <div className="o-page">
      <ControlPanel crumbs={[{ label: 'Brands', onClick: backToList }, { label: title }]}>
        <AllButton label="All brands" onClick={backToList} />
        {saved && allowed.includes('create') && <button type="button" className="tb" onClick={startNew}>New <kbd className="tb-kbd">F2</kbd></button>}
        {saved && <ActionMenu items={[
          allowed.includes('create') && { label: 'Duplicate', onClick: duplicate },
          allowed.includes('edit') && { label: saved.isActive ? 'Archive' : 'Unarchive', onClick: () => setArchived(saved.isActive) },
          allowed.includes('edit') && has('masters.brand.delete') && { label: 'Delete', danger: true, onClick: remove,
            disabled: saved.orders > 0, title: saved.orders > 0 ? 'This brand has orders, so it can only be archived' : 'Delete this brand' }
        ]} />}
        {dirty && saved && <span className="chip chip-amber">unsaved changes</span>}
      </ControlPanel>

      <div className="o-form">
        <div className="o-main">
          <StatusBar>
            <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
          </StatusBar>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && (
            <div className="alert alert-success o-saved" role="status">
              <span>{message}</span>
              <button type="button" className="tb" onClick={backToList}>See it in All brands</button>
              {allowed.includes('create') && <button type="button" className="tb" onClick={startNew}>Add another brand</button>}
            </div>
          )}

          <section className="o-sheet">
            <div className="o-title"><span>Brand{saved && !form.isActive ? ' · inactive' : ''}</span><h1>{title}</h1></div>
            <div className="o-groups">
              <div>
                <Field label="Brand code" req title={codeLocked ? 'This code is already in order numbers, so it can\'t be changed' : '2 to 5 letters or numbers'}>
                  {codeLocked
                    ? <span>{form.code} <span className="hint">· locked, used in {saved.orders} order{saved.orders === 1 ? '' : 's'}</span></span>
                    : <input aria-label="Brand code" className="inp" value={form.code} maxLength={5} placeholder="e.g. NWA" onChange={e => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />}
                </Field>
                <Field label="Brand name" req>
                  <input aria-label="Brand name" className="inp" value={form.name} maxLength={120} onChange={e => set({ name: e.target.value })} />
                </Field>
                <Field label="Buyer" req title={lookups.buyers.length ? undefined : 'Add the buyer in Party master first'}>
                  <select aria-label="Buyer" className="inp" value={form.buyerId} onChange={e => pickBuyer(e.target.value)}>
                    <option value="">{lookups.buyers.length ? 'Select buyer' : 'Add the buyer in Party master first'}</option>
                    {lookups.buyers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                  </select>
                </Field>
              </div>
              <div>
                <Field label="Currency">
                  <select aria-label="Currency" className="inp" value={form.currencyId} onChange={e => set({ currencyId: e.target.value })}>
                    <option value="">Select currency</option>
                    {lookups.currencies.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
                  </select>
                </Field>
                <Field label="Options">
                  <div className="o-checks">
                    <label><input type="checkbox" checked={form.isExport} onChange={e => set({ isExport: e.target.checked })} /> Is export brand</label>
                    {saved && <label title="Inactive brands stay in old orders but can't be picked for new ones"><input type="checkbox" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })} /> Active</label>}
                  </div>
                </Field>
                <Field label="Last saved">{saved?.updatedBy ? `${saved.updatedBy} · ${new Date(saved.updatedAt).toLocaleString('en-IN')}` : 'Not saved yet'}</Field>
              </div>
            </div>
          </section>
          <Chatter entity="brands" entityId={saved?.id} refreshKey={saved} />
        </div>
      </div>
    </div>
  );
}
