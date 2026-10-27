// Side panel of the Purchase order:
//   mode 'bom'  – approved BOM items still to buy (balance = BOM qty - already on other POs); this supplier's items first
//   mode 'item' – any item, for material not tied to an order
// Tick rows and press Add; qty starts at the balance and rate at the BOM's budgeted rate.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function PoPicker({ mode, supplierId, excludePoId, itemGroups, existing, onAdd, onClose }) {
  const bom = mode === 'bom';
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState({});
  const [error, setError] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); }, []);

  useEffect(() => {
    let stop = false;
    const params = new URLSearchParams(Object.entries({ search, itemGroupId: groupId, supplierId, excludePoId }).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/purchase/po/${bom ? 'bom-lines' : 'items'}?${params}`)
        .then(r => { if (!stop) { setRows(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, search ? 250 : 0);
    return () => { stop = true; clearTimeout(t); };
  }, [bom, search, groupId, supplierId, excludePoId]);

  const keyOf = (r) => (bom ? r.key : `0-${r.itemId}`);
  const shown = (rows || []).filter(r => !existing.has(keyOf(r)));
  const count = Object.keys(picked).length;
  const toggle = (r) => setPicked(p => { const n = { ...p }; if (n[keyOf(r)]) delete n[keyOf(r)]; else n[keyOf(r)] = r; return n; });
  const allPicked = shown.length > 0 && shown.every(r => picked[keyOf(r)]);
  const toggleAll = () => setPicked(p => {
    const n = { ...p };
    shown.forEach(r => { if (allPicked) delete n[keyOf(r)]; else n[keyOf(r)] = r; });
    return n;
  });

  return (
    <div className="drawer-dim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer po-drawer" role="dialog" aria-label={bom ? 'Add items from BOM' : 'Add items'} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="drawer-head">
          <h2>{bom ? 'Add from BOM' : 'Add items'}</h2>
          <span className="hint">{bom ? 'Approved BOMs, only what is still to buy' : 'Any item, without an order no.'}</span>
          <button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="drawer-filters">
          <label className="f span-all"><span>Search</span>
            <input ref={box} className="inp" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={bom ? 'Order no., style, buyer, item or BOM supplier' : 'Item name, code or summary item'} />
          </label>
          <label className="f"><span>Summary item (group)</span>
            <select className="inp" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">All</option>{itemGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="alert alert-error" role="alert" style={{ margin: '8px 18px 0' }}>{error}</div>}
        <div className="drawer-list">
          <div className={`pick-row pick-head ${bom ? 'po-pick' : 'po-pick-item'}`}>
            <input type="checkbox" aria-label="Select all shown" checked={allPicked} onChange={toggleAll} disabled={!shown.length} />
            {bom ? <><span>ORDER NO.</span><span>ITEM · {rows ? `${shown.length} shown` : 'loading…'}</span><span className="num">BOM QTY</span><span className="num">ORDERED</span><span className="num">BALANCE</span></>
              : <><span>ITEM · {rows ? `${shown.length} shown` : 'loading…'}</span><span>HSN</span><span>UOM</span></>}
          </div>
          {rows && shown.length === 0 && (
            <p className="empty-row">{bom ? 'Nothing left to buy here. Only approved BOMs show, and items already fully on POs drop out.' : 'No item matches.'}</p>
          )}
          {shown.map(r => (
            <label key={keyOf(r)} className={`pick-row ${bom ? 'po-pick' : 'po-pick-item'} ${picked[keyOf(r)] ? 'sel' : ''}`}>
              <input type="checkbox" checked={!!picked[keyOf(r)]} onChange={() => toggle(r)} />
              {bom ? (
                <>
                  <span><b>{r.orderNo}</b><small>{r.buyer} · {r.styleCode}</small></span>
                  <span>{r.itemName}{r.itemCode ? ` · ${r.itemCode}` : ''}
                    <small>{r.group}{r.bomSupplier ? ` · BOM supplier: ${r.bomSupplier}` : ''}{r.sameSupplier && <b className="po-same"> · this supplier</b>}</small></span>
                  <span className="num">{qty(r.bomQty)} {r.uom}</span>
                  <span className="num">{qty(r.ordered)}</span>
                  <span className="num"><b>{qty(r.balance)}</b></span>
                </>
              ) : (
                <>
                  <span>{r.itemName}{r.itemCode ? ` · ${r.itemCode}` : ''}<small>{r.group}</small></span>
                  <span>{r.hsn || '—'}</span>
                  <span>{r.uom}</span>
                </>
              )}
            </label>
          ))}
        </div>
        <div className="drawer-foot">
          <div className="foot-act">
            <span className="hint">{count} selected</span>
            <button type="button" className="tb" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button>
            <button type="button" className="tb tb-primary" disabled={!count} onClick={() => onAdd(Object.values(picked))}>
              Add {count || ''} item{count === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
