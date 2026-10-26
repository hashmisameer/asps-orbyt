// Costing screen: cost of one garment for a style or an order line.
//   Opens on All costings (list). Click a costing for its form:
//   buttons and stages (Initial › Final › Actual), smart buttons (order, BOM, revisions), costing details,
//   one card per cost section with the lines of the picked section, and notes / changes on the right.
// Amounts are worked out here as you type and worked out again by the server on save.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import DateInput from '../components/DateInput.jsx';
import ItemPicker from './ItemPicker.jsx';
import RecordList from '../components/RecordList.jsx';
import Chatter from '../components/Chatter.jsx';
import { ControlPanel, StatusBar, SmartButtons, Field, AllButton, SheetTabs } from '../components/RecordBar.jsx';

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

export default function Costing({ active, session, onGo, request }) {
  const allowed = session?.permissions?.['order.costing'] || [];
  const canApprove = allowed.includes('approve');
  // Functions and reports the owner gave this client (hidden when switched off)
  const has = (code) => Boolean(session?.permissions?.[code]);
  const canCreateItem = (session?.permissions?.['masters.item'] || []).includes('create');
  const [lookups, setLookups] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(null);
  const [header, setHeader] = useState(blankHeader());
  const [lines, setLines] = useState([]);
  const [tab, setTab] = useState('fabric');             // section whose lines are shown
  const [picker, setPicker] = useState(null);            // section whose item picker is open
  const [mode, setMode] = useState('list');               // 'list' = All costings, 'form' = one costing
  const [listState, setListState] = useState({ search: '', filter: '' });
  const [listIds, setListIds] = useState([]);
  const [lastOpened, setLastOpened] = useState(null);
  const [sheetTab, setSheetTab] = useState('cost');        // 'cost' sheet or 'rev' revisions
  const [flow, setFlow] = useState(null);
  const [viewing, setViewing] = useState(null);          // an older revision shown read-only
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { api('/costing/lookups').then(setLookups).catch(e => setLoadError(e.message)); }, []);

  // Flow strip when the costing is for an order line (reloads after save)
  useEffect(() => {
    if (!header.orderLineId) { setFlow(null); return undefined; }
    let stop = false;
    api(`/links/order-line/${header.orderLineId}`).then(f => { if (!stop) setFlow(f); }).catch(() => { if (!stop) setFlow(null); });
    return () => { stop = true; };
  }, [header.orderLineId, saved]);

  // Opened from another screen: a costing, or a new costing for an order line
  useEffect(() => {
    if (!request || !lookups) return;
    if (request.costingId) openCosting(request.costingId);
    else if (request.newForLine) { startNew(); setTimeout(() => pickOrder(String(request.newForLine)), 0); }
  }, [request?.n, lookups]); // eslint-disable-line react-hooks/exhaustive-deps
  const inr = lookups?.currencies.find(c => c.code === 'INR');

  const readOnly = !!viewing;
  const canSave = !readOnly && (saved ? allowed.includes('edit') : allowed.includes('create'));

  const setH = (patch) => { setMessage(''); setDirty(true); setHeader(h => ({ ...h, ...patch })); };
  const setLine = (key, patch) => { setMessage(''); setDirty(true); setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); };
  const removeLine = (key) => { setDirty(true); setLines(ls => ls.filter(l => l.key !== key)); };
  function addLines(section, list) {
    setDirty(true); setMessage('');
    setLines(ls => [...ls, ...list.map(from => blankLine(section, inr, from))]);
    setTab(section);
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
    setTab(prev => (c.lines.some(l => l.section === prev) ? prev : (c.lines[0]?.section || 'fabric')));
    if (!revisionView) setSaved(c);
    setViewing(revisionView);
    setDirty(false);
  }

  function startNew() {
    if (dirty && !window.confirm('Discard the changes on this screen and start a new costing?')) return;
    setSaved(null); setViewing(null); setHeader(blankHeader()); setLines([]); setTab('fabric'); setSheetTab('cost');
    setError(''); setMessage(''); setDirty(false); setMode('form');
  }
  function backToList() {
    if (dirty && !window.confirm('Discard the changes on this screen and go back to the list?')) return;
    setLastOpened(saved?.id || null);
    setSaved(null); setViewing(null); setHeader(blankHeader()); setLines([]); setTab('fabric');
    setError(''); setMessage(''); setDirty(false); setMode('list');
  }

  async function openCosting(id) {
    if (dirty && !window.confirm('Discard the changes on this screen and open the selected costing?')) return;
    try {
      loadCosting(await api(`/costing/${id}`));
      setSheetTab('cost'); setMode('form');
      setError(''); setMessage('');
    } catch (e) { setError(e.message); }
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
      setDirty(false); setSaved(null); setViewing(null); setHeader(blankHeader()); setLines([]); setTab('fabric');
      setLastOpened(null); setMode('list');
      setError(''); setMessage(`Costing ${no} deleted.`);
    } catch (e) { setError(e.message); }
  }

  // Form keys: F2 new, F3 back to All costings, Ctrl+S save (only while this tab is on screen and no panel is open)
  useEffect(() => {
    if (!active || picker || mode !== 'form') return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); startNew(); }
      if (e.key === 'F3') { e.preventDefault(); backToList(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loadError) return <div className="screen"><div className="alert alert-error">{loadError}</div></div>;
  if (!lookups) return <div className="screen"><p className="hint">Loading costing…</p></div>;

  const buyer = lookups.buyers.find(b => String(b.id) === header.buyerId);
  const style = lookups.styles.find(x => String(x.id) === header.styleId);
  const orderLine = lookups.orderLines.find(o => String(o.id) === header.orderLineId);


  // Which types can be picked: Final -> only Actual; Actual stays Actual; Final needs Approve permission
  const typeAllowed = (t) => {
    if (readOnly) return false;
    if (saved?.type === 'final' && t === 'initial') return false;
    if (saved?.type === 'actual' && t !== 'actual') return false;
    if (t === 'final' && !canApprove) return false;
    return true;
  };
  const sel = (key, list, label, opts = {}) => (
    <select className="inp" aria-label={label} disabled={readOnly || opts.disabled} value={header[key]} onChange={e => (opts.onPick ? opts.onPick(e.target.value) : setH({ [key]: e.target.value }))}>
      <option value="">{opts.placeholder || `Select ${label}`}</option>
      {list.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );

  if (mode === 'list') {
    return (
      <>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {message && <div className="alert alert-success" role="status">{message}</div>}
        <RecordList title="Costings" active={active} state={listState} setState={setListState} highlightId={lastOpened}
          onNew={allowed.includes('create') ? startNew : null}
          onOpen={(id, ids) => { setListIds(ids); openCosting(id); }}
          placeholder="Search costing no., buyer, style, order no. or description…"
          emptyText="No costings yet. Click New to make the first one."
          filters={Object.entries(TYPE_NAMES).map(([id, label]) => ({ id, label: `${label} costings` }))}
          fetchRows={({ search, filter }) => api(`/costing?${new URLSearchParams(Object.entries({ search, type: filter }).filter(([, v]) => v))}`)}
          note="Latest 100 shown. Search to find older costings."
          columns={[
            { label: 'Costing no.', cls: 'order-no', cell: r => r.costingNo },
            { label: 'Rev.', num: true, cell: r => r.revision },
            { label: 'Type', cell: r => <span className={`o-pill ${r.type === 'final' ? 'ok' : r.type === 'actual' ? 'wr' : 'no'}`}>{TYPE_NAMES[r.type]}</span> },
            { label: 'Date', cell: r => fmtDate(r.date) },
            { label: 'Buyer', cell: r => r.buyer },
            { label: 'Style', cell: r => r.styleCode },
            { label: 'Order no.', cell: r => r.orderNo || <span className="muted">Style costing</span> },
            { label: 'Qty', num: true, cell: r => qty(r.orderQty) },
            { label: 'Base ₹', num: true, cell: r => money(r.baseAmount) },
            { label: 'Base (currency)', num: true, cell: r => `${r.currency} ${Number(r.baseInCurrency || 0).toFixed(2)}` }
          ]} />
      </>
    );
  }

  const sheet = SECTIONS.find(x => x.key === tab);
  const secLines = lines.filter(l => l.section === tab);
  const material = MATERIAL.includes(tab);
  const at = saved ? listIds.indexOf(saved.id) : -1;
  const title = saved ? saved.costingNo : 'New costing';
  const order = ['initial', 'final', 'actual'];
  const steps = order.map((t, i) => ({ label: TYPE_NAMES[t], state: i < order.indexOf(header.type) ? 'done' : t === header.type ? 'on' : '' }));
  const inCurrency = currency && currency.code !== 'INR' && rate > 0 ? ` · ${currency.code} ${(totals.base / rate).toFixed(2)}` : '';
  const smart = [
    ...(header.orderLineId ? [{ icon: '▤', value: orderLine?.orderNo?.split('/').pop() || '—', label: 'Order', onClick: () => flow && onGo('orderEntry', { orderId: flow.line.orderId }) }] : []),
    ...(header.orderLineId ? [{ icon: '≡', value: flow?.bom ? (flow.bom.status === 'approved' ? 'Approved' : 'Draft') : 'Not made', label: 'BOM',
      tone: flow?.bom?.status === 'approved' ? 'ok' : 'warn', onClick: () => onGo('bom', { orderLineId: Number(header.orderLineId) }) }] : []),
    ...(saved && has('order.costing.revisions') ? [{ icon: '↺', value: saved.revisions.length, label: saved.revisions.length === 1 ? 'Revision' : 'Revisions', onClick: () => setSheetTab('rev') }] : []),
    { icon: '₹', value: money(totals.base), label: 'Base per pc' }
  ];

  return (
    <div className="o-page">
      {picker && <ItemPicker section={picker} canCreateItem={canCreateItem} onClose={() => setPicker(null)} onAdd={(list) => { addLines(picker, list); setPicker(null); }} />}
      <ControlPanel crumbs={[{ label: 'Costings', onClick: backToList }, { label: viewing ? `${title} · revision ${viewing}` : title }]}
        pager={at >= 0 ? { index: at, total: listIds.length, onPrev: () => openCosting(listIds[at - 1]), onNext: () => openCosting(listIds[at + 1]) } : null}>
        <AllButton label="All costings" onClick={backToList} />
        {saved && allowed.includes('create') && <button type="button" className="tb" onClick={startNew}>New <kbd className="tb-kbd">F2</kbd></button>}
        {dirty && saved && <span className="chip chip-amber">unsaved changes</span>}
      </ControlPanel>

      <div className="o-form">
        <div className="o-main">
          <StatusBar steps={steps}>
            <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
            {saved && header.orderLineId && header.type !== 'initial' && !viewing && (
              <button type="button" className="tb tb-line" onClick={() => onGo('bom', { orderLineId: Number(header.orderLineId) })}>{flow?.bom ? 'Open BOM' : 'Create BOM'}</button>
            )}
            {has('order.costing.print') && <button type="button" className="tb" title="Coming in a later phase">Print</button>}
            {has('order.costing.delete') && saved && (
              <button type="button" className="tb" onClick={remove} disabled={viewing || saved.type === 'final' || !allowed.includes('edit')}
                title={saved.type === 'final' ? 'A Final costing can\'t be deleted. Save it as Actual first.' : 'Delete this costing'}>Delete</button>
            )}
          </StatusBar>

          {viewing && (
            <div className="alert alert-warn" role="status">
              You are looking at revision {viewing} (read only). <button type="button" className="link-btn" onClick={() => viewRevision(saved.revision)}>Back to the latest revision</button>
            </div>
          )}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && (
            <div className="alert alert-success o-saved" role="status">
              <span>{message}</span>
              {saved && <button type="button" className="tb" onClick={backToList}>See it in All costings</button>}
            </div>
          )}

          <section className="o-sheet">
            <SmartButtons items={smart} />
            <div className="o-title"><span>{TYPE_NAMES[header.type]} costing</span><h1>{title}</h1></div>
            <div className="o-groups">
              <div>
                <Field label="Costing type" req title="Initial: first costing. Final: shows in BOM (needs Approve). Actual: a closed Final costing; only Actual can be deleted.">
                  <select aria-label="Costing type" className="inp" disabled={readOnly} value={header.type} onChange={e => setH({ type: e.target.value })}>
                    {order.map(t => (
                      <option key={t} value={t} disabled={!typeAllowed(t) && header.type !== t}>
                        {TYPE_NAMES[t]} costing{t === 'final' && !canApprove ? ' (needs Approve)' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Buyer" req>{sel('buyerId', lookups.buyers.map(b => ({ id: b.id, label: b.name })), 'buyer')}</Field>
                <Field label="Order no." title="Optional. Picking an order fills style, colour, size range, qty, ship mode and delivery date">
                  {sel('orderLineId', lookups.orderLines.map(o => ({ id: o.id, label: o.orderNo })), 'order', { onPick: pickOrder, placeholder: 'No order (style costing)' })}
                </Field>
                <Field label="Style no." req>{sel('styleId', lookups.styles.map(x => ({ id: x.id, label: `${x.code} · ${x.name}` })), 'style', { disabled: !!header.orderLineId })}</Field>
                <Field label="Colour">{sel('colourId', lookups.colours.map(c => ({ id: c.id, label: c.name })), 'colour')}</Field>
                <Field label="Size range">{sel('sizeRangeId', lookups.sizeRanges.map(x => ({ id: x.id, label: x.name })), 'size range')}</Field>
                <Field label="Order qty" req title={header.orderLineId ? 'Comes from the order' : 'Pieces this costing is for'}>
                  {header.orderLineId || readOnly ? <span>{header.orderQty ? qty(header.orderQty) : '—'} pcs</span>
                    : <input aria-label="Order qty" className="inp" inputMode="numeric" value={header.orderQty} onChange={e => setH({ orderQty: e.target.value.replace(/[^\d]/g, '') })} />}
                </Field>
              </div>
              <div>
                <Field label="Ship mode" req>
                  <select aria-label="Ship mode" className="inp" disabled={readOnly} value={header.shipMode} onChange={e => setH({ shipMode: e.target.value })}>
                    <option value="">Select</option><option value="sea">By sea</option><option value="air">By air</option>
                  </select>
                </Field>
                <Field label="Delivery date">
                  {readOnly ? fmtDate(header.deliveryDate) : <DateInput ariaLabel="Delivery date" value={header.deliveryDate} onChange={v => setH({ deliveryDate: v })} />}
                </Field>
                <Field label="Currency" req title="Currency the buyer pays in">
                  {sel('currencyId', lookups.currencies.map(c => ({ id: c.id, label: `${c.code} · ${c.name}` })), 'currency', { onPick: pickCurrency })}
                </Field>
                <Field label="Conversion rate" req title="1 unit of the currency in rupees">
                  <input aria-label="Conversion rate" className="inp" inputMode="decimal" disabled={readOnly} value={header.conversionRate} onChange={e => setH({ conversionRate: e.target.value })} />
                </Field>
                <Field label="Season / Year">
                  <div className="pair">
                    {sel('seasonId', lookups.seasons.map(x => ({ id: x.id, label: x.name })), 'season', { placeholder: 'Season' })}
                    {sel('year', lookups.years.map(y => ({ id: y, label: String(y) })), 'year', { placeholder: 'Year' })}
                  </div>
                </Field>
                <Field label="Base amount (1 pc)" title="Cost of one garment, worked out from all sections"><b>₹ {money(totals.base)}</b>{inCurrency}</Field>
                <Field label="Total amount" title="Base amount × order qty"><b>₹ {money(totals.total)}</b></Field>
              </div>
            </div>
            <Field label="Description" wide>
              <input aria-label="Description" className="inp" disabled={readOnly} maxLength={500} value={header.description} onChange={e => setH({ description: e.target.value })} placeholder="e.g. First costing as per tech pack" />
            </Field>

            <SheetTabs value={sheetTab} onChange={setSheetTab} tabs={[
              ['cost', `Cost sheet (${lines.length} line${lines.length === 1 ? '' : 's'})`],
              ...(saved && has('order.costing.revisions') ? [['rev', `Revisions (${saved.revisions.length})`]] : [])
            ]} />

            {sheetTab === 'cost' && (
              <>
                <div className="cost-cards o-cards" role="tablist" aria-label="Cost sections">
                  {SECTIONS.map(x => {
                    const count = lines.filter(l => l.section === x.key).length;
                    const mat = MATERIAL.includes(x.key);
                    const share = x.key !== 'other_receivable' && totals.gross > 0 ? Math.round((totals.secs[x.key] / totals.gross) * 100) : null;
                    return (
                      <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`cost-card ${tab === x.key ? 'on' : ''}`}
                        style={{ '--c': x.colour }} onClick={() => setTab(x.key)}>
                        <span>{x.name}</span>
                        <b>{x.key === 'other_receivable' ? '− ' : ''}₹{money(totals.secs[x.key])}{share !== null && count ? <em>{share}%</em> : null}</b>
                        <small>
                          {count ? `${count} ${mat ? 'item' : 'line'}${count === 1 ? '' : 's'}` : mat ? 'no items' : 'no lines'}
                          {x.key === 'other_receivable' ? ' · taken off' : ''}
                        </small>
                      </button>
                    );
                  })}
                </div>
                <div className="cost-lines-head o-lines-head">
                  <b>{sheet.name}</b>
                  <span className="hint">
                    {secLines.length} {material ? 'item' : 'line'}{secLines.length === 1 ? '' : 's'} · ₹ {money(totals.secs[tab])} per garment
                    {tab === 'other_receivable' ? ' · taken off the base amount' : ''}
                  </span>
                  {!readOnly && (
                    <button type="button" className="tb tb-line" style={{ marginLeft: 'auto' }}
                      onClick={() => (material ? setPicker(tab) : addLines(tab, [{}]))}>{material ? '+ Add items' : '+ Add line'}</button>
                  )}
                </div>
                <div className="grid-scroll">
                  {secLines.length === 0
                    ? <p className="empty-row">{material ? `No ${sheet.name.toLowerCase()} items yet. Click "+ Add items".` : 'No lines yet. Click "+ Add line".'}</p>
                    : <SectionGrid section={tab} lines={secLines} lookups={lookups} readOnly={readOnly} onChange={setLine} onCurrency={pickLineCurrency} onRemove={removeLine} />}
                </div>
              </>
            )}

            {sheetTab === 'rev' && saved && (
              <table className="og o-flow-table">
                <thead><tr><th>Revision</th><th>Saved on</th><th>Saved by</th><th /></tr></thead>
                <tbody>
                  {saved.revisions.map(r => (
                    <tr key={r.revision} className={(viewing || saved.revision) === r.revision ? 'o-hl' : ''}>
                      <td><b>Revision {r.revision}</b>{r.revision === saved.revision && <span className="o-pill ok" style={{ marginLeft: 6 }}>Latest</span>}</td>
                      <td>{new Date(r.savedAt).toLocaleString('en-IN')}</td>
                      <td>{r.savedBy}</td>
                      <td>{(viewing || saved.revision) === r.revision
                        ? <span className="muted">On screen</span>
                        : <button type="button" className="o-link" onClick={() => { viewRevision(r.revision); setSheetTab('cost'); }}>Look at it</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
        <Chatter entity="costing" entityId={saved?.id} refreshKey={saved} />
      </div>
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
