// Side panel for adding items to a BOM. Items land in their own issue process (set on the item master),
// so the user never chooses the section. Opened from one process, it shows only that process's items.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function BomItemPicker({ process, processes, existing, onAdd, onClose }) {
  const [processId, setProcessId] = useState(process ? String(process.id) : '');
  const [groupId, setGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState({});
  const [fill, setFill] = useState({ consumption: '', excessPct: '', budgetedRate: '' });
  const [error, setError] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); }, []);

  useEffect(() => {
    let stop = false;
    const params = new URLSearchParams(Object.entries({ processId, groupId, search }).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/bom/items?${params}`).then(r => { if (!stop) { setData(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, 200);
    return () => { stop = true; clearTimeout(t); };
  }, [processId, groupId, search]);

  const rows = (data?.rows || []).filter(r => !existing.has(r.itemId));
  const count = Object.keys(picked).length;
  const pname = (id) => processes.find(p => String(p.id) === String(id))?.name || '—';
  const toggle = (r) => setPicked(p => { const n = { ...p }; if (n[r.itemId]) delete n[r.itemId]; else n[r.itemId] = r; return n; });

  return (
    <div className="drawer-dim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-label="Add BOM items" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="drawer-head">
          <h2>Add items{process ? ` · ${process.name}` : ''}</h2>
          <span className="hint">Each item goes to its own process automatically</span>
          <button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="drawer-filters">
          <label className="f span-all"><span>Search item</span>
            <input ref={box} className="inp" placeholder="Type item name, code or summary item" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <label className="f"><span>Process</span>
            <select className="inp" value={processId} onChange={e => { setProcessId(e.target.value); setGroupId(''); }}>
              <option value="">All processes</option>{processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="f"><span>Summary item (group)</span>
            <select className="inp" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">All summary items</option>{(data?.groups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="alert alert-error" role="alert" style={{ margin: '8px 18px 0' }}>{error}</div>}
        <div className="drawer-list">
          <div className="pick-row pick-head bom-pick"><span /><span>ITEM · {data ? `${rows.length} shown` : 'loading…'}</span><span>PROCESS</span><span>UOM</span></div>
          {data && rows.length === 0 && <p className="empty-row">No item matches, or all of them are already in this BOM.</p>}
          {rows.map(r => (
            <label key={r.itemId} className={`pick-row bom-pick ${picked[r.itemId] ? 'sel' : ''}`}>
              <input type="checkbox" checked={!!picked[r.itemId]} onChange={() => toggle(r)} />
              <span>{r.name}{r.code ? ` · ${r.code}` : ''}<small>{r.group}</small></span>
              <span>{pname(r.processId)}</span>
              <span>{r.uom}</span>
            </label>
          ))}
        </div>
        <div className="drawer-foot">
          <div className="hint">Optional: fill these for all {count || ''} selected item{count === 1 ? '' : 's'}</div>
          <div className="fill-row">
            <label className="f"><span>Consumption / pc</span><input className="inp" inputMode="decimal" value={fill.consumption} onChange={e => setFill(f => ({ ...f, consumption: e.target.value }))} /></label>
            <label className="f"><span>Excess %</span><input className="inp" inputMode="decimal" value={fill.excessPct} onChange={e => setFill(f => ({ ...f, excessPct: e.target.value }))} /></label>
            <label className="f"><span>Budgeted rate ₹</span><input className="inp" inputMode="decimal" value={fill.budgetedRate} onChange={e => setFill(f => ({ ...f, budgetedRate: e.target.value }))} /></label>
          </div>
          <div className="foot-act">
            <span className="hint">{count} selected</span>
            <button type="button" className="tb" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button>
            <button type="button" className="tb tb-primary" disabled={!count}
              onClick={() => onAdd(Object.values(picked).map(r => ({ itemId: r.itemId, item: r.name, groupName: r.group, processId: r.processId, uom: r.uom, ...fill })))}>
              Add {count || ''} item{count === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
