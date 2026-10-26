// List view used by every record screen (All costings, All parties, …):
// title + New, a search box with one quick filter, the rows, and the record you came from highlighted.
// fetchRows({ search, filter }) returns the rows; columns say what to show.
import { useEffect, useRef, useState } from 'react';

export default function RecordList({
  title, active, fetchRows, columns, rowId = (r) => r.id, filters = [], state, setState,
  onOpen, onNew, newLabel = 'New', highlightId, placeholder, emptyText, note, extraButtons
}) {
  const { search = '', filter = '' } = state;
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const box = useRef(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let stop = false;
    const t = setTimeout(() => {
      fetchRows({ search, filter }).then(r => { if (!stop) { setRows(r); setError(''); } }).catch(e => { if (!stop) setError(e.message); });
    }, search ? 250 : 0);
    return () => { stop = true; clearTimeout(t); };
  }, [search, filter, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring the record you just came from into view
  useEffect(() => {
    if (!rows || !highlightId) return;
    document.querySelector(`[data-rec="${highlightId}"]`)?.scrollIntoView({ block: 'center' });
  }, [rows, highlightId]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'F2' && onNew) { e.preventDefault(); onNew(); }
      if (e.key === 'F3') { e.preventDefault(); box.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const set = (patch) => setState(s => ({ ...s, ...patch }));
  const ids = (rows || []).map(rowId);
  const filterName = filters.find(f => f.id === filter)?.label;

  return (
    <div className="o-page">
      <div className="o-cp">
        <h1 className="o-cp-title">{title}</h1>
        {onNew && <button type="button" className="tb tb-primary" onClick={onNew}>{newLabel} <kbd className="tb-kbd">F2</kbd></button>}
        {extraButtons}
        <div className="o-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          {filterName && <span className="o-facet">{filterName}<button type="button" aria-label={`Remove filter ${filterName}`} onClick={() => set({ filter: '' })}>×</button></span>}
          <input ref={box} aria-label={`Search ${title.toLowerCase()}`} placeholder={placeholder} value={search}
            onChange={e => set({ search: e.target.value })}
            onKeyDown={e => { if (e.key === 'Backspace' && !search && filter) set({ filter: '' }); }} />
          {filters.length > 0 && (
            <div className="o-filter-wrap">
              <button type="button" className="o-filter-btn" aria-expanded={filterOpen} aria-label="Filters" onClick={() => setFilterOpen(o => !o)}>▾</button>
              {filterOpen && (
                <>
                  <div className="drop-dim clear" onMouseDown={() => setFilterOpen(false)} />
                  <div className="o-filter-pop one" role="menu">
                    <div><h3>Filters</h3>
                      {filters.map(f => (
                        <button key={f.id} type="button" role="menuitemradio" aria-checked={filter === f.id} className={filter === f.id ? 'on' : ''}
                          onClick={() => { set({ filter: filter === f.id ? '' : f.id }); setFilterOpen(false); }}>{f.label}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <button type="button" className="tb o-refresh" aria-label="Refresh the list" title="Refresh" onClick={() => setReload(x => x + 1)}>↻</button>
        <span className="o-count">{rows ? (rows.length ? `1-${rows.length} / ${rows.length}` : '0') : ''}</span>
      </div>

      <div className="o-body">
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="o-list">
          <table className="og o-ltable">
            <thead><tr>{columns.map(c => <th key={c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows === null && !error && <tr><td colSpan={columns.length} className="empty-row">Loading…</td></tr>}
              {rows && rows.length === 0 && (
                <tr><td colSpan={columns.length} className="empty-row">{search || filter ? 'Nothing matches. Remove the filter or change the search.' : emptyText}</td></tr>
              )}
              {rows && rows.map(r => {
                const id = rowId(r);
                return (
                  <tr key={id} data-rec={id} className={`o-lrow ${id === highlightId ? 'o-hl' : ''}`} tabIndex={0}
                    onClick={() => onOpen(id, ids, r)} onKeyDown={e => { if (e.key === 'Enter') onOpen(id, ids, r); }}>
                    {columns.map((c, i) => (
                      <td key={c.label} className={`${c.num ? 'num' : ''} ${c.cls || ''}`}>
                        {c.cell(r)}
                        {i === 0 && id === highlightId && <span className="o-pill ok" style={{ marginLeft: 8 }}>Last opened</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {note && <p className="hint" style={{ margin: 0 }}>{note}</p>}
      </div>
    </div>
  );
}
