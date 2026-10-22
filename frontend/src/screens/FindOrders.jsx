// Search panel: find saved orders by order no., buyer PO, brand, product category or style, and open one.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');
const noFilters = { search: '', brandId: '', categoryId: '', styleId: '' };

export default function FindOrders({ lookups, onOpen, onClose }) {
  const [filters, setFilters] = useState(noFilters);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const box = useRef(null);

  useEffect(() => { box.current?.focus(); }, []);

  const set = (patch) => setFilters(f => ({ ...f, ...patch }));
  // Styles of the chosen brand only (styles without a brand fit every brand)
  const styles = (lookups?.styles || []).filter(s => !filters.brandId || !s.brandId || String(s.brandId) === filters.brandId);
  const anyFilter = Object.values(filters).some(Boolean);

  // Search again shortly after typing or picking a filter
  useEffect(() => {
    let stop = false;
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/orders?${params}`)
        .then(r => { if (!stop) { setRows(r); setError(''); } })
        .catch(e => { if (!stop) setError(e.message); });
    }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [filters]);

  return (
    <div className="find-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="find-panel" role="dialog" aria-label="Search orders" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="find-head">
          <h2>Search orders</h2>
          <button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="find-filters">
          <label className="f find-text"><span>Order no., buyer PO, brand or style</span>
            <input ref={box} className="inp" placeholder="Type to search" value={filters.search} onChange={e => set({ search: e.target.value })} />
          </label>
          <label className="f"><span>Brand</span>
            <select className="inp" value={filters.brandId} onChange={e => set({ brandId: e.target.value, styleId: '' })}>
              <option value="">All brands</option>
              {(lookups?.brands || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="f"><span>Product category</span>
            <select className="inp" value={filters.categoryId} onChange={e => set({ categoryId: e.target.value })}>
              <option value="">All categories</option>
              {(lookups?.productCategories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="f"><span>Style</span>
            <select className="inp" value={filters.styleId} onChange={e => set({ styleId: e.target.value })}>
              <option value="">All styles</option>
              {styles.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </select>
          </label>
          <button type="button" className="tb find-clear" onClick={() => setFilters(noFilters)} disabled={!anyFilter}>Clear</button>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="find-list">
          <table className="og find-table">
            <thead>
              <tr><th>Order no.</th><th>Brand</th><th>Product category</th><th>Style</th><th>Buyer PO</th><th className="num">Lines</th><th className="num">Total qty</th><th>Ex-factory</th></tr>
            </thead>
            <tbody>
              {rows === null && <tr><td colSpan={8} className="empty-row">Loading…</td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={8} className="empty-row">{anyFilter ? 'No order matches these filters.' : 'No orders saved yet.'}</td></tr>}
              {rows && rows.map(r => (
                <tr key={r.id} className="find-row" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.id); }}>
                  <td className="order-no">{r.orderNos}</td>
                  <td>{r.brand}</td>
                  <td>{r.category}</td>
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
        <p className="hint" style={{ margin: 0 }}>{rows ? `${rows.length} order${rows.length === 1 ? '' : 's'} shown (latest 50). ` : ''}Click an order or press Enter to open it. Esc closes this panel.</p>
      </section>
    </div>
  );
}
