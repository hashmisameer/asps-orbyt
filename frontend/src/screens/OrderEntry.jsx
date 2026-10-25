// Order entry (v2 – multi-line grid)
// Header: brand, product category, style, allowed deviation.
// Lines: one row per order no., with dispatch mode, buyer PO, colour, size range, size-wise qty and dates.
// After saving, only buyer PO no., size range and quantities can change.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import DateInput from '../components/DateInput.jsx';
import FindOrders from './FindOrders.jsx';

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');
function toInt(v) {
  const n = parseInt(String(v ?? '').replace(/,/g, ''), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

// A new line copies dispatch mode, colour and dates from the line before it
const blankLine = (prev) => ({
  key: newKey(), id: null, saved: false, dirty: true, orderNo: '',
  lineDate: today(), dispatchMode: prev?.dispatchMode || '', buyerPoNo: '', colourId: prev?.colourId || '',
  sizeRangeId: '', sizes: {}, manualTotal: '', exFactoryDate: prev?.exFactoryDate || '', fobDate: prev?.fobDate || ''
});

// Server line -> screen line
const fromServer = (l) => ({
  key: `s${l.id}`, id: l.id, saved: true, dirty: false, orderNo: l.orderNo,
  lineDate: l.lineDate, dispatchMode: l.dispatchMode, buyerPoNo: l.buyerPoNo || '', colourId: String(l.colourId),
  colourName: l.colourName, sizeRangeId: l.sizeRangeId ? String(l.sizeRangeId) : '',
  sizes: Object.fromEntries(Object.entries(l.sizes || {}).map(([k, v]) => [k, String(v)])),
  manualTotal: l.sizeRangeId ? '' : String(l.totalQty), exFactoryDate: l.exFactoryDate, fobDate: l.fobDate
});

const blankHeader = () => ({ brandId: '', productCategoryId: '', styleId: '', styleText: '', deviation: '2', remarks: '' });

export default function OrderEntry({ active, onNotice, session }) {
  // Functions and reports the owner gave this client (hidden when switched off)
  const has = (code) => Boolean(session?.permissions?.[code]);
  const [lookups, setLookups] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [order, setOrder] = useState(null);         // saved order from the server, or null for a new one
  const [header, setHeader] = useState(blankHeader);
  const [lines, setLines] = useState(() => [blankLine()]);
  const [previews, setPreviews] = useState([]);     // next order numbers for unsaved lines
  const [tried, setTried] = useState(false);
  const [problems, setProblems] = useState([]);
  const [serverError, setServerError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(null);   // line to put the cursor in after adding it

  useEffect(() => {
    api('/orders/lookups').then(setLookups).catch(e => setLoadError(e.message));
  }, []);

  // Put the cursor in the first box of a newly added line
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector(`[data-line="${focusKey}"] [data-first]`)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const ranges = useMemo(() => Object.fromEntries((lookups?.sizeRanges || []).map(r => [String(r.id), r])), [lookups]);
  const brandId = order ? String(order.brandId) : header.brandId;
  const unsavedCount = lines.filter(l => !l.saved).length;

  // Preview the next order numbers whenever brand or number of new lines changes
  useEffect(() => {
    if (!brandId || unsavedCount === 0) { setPreviews([]); return; }
    let stop = false;
    api(`/orders/next-numbers?brandId=${brandId}&count=${unsavedCount}`)
      .then(r => { if (!stop) setPreviews(r.numbers); })
      .catch(() => { if (!stop) setPreviews([]); });
    return () => { stop = true; };
  }, [brandId, unsavedCount]);

  const lineTotal = (l) => (l.sizeRangeId ? Object.values(l.sizes).reduce((a, v) => a + toInt(v), 0) : toInt(l.manualTotal));
  const grandTotal = lines.reduce((a, l) => a + lineTotal(l), 0);
  const deviation = order ? order.allowedDeviation : header.deviation;
  const maxAllowed = deviation === 'open' ? 'no limit (open)'
    : `${fmtNum(Math.ceil(grandTotal * (1 + Number(deviation) / 100)))} (+${deviation}%)`;
  const hasChanges = !order || lines.some(l => l.dirty);
  const isDirty = order ? lines.some(l => l.dirty) : (lines.some(l => l.dispatchMode || l.colourId || l.manualTotal || l.exFactoryDate) || !!header.brandId);

  // ---------- editing ----------
  const setLine = (key, patch) => {
    setMessage('');
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch, dirty: true } : l)));
  };
  const setSize = (key, size, value) => { setMessage(''); setLines(ls => ls.map(l => (l.key === key ? { ...l, sizes: { ...l.sizes, [size]: value }, dirty: true } : l))); };
  const setRange = (key, value) => setLine(key, { sizeRangeId: value, sizes: value ? Object.fromEntries(ranges[value].sizes.map(s => [s, ''])) : {} });
  // The new line is built from the latest lines, so a date just typed on the last line is copied too
  const addLine = () => {
    setMessage('');
    const key = newKey();
    // "Copy previous line" fills dates, dispatch mode and colour from the line above
    setLines(ls => [...ls, { ...blankLine(has('order.entry.copy_line') ? ls[ls.length - 1] : undefined), key }]);
    setFocusKey(key);
  };
  const removeLine = (key) => setLines(ls => ls.filter(l => l.key !== key));

  const setStyleText = (text) => {
    const match = (lookups?.styles || []).find(s => `${s.code} · ${s.name}` === text || s.code.toLowerCase() === text.trim().toLowerCase());
    setHeader(h => ({ ...h, styleText: text, styleId: match ? String(match.id) : '' }));
  };
  const stylesForBrand = (lookups?.styles || []).filter(s => !header.brandId || !s.brandId || String(s.brandId) === header.brandId);

  // ---------- checks before saving (the server checks again) ----------
  function check() {
    const list = [];
    const bad = {};
    if (!order) {
      const miss = [];
      if (!header.brandId) miss.push('brand');
      if (!header.productCategoryId) miss.push('product category');
      if (!header.styleId) miss.push('style');
      if (miss.length) list.push(`Header: ${miss.join(', ')}`);
    }
    if (lines.length === 0) list.push('Add at least one order line');
    lines.forEach((l, i) => {
      const miss = [];
      const b = {};
      if (!l.saved) {
        if (!l.lineDate) { miss.push('date'); b.lineDate = true; }
        if (!l.dispatchMode) { miss.push('dispatch mode'); b.dispatchMode = true; }
        if (!l.colourId) { miss.push('colour'); b.colourId = true; }
        if (!l.exFactoryDate) { miss.push('ex-factory'); b.exFactoryDate = true; }
        if (!l.fobDate) { miss.push('FOB'); b.fobDate = true; }
      }
      if (lineTotal(l) <= 0) { miss.push(l.sizeRangeId ? 'size qty' : 'total qty'); b.total = true; }
      if (l.exFactoryDate && l.fobDate && l.exFactoryDate > l.fobDate) { miss.push('ex-factory is after FOB'); b.exFactoryDate = true; b.fobDate = true; }
      if (miss.length) { list.push(`Line ${i + 1}: ${miss.join(', ')}`); bad[l.key] = b; }
    });
    return { list, bad };
  }
  const { list: liveProblems, bad } = check();
  const badOf = (l) => (tried ? bad[l.key] || {} : {});

  const toPayload = (l) => ({
    lineDate: l.lineDate, dispatchMode: l.dispatchMode, buyerPoNo: l.buyerPoNo, colourId: Number(l.colourId),
    sizeRangeId: l.sizeRangeId ? Number(l.sizeRangeId) : null,
    sizes: l.sizeRangeId ? Object.fromEntries(Object.entries(l.sizes).filter(([, v]) => v !== '').map(([k, v]) => [k, toInt(v)])) : {},
    totalQty: l.sizeRangeId ? 0 : toInt(l.manualTotal), exFactoryDate: l.exFactoryDate, fobDate: l.fobDate
  });

  function loadSaved(saved) {
    setOrder(saved);
    setLines(saved.lines.map(fromServer));
  }

  async function save() {
    if (saving) return;
    setTried(true);
    setServerError('');
    setMessage('');
    const { list } = check();
    setProblems(list);
    if (list.length) return;
    if (!hasChanges) { setMessage('Nothing to save.'); return; }

    setSaving(true);
    try {
      let saved;
      if (!order) {
        saved = await api('/orders', {
          method: 'POST',
          body: {
            brandId: Number(header.brandId), productCategoryId: Number(header.productCategoryId), styleId: Number(header.styleId),
            allowedDeviation: header.deviation, remarks: header.remarks, lines: lines.map(toPayload)
          }
        });
      } else {
        saved = order;
        for (const l of lines.filter(x => x.saved && x.dirty)) {
          const p = toPayload(l);
          saved = await api(`/orders/${order.id}/lines/${l.id}`, {
            method: 'PATCH',
            body: { buyerPoNo: p.buyerPoNo, sizeRangeId: p.sizeRangeId, sizes: p.sizes, ...(p.sizeRangeId ? {} : { totalQty: p.totalQty }) }
          });
        }
        const fresh = lines.filter(x => !x.saved);
        if (fresh.length) saved = await api(`/orders/${order.id}/lines`, { method: 'POST', body: { lines: fresh.map(toPayload) } });
      }
      loadSaved(saved);
      setTried(false);
      setProblems([]);
      setMessage(`${plural(saved.lines.length, 'order line')} saved. PO no. and size-wise qty can still be filled later.`);
    } catch (e) {
      setServerError(e.message);
      if (order) { try { loadSaved(await api(`/orders/${order.id}`)); } catch { /* keep screen as is */ } }
    } finally {
      setSaving(false);
    }
  }

  function startNew() {
    if (isDirty && !window.confirm('Discard the changes on this screen and start a new order?')) return;
    setOrder(null); setHeader(blankHeader()); setLines([blankLine()]);
    setTried(false); setProblems([]); setServerError(''); setMessage('');
  }

  async function openOrder(id) {
    if (isDirty && !window.confirm('Discard the changes on this screen and open the selected order?')) return;
    try {
      const saved = await api(`/orders/${id}`);
      loadSaved(saved);
      setHeader(blankHeader());
      setTried(false); setProblems([]); setServerError(''); setMessage('');
    } catch (e) {
      setServerError(e.message);
    }
    setFindOpen(false);
  }

  // Keyboard: F2 = new, F3 = search, Ctrl+S = save (only while this tab is on screen)
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); startNew(); }
      if (e.key === 'F3') { e.preventDefault(); setFindOpen(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loadError) return <div className="alert alert-error" role="alert">Couldn't load the order screen: {loadError}</div>;
  if (!lookups) return <div className="hint" style={{ padding: 8 }}>Loading order screen…</div>;

  const status = !order ? ['DRAFT · NOT SAVED', 'chip-grey'] : (hasChanges ? ['SAVED · CHANGES PENDING', 'chip-amber'] : ['SAVED', 'chip-teal']);
  const brandName = (id) => lookups.brands.find(b => String(b.id) === String(id))?.name || '';
  const categoryName = (id) => lookups.productCategories.find(c => String(c.id) === String(id))?.name || '';
  let previewIndex = 0;

  return (
    <div className="screen">
      {findOpen && <FindOrders lookups={lookups} onOpen={openOrder} onClose={() => setFindOpen(false)} />}
      <div className="screen-head">
        <h1 className="screen-title">Order entry</h1>
        <span className={`chip ${status[1]}`}>{status[0]}</span>
        <span className="hint" style={{ marginLeft: 'auto' }}>Fields marked <span className="req">*</span> are required</span>
      </div>

      <div className="toolbar">
        <button type="button" className="tb" onClick={startNew}>+ New (F2)</button>
        <button type="button" className="tb" onClick={() => setFindOpen(true)}>Search (F3)</button>
        <button type="button" className="tb tb-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save (Ctrl+S)'}</button>
        {(has('order.entry.print') || has('order.entry.import_excel')) && <span className="tb-sep" aria-hidden="true" />}
        {has('order.entry.print') && <button type="button" className="tb tb-soon" title="Coming in a later phase" onClick={() => onNotice('Print is coming in a later phase.')}>Print</button>}
        {has('order.entry.import_excel') && <button type="button" className="tb tb-soon" title="Coming in a later phase" onClick={() => onNotice('Excel import is coming in a later phase.')}>Import lines from Excel</button>}
        {has('order.entry.audit') && <button type="button" className="tb tb-soon" title="Coming in a later phase" style={{ marginLeft: 'auto' }} onClick={() => onNotice('Audit trail screen is coming in a later phase.')}>Audit trail</button>}
      </div>

      {message && <div className="alert alert-success" role="status">{message}</div>}
      {serverError && <div className="alert alert-error" role="alert">{serverError}</div>}
      {tried && liveProblems.length > 0 && (
        <div className="alert alert-error" role="alert">Fix before saving · {liveProblems.join(' · ')}</div>
      )}

      <section className="panel">
        <div className="panel-head">ORDER HEADER</div>
        <div className="form-grid">
          <label className="f" title="The brand initials go into each order no."><span>Brand <span className="req">*</span></span>
            {order ? <span className="ro">{order.brandName} ({order.brandInitials})</span> : (
              <select className={`inp ${tried && !header.brandId ? 'bad' : ''}`} value={header.brandId} onChange={e => setHeader(h => ({ ...h, brandId: e.target.value }))}>
                <option value="">Select brand</option>
                {lookups.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </label>
          <label className="f"><span>Product category <span className="req">*</span></span>
            {order ? <span className="ro">{categoryName(order.productCategoryId)}</span> : (
              <select className={`inp ${tried && !header.productCategoryId ? 'bad' : ''}`} value={header.productCategoryId} onChange={e => setHeader(h => ({ ...h, productCategoryId: e.target.value }))}>
                <option value="">Select category</option>
                {lookups.productCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </label>
          <label className="f span2" title="Styles created on the Style screen show here"><span>Style <span className="req">*</span></span>
            {order ? <span className="ro">{order.styleCode} · {order.styleName}</span> : (
              <>
                <input className={`inp ${tried && !header.styleId ? 'bad' : ''}`} list="order-styles" placeholder="Type to search style"
                  value={header.styleText} onChange={e => setStyleText(e.target.value)} />
                <datalist id="order-styles">
                  {stylesForBrand.map(s => <option key={s.id} value={`${s.code} · ${s.name}`} />)}
                </datalist>
              </>
            )}
          </label>
          <label className="f"><span>Allowed deviation <span className="req">*</span></span>
            {order ? <span className="ro">{order.allowedDeviation === 'open' ? 'Open (no limit)' : `${order.allowedDeviation}%`}</span> : (
              <select className="inp" value={header.deviation} onChange={e => setHeader(h => ({ ...h, deviation: e.target.value }))}>
                <option value="2">2%</option>
                <option value="5">5%</option>
                <option value="open">Open (no limit)</option>
              </select>
            )}
          </label>
          <label className="f" title="Sum of all order lines, worked out automatically"><span>Total order qty</span>
            <span className="ro">{fmtNum(grandTotal)} pcs</span>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head panel-head-row">
          <span>ORDER LINES <span className="muted-normal">· {plural(lines.length, 'line')}</span></span>
          <span className="muted-normal">Click + to add a line. Pick a size range to get size boxes in that line.</span>
        </div>
        <div className="grid-scroll">
          <table className="og">
            <thead>
              <tr>
                <th className="c-act"><button type="button" className="add-btn" onClick={addLine} aria-label="Add order line" title="Add order line">+</button></th>
                <th style={{ width: 128 }}>Date</th>
                <th style={{ width: 170 }}>Order no.<span className="sub">auto</span></th>
                <th style={{ width: 110 }}>Dispatch mode <span className="req">*</span></th>
                <th style={{ width: 140 }}>Buyer PO no.<span className="sub">editable after save</span></th>
                <th style={{ width: 120 }}>Colour <span className="req">*</span></th>
                <th style={{ width: 140 }}>Size range<span className="sub">can pick after save</span></th>
                <th style={{ width: '40%', minWidth: 120 }}>Size-wise qty</th>
                <th style={{ width: 96 }} className="num">Total qty <span className="req">*</span></th>
                <th style={{ width: 128 }}>Ex-factory <span className="req">*</span></th>
                <th style={{ width: 128 }}>FOB date <span className="req">*</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={11} className="empty-row">No order lines yet. Click + to add the first line.</td></tr>
              )}
              {lines.map((l, i) => {
                const b = badOf(l);
                const range = l.sizeRangeId ? ranges[l.sizeRangeId] : null;
                const preview = l.saved ? null : previews[previewIndex++];
                return (
                  <tr key={l.key} data-line={l.key}>
                    <td className="c-act">
                      {l.saved
                        ? <span className="lock" title="Saved line" aria-label="Saved line">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
                          </span>
                        : <button type="button" className="del-btn" onClick={() => removeLine(l.key)} aria-label={`Delete line ${i + 1}`} title="Delete line">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                          </button>}
                    </td>
                    <td>{l.saved ? fmtDate(l.lineDate)
                      : <DateInput className={b.lineDate ? 'bad' : ''} ariaLabel={`Date line ${i + 1}`} value={l.lineDate} onChange={v => setLine(l.key, { lineDate: v })} />}</td>
                    <td className="order-no">{l.saved ? l.orderNo
                      : <span className="preview">{preview || (brandId ? '…' : 'Pick a brand')} {preview && <small>(on save)</small>}</span>}</td>
                    <td>{l.saved ? (l.dispatchMode === 'air' ? 'By air' : 'By sea')
                      : <select data-first className={`ci ${b.dispatchMode ? 'bad' : ''}`} aria-label={`Dispatch mode line ${i + 1}`} value={l.dispatchMode} onChange={e => setLine(l.key, { dispatchMode: e.target.value })}>
                          <option value="">Select</option><option value="sea">By sea</option><option value="air">By air</option>
                        </select>}</td>
                    <td><input className="ci" aria-label={`Buyer PO no. line ${i + 1}`} placeholder="Add later" value={l.buyerPoNo} onChange={e => setLine(l.key, { buyerPoNo: e.target.value })} /></td>
                    <td>{l.saved ? l.colourName
                      : <select className={`ci ${b.colourId ? 'bad' : ''}`} aria-label={`Colour line ${i + 1}`} value={l.colourId} onChange={e => setLine(l.key, { colourId: e.target.value })}>
                          <option value="">Select</option>
                          {lookups.colours.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>}</td>
                    <td>
                      <select className="ci" aria-label={`Size range line ${i + 1}`} value={l.sizeRangeId} onChange={e => setRange(l.key, e.target.value)}>
                        <option value="">None</option>
                        {lookups.sizeRanges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </td>
                    <td>
                      {range ? (
                        <div className="sizes">
                          {range.sizes.map(s => (
                            <label key={s} className="sz">
                              <span className="sz-l">{s}</span>
                              <input className={`sz-i ${b.total ? 'bad' : ''}`} inputMode="numeric" aria-label={`Line ${i + 1} size ${s}`}
                                value={l.sizes[s] ?? ''} onChange={e => setSize(l.key, s, e.target.value.replace(/[^\d]/g, ''))} />
                            </label>
                          ))}
                        </div>
                      ) : <span className="hint">—</span>}
                    </td>
                    <td className="num">
                      {range
                        ? <><b>{fmtNum(lineTotal(l))}</b><span className="tag">auto</span></>
                        : <input className={`ci num ${b.total ? 'bad' : ''}`} inputMode="numeric" aria-label={`Total qty line ${i + 1}`} value={l.manualTotal}
                            onChange={e => setLine(l.key, { manualTotal: e.target.value.replace(/[^\d]/g, '') })} />}
                    </td>
                    <td>{l.saved ? fmtDate(l.exFactoryDate)
                      : <DateInput className={b.exFactoryDate ? 'bad' : ''} ariaLabel={`Ex-factory line ${i + 1}`} value={l.exFactoryDate} onChange={v => setLine(l.key, { exFactoryDate: v })} />}</td>
                    <td>{l.saved ? fmtDate(l.fobDate)
                      : <DateInput className={b.fobDate ? 'bad' : ''} ariaLabel={`FOB date line ${i + 1}`} value={l.fobDate} onChange={v => setLine(l.key, { fobDate: v })}
                          title="Press Enter on the last line to add a new line"
                          onKeyDown={e => { if (e.key === 'Enter' && i === lines.length - 1) { e.preventDefault(); setTimeout(addLine, 0); } }} />}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8}>Total · {plural(lines.length, 'line')}{grandTotal > 0 && ` · max allowed ${maxAllowed}`}</td>
                <td className="num"><b>{fmtNum(grandTotal)}</b></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="audit-line">
        {order
          ? <>Created by {order.createdBy} · {new Date(order.createdAt).toLocaleString('en-IN')} · Brand {brandName(order.brandId)}</>
          : 'Not saved yet'}
      </div>
    </div>
  );
}
