// Costing screen: cost of one garment for a style or an order line.
// Left: header and one box per cost section (fabric, trims, ... ). Right: cost summary and revisions.
// Amounts are worked out here as you type and worked out again by the server on save.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import DateInput from '../components/DateInput.jsx';
import CostingSearch from './CostingSearch.jsx';
import ItemPicker from './ItemPicker.jsx';

const SECTIONS = [
  { key: 'fabric', name: 'Fabric', colour: '#0F766E' },
  { key: 'trims', name: 'Trims', colour: '#2563EB' },
  { key: 'packing', name: 'Packing', colour: '#7C3AED' },
  { key: 'cmt', name: 'CMT cost', colour: '#D97706' },
  { key: 'value_addition', name: 'Value addition', colour: '#DB2777' },
  { key: 'expenses', name: 'Expenses', colour: '#0891B2' },
  { key: 'management', name: 'Management cost', colour: '#65A30D' },
  { key: 'other_receivable', name: 'Other receivable', colour: '#64748B' }
];
const MATERIAL = ['fabric', 'trims', 'packing'];
const NATURES = ['Main', 'Contrast', 'Lining', 'Interlining', 'Pocketing', 'Other'];
const TYPE_NAMES = { initial: 'Initial', final: 'Final', actual: 'Actual' };

