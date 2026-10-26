// Notes and changes of a saved record, shown under the sheet: write a note ("Log note"),
// and read the notes and changes, newest first, by day. Nothing shows for a record not saved yet.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const dayOf = (iso) => {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export default function Chatter({ entity, entityId, refreshKey, extra }) {
  const [items, setItems] = useState(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entity || !entityId) { setItems(null); return undefined; }
    let stop = false;
    api(`/links/history/${entity}/${entityId}`).then(h => { if (!stop) setItems(h); }).catch(() => { if (!stop) setItems([]); });
    return () => { stop = true; };
  }, [entity, entityId, refreshKey]);

  async function post() {
    if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try {
      setItems(await api(`/links/notes/${entity}/${entityId}`, { method: 'POST', body: { body: text } }));
      setText(''); setWriting(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!entityId) return null;
  let lastDay = '';
  return (
    <section className="o-chat" aria-label="Notes and changes">
      {extra}
      {(
        <>
          <div className="o-chat-btns">
            <h2>Notes and changes</h2>
            <button type="button" className={`tb ${writing ? 'tb-primary' : ''}`} onClick={() => setWriting(w => !w)}>Log note</button>
          </div>
          {writing && (
            <div className="o-chat-write">
              <textarea autoFocus rows={3} maxLength={2000} placeholder="Write a note for your team…" value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); post(); } }} />
              {error && <p className="field-bad">{error}</p>}
              <div className="o-chat-write-btns">
                <button type="button" className="tb tb-primary" disabled={busy || !text.trim()} onClick={post}>{busy ? 'Saving…' : 'Log'}</button>
                <button type="button" className="tb" onClick={() => { setWriting(false); setText(''); }}>Cancel</button>
                <span className="hint">Ctrl Enter to log</span>
              </div>
            </div>
          )}
          {items === null && <p className="o-chat-empty">Loading…</p>}
          {items && items.length === 0 && <p className="o-chat-empty">No notes or changes yet.</p>}
          {items && items.map((it, i) => {
            const day = dayOf(it.at);
            const head = day !== lastDay ? (lastDay = day, <h4 key={`d${i}`} className="o-chat-day">{day}</h4>) : null;
            return [head,
              <div key={i} className={`o-msg ${it.kind}`}>
                <span className="o-msg-av" aria-hidden="true">{(it.who || '?')[0].toUpperCase()}</span>
                <div>
                  <b>{it.who}</b><small>{timeOf(it.at)}</small>
                  <p>{it.text}</p>
                </div>
              </div>];
          })}
        </>
      )}
    </section>
  );
}
