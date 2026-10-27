// BOM screen: the material one order line needs, split by the process it is issued to
// (Cutting, Stitching, Finishing). Each item sits in its own process, set on the item master.
// Opens on All BOMs (every order line with its BOM status); click a line for its BOM.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { daysTo } from '../components/FlowStrip.jsx';
import BomItemPicker from './BomItemPicker.jsx';
import RecordList from '../components/RecordList.jsx';
import Chatter from '../components/Chatter.jsx';
import { ControlPanel, StatusBar, Field, AllButton, SheetTabs, ActionMenu } from '../components/RecordBar.jsx';

const STATUS = { none: ['No BOM', 'no'], draft: ['Draft', 'wr'], approved: ['Approved', 'ok'] };

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

export default function Bom({ active, session, onGo, request }) {
  const allowed = session?.permissions?.['order.bom'] || [];
  // Functions and reports the owner gave this client (hidden when switched off)
  const has = (code) => Boolean(session?.permissions?.[code]);
  const [processes, setProcesses] = useState([]);
  const [data, setData] = useState(null);           // { order, finalCosting, bom }
  const [lines, setLines] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [tab, setTab] = useState('');               // process shown in the Materials list ('' = all)
  const [sheetTab, setSheetTab] = useState('mat');  // 'mat' = Materials, 'other' = Other info
  const [mode, setMode] = useState('form');         // opens on 'pick an order'; 'list' = All BOMs
  const [listState, setListState] = useState({ search: '', filter: '' });
  const [lastOpened, setLastOpened] = useState(null);
  const [picker, setPicker] = useState(null);       // process object, or 'all'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [flow, setFlow] = useState(null);

  // Flow strip of the picked order line (reloads after save / approve / reopen)
  useEffect(() => {
    if (!data) { setFlow(null); return undefined; }
    let stop = false;
    api(`/links/order-line/${data.order.orderLineId}`).then(f => { if (!stop) setFlow(f); }).catch(() => { if (!stop) setFlow(null); });
    return () => { stop = true; };
  }, [data]);

  // Opened from another screen (order or costing flow)
  useEffect(() => {
    if (request?.orderLineId) openOrder(request.orderLineId);
  }, [request?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api('/bom/processes').then(p => setProcesses(p)).catch(e => setError(e.message));
  }, []);

  const approved = data?.bom?.status === 'approved';
  const readOnly = !data || approved;
  const canSave = !readOnly && (data.bom ? allowed.includes('edit') : allowed.includes('create'));
  const orderQty = data?.order.qty || 0;

  const setLine = (key, patch) => { setMessage(''); setDirty(true); setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); };
  const removeLine = (key) => { setDirty(true); setLines(ls => ls.filter(l => l.key !== key)); };
  function addLines(list) {
    const have = new Set(lines.map(l => l.itemId));
    const fresh = list.filter(l => !have.has(l.itemId)).map(toLine);
    if (!fresh.length) return;
    setDirty(true); setMessage('');
    setLines(ls => [...ls, ...fresh]);
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
      setMode('form'); setError(''); setMessage('');
    } catch (e) { setError(e.message); }
  }
  function backToList() {
    if (dirty && !window.confirm('Discard the changes on this screen and go back to the list?')) return;
    setLastOpened(data?.order.orderLineId || null);
    setData(null); setLines([]); setRemarks(''); setDirty(false); setError(''); setMessage('');
    setMode('list');
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

  // ⚙ Action › Delete: only a draft BOM (an approved one is reopened first); the order stays, ready for a new BOM
  async function remove() {
    const no = data.order.orderNo;
    if (!window.confirm(`Delete the BOM of ${no}? All its items will be removed. This can't be undone.`)) return;
    setError(''); setMessage('');
    try {
      await api(`/bom/order/${data.order.orderLineId}`, { method: 'DELETE' });
      load(await api(`/bom/order/${data.order.orderLineId}`));
      setMessage(`BOM of ${no} deleted.`);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => {
    if (!active || picker || mode !== 'form') return undefined;
    const onKey = (e) => {
      if (e.key === 'F3') { e.preventDefault(); backToList(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (mode === 'list') {
    return (
      <>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <RecordList title="BOMs" active={active} state={listState} setState={setListState} highlightId={lastOpened}
          rowId={r => r.orderLineId}
          onOpen={(id, ids) => { openOrder(id); }}
          placeholder="Search order no., style or product category…"
          emptyText="No order lines yet. Make an order in Order entry first."
          filters={Object.entries(STATUS).map(([id, v]) => ({ id, label: v[0] }))}
          fetchRows={({ search, filter }) => api(`/bom/orders?${new URLSearchParams(Object.entries({ search, status: filter }).filter(([, v]) => v))}`)}
          note="Every order line has one BOM. Click a line to make or open its BOM. Latest 200 shown."
          columns={[
            { label: 'Order no.', cls: 'order-no', cell: r => r.orderNo },
            { label: 'Brand', cell: r => r.brand },
            { label: 'Style', cell: r => <>{r.styleCode} <span className="muted">· {r.styleName}</span></> },
            { label: 'Product category', cell: r => r.category },
            { label: 'Colour', cell: r => r.colour },
            { label: 'Qty', num: true, cell: r => qty(r.qty) },
            { label: 'Ex-factory', cell: r => fmtDate(r.exFactory) },
            { label: 'BOM', cell: r => <span className={`o-pill ${STATUS[r.bomStatus][1]}`}>{STATUS[r.bomStatus][0]}{r.bomLines ? ` · ${r.bomLines} items` : ''}</span> }
          ]} />
      </>
    );
  }

  // New BOM: first pick the order (search by order no., style or product category)
  if (!data) {
    return (
      <div className="o-page">
        <ControlPanel crumbs={[{ label: 'BOMs', onClick: backToList }, { label: 'New BOM' }]}>
          <AllButton label="All BOMs" onClick={backToList} />
        </ControlPanel>
        <div className="o-form">
          <div className="o-main">
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <section className="o-sheet">
              <div className="o-title"><span>BOM</span><h1>New BOM</h1></div>
              <OrderFinder onPick={openOrder} />
            </section>
          </div>
        </div>
      </div>
    );
  }

  // Warn when the longest lead time does not fit before the ex-factory date
  const longest = Math.max(0, ...lines.map(l => n(l.leadDays)));
  const left = daysTo(data.order.exFactory);
  const leadWarn = left !== null && longest > 0 && !approved
    ? (longest >= left ? `Ex-factory in ${left} days · longest lead time ${longest} days – material will be late` : `Ex-factory in ${left} days · longest lead time ${longest} days`)
    : '';
  // Materials list: all items, sorted by process (like the components of an Odoo BOM), or one process
  const pOrder = (pid) => processes.findIndex(p => String(p.id) === String(pid));
  const pName = (pid) => processes.find(p => String(p.id) === String(pid))?.name || '—';
  const tabLines = lines.filter(l => !tab || l.processId === String(tab)).sort((a, b) => pOrder(a.processId) - pOrder(b.processId));
  const canApproveHere = data.bom && allowed.includes('approve') && has('order.bom.approve');
  const steps = [
    { label: 'Not started', state: data.bom ? 'done' : 'on' },
    { label: 'Draft', state: !data.bom ? '' : approved ? 'done' : 'on' },
    { label: 'Approved', state: approved ? 'on' : '' }
  ];

  return (
    <div className="o-page">
      {picker && (
        <BomItemPicker process={picker === 'all' ? null : picker} processes={processes} existing={new Set(lines.map(l => l.itemId))}
          onClose={() => setPicker(null)} onAdd={(list) => { addLines(list); setPicker(null); }} />
      )}
      <ControlPanel crumbs={[{ label: 'BOMs', onClick: backToList }, { label: `BOM · ${data.order.orderNo}` }]}>
        <AllButton label="All BOMs" onClick={backToList} />
        {data.bom && <ActionMenu items={[
          allowed.includes('edit') && has('order.bom.delete') && { label: 'Delete BOM', danger: true, onClick: remove, disabled: approved || dirty,
            title: approved ? 'This BOM is approved. Reopen it first, then delete.' : dirty ? 'Save or discard your changes first' : 'Delete this draft BOM' }
        ]} />}
        {dirty && <span className="chip chip-amber">unsaved changes</span>}
      </ControlPanel>

      <div className="o-form">
        <div className="o-main">
          <StatusBar steps={steps}>
            <button type="button" className="tb tb-primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving…' : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
            {has('order.bom.from_costing') && !approved && (
              <button type="button" className="tb tb-line" disabled={readOnly || !data.finalCosting} onClick={pullFromCosting}
                title={!data.finalCosting ? 'This order has no Final costing yet' : 'Add the fabric, trims and packing items of the Final costing'}>Pull from costing</button>
            )}
            {canApproveHere && (approved
              ? <button type="button" className="tb" onClick={() => changeStatus('reopen')}>Reopen for changes</button>
              : <button type="button" className="tb tb-line" onClick={() => changeStatus('approve')}>Approve &amp; lock</button>)}
            {has('order.bom.print') && <button type="button" className="tb" title="Coming in a later phase">Print</button>}
          </StatusBar>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && (
            <div className="alert alert-success o-saved" role="status">
              <span>{message}</span>
              <button type="button" className="tb" onClick={backToList}>See it in All BOMs</button>
            </div>
          )}

          <section className="o-sheet">
            <div className="o-title">
              <span>BOM{approved ? ' · approved and locked' : data.bom ? ' · draft' : ' · not saved yet'}</span>
              <h1>{data.order.orderNo}</h1>
              {leadWarn && <p className="o-warn">{leadWarn}</p>}
            </div>
            <div className="o-groups">
              <div>
                <Field label="Order no."><button type="button" className="o-link" onClick={() => flow && onGo('orderEntry', { orderId: flow.line.orderId, lineId: flow.line.id })}>{data.order.orderNo}</button></Field>
                <Field label="Style">{data.order.styleCode} · {data.order.styleName}</Field>
                <Field label="Product category">{data.order.category || '—'}</Field>
                <Field label="Brand / colour">{data.order.brand} · {data.order.colour}</Field>
              </div>
              <div>
                <Field label="Order qty">{qty(orderQty)} pcs</Field>
                <Field label="Ex-factory">{fmtDate(data.order.exFactory)}</Field>
                <Field label="Final costing" title="Items and rates come from this costing">
                  <button type="button" className="o-link" onClick={() => onGo('costing', flow?.costing ? { costingId: flow.costing.id } : { newForLine: data.order.orderLineId })}>
                    {data.finalCosting ? `${data.finalCosting.costingNo} · ${data.finalCosting.buyer}` : 'None yet · create costing'}
                  </button>
                </Field>
                <Field label="Material budget"><b>₹ {money(totals.budget)}</b></Field>
              </div>
            </div>

            <SheetTabs value={sheetTab} onChange={setSheetTab} tabs={[['mat', `Materials (${lines.length})`], ['other', 'Other info']]} />
            {sheetTab === 'other' && (
              <div className="o-groups">
                <div>
                  <Field label={approved ? 'Approved by' : 'Last saved by'}>
                    {approved ? `${data.bom.approvedBy} · ${new Date(data.bom.approvedAt).toLocaleDateString('en-IN')}` : data.bom ? data.bom.updatedBy : 'Not saved yet'}
                  </Field>
                  <Field label="Buyer PO no.">{data.order.buyerPo || '—'}</Field>
                </div>
                <div>
                  <Field label="Remarks">
                    <input aria-label="Remarks" className="inp" disabled={readOnly} maxLength={1000} value={remarks} onChange={e => { setRemarks(e.target.value); setDirty(true); }} />
                  </Field>
                  <Field label="FOB date">{fmtDate(data.order.fob)}</Field>
                </div>
              </div>
            )}
            {sheetTab === 'mat' && (<>
            <div className="o-lines-head">
              <div className="o-chips" role="group" aria-label="Show process">
                <button type="button" className={!tab ? 'on' : ''} onClick={() => setTab('')}>All ({lines.length})</button>
                {processes.map(p => {
                  const t = totals.per[String(p.id)] || { count: 0, amount: 0 };
                  return <button key={p.id} type="button" className={String(tab) === String(p.id) ? 'on' : ''} onClick={() => setTab(String(p.id))}>{p.name} ({t.count})</button>;
                })}
              </div>
              {!readOnly && <button type="button" className="tb tb-line" style={{ marginLeft: 'auto' }} onClick={() => setPicker('all')}>+ Add items</button>}
            </div>
            <div className="grid-scroll">
              {tabLines.length === 0 ? (
                <p className="empty-row">No {tab ? `${pName(tab).toLowerCase()} ` : ''}items yet.{data.finalCosting && has('order.bom.from_costing') ? ' Use "Pull from costing" or "+ Add items".' : ' Use "+ Add items".'}</p>
              ) : (
                <table className="og bom-grid">
                  <thead>
                    <tr>
                      <th>Item</th><th title="Department this material is issued to (set on the item master)">Process</th><th>UOM</th><th className="num">Consumption<span className="sub">per pc</span></th><th className="num">Excess %</th>
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
                          <td><span className="o-pill no">{pName(l.processId)}</span></td>
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
                  <tfoot>
                    <tr>
                      <td colSpan={10}>Total · {tabLines.length} item{tabLines.length === 1 ? '' : 's'}{tab ? ` in ${pName(tab)}` : ''}</td>
                      <td className="num"><b>{money(tabLines.reduce((a, l) => a + calc(l, orderQty).amount, 0))}</b></td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              )}
              {!readOnly && <button type="button" className="o-link o-addline" onClick={() => setPicker('all')}>Add a line</button>}
            </div>
            </>)}
          </section>
          <Chatter entity="bom" entityId={data.bom?.id} refreshKey={data} />
        </div>
      </div>
    </div>
  );
}

// Pick the order a new BOM is for: type order no., style or product category, then click the order
function OrderFinder({ onPick }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!q.trim()) { setRows(null); return undefined; }
    let stop = false;
    const t = setTimeout(() => {
      api(`/bom/orders?${new URLSearchParams({ search: q.trim() })}`).then(r => { if (!stop) setRows(r); }).catch(() => { if (!stop) setRows([]); });
    }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [q]);
  return (
    <div className="o-finder">
      <Field label="Order no." req title="Type the order no., style or product category">
        <input autoFocus aria-label="Find order" className="inp" placeholder="Type order no., style or product category, e.g. UTH/0007, ST-2215, Tops"
          value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && rows?.[0]) onPick(rows[0].orderLineId); }} />
      </Field>
      {rows && (
        <div className="o-finder-list" role="listbox" aria-label="Orders">
          {rows.length === 0 && <p className="empty-row">No order matches "{q}".</p>}
          {rows.slice(0, 10).map(r => (
            <button key={r.orderLineId} type="button" role="option" aria-selected="false" onClick={() => onPick(r.orderLineId)}>
              <b>{r.orderNo}</b>
              <span>{r.styleCode} · {r.styleName}</span>
              <span>{r.category}</span>
              <span>{qty(r.qty)} pcs</span>
              <span className={`o-pill ${STATUS[r.bomStatus][1]}`}>{STATUS[r.bomStatus][0]}</span>
            </button>
          ))}
          {rows.length > 10 && <p className="hint" style={{ margin: '6px 10px' }}>{rows.length - 10} more – type more to narrow down.</p>}
        </div>
      )}
      {!rows && <p className="hint o-grid-hint">Every saved order shows up here. Pick one to add its items. Orders that already have a BOM open it.</p>}
    </div>
  );
}
