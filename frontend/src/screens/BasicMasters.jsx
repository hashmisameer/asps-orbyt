// Basic masters: Colour, Size range, Product group, Product class, UOM, Year, Season and Currency on one screen.
// Left: the five masters with a count. Right: the rows of the one picked, changed right in the table.
// "+ Add a line" adds a row; Save (Ctrl+S) saves the whole list at once (all or nothing); Discard throws the changes away.
// A row used in orders or costings can only be switched off (Active), not deleted.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

let keySeq = 0;
const newKey = () => `m${++keySeq}`;

const KINDS = [
  { id: 'colour', name: 'Colour', plural: 'colours', hint: 'Colours picked on order lines and costings',
    cols: [{ key: 'name', label: 'Colour name', max: 60 }] },
  { id: 'size_range', name: 'Size range', plural: 'size ranges', hint: 'Sizes show as boxes in Order entry, in this order',
    cols: [{ key: 'name', label: 'Size range', max: 40, width: 200 }, { key: 'sizes', label: 'Sizes (in order)', sizes: true }] },
  { id: 'product_group', name: 'Product group', plural: 'product groups', hint: 'Picked on Product category (style), e.g. TROUSER, SHIRT',
    cols: [{ key: 'name', label: 'Product group', max: 60, upper: true }] },
  { id: 'product_class', name: 'Product class', plural: 'product classes', hint: 'Picked on Product category (style), e.g. MEN\'S TROUSER',
    cols: [{ key: 'name', label: 'Product class', max: 60, upper: true }] },
  { id: 'uom', name: 'UOM', plural: 'units', hint: 'Units used on items, costing, BOM and purchase',
    cols: [{ key: 'code', label: 'Code', max: 10, upper: true, width: 140 }, { key: 'name', label: 'Name', max: 40 },
      { key: 'allowDecimals', label: 'Decimals allowed', yesNo: true, width: 170 }] },
  { id: 'year', name: 'Year', plural: 'years', hint: 'April to March, e.g. 2026-27. Priority 1 shows first in every Year dropdown',
    cols: [{ key: 'name', label: 'Year', max: 7, width: 220, placeholder: 'e.g. 2026-27' },
      { key: 'priority', label: 'Priority', number: true, integer: true, optional: true, distinct: true, width: 150, placeholder: '1 = top' }] },
  { id: 'season', name: 'Season', plural: 'seasons', hint: 'Seasons picked on costings, e.g. Spring Summer',
    cols: [{ key: 'name', label: 'Season', max: 60 }] },
  { id: 'currency', name: 'Currency', plural: 'currencies', hint: 'Rate in rupees is the suggested rate for new costings',
    cols: [{ key: 'code', label: 'Code', max: 3, upper: true, width: 110 }, { key: 'name', label: 'Currency name', max: 60 },
      { key: 'rateToInr', label: 'Rate in rupees', number: true, width: 150 }] }
];

const blankRow = (kind) => ({
  key: newKey(), id: null, isActive: true, usedIn: 0, dirty: true,
  ...Object.fromEntries(kind.cols.map(c => [c.key, c.sizes ? [] : c.yesNo ? true : '']))
});
const fromServer = (r) => ({
  ...r, key: `s${r.id}`, dirty: false,
  ...(r.rateToInr === undefined ? {} : { rateToInr: String(r.rateToInr) }),
  ...(r.priority === undefined ? {} : { priority: r.priority === '' ? '' : String(r.priority) })
});

