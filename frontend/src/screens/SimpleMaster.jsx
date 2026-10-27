// One screen for the item masters (Item group, Item): opens on a new record; the list opens with All …,
// click one for its form. Untick "Active" to hide it from dropdowns (rows are never deleted).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import RecordList from '../components/RecordList.jsx';
import { ControlPanel, StatusBar, Field, AllButton } from '../components/RecordBar.jsx';

export const MASTER_SCREENS = {
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
const plural = (cfg) => cfg.plural[0].toUpperCase() + cfg.plural.slice(1);

export default function SimpleMaster({ kind, active, session }) {
  const cfg = MASTER_SCREENS[kind];
  const allowed = session?.permissions?.[cfg.feature || `masters.${kind}`] || [];
  const [refs, setRefs] = useState({});
  const [form, setForm] = useState(emptyFor(cfg));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(() => (allowed.includes('create') ? 'form' : 'list')); // opens on a new record; 'list' = all records
  const [listState, setListState] = useState({ search: '', filter: '' });
  const [lastOpened, setLastOpened] = useState(null);
  const [dirty, setDirty] = useState(false);

  // What a value looks like in the list: option names and dropdown labels instead of codes and ids
  const show = (f, v) => {
    if (v === '' || v === null || v === undefined) return f.empty ? 'Same as summary' : '—';
    if (f.options) return (f.options.find(o => o[0] === v) || [v, v])[1];
    if (f.ref) return (refs[f.key] || []).find(o => o.id === String(v))?.label || v;
    return String(v);
  };
  // Dropdown lists need refs on the form too (e.g. New straight from the menu)
  useEffect(() => { api(`/masters/${kind}`).then(r => setRefs(r.refs || {})).catch(() => {}); }, [kind]);

  async function fetchRows({ search, filter }) {
    const r = await api(`/masters/${kind}`);
    const rf = r.refs || {};
    setRefs(rf);
    const label = (f, v) => (f.ref ? (rf[f.key] || []).find(o => o.id === String(v))?.label || '' : f.options ? (f.options.find(o => o[0] === v) || [v, v])[1] : String(v ?? ''));
    const q = search.trim().toLowerCase();
    const rows = r.rows.filter(x => (!filter || (filter === 'active') === x.isActive) && (!q || cfg.fields.some(f => label(f, x[f.key]).toLowerCase().includes(q))));
    return rows;
  }

  const canSave = form.id ? allowed.includes('edit') : allowed.includes('create');
  const set = (patch) => { setMessage(''); setDirty(true); setForm(f => ({ ...f, ...patch })); };
  const toForm = (r) => ({ ...r, ...Object.fromEntries(cfg.fields.filter(f => f.number).map(f => [f.key, r[f.key] === '' || r[f.key] === null ? '' : String(r[f.key])])) });

  function startNew() {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setForm(emptyFor(cfg)); setMessage(''); setError(''); setDirty(false); setMode('form');
  }
  function openRow(r) {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setForm(toForm(r)); setMessage(''); setError(''); setDirty(false); setMode('form');
  }
  function backToList() {
    if (dirty && !window.confirm('Discard the changes on this screen and go back to the list?')) return;
    setLastOpened(form.id || null); setForm(emptyFor(cfg)); setMessage(''); setError(''); setDirty(false); setMode('list');
  }

  async function save() {
    if (!canSave || busy) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const saved = form.id
        ? await api(`/masters/${kind}/${form.id}`, { method: 'PUT', body: form })
        : await api(`/masters/${kind}`, { method: 'POST', body: form });
      setForm(toForm({ ...form, ...saved }));
      setDirty(false);
      setMessage(`${cfg.title} "${saved.name || saved.code}" saved.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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

  if (mode === 'list') {
    return (
      <RecordList title={plural(cfg)} active={active} state={listState} setState={setListState} highlightId={lastOpened}
        onNew={allowed.includes('create') ? startNew : null}
        onOpen={(id, ids, r) => openRow(r)}
        placeholder={`Search ${cfg.plural}…`}
        emptyText={`No ${cfg.plural} yet. Click New to add the first one.`}
        filters={[{ id: 'active', label: 'Active only' }, { id: 'inactive', label: 'Inactive only' }]}
        fetchRows={fetchRows}
        columns={[
          ...cfg.fields.map((f, i) => ({ label: f.label, num: f.number, cls: i === 0 ? 'o-strong' : '', cell: r => show(f, r[f.key]) })),
          { label: 'Status', cell: r => <span className={`o-pill ${r.isActive ? 'ok' : 'no'}`}>{r.isActive ? 'Active' : 'Inactive'}</span> }
        ]} />
    );
  }

  const title = form.id ? (form.name || form.code) : `New ${cfg.title.toLowerCase()}`;
  const half = Math.ceil(cfg.fields.length / 2);
  const fieldOf = (f) => (
    <Field key={f.key} label={f.label} req={f.required} title={f.hint || undefined}>
      {f.options || f.ref ? (
        <select aria-label={f.label} className="inp" value={form[f.key] ?? ''} onChange={e => set({ [f.key]: e.target.value })}>
          <option value="">{f.empty || 'Select'}</option>
          {f.options
            ? f.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)
            : (refs[f.key] || []).filter(o => o.isActive || o.id === String(form[f.key])).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : (
        <input aria-label={f.label} className="inp" maxLength={f.max} inputMode={f.number ? 'decimal' : undefined} placeholder={f.hint || ''}
          value={form[f.key] ?? ''} onChange={e => set({ [f.key]: f.upper ? e.target.value.toUpperCase() : e.target.value })} />
      )}
    </Field>
  );

  return (
    <div className="o-page no-chat">
      <ControlPanel crumbs={[{ label: plural(cfg), onClick: backToList }, { label: title }]}>
        <AllButton label={`All ${cfg.plural}`} onClick={backToList} />
        {form.id && allowed.includes('create') && <button type="button" className="tb" onClick={startNew}>New <kbd className="tb-kbd">F2</kbd></button>}
        {dirty && form.id && <span className="chip chip-amber">unsaved changes</span>}
      </ControlPanel>
      <div className="o-form">
        <div className="o-main o-main-narrow">
          <StatusBar>
            <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
          </StatusBar>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && (
            <div className="alert alert-success o-saved" role="status">
              <span>{message}</span>
              <button type="button" className="tb" onClick={backToList}>See it in All {cfg.plural}</button>
              {allowed.includes('create') && <button type="button" className="tb" onClick={startNew}>Add another</button>}
            </div>
          )}
          <section className="o-sheet">
            <div className="o-title"><span>{cfg.title}{form.id && !form.isActive ? ' · inactive' : ''}</span><h1>{title}</h1></div>
            <div className="o-groups">
              <div>{cfg.fields.slice(0, half).map(fieldOf)}</div>
              <div>
                {cfg.fields.slice(half).map(fieldOf)}
                {form.id && (
                  <Field label="Status" title="Inactive records stay in old documents but can't be picked in new ones">
                    <label className="o-checks"><span><input type="checkbox" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })} /> Active</span></label>
                  </Field>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
