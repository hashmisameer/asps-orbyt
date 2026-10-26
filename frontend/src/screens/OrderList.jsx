// Orders list (first thing you see on Order entry): search, quick filters, group by brand.
// Click a row to open the order. The list order is kept, so the form can step with ‹ ›.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const FILTERS = [
  { id: 'soon', label: 'Ex-factory next 90 days' },
  { id: 'nocosting', label: 'No Final costing' },
  { id: 'bompending', label: 'BOM pending' }
];
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');
const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');

function Pill({ done, of }) {
  if (!of) return <span className="o-pill no">—</span>;
  if (done === of) return <span className="o-pill ok">{of === 1 ? 'Done' : `All ${of}`}</span>;
  return <span className={`o-pill ${done ? 'wr' : 'no'}`}>{done} of {of}</span>;
}

export default function OrderList({ active, onOpen, onNew, state, setState }) {
  const { search, view, group } = state;
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [shut, setShut] = useState({});           // brand groups folded away
  const box = useRef(null);

  useEffect(() => {
    let stop = false;
    const params = new URLSearchParams(Object.entries({ search, view, limit: 300 }).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/orders?${params}`).then(r => { if (!stop) { setRows(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, search ? 250 : 0);
    return () => { stop = true; clearTimeout(t); };
  }, [search, view]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); onNew(); }
      if (e.key === 'F3') { e.preventDefault(); box.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const set = (patch) => setState(s => ({ ...s, ...patch }));
  const ids = (rows || []).map(r => r.id);
  const groups = [];
  if (rows && group) {
    for (const r of rows) {
      let g = groups.find(x => x.brand === r.brand);
      if (!g) { g = { brand: r.brand, rows: [], qty: 0 }; groups.push(g); }
      g.rows.push(r); g.qty += r.totalQty;
    }
  }
  const filterName = FILTERS.find(f => f.id === view)?.label;

  const row = (r) => (
    <tr key={r.id} className="o-lrow" tabIndex={0} onClick={() => onOpen(r.id, ids)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.id, ids); }}>
      <td className="order-no">{r.orderNos || '—'}</td>
      {!group && <td>{r.brand}</td>}
      <td>{r.styleCode} <span className="muted">· {r.styleName}</span></td>
      <td>{r.category}</td>
      <td className="num">{r.lines}</td>
      <td className="num">{fmtNum(r.totalQty)}</td>
      <td>{fmtDate(r.firstExFactory)}</td>
      <td><Pill done={r.finalLines} of={r.lines} /></td>
      <td><Pill done={r.bomApproved} of={r.lines} /></td>
    </tr>
  );
  const cols = group ? 8 : 9;

  return (
    <div className="o-page">
      <div className="o-cp">
        <h1 className="o-cp-title">Orders</h1>
        <button type="button" className="tb tb-primary" onClick={onNew}>New <kbd className="tb-kbd">F2</kbd></button>
        <div className="o-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          {filterName && <span className="o-facet">{filterName}<button type="button" aria-label={`Remove filter ${filterName}`} onClick={() => set({ view: '' })}>×</button></span>}
          {group && <span className="o-facet">Group by: Brand<button type="button" aria-label="Remove group by brand" onClick={() => set({ group: false })}>×</button></span>}
          <input ref={box} aria-label="Search orders" placeholder="Search order no., buyer PO, brand or style…" value={search}
            onChange={e => set({ search: e.target.value })}
            onKeyDown={e => { if (e.key === 'Backspace' && !search) set(group ? { group: false } : { view: '' }); }} />
          <div className="o-filter-wrap">
            <button type="button" className="o-filter-btn" aria-expanded={filterOpen} aria-label="Filters and group by" onClick={() => setFilterOpen(o => !o)}>▾</button>
            {filterOpen && (
              <>
                <div className="drop-dim clear" onMouseDown={() => setFilterOpen(false)} />
                <div className="o-filter-pop" role="menu">
                  <div><h3>Filters</h3>
                    {FILTERS.map(f => (
                      <button key={f.id} type="button" role="menuitemradio" aria-checked={view === f.id} className={view === f.id ? 'on' : ''}
                        onClick={() => { set({ view: view === f.id ? '' : f.id }); setFilterOpen(false); }}>{f.label}</button>
                    ))}
                  </div>
                  <div><h3>Group by</h3>
                    <button type="button" role="menuitemcheckbox" aria-checked={group} className={group ? 'on' : ''}
                      onClick={() => { set({ group: !group }); setFilterOpen(false); }}>Brand</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <span className="o-count">{rows ? (rows.length ? `1-${rows.length} / ${rows.length}` : '0') : ''}</span>
      </div>

      <div className="o-body">
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="o-list">
          <table className="og o-ltable">
            <thead>
              <tr>
                <th>Order no.</th>{!group && <th>Brand</th>}<th>Style</th><th>Category</th>
                <th className="num">Lines</th><th className="num">Qty</th><th>First ex-factory</th><th>Final costing</th><th>BOM approved</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && <tr><td colSpan={cols} className="empty-row">Loading…</td></tr>}
              {rows && rows.length === 0 && (
                <tr><td colSpan={cols} className="empty-row">{search || view ? 'No order matches. Remove a filter or change the search.' : 'No orders yet. Click New to make the first one.'}</td></tr>
              )}
              {rows && !group && rows.map(row)}
              {rows && group && groups.map(g => [
                <tr key={`g-${g.brand}`} className="o-grow" onClick={() => setShut(s => ({ ...s, [g.brand]: !s[g.brand] }))}>
                  <td colSpan={3}><button type="button" aria-expanded={!shut[g.brand]}>{shut[g.brand] ? '▸' : '▾'} {g.brand} ({g.rows.length})</button></td>
                  <td className="num">{g.rows.reduce((a, r) => a + r.lines, 0)}</td>
                  <td className="num">{fmtNum(g.qty)}</td>
                  <td colSpan={3} />
                </tr>,
                ...(shut[g.brand] ? [] : g.rows.map(row))
              ])}
            </tbody>
          </table>
        </div>
        {rows && rows.length === 300 && <p className="hint">Showing the first 300. Search or filter to narrow down.</p>}
      </div>
    </div>
  );
}