// Sizes as small boxes: type a size and press Enter (or comma) to add it; × or Backspace removes one
function SizeEditor({ value, onChange, disabled, label }) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(',').map(x => x.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter(p => !value.some(v => v.toUpperCase() === p.toUpperCase()))]);
    setText('');
  };
  return (
    <div className="bm-sizes">
      {value.map((s, i) => (
        <span key={s} className="bm-size">{s}
          {!disabled && <button type="button" aria-label={`Remove size ${s}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>}
        </span>
      ))}
      {!disabled && (
        <input aria-label={`Add size to ${label || 'size range'}`} placeholder={value.length ? '+ size' : 'Type a size, Enter'} value={text}
          onChange={e => setText(e.target.value)} onBlur={add}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
            if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }} />
      )}
    </div>
  );
}

export default function BasicMasters({ active, session }) {
  const allowed = session?.permissions?.['masters.basic'] || [];
  const canEdit = allowed.includes('edit');
  const canCreate = allowed.includes('create');
  const [kindId, setKindId] = useState('colour');
  const [rows, setRows] = useState({});         // kind -> rows on screen
  const [removed, setRemoved] = useState([]);   // saved rows marked for delete (ids) of the kind on screen
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [focusKey, setFocusKey] = useState(null); // new row to put the cursor in
  const kind = KINDS.find(k => k.id === kindId);
  const list = rows[kindId];
  const dirty = (list || []).some(r => r.dirty) || removed.length > 0;

  const load = (id) => api(`/masters/${id}`).then(r => setRows(all => ({ ...all, [id]: r.rows.map(fromServer) })));
  useEffect(() => {
    KINDS.forEach(k => load(k.id).catch(e => setError(e.message)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(id) {
    if (id === kindId) return;
    if (dirty && !window.confirm('Discard the changes on this list?')) return;
    if (dirty) load(kindId);
    setKindId(id); setRemoved([]); setSearch(''); setError(''); setMessage('');
  }
  const setRow = (key, patch) => {
    setMessage('');
    setRows(all => ({ ...all, [kindId]: all[kindId].map(r => (r.key === key ? { ...r, ...patch, dirty: true } : r)) }));
  };
  function addRow() {
    setMessage(''); setSearch('');
    const row = blankRow(kind);
    setRows(all => ({ ...all, [kindId]: [...(all[kindId] || []), row] }));
    setFocusKey(row.key);
  }
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector(`[data-row="${focusKey}"] input`)?.focus();
    setFocusKey(null);
  }, [focusKey, rows]);
  function removeRow(r) {
    setMessage('');
    if (r.id) setRemoved(ids => [...ids, r.id]);
    setRows(all => ({ ...all, [kindId]: all[kindId].filter(x => x.key !== r.key) }));
  }
  function discard() {
    setRemoved([]); setError(''); setMessage('');
    load(kindId);
  }

  // Columns that must differ between rows (Year priority): checked on screen first, with a clear message
  function clashOnScreen() {
    for (const c of kind.cols.filter(x => x.distinct)) {
      const seen = {};
      for (const r of list) {
        const v = String(r[c.key] ?? '').trim();
        if (!v) continue;
        if (seen[v]) {
          const other = seen[v];
          return other.dirty && !r.dirty
            ? `${c.label} ${v} is already given to ${r.name}. Change the ${c.label.toLowerCase()} of ${r.name} first (for example to ${Number(v) + 1}), then save.`
            : !other.dirty && r.dirty
              ? `${c.label} ${v} is already given to ${other.name}. Change the ${c.label.toLowerCase()} of ${other.name} first (for example to ${Number(v) + 1}), then save.`
              : `${c.label} ${v} is given to both ${other.name || 'a new row'} and ${r.name || 'a new row'}. Give each a different ${c.label.toLowerCase()}.`;
        }
        seen[v] = r;
      }
    }
    return '';
  }

  // Save the whole list in one go: all changes are saved, or none (the server checks everything again)
  async function save() {
    if (busy || !dirty) return;
    setError(''); setMessage('');
    const clash = clashOnScreen();
    if (clash) { setError(clash); return; }
    setBusy(true);
    const changed = list.map((r, i) => ({ ...r, rowNo: i + 1 })).filter(r => r.dirty);
    const count = changed.length + removed.length;
    try {
      const r = await api(`/masters/${kindId}/batch`, { method: 'POST', body: { remove: removed, save: changed } });
      setRows(all => ({ ...all, [kindId]: r.rows.map(fromServer) }));
      setRemoved([]);
      setMessage(`${kind.name}: ${count} change${count === 1 ? '' : 's'} saved.`);
    } catch (e) {
      setError(`${e.message} Nothing was saved; fix it and save again.`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const q = search.trim().toLowerCase();
  const shown = (list || []).filter(r => !q || r.dirty || kind.cols.some(c => String(c.sizes ? r[c.key].join(' ') : r[c.key] ?? '').toLowerCase().includes(q)));
  const canChange = (r) => (r.id ? canEdit : canCreate);

  return (
    <div className="o-page">
      <div className="o-cp">
        <h1 className="o-cp-title">Basic masters</h1>
        {(canEdit || canCreate) && (
          <>
            <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
            <button type="button" className="tb" onClick={discard} disabled={busy || !dirty}>Discard</button>
          </>
        )}
        {dirty && <span className="chip chip-amber">unsaved changes</span>}
        <div className="o-search bm-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input aria-label={`Search ${kind.plural}`} placeholder={`Search ${kind.plural}…`} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bm-wrap">
        <nav className="bm-side" aria-label="Masters">
          <h3>Masters</h3>
          {KINDS.map(k => (
            <button key={k.id} type="button" className={k.id === kindId ? 'on' : ''} aria-current={k.id === kindId ? 'true' : undefined} onClick={() => pick(k.id)}>
              {k.name}<small>{rows[k.id] ? rows[k.id].length : '…'}</small>
            </button>
          ))}
        </nav>

        <section className="o-sheet bm-sheet">
          <div className="bm-head"><h2>{kind.name}</h2><span>{list ? `${list.length} ${kind.plural}` : 'Loading…'} · {kind.hint}</span></div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && <div className="alert alert-success" role="status">{message}</div>}

          <table className="og bm-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                {kind.cols.map(c => <th key={c.key} className={c.number ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>{c.label}{!c.yesNo && !c.sizes && !c.optional && <span className="req"> *</span>}</th>)}
                <th style={{ width: 130 }}>Used in</th>
                <th style={{ width: 80 }}>Active</th>
                <th style={{ width: 44 }} aria-label="Delete" />
              </tr>
            </thead>
            <tbody>
              {list && shown.length === 0 && (
                <tr><td colSpan={kind.cols.length + 4} className="empty-row">{q ? 'Nothing matches the search.' : `No ${kind.plural} yet. Click "+ Add a line".`}</td></tr>
              )}
              {shown.map((r, i) => {
                const ro = !canChange(r);
                return (
                  <tr key={r.key} data-row={r.key} className={r.dirty ? 'bm-dirty' : ''}>
                    <td className="muted">{i + 1}</td>
                    {kind.cols.map(c => (
                      <td key={c.key} className={c.number ? 'num' : ''}>
                        {c.sizes ? (
                          <SizeEditor value={r.sizes} disabled={ro} label={r.name} onChange={v => setRow(r.key, { sizes: v })} />
                        ) : c.yesNo ? (
                          <select className="ci bm-in" aria-label={c.label} disabled={ro} value={r[c.key] ? 'yes' : 'no'} onChange={e => setRow(r.key, { [c.key]: e.target.value === 'yes' })}>
                            <option value="yes">Yes</option><option value="no">No (whole numbers)</option>
                          </select>
                        ) : (
                          <input className={`ci bm-in ${c.number ? 'num' : ''}`} aria-label={c.label} disabled={ro} maxLength={c.max}
                            inputMode={c.integer ? 'numeric' : c.number ? 'decimal' : undefined} value={r[c.key] ?? ''} placeholder={c.placeholder}
                            onChange={e => setRow(r.key, { [c.key]: c.upper ? e.target.value.toUpperCase() : c.integer ? e.target.value.replace(/[^\d]/g, '') : e.target.value })} />
                        )}
                      </td>
                    ))}
                    <td className="muted">{r.id ? (r.usedIn ? `${r.usedIn} record${r.usedIn === 1 ? '' : 's'}` : 'Not used yet') : 'New'}</td>
                    <td>
                      <button type="button" role="switch" aria-checked={r.isActive} aria-label="Active" disabled={ro || !r.id}
                        title={!r.id ? 'New rows start active' : r.isActive ? 'Switch off to hide it from dropdowns' : 'Switched off'}
                        className={`bm-switch ${r.isActive ? 'on' : ''}`} onClick={() => setRow(r.key, { isActive: !r.isActive })} />
                    </td>
                    <td>
                      {!ro && (!r.id || !r.usedIn) && (
                        <button type="button" className="del-btn" aria-label={`Delete row ${i + 1}`} title={r.id ? 'Delete (not used anywhere yet)' : 'Remove this new row'} onClick={() => removeRow(r)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {canCreate && <button type="button" className="o-link o-addline" onClick={addRow}>+ Add a line</button>}
          <p className="hint o-grid-hint">
            {kindId === 'year'
              ? 'Give priority 1 to the year you work in now: it shows first in every Year dropdown and new records start on it. Years without a priority come after, newest first.'
              : kindId === 'size_range'
              ? 'Type a size and press Enter to add it. Sizes go in the order you type them. A size already used in an order can\'t be removed.'
              : 'A row used in orders or costings can\'t be deleted; switch off Active to hide it from dropdowns. Old records stay as they are.'}
          </p>
        </section>
      </div>
    </div>
  );
}
