// Owner console › Catalogue & prices.
// Decide once, for all clients, what is Base (part of the licence) and what is an Add-on, and its default price.
// A client's own Access tab can still give that client a special price.
import { useMemo, useState } from 'react';
import { ownerApi } from '../api.js';
import { LEVEL, rupees, perShort } from './addons.js';

const SearchIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;

export default function CataloguePrices({ catalog, onChange }) {
  const [sel, setSel] = useState(catalog[0].code);
  const [q, setQ] = useState('');
  const [drafts, setDrafts] = useState({});        // code -> { isAddon, price, pricePer } being edited
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const all = useMemo(() => catalog.flatMap(m => m.features.map(f => ({ ...f, module: m }))), [catalog]);
  const kids = useMemo(() => {
    const k = {};
    for (const f of all) if (f.parent) (k[f.parent] = k[f.parent] || []).push(f);
    return k;
  }, [all]);
  const byCode = useMemo(() => Object.fromEntries(all.map(f => [f.code, f])), [all]);
  const depthOf = (f) => (f.parent ? 1 + depthOf(byCode[f.parent]) : 0);

  // Items of a module in tree order: each screen followed by its functions and reports
  const treeOf = (m) => {
    const out = [];
    const walk = (f) => { out.push(f); (kids[f.code] || []).forEach(walk); };
    m.features.filter(f => !f.parent).forEach(walk);
    return out;
  };

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const mod = catalog.find(m => m.code === sel) || catalog[0];
  const rows = words.length
    ? all.filter(f => words.every(w => `${f.name} ${f.module.name}`.toLowerCase().includes(w)))
    : treeOf(mod);

  const valueOf = (item) => drafts[item.code] || { isAddon: item.isAddon, price: item.price ?? '', pricePer: item.pricePer };
  const edit = (item, patch) => { setMessage(''); setDrafts(d => ({ ...d, [item.code]: { ...valueOf(item), ...patch } })); };
  const changed = (item) => {
    const d = drafts[item.code];
    if (!d) return false;
    return d.isAddon !== item.isAddon || (d.isAddon && (String(d.price) !== String(item.price ?? '') || d.pricePer !== item.pricePer));
  };

  async function save(item, level) {
    const d = valueOf(item);
    setError(''); setMessage(''); setBusy(item.code);
    try {
      const next = await ownerApi(`/catalog/${level}/${encodeURIComponent(item.code)}`, { method: 'PUT', body: d });
      onChange(next);
      setDrafts(x => { const y = { ...x }; delete y[item.code]; return y; });
      setMessage(d.isAddon && !item.isAddon
        ? `"${item.name}" is now an add-on. Clients that already had it keep it till their licence date – change the date in each client's Access & add-ons tab.`
        : `"${item.name}" saved.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function line(item, level, depth, label) {
    const v = valueOf(item);
    const fixed = level === 'modules' && item.alwaysOn;
    return (
      <tr key={`${level}-${item.code}`} className={`acc-row d${Math.min(depth, 3)} ${level === 'modules' ? 'cat-mod' : ''}`}>
        <td><span className="acc-name" style={{ paddingLeft: depth * 24 }}>
          <span>{level === 'modules' ? <b>{item.name} module</b> : item.name}
            {words.length > 0 && level === 'features' && <small className="acc-path">{item.module.name}</small>}</span>
        </span></td>
        <td className="dim">{label}</td>
        <td>
          {fixed ? <span className="hint">Always part of the licence</span> : (
            <span className="seg" role="group" aria-label={`Type of ${item.name}`}>
              <button type="button" className={!v.isAddon ? 'on' : ''} aria-pressed={!v.isAddon} onClick={() => edit(item, { isAddon: false })}>Base</button>
              <button type="button" className={v.isAddon ? 'on add' : ''} aria-pressed={v.isAddon} onClick={() => edit(item, { isAddon: true })}>Add-on</button>
            </span>
          )}
        </td>
        <td>
          {v.isAddon && !fixed ? (
            <span className="acc-price">₹<input inputMode="decimal" aria-label={`Default price for ${item.name}`} placeholder="0"
              value={v.price ?? ''} onChange={e => edit(item, { price: e.target.value.replace(/[^\d.]/g, '') })} /></span>
          ) : <span className="dim">—</span>}
        </td>
        <td>
          {v.isAddon && !fixed ? (
            <select className="inp cat-per" aria-label={`Charged per, ${item.name}`} value={v.pricePer} onChange={e => edit(item, { pricePer: e.target.value })}>
              <option value="month">Month</option><option value="year">Year</option>
            </select>
          ) : <span className="dim">—</span>}
        </td>
        <td><span className="cat-act">
          {changed(item)
            ? <>
              <button type="button" className="tb tb-primary tb-sm" disabled={busy === item.code} onClick={() => save(item, level)}>{busy === item.code ? 'Saving…' : 'Save'}</button>
              <button type="button" className="tb tb-sm" onClick={() => setDrafts(d => { const y = { ...d }; delete y[item.code]; return y; })}>Undo</button>
            </>
            : item.isAddon ? <span className="dim">{rupees(item.price)} {perShort(item.pricePer)}</span> : null}
        </span></td>
      </tr>
    );
  }

  return (
    <div className="screen">
      <div className="screen-head"><h1 className="screen-title">Catalogue &amp; prices</h1>
        <span className="hint" style={{ marginLeft: 'auto' }}>Set once for all clients. A client can get a special price in their own Access &amp; add-ons tab.</span></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      <section className="panel">
        <div className="acc-bar">
          <label className="menu-search acc-search">{SearchIcon}<span className="sr-only">Search</span>
            <input type="search" placeholder="Search all modules…" value={q} onChange={e => setQ(e.target.value)} /></label>
          <div className="cat-mods">
            {catalog.map(m => (
              <button key={m.code} type="button" className={`acc-chip ${!words.length && m.code === mod.code ? 'on' : ''}`}
                onClick={() => { setSel(m.code); setQ(''); }}>
                {m.name}{m.isAddon && <span className="cat-dot" title="Add-on module" />}
              </button>
            ))}
          </div>
        </div>
        <table className="acc-table">
          <thead><tr><th style={{ width: '34%' }}>Name</th><th>Level</th><th>Type</th><th>Default price</th><th>Charged per</th><th /></tr></thead>
          <tbody>
            {!words.length && line(mod, 'modules', 0, 'Module')}
            {rows.length === 0 && <tr><td colSpan={6} className="empty-row">{words.length ? `Nothing matches "${q}".` : 'No screens in this module yet.'}</td></tr>}
            {rows.map(f => line(f, 'features', words.length ? 0 : depthOf(f) + 1, LEVEL[f.kind]))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