let keySeq = 0;
const newKey = () => `c${++keySeq}`;
const n = (v) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const r4 = (x) => Math.round(x * 10000) / 10000;
const money = (x) => n(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (x) => n(x).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');
const str = (v) => (v === null || v === undefined ? '' : String(v));

// Same sums as the server: average qty and rupee amount for one garment
function calc(section, l) {
  const consumption = n(l.consumption);
  const wastage = MATERIAL.includes(section) ? n(l.wastagePct) : 0;
  const rate = section === 'fabric' ? n(l.greigeRate) + n(l.processRate) : n(l.rate);
  const avgQty = MATERIAL.includes(section) ? consumption * (1 + wastage / 100) : consumption;
  return { avgQty: r4(avgQty), rate: r4(rate), amount: r4(avgQty * rate * (n(l.exchangeRate) || 1)) };
}

const blankHeader = () => ({
  type: 'initial', description: '', buyerId: '', styleId: '', orderLineId: '', deliveryDate: '', sizeRangeId: '',
  orderQty: '', shipMode: '', seasonId: '', year: String(new Date().getFullYear()), colourId: '', currencyId: '', conversionRate: ''
});
const blankLine = (section, inr, from = {}) => ({
  key: newKey(), section, itemId: '', itemGroupId: '', groupName: '', itemType: '', item: '', description: '', uom: '', itemNature: '',
  excludeMaterial: false, cutWidth: '', consumption: MATERIAL.includes(section) ? '' : '1', wastagePct: '', greigeRate: '',
  processRate: '', rate: '', currencyId: inr ? String(inr.id) : '', exchangeRate: '1', ...from
});

export default function Costing({ active, session }) {
  const allowed = session?.permissions?.['order.costing'] || [];
  const canApprove = allowed.includes('approve');
  const canCreateItem = (session?.permissions?.['masters.item'] || []).includes('create');
  const [lookups, setLookups] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(null);
  const [header, setHeader] = useState(blankHeader());
  const [lines, setLines] = useState([]);
  const [open, setOpen] = useState({ fabric: true });   // which section boxes are open
  const [picker, setPicker] = useState(null);            // section whose item picker is open
  const [findOpen, setFindOpen] = useState(false);
  const [viewing, setViewing] = useState(null);          // an older revision shown read-only
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { api('/costing/lookups').then(setLookups).catch(e => setLoadError(e.message)); }, []);
  const inr = lookups?.currencies.find(c => c.code === 'INR');

  const readOnly = !!viewing;
  const canSave = !readOnly && (saved ? allowed.includes('edit') : allowed.includes('create'));

  const setH = (patch) => { setMessage(''); setDirty(true); setHeader(h => ({ ...h, ...patch })); };
  const setLine = (key, patch) => { setMessage(''); setDirty(true); setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); };
  const removeLine = (key) => { setDirty(true); setLines(ls => ls.filter(l => l.key !== key)); };
  function addLines(section, list) {
    setDirty(true); setMessage('');
    setLines(ls => [...ls, ...list.map(from => blankLine(section, inr, from))]);
    setOpen(o => ({ ...o, [section]: true }));
  }

  // Picking an order fills style, colour, size range, qty, ship mode and delivery date from Order entry
  function pickOrder(value) {
    const o = lookups.orderLines.find(x => String(x.id) === value);
    if (!o) { setH({ orderLineId: '' }); return; }
    setH({
      orderLineId: value, styleId: str(o.styleId), colourId: str(o.colourId), sizeRangeId: str(o.sizeRangeId),
      orderQty: str(o.qty), shipMode: o.shipMode, deliveryDate: o.deliveryDate || header.deliveryDate
    });
  }
  function pickCurrency(value) {
    const c = lookups.currencies.find(x => String(x.id) === value);
    setH({ currencyId: value, conversionRate: c ? str(c.rate) : '' });
  }
  function pickLineCurrency(key, value) {
    const c = lookups.currencies.find(x => String(x.id) === value);
    setLine(key, { currencyId: value, exchangeRate: c ? str(c.rate) : '1' });
  }

  // ---------- totals ----------
  const totals = useMemo(() => {
    const secs = Object.fromEntries(SECTIONS.map(s => [s.key, 0]));
    for (const l of lines) secs[l.section] = r4(secs[l.section] + calc(l.section, l).amount);
    const gross = SECTIONS.filter(s => s.key !== 'other_receivable').reduce((a, s) => a + secs[s.key], 0);
    const base = r4(gross - secs.other_receivable);
    return { secs, gross, base, total: Math.round(base * n(header.orderQty) * 100) / 100 };
  }, [lines, header.orderQty]);
  const currency = lookups?.currencies.find(c => String(c.id) === header.currencyId);
  const rate = n(header.conversionRate);
  const inCurrency = (x) => (currency && currency.code !== 'INR' && rate > 0 ? `${currency.code} ${(x / rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');

  // ---------- load / new / save / delete ----------
  function loadCosting(c, revisionView = null) {
    setHeader({
      type: c.type, description: c.description, buyerId: str(c.buyerId), styleId: str(c.styleId), orderLineId: str(c.orderLineId),
      deliveryDate: c.deliveryDate, sizeRangeId: str(c.sizeRangeId), orderQty: str(c.orderQty), shipMode: c.shipMode,
      seasonId: str(c.seasonId), year: str(c.year), colourId: str(c.colourId), currencyId: str(c.currencyId), conversionRate: str(c.conversionRate)
    });
    setLines(c.lines.map(l => blankLine(l.section, null, {
      itemId: str(l.itemId), itemGroupId: str(l.itemGroupId), groupName: l.itemId ? l.groupName : (l.itemGroupId ? 'Summary item' : ''),
      itemType: l.itemType, item: l.item, description: l.description, uom: l.uom, itemNature: l.itemNature,
      excludeMaterial: l.excludeMaterial, cutWidth: str(l.cutWidth), consumption: str(l.consumption), wastagePct: str(l.wastagePct),
      greigeRate: str(l.greigeRate), processRate: str(l.processRate), rate: str(l.rate), currencyId: str(l.currencyId), exchangeRate: str(l.exchangeRate)
    })));
    setOpen(Object.fromEntries(SECTIONS.map(s => [s.key, c.lines.some(l => l.section === s.key)])));
    if (!revisionView) setSaved(c);
    setViewing(revisionView);
    setDirty(false);
  }

  function startNew() {
    if (dirty && !window.confirm('Discard the changes on this screen and start a new costing?')) return;
    setSaved(null); setViewing(null); setHeader(blankHeader()); setLines([]); setOpen({ fabric: true });
    setError(''); setMessage(''); setDirty(false);
  }

  async function openCosting(id) {
    if (dirty && !window.confirm('Discard the changes on this screen and open the selected costing?')) return;
    try {
      loadCosting(await api(`/costing/${id}`));
      setFindOpen(false); setError(''); setMessage('');
    } catch (e) { setError(e.message); setFindOpen(false); }
  }

  async function viewRevision(rev) {
    if (!saved) return;
    if (rev === saved.revision) { loadCosting(saved); return; }
    if (dirty && !window.confirm('Discard the changes on this screen and look at an older revision?')) return;
    try {
      loadCosting(await api(`/costing/${saved.id}/revisions/${rev}`), rev);
      setError(''); setMessage('');
    } catch (e) { setError(e.message); }
  }

  async function save() {
    if (!canSave || busy) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const body = { ...header, lines };
      const c = saved
        ? await api(`/costing/${saved.id}`, { method: 'PUT', body })
        : await api('/costing', { method: 'POST', body });
      loadCosting(c);
      setMessage(`Costing ${c.costingNo} saved (revision ${c.revision}, ${TYPE_NAMES[c.type]}).`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!saved || saved.type === 'final') return;
    if (!window.confirm(`Delete costing ${saved.costingNo}? It will no longer show anywhere.`)) return;
    try {
      await api(`/costing/${saved.id}`, { method: 'DELETE' });
      const no = saved.costingNo;
      setDirty(false); setSaved(null); setViewing(null); setHeader(blankHeader()); setLines([]); setOpen({ fabric: true });
      setError(''); setMessage(`Costing ${no} deleted.`);
    } catch (e) { setError(e.message); }
  }

  // Keyboard: F2 new, F3 search, Ctrl+S save (only while this tab is on screen and no panel is open)
  useEffect(() => {
    if (!active || picker) return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); startNew(); }
      if (e.key === 'F3') { e.preventDefault(); setFindOpen(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loadError) return <div className="screen"><div className="alert alert-error">{loadError}</div></div>;
  if (!lookups) return <div className="screen"><p className="hint">Loading costing…</p></div>;

  // Which types can be picked: Final -> only Actual; Actual stays Actual; Final needs Approve permission
  const typeAllowed = (t) => {
    if (readOnly) return false;
    if (saved?.type === 'final' && t === 'initial') return false;
    if (saved?.type === 'actual' && t !== 'actual') return false;
    if (t === 'final' && !canApprove) return false;
    return true;
  };
  const status = viewing ? [`REVISION ${viewing} · READ ONLY`, 'chip-amber'] : !saved ? ['DRAFT · NOT SAVED', 'chip-grey'] : dirty ? ['SAVED · CHANGES PENDING', 'chip-amber'] : ['SAVED', 'chip-teal'];
  const sel = (key, list, label, opts = {}) => (
    <select className="inp" disabled={readOnly || opts.disabled} value={header[key]} onChange={e => (opts.onPick ? opts.onPick(e.target.value) : setH({ [key]: e.target.value }))}>
      <option value="">{opts.placeholder || `Select ${label}`}</option>
      {list.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="screen">
      {findOpen && <CostingSearch onOpen={openCosting} onClose={() => setFindOpen(false)} />}
      {picker && <ItemPicker section={picker} canCreateItem={canCreateItem} onClose={() => setPicker(null)} onAdd={(list) => { addLines(picker, list); setPicker(null); }} />}

      <div className="screen-head">
        <h1 className="screen-title">Costing</h1>
        <span className={`chip ${status[1]}`}>{status[0]}</span>
        <span className="hint" style={{ marginLeft: 'auto' }}>Fields marked <span className="req">*</span> are required · amounts in ₹ per garment</span>
      </div>

      <div className="toolbar">
        <button type="button" className="tb" onClick={startNew}>+ New (F2)</button>
        <button type="button" className="tb" onClick={() => setFindOpen(true)}>Search (F3)</button>
        <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : 'Save (Ctrl+S)'}</button>
        <button type="button" className="tb" onClick={remove} disabled={!saved || viewing || saved.type === 'final' || !allowed.includes('edit')}
          title={saved?.type === 'final' ? 'A Final costing can\'t be deleted. Save it as Actual first.' : 'Delete this costing'}>Delete</button>
        <button type="button" className="tb tb-soon" style={{ marginLeft: 'auto' }} title="Coming in a later phase">Print</button>
      </div>

      {viewing && (
        <div className="alert alert-warn" role="status">
          You are looking at revision {viewing} (read only). <button type="button" className="link-btn" onClick={() => viewRevision(saved.revision)}>Back to the latest revision</button>
        </div>
      )}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <section className="panel">
        <div className="cost-id">
          <div><span>Costing no.</span><b>{saved ? saved.costingNo : 'Given on save'}</b></div>
          <div title="Goes up by 1 every time the costing is saved"><span>Revision</span><b>{viewing || saved?.revision || '—'}</b></div>
          <div title="Date of the latest save"><span>Costing date</span><b>{fmtDate(saved?.costingDate)}</b></div>
          <div className="type-seg" role="radiogroup" aria-label="Costing type"
            title="Initial: first costing. Final: shows in BOM (needs Approve). Actual: a closed Final costing; only Actual can be deleted.">
            {['initial', 'final', 'actual'].map(t => (
              <button key={t} type="button" role="radio" aria-checked={header.type === t} className={header.type === t ? 'on' : ''}
                disabled={!typeAllowed(t) && header.type !== t} onClick={() => typeAllowed(t) && setH({ type: t })}>{TYPE_NAMES[t]}</button>
            ))}
          </div>
        </div>
        <div className="form-grid cost-head">
          <label className="f"><span>Buyer <span className="req">*</span></span>{sel('buyerId', lookups.buyers.map(b => ({ id: b.id, label: b.name })), 'buyer')}</label>
          <label className="f" title="Optional. Picking an order fills style, colour, size range, qty, ship mode and delivery date"><span>Order no.</span>
            {sel('orderLineId', lookups.orderLines.map(o => ({ id: o.id, label: o.orderNo })), 'order', { onPick: pickOrder, placeholder: 'No order (style costing)' })}
          </label>
          <label className="f"><span>Style no. <span className="req">*</span></span>
            {sel('styleId', lookups.styles.map(s => ({ id: s.id, label: `${s.code} · ${s.name}` })), 'style', { disabled: !!header.orderLineId })}
          </label>
          <label className="f"><span>Colour</span>{sel('colourId', lookups.colours.map(c => ({ id: c.id, label: c.name })), 'colour')}</label>
          <label className="f"><span>Size range</span>{sel('sizeRangeId', lookups.sizeRanges.map(s => ({ id: s.id, label: s.name })), 'size range')}</label>
          <label className="f" title={header.orderLineId ? 'Comes from the order' : 'Pieces this costing is for'}><span>Order qty <span className="req">*</span></span>
            {header.orderLineId || readOnly ? <span className="ro">{header.orderQty ? qty(header.orderQty) : '—'} pcs</span>
              : <input className="inp" inputMode="numeric" value={header.orderQty} onChange={e => setH({ orderQty: e.target.value.replace(/[^\d]/g, '') })} />}
          </label>
          <label className="f"><span>Ship mode <span className="req">*</span></span>
            <select className="inp" disabled={readOnly} value={header.shipMode} onChange={e => setH({ shipMode: e.target.value })}>
              <option value="">Select</option><option value="sea">By sea</option><option value="air">By air</option>
            </select>
          </label>
          <label className="f"><span>Delivery date</span>
            {readOnly ? <span className="ro">{fmtDate(header.deliveryDate)}</span>
              : <DateInput ariaLabel="Delivery date" value={header.deliveryDate} onChange={v => setH({ deliveryDate: v })} />}
          </label>
          <div className="f"><span>Season / Year</span>
            <div className="pair">
              {sel('seasonId', lookups.seasons.map(s => ({ id: s.id, label: s.name })), 'season', { placeholder: 'Season' })}
              {sel('year', lookups.years.map(y => ({ id: y, label: String(y) })), 'year', { placeholder: 'Year' })}
            </div>
          </div>
          <label className="f" title="Currency the buyer pays in"><span>Currency <span className="req">*</span></span>
            {sel('currencyId', lookups.currencies.map(c => ({ id: c.id, label: `${c.code} · ${c.name}` })), 'currency', { onPick: pickCurrency })}
          </label>
          <label className="f" title="1 unit of the currency in rupees"><span>Conversion rate <span className="req">*</span></span>
            <input className="inp num-inp" inputMode="decimal" disabled={readOnly} value={header.conversionRate} onChange={e => setH({ conversionRate: e.target.value })} />
          </label>
          <label className="f"><span>Description</span>
            <input className="inp" disabled={readOnly} maxLength={500} value={header.description} onChange={e => setH({ description: e.target.value })} placeholder="e.g. First costing as per tech pack" />
          </label>
        </div>
      </section>

      <div className="cost-body">
        <div>
          {SECTIONS.map(s => {
            const secLines = lines.filter(l => l.section === s.key);
            const material = MATERIAL.includes(s.key);
            const isOpen = !!open[s.key];
            return (
              <section key={s.key} className={`cost-sec ${isOpen ? 'open' : ''}`}>
                <div className="cost-sec-head">
                  <button type="button" className="sec-toggle" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [s.key]: !o[s.key] }))}>
                    <span className="chev" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                    <span className="dot" style={{ background: s.colour }} aria-hidden="true" />
                    <b>{s.name}</b>
                    <span className="cnt">{secLines.length ? `${secLines.length} ${material ? 'item' : 'line'}${secLines.length === 1 ? '' : 's'}` : material ? 'No items' : 'No lines'}{s.key === 'other_receivable' ? ' · taken off the base' : ''}</span>
                  </button>
                  <span className="amt">{s.key === 'other_receivable' ? '− ' : ''}₹ {money(totals.secs[s.key])}</span>
                  {!readOnly && (
                    <button type="button" className="sec-add" onClick={() => (material ? setPicker(s.key) : addLines(s.key, [{}]))}>
                      {material ? '+ Add items' : '+ Add line'}
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="grid-scroll cost-sec-body">
                    {secLines.length === 0
                      ? <p className="empty-row">{material ? `No ${s.name.toLowerCase()} items yet. Click "+ Add items".` : 'No lines yet. Click "+ Add line".'}</p>
                      : <SectionGrid section={s.key} lines={secLines} lookups={lookups} readOnly={readOnly} onChange={setLine} onCurrency={pickLineCurrency} onRemove={removeLine} />}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <aside className="cost-side">
          <h3>COST SUMMARY · PER GARMENT</h3>
          {SECTIONS.map(s => (
            <div key={s.key} className="side-row">
              <span>{s.name}</span>
              <b>{s.key === 'other_receivable' ? '− ' : ''}{money(totals.secs[s.key])}</b>
              {s.key !== 'other_receivable' && (
                <span className="bar" aria-hidden="true"><i style={{ width: `${totals.gross > 0 ? (totals.secs[s.key] / totals.gross) * 100 : 0}%`, background: s.colour }} /></span>
              )}
            </div>
          ))}
          <div className="side-big">
            <span>BASE AMOUNT (1 GARMENT)</span>
            <b>₹ {money(totals.base)}</b>
            {inCurrency(totals.base) && <small>= {inCurrency(totals.base)} at {rate}</small>}
          </div>
          <div className="side-big plain">
            <span>TOTAL · {header.orderQty ? `${qty(header.orderQty)} PCS` : 'ORDER QTY NOT SET'}</span>
            <b>₹ {money(totals.total)}</b>
            {inCurrency(totals.total) && <small>{inCurrency(totals.total)}</small>}
          </div>
          {saved && (
            <div className="side-revs">
              <span className="side-label">REVISIONS</span>
              {saved.revisions.map(r => {
                const on = (viewing || saved.revision) === r.revision;
                return (
                  <button key={r.revision} type="button" className={`rev ${on ? 'on' : ''}`} onClick={() => viewRevision(r.revision)}>
                    <span className="rev-no">{r.revision}</span>
                    <span>{new Date(r.savedAt).toLocaleDateString('en-IN')} · {r.savedBy}{r.revision === saved.revision ? ' · latest' : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>
      {saved && !viewing && <p className="hint">Last saved by {saved.updatedBy} · {new Date(saved.updatedAt).toLocaleString('en-IN')}</p>}
    </div>
  );
}

// Lines of one section. Fabric shows every column; trims/packing a few less; the cost sections description, qty and rate.
function SectionGrid({ section, lines, lookups, readOnly, onChange, onCurrency, onRemove }) {
  const fabric = section === 'fabric';
  const material = MATERIAL.includes(section);
  const inp = (l, key, label, width, num = true) => (
    <input className={`ci ${num ? 'num' : ''}`} disabled={readOnly} inputMode={num ? 'decimal' : undefined} aria-label={label}
      value={l[key]} onChange={e => onChange(l.key, { [key]: e.target.value })} style={{ minWidth: width }} />
  );
  return (
    <table className="og sec-grid">
      <thead>
        <tr>
          <th>{material ? 'Item' : 'Description'} <span className="req">*</span></th>
          {fabric && <th>Nature</th>}
          {material && <th>UOM</th>}
          {fabric && <th title="Costed, but not ordered through BOM">Excl. mat.</th>}
          {fabric && <th className="num">Cut width</th>}
          <th className="num">{fabric ? 'Cut avg' : material ? 'Consumption' : 'Qty'}</th>
          {material && <th className="num">Wastage %</th>}
          {material && <th className="num">Avg qty</th>}
          {fabric && <th className="num">Greige</th>}
          {fabric && <th className="num">Process</th>}
          <th className="num">{fabric ? 'Ready rate' : 'Rate'}</th>
          <th>Curr.</th>
          <th className="num">Exch.</th>
          <th className="num">Amount ₹</th>
          <th className="c-act" aria-label="Delete" />
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => {
          const c = calc(section, l);
          return (
            <tr key={l.key}>
              <td>{material
                ? <div className="itm">{l.item}<small>{l.groupName || 'Typed item'}</small></div>
                : inp(l, 'description', `Description line ${i + 1}`, 260, false)}
              </td>
              {fabric && (
                <td><select className="ci" disabled={readOnly} aria-label="Item nature" value={l.itemNature} onChange={e => onChange(l.key, { itemNature: e.target.value })}>
                  <option value="">—</option>{NATURES.map(x => <option key={x}>{x}</option>)}
                </select></td>
              )}
              {material && <td>{inp(l, 'uom', 'UOM', 46, false)}</td>}
              {fabric && <td className="c-chk"><input type="checkbox" disabled={readOnly} aria-label="Exclude for material" checked={l.excludeMaterial} onChange={e => onChange(l.key, { excludeMaterial: e.target.checked })} /></td>}
              {fabric && <td>{inp(l, 'cutWidth', 'Cut width', 48)}</td>}
              <td>{inp(l, 'consumption', fabric ? 'Cut avg' : material ? 'Consumption' : 'Qty', 58)}</td>
              {material && <td>{inp(l, 'wastagePct', 'Wastage %', 48)}</td>}
              {material && <td className="num calc">{qty(c.avgQty)}</td>}
              {fabric && <td>{inp(l, 'greigeRate', 'Greige rate', 58)}</td>}
              {fabric && <td>{inp(l, 'processRate', 'Process rate', 58)}</td>}
              {fabric ? <td className="num calc">{money(c.rate)}</td> : <td>{inp(l, 'rate', 'Rate', 70)}</td>}
              <td><select className="ci" disabled={readOnly} aria-label="Buying currency" value={l.currencyId} onChange={e => onCurrency(l.key, e.target.value)}>
                {lookups.currencies.map(x => <option key={x.id} value={x.id}>{x.code}</option>)}
              </select></td>
              <td>{inp(l, 'exchangeRate', 'Exchange rate', 50)}</td>
              <td className="num"><b>{money(c.amount)}</b></td>
              <td className="c-act">{!readOnly && (
                <button type="button" className="del-btn" onClick={() => onRemove(l.key)} aria-label={`Delete line ${i + 1}`} title="Delete line">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                </button>)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
