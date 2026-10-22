// Find panel: search saved orders by order no., buyer PO, brand or style and open one.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');

export default function FindOrders({ onOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const box = useRef(null);

  useEffect(() => { box.current?.focus(); }, []);

  // Search again shortly after typing stops
  useEffect(() => {
    let stop = false;
    const t = setTimeout(() => {
      api(`/orders?search=${encodeURIComponent(search)}`)
        .then(r => { if (!stop) { setRows(r); setError(''); } })
        .catch(e => { if (!stop) setError(e.message); });
    }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [search]);

  return (
    <div className="find-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="find-panel" role="dialog" aria-label="Find order" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="find-head">
          <h2>Find order</h2>
          <button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <label className="find-search">
          <span className="sr-only">Search orders</span>
          <input ref={box} className="inp" placeholder="Order no., buyer PO, brand or style" value={search} onChange={e => setSearch(e.target.value)} />
        </label>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="find-list">
          <table className="og find-table">
            <thead>
              <tr><th>Order no.</th><th>Brand</th><th>Style</th><th>Buyer PO</th><th className="num">Lines</th><th className="num">Total qty</th><th>Ex-factory</th></tr>
            </thead>
            <tbody>
              {rows === null && <tr><td colSpan={7} className="empty-row">Loading…</td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={7} className="empty-row">{search ? 'No order matches that search.' : 'No orders saved yet.'}</td></tr>}
              {rows && rows.map(r => (
                <tr key={r.id} className="find-row" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.id); }}>
                  <td className="order-no">{r.orderNos}</td>
                  <td>{r.brand}</td>
                  <td>{r.styleCode} · {r.styleName}</td>
                  <td>{r.buyerPos || '—'}</td>
                  <td className="num">{r.lines}</td>
                  <td className="num">{r.totalQty.toLocaleString('en-IN')}</td>
                  <td>{fmtDate(r.firstExFactory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ margin: 0 }}>Click an order or press Enter to open it. Esc closes this panel.</p>
      </section>
    </div>
  );
}
