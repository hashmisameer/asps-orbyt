// BOM screen: the material one order line needs, split by the process it is issued to
// (Cutting, Stitching, Finishing). Each item sits in its own process, set on the item master.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import BomSearch from './BomSearch.jsx';
import BomItemPicker from './BomItemPicker.jsx';

const COLOURS = ['#0F766E', '#2563EB', '#D97706', '#7C3AED', '#DB2777', '#0891B2'];
let keySeq = 0;
const newKey = () => `b${++keySeq}`;
const n = (v) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const r4 = (x) => Math.round(x * 10000) / 10000;
const money = (x) => n(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (x) => n(x).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');
const str = (v) => (v === null || v === undefined ? '' : String(v));

// Same sums as the server: consumption + excess, and quantity for the whole order rounded up
function calc(l, orderQty) {
  const totalAvg = r4(n(l.consumption) * (1 + n(l.excessPct) / 100));
  const required = Math.ceil(Math.round(totalAvg * orderQty * 1e6) / 1e6);
  return { totalAvg, required, amount: required * n(l.budgetedRate) };
}

const toLine = (l) => ({
  key: newKey(), itemId: l.itemId, item: l.item, groupName: l.groupName || '', processId: String(l.processId), uom: l.uom || '',
  consumption: str(l.consumption), excessPct: str(l.excessPct), costingRate: l.costingRate === '' ? null : l.costingRate ?? null,
  budgetedRate: str(l.budgetedRate), supplier: l.supplier || '', leadDays: str(l.leadDays), fromBuyer: !!l.fromBuyer
});

export default function Bom({ active, session }) {
  const allowed = session?.permissions?.['order.bom'] || [];
  // Functions and reports the owner gave this client (hidden when switched off)
  const has = (code) => Boolean(session?.permissions?.[code]);
  const [processes, setProcesses] = useState([]);
  const [data, setData] = useState(null);           // { order, finalCosting, bom }
  const [lines, setLines] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [tab, setTab] = useState(null);             // process id shown in the grid
  const [findOpen, setFindOpen] = useState(false);
  const [picker, setPicker] = useState(null);       // process object, or 'all'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api('/bom/processes').then(p => { setProcesses(p); setTab(String(p[0]?.id || '')); }).catch(e => setError(e.message));
  }, []);

  const approved = data?.bom?.status === 'approved';
  const readOnly = !data || approved;
  const canSave = !readOnly && (data.bom ? allowed.includes('edit') : allowed.includes('create'));
  const orderQty = data?.order.qty || 0;
  const colourOf = (pid) => COLOURS[processes.findIndex(p => String(p.id) === String(pid)) % COLOURS.length];

  const setLine = (key, patch) => { setMessage(''); setDirty(true); setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); };
  const removeLine = (key) => { setDirty(true); setLines(ls => ls.filter(l => l.key !== key)); };
  function addLines(list) {
    const have = new Set(lines.map(l => l.itemId));
    const fresh = list.filter(l => !have.has(l.itemId)).map(toLine);
    if (!fresh.length) return;
    setDirty(true); setMessage('');
    setLines(ls => [...ls, ...fresh]);
    setTab(fresh[0].processId);
  }

  const totals = useMemo(() => {
    const per = {};
    let budget = 0;
    for (const l of lines) {
      const c = calc(l, orderQty);
      per[l.processId] = per[l.processId] || { count: 0, amount: 0 };
      per[l.processId].count += 1;
      per[l.processId].amount += c.amount;
      budget += c.amount;
    }
    return { per, budget };
  }, [lines, orderQty]);

  // ---------- load / save ----------
  function load(d) {
    setData(d);
    setLines((d.bom?.lines || []).map(toLine));
    setRemarks(d.bom?.remarks || '');
    setDirty(false);
  }

  async function openOrder(orderLineId) {
    if (dirty && !window.confirm('Discard the changes on this screen and open another order?')) return;
    try {
      load(await api(`/bom/order/${orderLineId}`));
      setFindOpen(false); setError(''); setMessage('');
    } catch (e) { setError(e.message); setFindOpen(false); }
  }

  async function pullFromCosting() {
    setError(''); setMessage('');
    try {
      const r = await api(`/bom/order/${data.order.orderLineId}/from-costing`);
      const have = new Set(lines.map(l => l.itemId));
      const fresh = r.lines.filter(l => !have.has(l.itemId));
      addLines(fresh);
      const parts = [`${fresh.length} item${fresh.length === 1 ? '' : 's'} added from costing ${r.costing.costingNo}`];
      if (r.lines.length > fresh.length) parts.push(`${r.lines.length - fresh.length} already in the BOM`);
      if (r.skipped.length) parts.push(`not added: ${r.skipped.join('; ')}`);
      setMessage(`${parts.join(' · ')}.`);
    } catch (e) { setError(e.message); }
  }

  async function save() {
    if (!canSave || busy) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const d = await api(`/bom/order/${data.order.orderLineId}`, { method: 'PUT', body: { remarks, lines } });
      load(d);
      setMessage(`BOM for ${d.order.orderNo} saved.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function changeStatus(action) {
    if (dirty) { setError('Save your changes first.'); return; }
    setError(''); setMessage('');
    try {
      const d = await api(`/bom/order/${data.order.orderLineId}/${action}`, { method: 'POST' });
      load(d);
      setMessage(action === 'approve' ? 'BOM approved. It is now locked; Reopen it to make changes.' : 'BOM reopened for changes.');
    } catch (e) { setError(e.message); }
  }

  useEffect(() => {
    if (!active || picker) return undefined;
    const onKey = (e) => {
      if (e.key === 'F3') { e.preventDefault(); setFindOpen(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const status = !data ? ['NO ORDER PICKED', 'chip-grey'] : !data.bom ? ['NEW', 'chip-grey'] : approved ? ['APPROVED', 'chip-teal'] : dirty ? ['DRAFT · CHANGES PENDING', 'chip-amber'] : ['DRAFT', 'chip-amber'];
  const current = processes.find(p => String(p.id) === String(tab));
  const tabLines = lines.filter(l => l.processId === String(tab));

  return (
    <div className="screen">
      {findOpen && <BomSearch onOpen={openOrder} onClose={() => setFindOpen(false)} />}
      {picker && (
        <BomItemPicker process={picker === 'all' ? null : picker} processes={processes} existing={new Set(lines.map(l => l.itemId))}
          onClose={() => setPicker(null)} onAdd={(list) => { addLines(list); setPicker(null); }} />
      )}

      <div className="screen-head">
        <h1 className="screen-title">BOM{data && <span className="doc-no">{data.order.orderNo}</span>}</h1>
        <span className={`chip ${status[1]}`}>{status[0]}</span>
      </div>
      <div className="toolbar">
        <button type="button" className="tb" onClick={() => setFindOpen(true)}>Pick order (F3)</button>
        <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : 'Save (Ctrl+S)'}</button>
        {has('order.bom.from_costing') && (
          <button type="button" className="tb" disabled={readOnly || !data.finalCosting} onClick={pullFromCosting}
            title={data && !data.finalCosting ? 'This order has no Final costing yet' : 'Add the fabric, trims and packing items of the Final costing'}>Pull from costing</button>
        )}
        {data?.bom && allowed.includes('approve') && has('order.bom.approve') && (approved
          ? <button type="button" className="tb" onClick={() => changeStatus('reopen')}>Reopen</button>
          : <button type="button" className="tb" onClick={() => changeStatus('approve')}>Approve</button>)}
        {has('order.bom.print') && <button type="button" className="tb tb-soon" style={{ marginLeft: 'auto' }} title="Coming in a later phase">Print</button>}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      {!data ? (
        <section className="panel bom-empty">
          <h2>Pick an order to start its BOM</h2>
          <p className="hint">Press F3 or click "Pick order". Orders show whether their BOM is not started, a draft or approved.</p>
          <button type="button" className="tb tb-primary" onClick={() => setFindOpen(true)}>Pick order (F3)</button>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-head">ORDER</div>
            <div className="form-grid bom-head">
              <label className="f"><span>Order no.</span><span className="ro">{data.order.orderNo}</span></label>
              <label className="f"><span>Style</span><span className="ro">{data.order.styleCode} · {data.order.styleName}</span></label>
              <label className="f"><span>Brand / colour</span><span className="ro">{data.order.brand} · {data.order.colour}</span></label>
              <label className="f"><span>Order qty</span><span className="ro">{qty(orderQty)} pcs</span></label>
              <label className="f"><span>Ex-factory</span><span className="ro">{fmtDate(data.order.exFactory)}</span></label>
              <label className="f" title="Items and rates come from this costing"><span>Final costing</span>
                <span className="ro">{data.finalCosting ? `${data.finalCosting.costingNo} · ${data.finalCosting.buyer}` : 'None yet'}</span>
              </label>
              <label className="f"><span>Material budget</span><span className="ro">₹ {money(totals.budget)}</span></label>
              <label className="f"><span>Remarks</span>
                <input className="inp" disabled={readOnly} maxLength={1000} value={remarks} onChange={e => { setRemarks(e.target.value); setDirty(true); }} />
              </label>
            </div>
          </section>

          <div className="cost-cards bom-cards" role="tablist" aria-label="Processes">
            {processes.map(p => {
              const t = totals.per[String(p.id)] || { count: 0, amount: 0 };
              return (
                <button key={p.id} type="button" role="tab" aria-selected={String(tab) === String(p.id)}
                  className={`cost-card ${String(tab) === String(p.id) ? 'on' : ''}`} style={{ '--c': colourOf(p.id) }} onClick={() => setTab(String(p.id))}>
                  <span>{p.name}</span>
                  <b>{t.count} item{t.count === 1 ? '' : 's'}</b>
                  <small>₹ {money(t.amount)}</small>
                </button>
              );
            })}
          </div>

          <section className="panel cost-lines">
            <div className="cost-lines-head">
              <b>{current?.name}</b>
              <span className="hint">Items issued to the {current?.name.toLowerCase()} department · {tabLines.length} item{tabLines.length === 1 ? '' : 's'}</span>
              {!readOnly && <button type="button" className="tb tb-primary" style={{ marginLeft: 'auto' }} onClick={() => setPicker(current)}>+ Add items</button>}
            </div>
            <div className="grid-scroll">
              {tabLines.length === 0 ? (
                <p className="empty-row">No {current?.name.toLowerCase()} items yet.{data.finalCosting && has('order.bom.from_costing') ? ' Use "Pull from costing" or "+ Add items".' : ' Use "+ Add items".'}</p>
              ) : (
                <table className="og bom-grid">
                  <thead>
                    <tr>
                      <th>Item</th><th>UOM</th><th className="num">Consumption<span className="sub">per pc</span></th><th className="num">Excess %</th>
                      <th className="num">Total avg</th><th className="num">Order qty</th><th className="num">Required qty<span className="sub">rounded up</span></th>
                      <th className="num">Costing rate</th><th className="num">Budgeted rate</th><th className="num">Amount ₹</th>
                      <th>Supplier</th><th className="num">Lead days</th><th title="The buyer supplies this material">From buyer</th><th className="c-act" aria-label="Delete" />
                    </tr>
                  </thead>
                  <tbody>
                    {tabLines.map(l => {
                      const c = calc(l, orderQty);
                      const over = l.costingRate !== null && n(l.budgetedRate) > n(l.costingRate) + 0.0001;
                      return (
                        <tr key={l.key}>
                          <td><div className="itm">{l.item}<small>{l.groupName}</small></div></td>
                          <td><input className="ci" style={{ minWidth: 50 }} disabled={readOnly} aria-label="UOM" value={l.uom} onChange={e => setLine(l.key, { uom: e.target.value.toUpperCase() })} /></td>
                          <td><input className="ci num" style={{ minWidth: 70 }} disabled={readOnly} inputMode="decimal" aria-label="Consumption" value={l.consumption} onChange={e => setLine(l.key, { consumption: e.target.value })} /></td>
                          <td><input className="ci num" style={{ minWidth: 56 }} disabled={readOnly} inputMode="decimal" aria-label="Excess %" value={l.excessPct} onChange={e => setLine(l.key, { excessPct: e.target.value })} /></td>
                          <td className="num calc">{qty(c.totalAvg)}</td>
                          <td className="num calc">{qty(orderQty)}</td>
                          <td className="num calc"><b>{qty(c.required)}</b></td>
                          <td className="num calc">{l.costingRate === null ? '—' : money(l.costingRate)}</td>
                          <td><input className={`ci num ${over ? 'bad' : ''}`} style={{ minWidth: 70 }} disabled={readOnly} inputMode="decimal" aria-label="Budgeted rate"
                            title={over ? `Above the costing rate ${money(l.costingRate)}` : undefined} value={l.budgetedRate} onChange={e => setLine(l.key, { budgetedRate: e.target.value })} /></td>
                          <td className="num"><b>{money(c.amount)}</b></td>
                          <td><input className="ci" style={{ minWidth: 120 }} disabled={readOnly} aria-label="Supplier" value={l.supplier} onChange={e => setLine(l.key, { supplier: e.target.value })} /></td>
                          <td><input className="ci num" style={{ minWidth: 50 }} disabled={readOnly} inputMode="numeric" aria-label="Lead days" value={l.leadDays} onChange={e => setLine(l.key, { leadDays: e.target.value.replace(/[^\d]/g, '') })} /></td>
                          <td className="c-chk"><input type="checkbox" disabled={readOnly} aria-label="From buyer" checked={l.fromBuyer} onChange={e => setLine(l.key, { fromBuyer: e.target.checked })} /></td>
                          <td className="c-act">{!readOnly && (
                            <button type="button" className="del-btn" onClick={() => removeLine(l.key)} aria-label={`Delete ${l.item}`} title="Delete line">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                            </button>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          {data.bom && (
            <p className="hint">
              {approved ? `Approved by ${data.bom.approvedBy} · ${new Date(data.bom.approvedAt).toLocaleString('en-IN')}` : `Last saved by ${data.bom.updatedBy} · ${new Date(data.bom.updatedAt).toLocaleString('en-IN')}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
