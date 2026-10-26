// Owner console: all client companies.
import { useEffect, useState } from 'react';
import { ownerApi } from '../api.js';

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : 'No end date');

export default function ClientList({ onOpen }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { ownerApi('/companies').then(setRows).catch(e => setError(e.message)); }, []);

  return (
    <div className="screen">
      <div className="screen-head"><h1 className="screen-title">Clients</h1>
        <span className="hint" style={{ marginLeft: 'auto' }}>Only you (the ORBYT owner) can see this console</span></div>
      <div className="toolbar">
        <button type="button" className="tb tb-primary" onClick={() => onOpen('new')}>+ New client</button>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <section className="panel">
        <div className="panel-head">All clients{rows ? ` · ${rows.length}` : ''}</div>
        <table className="og">
          <thead><tr><th>Code</th><th>Client</th><th>City</th><th className="num">Modules on</th><th className="num">Users</th><th>Licence valid till</th><th>Add-ons</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null && !error && <tr><td colSpan={8} className="empty-row">Loading…</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan={8} className="empty-row">No clients yet. Click "+ New client".</td></tr>}
            {rows && rows.map(r => (
              <tr key={r.id} className="find-row" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.id); }}>
                <td className="order-no">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.city || '—'}</td>
                <td className="num">{r.modulesOn}</td>
                <td className="num">{r.usersUsed} / {r.maxUsers}</td>
                <td>{fmtDate(r.licenceValidTill)}</td>
                <td>{r.addonsExpiring > 0
                  ? <span className="chip chip-amber" title="Add-ons ending within 15 days">{r.addonsExpiring} ending soon</span>
                  : <span className="hint">—</span>}</td>
                <td><span className={`chip ${r.status === 'active' ? 'chip-teal' : 'chip-amber'}`}>{r.status === 'active' ? 'Active' : 'Suspended'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
