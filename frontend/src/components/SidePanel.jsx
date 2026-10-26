// Right-hand column of a document: what it is linked to, extra boxes from the screen, and its last changes.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const when = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return today ? `today ${time}` : `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' })} ${time}`;
};

export default function SidePanel({ linked = [], entity, entityId, refreshKey, children }) {
  const [history, setHistory] = useState(null);
  useEffect(() => {
    if (!entity || !entityId) { setHistory(null); return undefined; }
    let stop = false;
    api(`/links/history/${entity}/${entityId}`).then(h => { if (!stop) setHistory(h); }).catch(() => { if (!stop) setHistory([]); });
    return () => { stop = true; };
  }, [entity, entityId, refreshKey]);

  return (
    <aside className="side-col">
      {linked.length > 0 && (
        <section className="side-box">
          <h2>Linked</h2>
          {linked.map(l => (
            <div key={l.label} className="side-row">
              <span>{l.label}</span>
              {l.onClick
                ? <button type="button" className={`side-val link ${l.tone || ''}`} onClick={l.onClick}>{l.value}</button>
                : <b className={`side-val ${l.tone || ''}`}>{l.value}</b>}
            </div>
          ))}
        </section>
      )}
      {children}
      {entity && entityId && (
        <section className="side-box">
          <h2>Last changes</h2>
          {history === null && <p className="side-empty">Loading…</p>}
          {history && history.length === 0 && <p className="side-empty">No changes recorded yet.</p>}
          {history && history.map((h, i) => (
            <div key={i} className="side-row">
              <span>{h.who} · {when(h.at)}</span>
              <b>{h.text}</b>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}
