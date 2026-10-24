// One screen for the small masters (Buyer, Season, Currency, Item group, Item): a form on top, the list below.
// Click a row to change it; untick "Active" to hide it from dropdowns (rows are never deleted).
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export const MASTER_SCREENS = {
  buyer: {
    title: 'Buyer', plural: 'buyers',
    fields: [
      { key: 'code', label: 'Short code', required: true, upper: true, max: 10, width: 120 },
      { key: 'name', label: 'Buyer name', required: true, max: 120 },
      { key: 'country', label: 'Country', max: 60 }
    ]
  },
  season: {
    title: 'Season', plural: 'seasons',
    fields: [{ key: 'name', label: 'Season', required: true, max: 60, hint: 'e.g. Spring Summer, Autumn Winter' }]
  },
  currency: {
    title: 'Currency', plural: 'currencies',
    fields: [
      { key: 'code', label: 'Code', required: true, upper: true, max: 3, width: 90, hint: 'e.g. USD' },
      { key: 'name', label: 'Currency name', required: true, max: 60 },
      { key: 'rateToInr', label: 'Rate in rupees', required: true, number: true, width: 140, hint: 'Suggested rate for new costings' }
    ]
  },
  item_group: {
    title: 'Summary item', plural: 'summary items', feature: 'masters.item_group',
    fields: [
      { key: 'itemType', label: 'Item type', required: true, width: 150, options: [['fabric', 'Fabric'], ['trims', 'Trims'], ['packing', 'Packing']] },
      { key: 'name', label: 'Summary item', required: true, upper: true, max: 120, width: 340, hint: 'e.g. EXPORT PURCHASE FABRIC' },
      { key: 'uom', label: 'Usual UOM', upper: true, max: 10, width: 110, hint: 'e.g. MTR' },
      { key: 'processId', label: 'Issue process', required: true, ref: true, width: 160, hint: 'Department this material is issued to' }
    ]
  },
  item: {
    title: 'Item', plural: 'items', feature: 'masters.item',
    fields: [
      { key: 'groupId', label: 'Summary item', required: true, ref: true, width: 320 },
      { key: 'code', label: 'Item code', upper: true, max: 40, width: 140 },
      { key: 'name', label: 'Item name', required: true, upper: true, max: 150, width: 300, hint: 'e.g. AS/ALGARVE/NAVY' },
      { key: 'uom', label: 'UOM', required: true, upper: true, max: 10, width: 90 },
      { key: 'itemNature', label: 'Item nature', width: 140, options: ['Main', 'Contrast', 'Lining', 'Interlining', 'Pocketing', 'Other'].map(x => [x, x]) },
      { key: 'hsn', label: 'HSN', max: 12, width: 110 },
      { key: 'width', label: 'Width', number: true, width: 90 },
      { key: 'gsm', label: 'GSM', number: true, width: 90 },
      { key: 'composition', label: 'Composition', max: 120, width: 220, hint: 'e.g. 100% cotton' },
      { key: 'processId', label: 'Issue process', ref: true, width: 200, empty: 'Same as summary item', hint: 'Leave as "Same as summary item" unless this item goes to a different department' }
    ]
  }
};

const emptyFor = (cfg) => ({ id: null, isActive: true, ...Object.fromEntries(cfg.fields.map(f => [f.key, ''])) });

