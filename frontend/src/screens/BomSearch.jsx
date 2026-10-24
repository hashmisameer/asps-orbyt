// Search panel for the BOM screen: order lines with their BOM status (none / draft / approved).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const STATUS = { none: ['No BOM', 'chip-grey'], draft: ['Draft', 'chip-amber'], approved: ['Approved', 'chip-teal'] };
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');

export default function BomSearch({ onOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); }, []);

  useEffect(() => {
    let stop = false;
    const params = new URLSearchParams(Object.entries({ search, status }).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/bom/orders?${params}`).then(r => { if (!stop) { setRows(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [search, status]);

  return (
    <div className="find-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="find-panel" role="dialog" aria-label="Pick an order" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="find-head"><h2>Pick an order</h2><button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="find-filters" style={{ gridTemplateColumns: '3fr 1fr auto' }}>
          <label className="f"><span>Order no., style, brand or buyer PO</span>
            <input ref={box} className="inp" placeholder="Type to search" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <label className="f"><span>BOM status</span>
            <select className="inp" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
            </select>
          </label>
          <button type="button" className="tb find-clear" disabled={!search && !status} onClick={() => { setSearch(''); setStatus(''); }}>Clear</button>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="find-list">
          <table className="og find-table">
            <thead><tr><th>Order no.</th><th>Brand</th><th>Style</th><th>Colour</th><th className="num">Qty</th><th>Ex-factory</th><th>BOM</th></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={7} className="empty-row">Loading…</td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={7} className="empty-row">No order matches.</td></tr>}
              {rows && rows.map(r => (
                <tr key={r.orderLineId} className="find-row" tabIndex={0} onClick={() => onOpen(r.orderLineId)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.orderLineId); }}>
                  <td className="order-no">{r.orderNo}</td>
                  <td>{r.brand}</td>
                  <td>{r.styleCode} · {r.styleName}</td>
                  <td>{r.colour}</td>
                  <td className="num">{r.qty.toLocaleString('en-IN')}</td>
                  <td>{fmtDate(r.exFactory)}</td>
                  <td><span className={`chip ${STATUS[r.bomStatus][1]}`}>{STATUS[r.bomStatus][0]}{r.bomLines ? ` · ${r.bomLines} items` : ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ margin: 0 }}>Latest 200 shown. Click an order or press Enter to open its BOM. Esc closes this panel.</p>
      </section>
    </div>
  );
}
