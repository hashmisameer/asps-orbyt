// Search panel for parties: by name, party code or GST code, and by party type.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export const TYPE_NAMES = { buyer: 'Buyer', supplier: 'Supplier', both: 'Both' };

export default function PartySearch({ onOpen, onClose }) {
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
      api(`/parties?${params}`).then(r => { if (!stop) { setRows(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [search, type]);

  return (
    <div className="find-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="find-panel" role="dialog" aria-label="Search parties" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="find-head"><h2>Search parties</h2><button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="find-filters" style={{ gridTemplateColumns: '3fr 1fr auto' }}>
          <label className="f"><span>Party name, party code or GST code</span>
            <input ref={box} className="inp" placeholder="Type to search" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <label className="f"><span>Party type</span>
            <select className="inp" value={type} onChange={e => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="buyer">Buyers (incl. Both)</option>
              <option value="supplier">Suppliers (incl. Both)</option>
              <option value="both">Only Both</option>
            </select>
          </label>
          <button type="button" className="tb find-clear" disabled={!search && !type} onClick={() => { setSearch(''); setType(''); }}>Clear</button>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="find-list">
          <table className="og find-table">
            <thead><tr><th>Party code</th><th>Party name</th><th>Type</th><th>GST code</th><th>Currency</th><th>Billing city</th><th className="num">Addresses</th><th>Status</th></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={8} className="empty-row">Loading…</td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={8} className="empty-row">{search || type ? 'No party matches.' : 'No parties saved yet.'}</td></tr>}
              {rows && rows.map(r => (
                <tr key={r.id} className="find-row" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.id); }}>
                  <td className="order-no">{r.code}</td>
                  <td>{r.name}{r.isExport && <span className="chip chip-grey" style={{ marginLeft: 6 }}>Export</span>}</td>
                  <td>{TYPE_NAMES[r.type]}</td>
                  <td>{r.gstCode || '—'}</td>
                  <td>{r.currency}</td>
                  <td>{[r.city, r.country].filter(Boolean).join(', ') || '—'}</td>
                  <td className="num">{r.addresses}</td>
                  <td>{r.isActive ? <span className="chip chip-teal">Active</span> : <span className="chip chip-grey">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ margin: 0 }}>Latest 300 shown. Click a party or press Enter to open it. Esc closes this panel.</p>
      </section>
    </div>
  );
}