export default function SimpleMaster({ kind, active, session }) {
  const cfg = MASTER_SCREENS[kind];
  const allowed = session?.permissions?.[cfg.feature || `masters.${kind}`] || [];
  const [rows, setRows] = useState(null);
  const [refs, setRefs] = useState({});
  const [form, setForm] = useState(emptyFor(cfg));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const load = () => api(`/masters/${kind}`).then(r => { setRows(r.rows); setRefs(r.refs || {}); }).catch(e => setError(e.message));
  // What a value looks like in the list: option names and dropdown labels instead of codes and ids
  const show = (f, v) => {
    if (v === '' || v === null || v === undefined) return f.empty ? 'Same as summary' : '—';
    if (f.options) return (f.options.find(o => o[0] === v) || [v, v])[1];
    if (f.ref) return (refs[f.key] || []).find(o => o.id === String(v))?.label || v;
    return String(v);
  };
  useEffect(() => { load(); }, [kind]);

  const canSave = form.id ? allowed.includes('edit') : allowed.includes('create');
  const set = (patch) => { setMessage(''); setForm(f => ({ ...f, ...patch })); };

  async function save() {
    if (!canSave) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const saved = form.id
        ? await api(`/masters/${kind}/${form.id}`, { method: 'PUT', body: form })
        : await api(`/masters/${kind}`, { method: 'POST', body: form });
      setMessage(`${cfg.title} "${saved.name || saved.code}" saved.`);
      setForm(emptyFor(cfg));
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); setForm(emptyFor(cfg)); setMessage(''); setError(''); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shown = (rows || []).filter(r => !filter || cfg.fields.some(f => show(f, r[f.key]).toLowerCase().includes(filter.toLowerCase())));

  return (
    <div className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{cfg.title}</h1>
        <span className={`chip ${form.id ? 'chip-amber' : 'chip-grey'}`}>{form.id ? 'EDITING' : 'NEW'}</span>
        <span className="hint" style={{ marginLeft: 'auto' }}>Fields marked <span className="req">*</span> are required</span>
      </div>
      <div className="toolbar">
        <button type="button" className="tb" onClick={() => { setForm(emptyFor(cfg)); setMessage(''); setError(''); }}>+ New (F2)</button>
        <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : 'Save (Ctrl+S)'}</button>
        <input className="inp" style={{ marginLeft: 'auto', width: 260 }} placeholder={`Search ${cfg.plural}`} value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <section className="panel">
        <div className="panel-head">{form.id ? `CHANGE ${cfg.title.toUpperCase()}` : `NEW ${cfg.title.toUpperCase()}`}</div>
        <div className="master-form">
          {cfg.fields.map(f => (
            <label key={f.key} className="f" style={{ width: f.width || 260 }} title={f.hint || undefined}>
              <span>{f.label} {f.required && <span className="req">*</span>}</span>
              {f.options || f.ref ? (
                <select className="inp" value={form[f.key]} onChange={e => set({ [f.key]: e.target.value })}>
                  <option value="">{f.empty || 'Select'}</option>
                  {f.options
                    ? f.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)
                    : (refs[f.key] || []).filter(o => o.isActive || o.id === String(form[f.key])).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              ) : (
                <input className="inp" maxLength={f.max} inputMode={f.number ? 'decimal' : undefined} placeholder={f.hint || ''}
                  value={form[f.key]} onChange={e => set({ [f.key]: f.upper ? e.target.value.toUpperCase() : e.target.value })} />
              )}
            </label>
          ))}
          {form.id && (
            <label className="check master-active"><input type="checkbox" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })} /> Active</label>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">ALL {cfg.plural.toUpperCase()}{rows ? ` · ${rows.length}` : ''}</div>
        <table className="og master-table">
          <thead><tr>{cfg.fields.map(f => <th key={f.key} className={f.number ? 'num' : ''}>{f.label}</th>)}<th style={{ width: 90 }}>Status</th></tr></thead>
          <tbody>
            {rows === null && !error && <tr><td colSpan={cfg.fields.length + 1} className="empty-row">Loading…</td></tr>}
            {rows && shown.length === 0 && <tr><td colSpan={cfg.fields.length + 1} className="empty-row">{rows.length ? 'Nothing matches the search.' : `No ${cfg.plural} yet. Fill the form above and save.`}</td></tr>}
            {shown.map(r => (
              <tr key={r.id} className={`find-row ${form.id === r.id ? 'sel' : ''}`} tabIndex={0}
                onClick={() => { setForm({ ...r, ...Object.fromEntries(cfg.fields.filter(f => f.number).map(f => [f.key, r[f.key] === '' ? '' : String(r[f.key])])) }); setMessage(''); setError(''); }}>
                {cfg.fields.map(f => <td key={f.key} className={f.number ? 'num' : ''}>{show(f, r[f.key])}</td>)}
                <td><span className={`chip ${r.isActive ? 'chip-teal' : 'chip-grey'}`}>{r.isActive ? 'Active' : 'Inactive'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
