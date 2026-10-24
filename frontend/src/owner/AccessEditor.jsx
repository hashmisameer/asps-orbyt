// Owner console › client › "Access & add-ons".
// Left: modules. Right: the screens of the chosen module, each with its functions and reports.
// Base items only need a tick. Add-ons also need a "paid till" date; after that date they disappear for the client.
import { useMemo, useState } from 'react';
import DateInput from '../components/DateInput.jsx';
import { daysLeft, fmtDate, rupees, perShort, monthly, LEVEL, WARN_DAYS } from './addons.js';

const SearchIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
const CHILD_GROUPS = [['function', 'FUNCTIONS'], ['report', 'REPORTS'], ['screen', 'SCREENS'], ['tool', 'TOOLS']];

export default function AccessEditor({ catalog, form, set }) {
  const [sel, setSel] = useState(() => (catalog.find(m => !m.alwaysOn) || catalog[0]).code);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');          // all | addons | expiring
  const [closed, setClosed] = useState({});              // screens folded shut

  const mods = new Set(form.modules);
  const feats = new Set(form.features);
  const addons = form.addons || {};

  // Every feature with its module, and lookups for parents and children
  const all = useMemo(() => catalog.flatMap(m => m.features.map(f => ({ ...f, module: m }))), [catalog]);
  const byCode = useMemo(() => Object.fromEntries(all.map(f => [f.code, f])), [all]);
  const kids = useMemo(() => {
    const k = {};
    for (const f of all) if (f.parent) (k[f.parent] = k[f.parent] || []).push(f);
    return k;
  }, [all]);
  const below = (code) => (kids[code] || []).flatMap(c => [c.code, ...below(c.code)]);
  const above = (code) => { const p = byCode[code]?.parent; return p ? [p, ...above(p)] : []; };

  const priceOf = (item) => (addons[item.code]?.price ?? item.price);

  // ---------- status: is it shown to the client today? ----------
  function statusOf(item, ticked, parentHidden) {
    if (!ticked) return { text: 'Off – hidden', cls: 'off', hidden: true };
    if (parentHidden) return { text: 'Hidden with its screen', cls: 'off', hidden: true };
    if (!item.isAddon || item.alwaysOn) return { text: 'On', cls: 'ok', hidden: false };
    const pt = addons[item.code]?.paidTill;
    if (!pt) return { text: 'Enter paid till date', cls: 'exp', hidden: true, needsDate: true };
    const d = daysLeft(pt);
    if (d < 0) return { text: 'Expired – hidden', cls: 'exp', hidden: true, expiring: true };
    if (d <= WARN_DAYS) return { text: d === 0 ? 'Ends today' : `Ends in ${d} day${d === 1 ? '' : 's'}`, cls: 'warn', hidden: false, expiring: true };
    return { text: `Paid · ${d} days`, cls: 'ok', hidden: false };
  }
  const moduleStatus = (m) => statusOf(m, m.alwaysOn || mods.has(m.code), false);
  const featureStatus = (f) => {
    const parentHidden = f.parent ? featureStatus(byCode[f.parent]).hidden : moduleStatus(f.module).hidden;
    return statusOf(f, f.module.alwaysOn || feats.has(f.code), parentHidden);
  };

  // What this client pays per month for add-ons that are shown today
  const total = catalog.reduce((sum, m) => (m.isAddon && !moduleStatus(m).hidden ? sum + monthly(priceOf(m), m.pricePer) : sum), 0)
    + all.reduce((sum, f) => (f.isAddon && !featureStatus(f).hidden ? sum + monthly(priceOf(f), f.pricePer) : sum), 0);

  // ---------- ticking ----------
  function toggleModule(m) {
    if (m.alwaysOn) return;
    const codes = m.features.map(f => f.code);
    if (mods.has(m.code)) set({ modules: form.modules.filter(c => c !== m.code), features: form.features.filter(c => !codes.includes(c)) });
    else set({ modules: [...form.modules, m.code], features: [...new Set([...form.features, ...codes])] });
  }
  function toggleFeature(f) {
    if (f.module.alwaysOn) return;
    if (feats.has(f.code)) {
      const drop = new Set([f.code, ...below(f.code)]);
      set({ features: form.features.filter(c => !drop.has(c)) });
    } else {
      // Ticking a screen ticks its functions and reports too; ticking a function ticks its screen
      set({
        features: [...new Set([...form.features, f.code, ...below(f.code), ...above(f.code)])],
        modules: mods.has(f.module.code) ? form.modules : [...form.modules, f.module.code]
      });
    }
  }
  const setAddon = (code, patch) => set({ addons: { ...addons, [code]: { paidTill: '', price: null, ...addons[code], ...patch } } });

  // ---------- filters ----------
  const selfMatches = (f) => {
    if (filter === 'addons') return f.isAddon;
    if (filter === 'expiring') return f.isAddon && (featureStatus(f).expiring || featureStatus(f).needsDate);
    return true;
  };
  const shows = (f) => selfMatches(f) || (kids[f.code] || []).some(shows);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const path = (f) => [f.module.name, ...above(f.code).reverse().map(c => byCode[c].name)].join(' › ');
  const found = words.length ? all.filter(f => selfMatches(f) && words.every(w => `${f.name} ${path(f)}`.toLowerCase().includes(w))) : [];

  const mod = catalog.find(m => m.code === sel) || catalog[0];
  const modOn = mod.alwaysOn || mods.has(mod.code);
  const top = all.filter(f => f.module.code === mod.code && !f.parent && shows(f));
  const groups = [...new Set(top.map(f => f.group))];

  // ---------- one row ----------
  function row(f, depth, showPath = false) {
    const ticked = f.module.alwaysOn || feats.has(f.code);
    const st = featureStatus(f);
    const hasKids = (kids[f.code] || []).length > 0;
    const isOpen = !closed[f.code];
    return (
      <tr key={f.code} className={`acc-row d${Math.min(depth, 3)} ${depth === 0 ? 'acc-top' : ''} ${st.hidden ? 'is-hidden' : ''}`}>
        <td>
          <span className="acc-name" style={{ paddingLeft: depth * 26 }}>
            {depth === 0 && !showPath
              ? <button type="button" className="acc-car" aria-label={isOpen ? `Fold ${f.name}` : `Open ${f.name}`} disabled={!hasKids}
                onClick={() => setClosed(c => ({ ...c, [f.code]: isOpen }))}>{hasKids ? (isOpen ? '▾' : '▸') : ''}</button>
              : null}
            <input type="checkbox" checked={ticked} disabled={f.module.alwaysOn} aria-label={f.name} onChange={() => toggleFeature(f)} />
            <span>{f.name}{showPath && <small className="acc-path">{path(f)}</small>}</span>
            {f.kind !== 'screen' && depth === 0 && <span className="acc-kind">{LEVEL[f.kind]}</span>}
          </span>
        </td>
        {addonCells(f, ticked, st)}
      </tr>
    );
  }

  // Type, price, paid till and status cells (same for modules and features)
  function addonCells(item, ticked, st) {
    return (
      <>
        <td><span className={`acc-tag ${item.isAddon ? 'add' : 'base'}`}>{item.isAddon ? 'Add-on' : 'Base'}</span></td>
        <td>
          {!item.isAddon ? <span className="dim">—</span>
            : ticked ? (
              <span className="acc-price" title="Leave as it is for the catalogue price, or type a special price for this client">
                ₹<input inputMode="decimal" aria-label={`Price for ${item.name}`} placeholder={String(item.price ?? 0)}
                  value={addons[item.code]?.price ?? ''} onChange={e => setAddon(item.code, { price: e.target.value.replace(/[^\d.]/g, '') || null })} />
                <span>{perShort(item.pricePer)}</span>
              </span>
            ) : <span className="dim">{rupees(item.price)} {perShort(item.pricePer)}</span>}
        </td>
        <td>
          {item.isAddon && ticked
            ? <DateInput ariaLabel={`Paid till for ${item.name}`} className={st.needsDate ? 'acc-need' : ''}
              value={addons[item.code]?.paidTill || ''} onChange={v => setAddon(item.code, { paidTill: v })} />
            : <span className="dim">—</span>}
        </td>
        <td><span className={`acc-st ${st.cls}`}>{st.text}</span></td>
      </>
    );
  }

  function children(f, depth) {
    if (closed[f.code]) return [];
    const list = (kids[f.code] || []).filter(shows);
    return CHILD_GROUPS.flatMap(([kind, title]) => {
      const rows = list.filter(c => c.kind === kind);
      if (!rows.length) return [];
      return [
        <tr key={`${f.code}-${kind}`} className="acc-grp"><td colSpan={5} style={{ paddingLeft: 40 + depth * 26 }}>{title}</td></tr>,
        ...rows.flatMap(c => [row(c, depth), children(c, depth + 1)])
      ];
    });
  }

  const mStatus = moduleStatus(mod);
  const head = <tr><th style={{ width: '42%' }}>Screen / function / report</th><th>Type</th><th>Price</th><th>Paid till</th><th>Status</th></tr>;

  return (
    <div className="acc">
      <nav className="acc-mods" aria-label="Modules">
        {catalog.map(m => {
          const on = m.alwaysOn || mods.has(m.code);
          const n = m.features.filter(f => m.alwaysOn || feats.has(f.code)).length;
          const st = moduleStatus(m);
          return (
            <div key={m.code} className={`acc-mod ${m.code === mod.code ? 'sel' : ''}`}>
              <input type="checkbox" checked={on} disabled={m.alwaysOn} aria-label={`${m.name} module`} onChange={() => toggleModule(m)} />
              <button type="button" onClick={() => { setSel(m.code); setQ(''); }}>
                <span>{m.name}</span>
                {m.isAddon && <span className="acc-tag add">Add-on</span>}
                <small className={on && m.isAddon && st.cls !== 'ok' ? `acc-st ${st.cls}` : ''}>
                  {m.alwaysOn ? 'Always on' : !on ? 'Off' : m.isAddon && st.cls !== 'ok' ? '!' : `${n} / ${m.features.length}`}
                </small>
              </button>
            </div>
          );
        })}
      </nav>

      <div className="acc-main">
        <div className="acc-bar">
          <label className="menu-search acc-search">{SearchIcon}<span className="sr-only">Search</span>
            <input type="search" placeholder="Search screen, function, report…" value={q} onChange={e => setQ(e.target.value)} /></label>
          {[['all', 'All'], ['addons', 'Only add-ons'], ['expiring', 'Expiring / needs date']].map(([k, label]) => (
            <button key={k} type="button" className={`acc-chip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
          <span className="acc-sum">Add-ons for this client: <b>{rupees(Math.round(total))} / month</b></span>
        </div>

        {words.length ? (
          <table className="acc-table">
            <thead>{head}</thead>
            <tbody>
              {found.length === 0 && <tr><td colSpan={5} className="empty-row">Nothing matches "{q}".</td></tr>}
              {found.map(f => row(f, 0, true))}
            </tbody>
          </table>
        ) : (
          <>
            {!mod.alwaysOn && mod.isAddon && (
              <table className="acc-table acc-modrow">
                <tbody>
                  <tr className={mStatus.hidden ? 'is-hidden' : ''}>
                    <td style={{ width: '42%' }}><span className="acc-name"><b>{mod.name} module</b><span className="hint">whole module is an add-on</span></span></td>
                    {addonCells(mod, modOn, mStatus)}
                  </tr>
                </tbody>
              </table>
            )}
            <table className="acc-table">
              <thead>{head}</thead>
              <tbody>
                {top.length === 0 && (
                  <tr><td colSpan={5} className="empty-row">
                    {mod.features.length === 0 ? 'No screens in this module yet. They appear here as soon as they are built.' : 'Nothing matches this filter.'}
                  </td></tr>
                )}
                {groups.map(g => [
                  groups.length > 1 && <tr key={`g-${g}`} className="acc-sec"><td colSpan={5}>{g.toUpperCase()}</td></tr>,
                  ...top.filter(f => f.group === g).flatMap(f => [row(f, 0), children(f, 1)])
                ])}
              </tbody>
            </table>
          </>
        )}
        <p className="hint acc-note">
          Base = part of the licence. Add-on = works only till its paid till date{form.licenceValidTill ? ` (licence ends ${fmtDate(form.licenceValidTill)})` : ''}.
          When payment comes, move the date ahead and save – it switches on at once. Admin is always on.
        </p>
      </div>
    </div>
  );
}
