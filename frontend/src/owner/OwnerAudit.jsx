// Owner console: what the owner changed, and when.
import { useEffect, useState } from 'react';
import { ownerApi } from '../api.js';

const ACTIONS = {
  OWNER_LOGIN: 'Signed in',
  OWNER_LOGIN_FAILED: 'Wrong password tried',
  CLIENT_CREATED: 'Client created',
  CLIENT_UPDATED: 'Client changed',
  CLIENT_ADMIN_PASSWORD_RESET: 'Client admin password reset'
};

// names: code -> readable name for modules and screens (from the catalogue)
function describe(a, names) {
  const d = a.details || {};
  const n = (list) => list.map(c => names[c] || c).join(', ');
  if (a.action === 'CLIENT_CREATED') return `${d.code} · modules: ${n(d.modules || [])}`;
  if (a.action === 'CLIENT_ADMIN_PASSWORD_RESET') return `Login: ${d.username}`;
  if (a.action === 'OWNER_LOGIN_FAILED') return `Attempt ${d.attempts}`;
  if (a.action !== 'CLIENT_UPDATED') return '';
  const parts = [];
  if (d.modulesOn) parts.push(`Modules on: ${n(d.modulesOn)}`);
  if (d.modulesOff) parts.push(`Modules off: ${n(d.modulesOff)}`);
  if (d.screensOn) parts.push(`Screens on: ${n(d.screensOn)}`);
  if (d.screensOff) parts.push(`Screens off: ${n(d.screensOff)}`);
  for (const k of ['name', 'licenceValidTill', 'maxUsers', 'status']) {
    if (d[k]) parts.push(`${k}: ${d[k].from || '—'} → ${d[k].to || '—'}`);
  }
  if (d.detailsChanged) parts.push(`Details: ${d.detailsChanged.join(', ')}`);
  return parts.join(' · ');
}

export default function OwnerAudit({ catalog }) {
  const names = Object.fromEntries((catalog || []).flatMap(m => [[m.code, m.name], ...m.features.map(f => [f.code, f.name])]));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { ownerApi('/audit').then(setRows).catch(e => setError(e.message)); }, []);

  return (
    <div className="screen">
      <div className="screen-head"><h1 className="screen-title">Owner audit log</h1><span className="hint">Latest 200 entries</span></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <section className="panel">
        <table className="og">
          <thead><tr><th style={{ width: 170 }}>When</th><th style={{ width: 110 }}>Owner</th><th style={{ width: 200 }}>Action</th><th style={{ width: 200 }}>Client</th><th>What changed</th></tr></thead>
          <tbody>
            {rows === null && !error && <tr><td colSpan={5} className="empty-row">Loading…</td></tr>}
            {rows && rows.map(a => (
              <tr key={a.id}>
                <td>{new Date(a.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{a.owner}</td>
                <td>{ACTIONS[a.action] || a.action}</td>
                <td>{a.company || '—'}</td>
                <td style={{ whiteSpace: 'normal' }}>{describe(a, names)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
