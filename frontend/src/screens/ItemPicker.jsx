// Side panel for adding fabric / trims / packing items to a costing.
// Filter by summary item (group), item nature or search; tick several; optionally fill the same
// consumption, wastage and rate for all of them; then add them in one go.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const NATURES = ['Main', 'Contrast', 'Lining', 'Interlining', 'Pocketing', 'Other'];
const TITLES = { fabric: 'fabric', trims: 'trims', packing: 'packing' };

export default function ItemPicker({ section, canCreateItem, onAdd, onClose }) {
  const fabric = section === 'fabric';
  const [mode, setMode] = useState('detail');          // 'detail' or 'summary'
  const [groupId, setGroupId] = useState('');
  const [nature, setNature] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState({});           // key -> row
  const [fill, setFill] = useState({ consumption: '', wastagePct: '', rate: '', itemNature: '' });
  const [newOpen, setNewOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', uom: '', itemNature: '' });
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const box = useRef(null);

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    let stop = false;
    const params = new URLSearchParams(Object.entries({ section, mode, groupId, nature, search }).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/costing/items?${params}`).then(r => { if (!stop) { setData(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, 200);
    return () => { stop = true; clearTimeout(t); };
  }, [section, mode, groupId, nature, search, reload]);

  const rows = data?.rows || [];
  const count = Object.keys(picked).length;
  const toggle = (r) => setPicked(p => { const n = { ...p }; if (n[r.key]) delete n[r.key]; else n[r.key] = r; return n; });
  const allShownPicked = rows.length > 0 && rows.every(r => picked[r.key]);
  const toggleAll = () => setPicked(p => {
    const n = { ...p };
    if (allShownPicked) rows.forEach(r => delete n[r.key]); else rows.forEach(r => { n[r.key] = r; });
    return n;
  });

  async function createItem() {
    setError('');
    if (!groupId) { setError('Pick a summary item first: the new item goes into that group.'); return; }
    try {
      const it = await api('/masters/item', { method: 'POST', body: { groupId, ...newItem } });
      setNewOpen(false); setNewItem({ name: '', uom: '', itemNature: '' });
      setSearch(it.name); setMode('detail'); setReload(x => x + 1);
      setPicked(p => ({ ...p, [`i${it.id}`]: { key: `i${it.id}`, itemId: it.id, groupId: Number(it.groupId), name: it.name, uom: it.uom, itemNature: it.itemNature, group: data.groups.find(g => String(g.id) === String(groupId))?.name || '' } }));
    } catch (e) { setError(e.message); }
  }

  function add() {
    onAdd(Object.values(picked).map(r => ({
      itemId: r.itemId ? String(r.itemId) : '', itemGroupId: r.itemId ? '' : String(r.groupId), item: r.name, groupName: r.itemId ? r.group : 'Summary item',
      uom: r.uom || '', itemNature: fill.itemNature || r.itemNature || '', cutWidth: r.width ? String(r.width) : '',
      consumption: fill.consumption, wastagePct: fill.wastagePct, ...(fabric ? { greigeRate: fill.rate } : { rate: fill.rate })
    })));
  }

  return (
    <div className="drawer-dim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-label={`Add ${TITLES[section]} items`} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="drawer-head">
          <h2>Add {TITLES[section]} items</h2>
          <span className="hint">Pick one or more; they are added to the {TITLES[section]} section</span>
          <button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="drawer-filters">
          <label className="f span-all"><span>Search item</span>
            <input ref={box} className="inp" placeholder="Type item name or code" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <div className="f"><span>Show</span>
            <div className="seg" role="group" aria-label="Show">
              <button type="button" className={mode === 'summary' ? 'on' : ''} onClick={() => setMode('summary')}>Summary items</button>
              <button type="button" className={mode === 'detail' ? 'on' : ''} onClick={() => setMode('detail')}>Detail items</button>
            </div>
          </div>
          <label className="f"><span>Summary item (group)</span>
            <select className="inp" value={groupId} disabled={mode === 'summary'} onChange={e => setGroupId(e.target.value)}>
              <option value="">All summary items</option>
              {(data?.groups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          {mode === 'detail' && (
            <div className="span-all"><div className="hint" style={{ marginBottom: 5 }}>Item nature</div>
              <div className="chips">
                <button type="button" className={!nature ? 'on' : ''} onClick={() => setNature('')}>All</button>
                {NATURES.map(n => <button key={n} type="button" className={nature === n ? 'on' : ''} onClick={() => setNature(n)}>{n}</button>)}
              </div>
            </div>
          )}
        </div>

        {error && <div className="alert alert-error" role="alert" style={{ margin: '8px 18px 0' }}>{error}</div>}
        <div className="drawer-list">
          <div className="pick-row pick-head">
            <input type="checkbox" aria-label="Pick all shown" checked={allShownPicked} onChange={toggleAll} disabled={!rows.length} />
            <span>{mode === 'summary' ? 'SUMMARY ITEM' : 'ITEM'} · {data ? `${data.total} found${data.total > rows.length ? `, first ${rows.length} shown` : ''}` : 'loading…'}</span>
            <span>NATURE</span><span>UOM</span>
          </div>
          {data && rows.length === 0 && (
            <p className="empty-row">{search || groupId || nature ? 'No item matches.' : `No ${TITLES[section]} items yet. Add them on the Item master screen${canCreateItem ? ' or with "+ New item" below' : ''}.`}</p>
          )}
          {rows.map(r => (
            <label key={r.key} className={`pick-row ${picked[r.key] ? 'sel' : ''}`}>
              <input type="checkbox" checked={!!picked[r.key]} onChange={() => toggle(r)} />
              <span>{r.name}{r.code ? ` · ${r.code}` : ''}<small>{r.group}</small></span>
              <span>{r.itemNature || '—'}</span>
              <span>{r.uom || '—'}</span>
            </label>
          ))}
        </div>

        <div className="drawer-foot">
          {newOpen ? (
            <div className="new-item">
              <div className="hint">New item in "{data?.groups.find(g => String(g.id) === groupId)?.name || 'pick a summary item above'}"</div>
              <div className="fill-row">
                <label className="f" style={{ flex: 2 }}><span>Item name <span className="req">*</span></span><input className="inp" value={newItem.name} onChange={e => setNewItem(n => ({ ...n, name: e.target.value.toUpperCase() }))} /></label>
                <label className="f"><span>UOM <span className="req">*</span></span><input className="inp" value={newItem.uom} onChange={e => setNewItem(n => ({ ...n, uom: e.target.value.toUpperCase() }))} /></label>
                <label className="f"><span>Nature</span>
                  <select className="inp" value={newItem.itemNature} onChange={e => setNewItem(n => ({ ...n, itemNature: e.target.value }))}>
                    <option value="">—</option>{NATURES.map(n => <option key={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <div className="foot-act">
                <button type="button" className="tb" style={{ marginLeft: 'auto' }} onClick={() => setNewOpen(false)}>Cancel</button>
                <button type="button" className="tb tb-primary" onClick={createItem}>Create item</button>
              </div>
            </div>
          ) : (
            <>
              <div className="hint">Optional: fill these for all {count || ''} selected item{count === 1 ? '' : 's'} (you can change each line later)</div>
              <div className="fill-row">
                <label className="f"><span>{fabric ? 'Cut avg' : 'Consumption'}</span><input className="inp" inputMode="decimal" value={fill.consumption} onChange={e => setFill(f => ({ ...f, consumption: e.target.value }))} /></label>
                <label className="f"><span>Wastage %</span><input className="inp" inputMode="decimal" value={fill.wastagePct} onChange={e => setFill(f => ({ ...f, wastagePct: e.target.value }))} /></label>
                <label className="f"><span>{fabric ? 'Greige rate' : 'Rate'}</span><input className="inp" inputMode="decimal" value={fill.rate} onChange={e => setFill(f => ({ ...f, rate: e.target.value }))} /></label>
                {fabric && (
                  <label className="f"><span>Item nature</span>
                    <select className="inp" value={fill.itemNature} onChange={e => setFill(f => ({ ...f, itemNature: e.target.value }))}>
                      <option value="">Keep each</option>{NATURES.map(n => <option key={n}>{n}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="foot-act">
                <span className="hint">{count} selected</span>
                {canCreateItem && <button type="button" className="tb" style={{ marginLeft: 'auto' }} onClick={() => setNewOpen(true)}>Item not in list? + New item</button>}
                <button type="button" className="tb" style={canCreateItem ? undefined : { marginLeft: 'auto' }} onClick={onClose}>Cancel</button>
                <button type="button" className="tb tb-primary" disabled={!count} onClick={add}>Add {count || ''} item{count === 1 ? '' : 's'}</button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
