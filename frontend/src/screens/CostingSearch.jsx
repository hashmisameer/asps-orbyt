// Search panel for costings: by costing no., buyer, style, order no. or description, and by type.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const TYPE_NAMES = { initial: 'Initial', final: 'Final', actual: 'Actual' };
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');
const money = (x) => Number(x || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CostingSearch({ onOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); }, []);

  useEffect(() => {
    let stop = false;
    const params = new URLSearchParams(Object.entries({ search, type }).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/costing?${params}`).then(r => { if (!stop) { setRows(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [search, type]);

  return (
    <div className="find-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="find-panel" role="dialog" aria-label="Search costings" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="find-head"><h2>Search costings</h2><button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="find-filters" style={{ gridTemplateColumns: '3fr 1fr auto' }}>
          <label className="f"><span>Costing no., buyer, style, order no. or description</span>
            <input ref={box} className="inp" placeholder="Type to search" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <label className="f"><span>Costing type</span>
            <select className="inp" value={type} onChange={e => setType(e.target.value)}>
              <option value="">All types</option>{Object.entries(TYPE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button type="button" className="tb find-clear" disabled={!search && !type} onClick={() => { setSearch(''); setType(''); }}>Clear</button>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="find-list">
          <table className="og find-table">
            <thead><tr><th>Costing no.</th><th className="num">Rev.</th><th>Type</th><th>Date</th><th>Buyer</th><th>Style</th><th>Order no.</th><th className="num">Qty</th><th className="num">Base ₹</th><th className="num">Base (currency)</th></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={10} className="empty-row">Loading…</td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={10} className="empty-row">{search || type ? 'No costing matches.' : 'No costings saved yet.'}</td></tr>}
              {rows && rows.map(r => (
                <tr key={r.id} className="find-row" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.id); }}>
                  <td className="order-no">{r.costingNo}</td>
                  <td className="num">{r.revision}</td>
                  <td><span className={`chip ${r.type === 'final' ? 'chip-teal' : r.type === 'actual' ? 'chip-amber' : 'chip-grey'}`}>{TYPE_NAMES[r.type]}</span></td>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.buyer}</td>
                  <td>{r.styleCode}</td>
                  <td>{r.orderNo || '—'}</td>
                  <td className="num">{r.orderQty.toLocaleString('en-IN')}</td>
                  <td className="num">{money(r.baseAmount)}</td>
                  <td className="num">{r.currency} {r.baseInCurrency.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ margin: 0 }}>Latest 100 shown. Click a costing or press Enter to open it. Esc closes this panel.</p>
      </section>
    </div>
  );
}
