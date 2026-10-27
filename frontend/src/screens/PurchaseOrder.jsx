// Purchase order: opens on a new PO; "All POs (F3)" opens the list.
// Header: supplier (its currency, payment terms and bill address come with it), dates, dispatch and delivery terms.
// Items: "+ Add from BOM" brings approved BOM items still to buy; "+ Item" adds any item without an order no.
// GST: CGST + SGST in the company's state, IGST from another state, none from an import supplier.
// When the owner turned on PO approval for this client, a PO above the limit waits for someone who can Approve.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import RecordList from '../components/RecordList.jsx';
import Chatter from '../components/Chatter.jsx';
import DateInput from '../components/DateInput.jsx';
import { ControlPanel, StatusBar, Field, AllButton, SheetTabs, ActionMenu } from '../components/RecordBar.jsx';
import PoPicker from './PoPicker.jsx';

let nextKey = 1;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const n = (v) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const money = (x) => Number(x || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = (x) => Number(x || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');
const str = (v) => (v === null || v === undefined ? '' : String(v));

const STATUS = { pending: ['Waiting for approval', 'wr'], open: ['Open', 'ok'], rejected: ['Rejected', 'bad'], cancelled: ['Cancelled', 'no'] };
const GST_WORDS = { intra: 'CGST + SGST (same state)', inter: 'IGST (other state)', import: 'No GST (import)' };

const blankHeader = () => ({
  supplierId: '', poDate: today(), deliveryDate: '', billAddressId: '', currencyId: '', conversionRate: '1',
  paymentTermId: '', dispatchMode: '', deliveryTerms: '', vendorPi: '', remarks: ''
});
const lineFromServer = (l) => ({
  key: nextKey++, orderLineId: l.orderLineId, orderNo: l.orderNo, buyer: l.buyer, styleCode: l.styleCode,
  itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, uom: l.uom, hsn: l.hsn,
  qty: str(l.qty), moqExtraQty: l.moqExtraQty ? str(l.moqExtraQty) : '', rate: str(l.rate), discountPct: l.discountPct ? str(l.discountPct) : '',
  gstRate: str(l.gstRate), deliveryDate: l.deliveryDate, remarks: l.remarks, bomQty: l.bomQty, orderedElsewhere: l.orderedElsewhere
});
const calc = (l, gstType) => {
  const amount = r2((n(l.qty) + n(l.moqExtraQty)) * n(l.rate) * (1 - n(l.discountPct) / 100));
  return { amount, tax: gstType === 'import' ? 0 : r2(amount * n(l.gstRate) / 100) };
};
// Still to buy for this order no. (BOM qty less what other POs already have)
const balanceOf = (l) => (l.orderLineId && l.bomQty !== null && l.bomQty !== undefined ? r2(l.bomQty - (l.orderedElsewhere || 0)) : null);

export default function PurchaseOrder({ active, session, onNotice }) {
  const allowed = session?.permissions?.['purchase.po'] || [];
  const has = (code) => Boolean(session?.permissions?.[code]);
  const canApprove = allowed.includes('approve');
  const [lookups, setLookups] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(null);
  const [header, setHeader] = useState(blankHeader());
  const [addresses, setAddresses] = useState([]);
  const [lines, setLines] = useState([]);
  const [mode, setMode] = useState(() => (allowed.includes('create') ? 'form' : 'list'));
  const [listState, setListState] = useState({ search: '', filter: '' });
  const [lastOpened, setLastOpened] = useState(null);
  const [tab, setTab] = useState('items');
  const [picker, setPicker] = useState(null);         // 'bom' | 'item'
  const [discAll, setDiscAll] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { api('/purchase/po/lookups').then(setLookups).catch(e => setLoadError(e.message)); }, []);

  const currency = lookups?.currencies.find(c => c.id === header.currencyId);
  const foreign = currency && currency.code !== 'INR';
  const address = addresses.find(a => a.id === header.billAddressId);
  const gstType = address?.gstType || (saved?.gstType) || 'inter';
  const readOnly = saved?.status === 'cancelled' || (saved ? !allowed.includes('edit') : !allowed.includes('create'));
  const canSave = !readOnly && !busy;

  const setH = (patch) => { setMessage(''); setDirty(true); setHeader(h => ({ ...h, ...patch })); };
  const setL = (key, patch) => { setMessage(''); setDirty(true); setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); };

  async function loadAddresses(supplierId, keepId) {
    if (!supplierId) { setAddresses([]); return ''; }
    const r = await api(`/purchase/po/supplier/${supplierId}`);
    setAddresses(r.addresses);
    const pick = keepId && r.addresses.some(a => a.id === keepId) ? keepId
      : (r.addresses.find(a => a.type === 'billing' && a.isDefault) || r.addresses.find(a => a.type === 'billing') || r.addresses[0])?.id || '';
    return pick;
  }
  async function pickSupplier(id) {
    const s = lookups.suppliers.find(x => x.id === id);
    const cur = lookups.currencies.find(c => c.id === (s?.currencyId || header.currencyId));
    const billAddressId = await loadAddresses(id).catch(e => { setError(e.message); return ''; });
    setH({
      supplierId: id, billAddressId,
      ...(s?.currencyId ? { currencyId: s.currencyId, conversionRate: str(cur?.code === 'INR' ? 1 : cur?.rateToInr || 1) } : {}),
      ...(s?.paymentTermId ? { paymentTermId: s.paymentTermId } : {})
    });
  }
  function pickCurrency(id) {
    const c = lookups.currencies.find(x => x.id === id);
    setH({ currencyId: id, conversionRate: str(c?.code === 'INR' ? 1 : c?.rateToInr || '') });
  }

  function load(p) {
    setSaved(p);
    setHeader({
      supplierId: p.supplierId, poDate: p.poDate, deliveryDate: p.deliveryDate, billAddressId: p.billAddressId, currencyId: p.currencyId,
      conversionRate: str(p.conversionRate), paymentTermId: p.paymentTermId, dispatchMode: p.dispatchMode, deliveryTerms: p.deliveryTerms,
      vendorPi: p.vendorPi, remarks: p.remarks
    });
    setLines(p.lines.map(lineFromServer));
    loadAddresses(p.supplierId, p.billAddressId).catch(() => {});
    setDirty(false);
  }
  function blankForm() {
    const inr = lookups?.currencies.find(c => c.code === 'INR');
    setSaved(null); setHeader({ ...blankHeader(), currencyId: inr?.id || '' }); setLines([]); setAddresses([]);
    setError(''); setDirty(false); setTab('items');
  }
  useEffect(() => { if (lookups && !saved && !dirty) blankForm(); }, [lookups]); // eslint-disable-line react-hooks/exhaustive-deps

  function startNew() {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    blankForm(); setMessage(''); setMode('form');
  }
  function backToList() {
    if (dirty && !window.confirm('Discard the changes on this screen and go back to the list?')) return;
    setLastOpened(saved?.id || null); blankForm(); setMessage(''); setMode('list');
  }
  async function openPo(id) {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    setError(''); setMessage('');
    try { load(await api(`/purchase/po/${id}`)); setTab('items'); setMode('form'); } catch (e) { setError(e.message); }
  }

  // ---------- lines ----------
  function addRows(rows) {
    const rate = (inr) => (foreign && n(header.conversionRate) > 0 ? str(Math.round(inr / n(header.conversionRate) * 10000) / 10000) : str(inr));
    setDirty(true); setMessage('');
    setLines(ls => [...ls, ...rows.map(r => ({
      key: nextKey++, orderLineId: r.orderLineId || '', orderNo: r.orderNo || '', buyer: r.buyer || '', styleCode: r.styleCode || '',
      itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, uom: r.uom, hsn: r.hsn,
      qty: r.balance !== undefined ? str(r.balance) : '', moqExtraQty: '', rate: r.budgetedRate ? rate(r.budgetedRate) : '', discountPct: '',
      gstRate: r.gstRate === null || r.gstRate === undefined ? '' : str(r.gstRate), deliveryDate: header.deliveryDate, remarks: '',
      bomQty: r.bomQty ?? null, orderedElsewhere: r.ordered ?? 0
    }))]);
    setPicker(null);
  }
  const removeLine = (key) => { setDirty(true); setLines(ls => ls.filter(l => l.key !== key)); };
  function applyAll(patch, what) {
    if (!lines.length) return;
    setDirty(true); setMessage(`${what} applied to all ${lines.length} line${lines.length === 1 ? '' : 's'}.`);
    setLines(ls => ls.map(l => ({ ...l, ...patch })));
  }

  // ---------- totals ----------
  const per = lines.map(l => calc(l, gstType));
  const taxable = r2(per.reduce((a, c) => a + c.amount, 0));
  const tax = r2(per.reduce((a, c) => a + c.tax, 0));
  const total = r2(taxable + tax);
  const cur = currency?.code || '';

  // ---------- save and status ----------
  async function save() {
    if (!canSave) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const body = { ...header, lines: lines.map(({ key, orderNo, buyer, styleCode, itemCode, itemName, bomQty, orderedElsewhere, ...l }) => l) };
      const p = saved ? await api(`/purchase/po/${saved.id}`, { method: 'PUT', body }) : await api('/purchase/po', { method: 'POST', body });
      load(p);
      setMessage(`${p.poNo} ${saved ? 'saved' : 'created'}${p.status === 'pending' ? ' · waiting for approval' : ''}.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function act(path, body, done) {
    if (dirty) { setError('Save or discard your changes first.'); return; }
    setError(''); setMessage('');
    try { const p = await api(`/purchase/po/${saved.id}/${path}`, { method: 'POST', body }); load(p); setMessage(done(p)); } catch (e) { setError(e.message); }
  }
  const approve = () => act('approve', {}, p => `${p.poNo} approved. It is Open now.`);
  function reject() {
    const reason = window.prompt(`Why is ${saved.poNo} rejected? (goes back to the person who made it)`);
    if (reason === null) return;
    act('reject', { reason }, p => `${p.poNo} rejected.`);
  }
  function cancelPo() {
    const reason = window.prompt(`Cancel ${saved.poNo}? Its items go back to "still to buy". Reason (optional):`);
    if (reason === null) return;
    act('cancel', { reason }, p => `${p.poNo} cancelled.`);
  }
  async function remove() {
    if (!window.confirm(`Delete ${saved.poNo}? This can't be undone, and the number will not be used again.`)) return;
    try {
      await api(`/purchase/po/${saved.id}`, { method: 'DELETE' });
      const no = saved.poNo;
      setDirty(false); blankForm(); setLastOpened(null); setMode('list'); onNotice?.(`${no} deleted.`);
    } catch (e) { setError(e.message); }
  }
  function duplicate() {
    if (dirty && !window.confirm('Discard the changes on this screen and make a copy?')) return;
    const from = saved.poNo;
    setSaved(null);
    setHeader(h => ({ ...h, poDate: today(), vendorPi: '' }));
    setLines(ls => ls.map(l => ({ ...l, key: nextKey++ })));
    setDirty(true); setError(''); setTab('items');
    setMessage(`Copy of ${from}. Check qty and rates, then Save to get a new PO no.`);
  }

  useEffect(() => {
    if (!active || mode !== 'form' || picker) return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); startNew(); }
      if (e.key === 'F3') { e.preventDefault(); backToList(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loadError) return <div className="screen"><div className="alert alert-error" role="alert">{loadError}</div></div>;
  if (!lookups) return <div className="screen"><p className="hint">Loading…</p></div>;

  if (mode === 'list') {
    return (
      <>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <RecordList title="Purchase orders" active={active} state={listState} setState={setListState} highlightId={lastOpened}
          onNew={allowed.includes('create') ? startNew : null}
          onOpen={(id) => openPo(id)}
          placeholder="Search PO no., supplier, vendor PI, order no., style or item…"
          emptyText="No purchase orders yet. Click New to make the first one."
          filters={[
            ...(lookups.approval.on ? [{ id: 'pending', label: 'To approve' }, { id: 'rejected', label: 'Rejected' }] : []),
            { id: 'open', label: 'Open' }, { id: 'cancelled', label: 'Cancelled' }
          ]}
          fetchRows={({ search, filter }) => api(`/purchase/po?${new URLSearchParams(Object.entries({ search, status: filter }).filter(([, v]) => v))}`)}
          note="Latest 300 shown. Search to find others."
          columns={[
            { label: 'PO no.', cls: 'order-no', cell: r => r.poNo },
            { label: 'Date', cell: r => fmtDate(r.date) },
            { label: 'Supplier', cell: r => r.supplier },
            { label: 'Vendor PI', cell: r => r.vendorPi || '—' },
            { label: 'Order nos.', cell: r => r.orderNos || <span className="muted">General items</span> },
            { label: 'Items', num: true, cell: r => r.lines },
            { label: 'Amount', num: true, cell: r => `${r.currency === 'INR' ? '₹' : r.currency} ${money(r.total)}` },
            { label: 'Delivery', cell: r => fmtDate(r.deliveryDate) },
            { label: 'Status', cell: r => <span className={`o-pill ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span> }
          ]} />
      </>
    );
  }

  const title = saved ? saved.poNo : 'New purchase order';
  const status = saved?.status;
  const steps = (lookups.approval.on ? ['Draft', 'Approval', 'Open', 'Received'] : ['Draft', 'Open', 'Received']).map((label, i, all) => {
    const at = !saved ? 0 : status === 'open' ? all.indexOf('Open') : status === 'cancelled' ? -1 : all.indexOf('Approval');
    return { label, state: at < 0 ? '' : i < at ? 'done' : i === at ? 'on' : '' };
  });
  const supplierList = lookups.suppliers.filter(s => s.isActive || s.id === header.supplierId);
  const existing = new Set(lines.map(l => `${l.orderLineId || 0}-${l.itemId}`));

  return (
    <div className="o-page">
      {picker && (
        <PoPicker mode={picker} supplierId={header.supplierId} excludePoId={saved?.id} itemGroups={lookups.itemGroups}
          existing={existing} onAdd={addRows} onClose={() => setPicker(null)} />
      )}
      <ControlPanel crumbs={[{ label: 'Purchase orders', onClick: backToList }, { label: title }]}>
        <AllButton label="All POs" onClick={backToList} />
        {saved && allowed.includes('create') && <button type="button" className="tb" onClick={startNew}>New <kbd className="tb-kbd">F2</kbd></button>}
        {saved && <ActionMenu items={[
          allowed.includes('create') && { label: 'Duplicate', onClick: duplicate },
          allowed.includes('edit') && status !== 'cancelled' && { label: 'Cancel PO', onClick: cancelPo, disabled: dirty, title: dirty ? 'Save or discard your changes first' : 'Cancel this PO' },
          allowed.includes('edit') && has('purchase.po.delete') && { label: 'Delete', danger: true, onClick: remove }
        ]} />}
        {dirty && saved && <span className="chip chip-amber">unsaved changes</span>}
      </ControlPanel>

      <div className="o-form">
        <div className="o-main">
          <StatusBar steps={steps}>
            <button type="button" className="tb tb-primary" onClick={save} disabled={!canSave}>{busy ? 'Saving…' : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
            {status === 'pending' && canApprove && <>
              <button type="button" className="tb tb-line" onClick={approve}>Approve</button>
              <button type="button" className="tb" onClick={reject}>Reject</button>
            </>}
            {has('purchase.po.print') && <button type="button" className="tb" title="Coming in a later phase">Print</button>}
          </StatusBar>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && (
            <div className="alert alert-success o-saved" role="status">
              <span>{message}</span>
              {saved && !dirty && <button type="button" className="tb" onClick={backToList}>See it in All POs</button>}
            </div>
          )}
          {status === 'rejected' && <div className="alert alert-warn" role="status">Rejected: {saved.rejectReason}. Change the PO and Save to send it for approval again.</div>}
          {status === 'cancelled' && <div className="alert alert-warn" role="status">This PO is cancelled{saved.cancelReason ? `: ${saved.cancelReason}` : ''}. It can't be changed; use Action › Duplicate to make a new one.</div>}
          {status === 'pending' && !canApprove && <div className="alert alert-warn" role="status">Waiting for approval by someone who can approve POs.</div>}

          <section className="o-sheet">
            <div className="o-title">
              <span>Purchase order{status ? <> · <span className={`o-pill ${STATUS[status][1]}`}>{STATUS[status][0]}</span></> : ''}</span>
              <h1>{title}</h1>
            </div>
            <div className="o-groups">
              <div>
                <Field label="Supplier" req>
                  <select aria-label="Supplier" className="inp" disabled={readOnly} value={header.supplierId} onChange={e => pickSupplier(e.target.value)}>
                    <option value="">Select supplier</option>
                    {supplierList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </Field>
                <Field label="Bill address" title="The supplier's billing address. It decides CGST + SGST or IGST.">
                  <select aria-label="Bill address" className="inp" disabled={readOnly || !addresses.length} value={header.billAddressId} onChange={e => setH({ billAddressId: e.target.value })}>
                    {!addresses.length && <option value="">{header.supplierId ? 'No address in Party master' : 'Pick the supplier first'}</option>}
                    {addresses.map(a => <option key={a.id} value={a.id}>{a.type === 'billing' ? 'Billing' : 'Shipping'} · {a.label}</option>)}
                  </select>
                </Field>
                <Field label="Currency" req>
                  <div className="po-cur">
                    <select aria-label="Currency" className="inp" disabled={readOnly} value={header.currencyId} onChange={e => pickCurrency(e.target.value)}>
                      {lookups.currencies.filter(c => c.isActive || c.id === header.currencyId).map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                    </select>
                    {foreign && <label className="po-rate">1 {cur} = ₹
                      <input aria-label="Conversion rate" className="inp num" inputMode="decimal" disabled={readOnly} value={header.conversionRate} onChange={e => setH({ conversionRate: e.target.value })} />
                    </label>}
                  </div>
                </Field>
                <Field label="Payment terms">
                  <select aria-label="Payment terms" className="inp" disabled={readOnly} value={header.paymentTermId} onChange={e => setH({ paymentTermId: e.target.value })}>
                    <option value="">Select</option>
                    {lookups.paymentTerms.filter(t => t.isActive || t.id === header.paymentTermId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Vendor PI" title="Supplier's proforma invoice no.">
                  <input aria-label="Vendor PI" className="inp" maxLength={60} disabled={readOnly} value={header.vendorPi} onChange={e => setH({ vendorPi: e.target.value })} placeholder="Supplier's proforma invoice no." />
                </Field>
              </div>
              <div>
                <Field label="PO date" req><DateInput ariaLabel="PO date" disabled={readOnly} value={header.poDate} onChange={v => setH({ poDate: v })} /></Field>
                <Field label="Delivery date" title="Used for new lines; Apply sets it on every line">
                  <div className="po-cur">
                    <DateInput ariaLabel="Delivery date" disabled={readOnly} value={header.deliveryDate} onChange={v => setH({ deliveryDate: v })} />
                    {!readOnly && lines.length > 0 && header.deliveryDate && (
                      <button type="button" className="tb" onClick={() => applyAll({ deliveryDate: header.deliveryDate }, 'Delivery date')}>Apply to all lines</button>
                    )}
                  </div>
                </Field>
                <Field label="Mode of dispatch">
                  <select aria-label="Mode of dispatch" className="inp" disabled={readOnly} value={header.dispatchMode} onChange={e => setH({ dispatchMode: e.target.value })}>
                    <option value="">Select</option>{lookups.dispatchModes.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Delivery terms">
                  <select aria-label="Delivery terms" className="inp" disabled={readOnly} value={header.deliveryTerms} onChange={e => setH({ deliveryTerms: e.target.value })}>
                    <option value="">Select</option>{lookups.deliveryTerms.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="GST" title={lookups.companyStateKnown ? undefined : "Your company's state is not set (owner's client setup: GSTIN or state), so GST shows as IGST"}>
                  <span>{header.supplierId ? GST_WORDS[gstType] : '—'}{!lookups.companyStateKnown && gstType !== 'import' && header.supplierId && <span className="muted"> · company state not set</span>}</span>
                </Field>
              </div>
            </div>

            <SheetTabs value={tab} onChange={setTab} tabs={[['items', `Items (${lines.length})`], ['other', 'Other info']]} />
            {tab === 'other' && (
              <div className="o-groups">
                <div>
                  <Field label="Ship to">{lookups.shipTo || '—'}</Field>
                  <Field label="Remarks">
                    <input aria-label="Remarks" className="inp" maxLength={1000} disabled={readOnly} value={header.remarks} onChange={e => setH({ remarks: e.target.value })} />
                  </Field>
                </div>
                <div>
                  {lookups.approval.on && <Field label="Approval">{lookups.approval.limit > 0 ? `Needed above ₹ ${money(lookups.approval.limit)}` : 'Needed for every PO'}</Field>}
                  {saved?.approvedBy && <Field label="Approved by">{saved.approvedBy} · {new Date(saved.approvedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Field>}
                </div>
              </div>
            )}
            {tab === 'items' && (<>
              <div className="o-lines-head">
                {!readOnly && <>
                  <button type="button" className="tb tb-line" disabled={!header.supplierId} title={header.supplierId ? undefined : 'Pick the supplier first'} onClick={() => setPicker('bom')}>+ Add from BOM</button>
                  <button type="button" className="tb" disabled={!header.supplierId} onClick={() => setPicker('item')}>+ Item</button>
                  {lines.length > 0 && (
                    <span className="po-apply">Discount % for all
                      <input aria-label="Discount for all lines" className="ci num" inputMode="decimal" value={discAll} onChange={e => setDiscAll(e.target.value)} />
                      <button type="button" className="tb" disabled={discAll === ''} onClick={() => applyAll({ discountPct: discAll }, 'Discount')}>Apply</button>
                    </span>
                  )}
                </>}
              </div>
              <div className="grid-scroll">
                {lines.length === 0 ? (
                  <p className="empty-row">{header.supplierId ? 'No items yet. Use "+ Add from BOM" for order material, or "+ Item" for anything else.' : 'Pick the supplier, then add items.'}</p>
                ) : (
                  <table className="og po-grid">
                    <thead>
                      <tr>
                        <th>Order no.</th><th>Item</th><th>HSN</th><th>UOM</th>
                        <th className="num">Qty</th><th className="num" title="Extra qty only because of the supplier's minimum order qty">MOQ extra</th>
                        <th className="num">Rate {cur}</th><th className="num">Disc %</th><th className="num">Amount</th>
                        <th className="num">GST %</th><th className="num">Tax</th><th>Delivery</th><th>Remarks</th><th className="c-act" aria-label="Delete" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const bal = balanceOf(l);
                        const over = bal !== null && n(l.qty) > bal + 0.0005;
                        return (
                          <tr key={l.key}>
                            <td>{l.orderNo ? <div className="itm"><b>{l.orderNo}</b><small>{l.buyer} · {l.styleCode}</small></div> : <span className="muted">General</span>}</td>
                            <td><div className="itm">{l.itemName}<small>{l.itemCode}</small></div></td>
                            <td><input className="ci" style={{ minWidth: 92 }} aria-label="HSN" disabled={readOnly} maxLength={8} value={l.hsn} onChange={e => setL(l.key, { hsn: e.target.value.replace(/[^\d]/g, '') })} /></td>
                            <td>{l.uom}</td>
                            <td>
                              <input className={`ci num ${over ? 'warn' : ''}`} style={{ minWidth: 80 }} aria-label={`Qty line ${i + 1}`} inputMode="decimal" disabled={readOnly}
                                value={l.qty} onChange={e => setL(l.key, { qty: e.target.value })}
                                title={over ? `More than still to buy (${qtyFmt(bal)}). Allowed, just check it.` : bal !== null ? `Still to buy: ${qtyFmt(bal)} of BOM ${qtyFmt(l.bomQty)}` : undefined} />
                              {bal !== null && <small className={`po-bal ${over ? 'over' : ''}`}>{over ? 'over BOM · ' : ''}to buy {qtyFmt(bal)}</small>}
                            </td>
                            <td><input className="ci num" style={{ minWidth: 64 }} aria-label="MOQ extra" inputMode="decimal" disabled={readOnly} value={l.moqExtraQty} onChange={e => setL(l.key, { moqExtraQty: e.target.value })} /></td>
                            <td>
                              <input className="ci num" style={{ minWidth: 76 }} aria-label={`Rate line ${i + 1}`} inputMode="decimal" disabled={readOnly} value={l.rate} onChange={e => setL(l.key, { rate: e.target.value })} />
                              {foreign && n(l.rate) > 0 && <small className="po-bal">₹ {money(n(l.rate) * n(header.conversionRate))}</small>}
                            </td>
                            <td><input className="ci num" style={{ minWidth: 50 }} aria-label="Discount %" inputMode="decimal" disabled={readOnly} value={l.discountPct} onChange={e => setL(l.key, { discountPct: e.target.value })} /></td>
                            <td className="num"><b>{money(per[i].amount)}</b></td>
                            <td><input className={`ci num ${l.gstRate === '' && gstType !== 'import' ? 'warn' : ''}`} style={{ minWidth: 46 }} aria-label="GST %" inputMode="decimal" disabled={readOnly}
                              title={l.gstRate === '' ? 'No GST % for this HSN in Basic masters › HSN / GST. Type it here.' : undefined}
                              value={l.gstRate} onChange={e => setL(l.key, { gstRate: e.target.value })} /></td>
                            <td className="num calc">{money(per[i].tax)}</td>
                            <td><DateInput ariaLabel="Line delivery date" className="ci" disabled={readOnly} value={l.deliveryDate} onChange={v => setL(l.key, { deliveryDate: v })} /></td>
                            <td><input className="ci" style={{ minWidth: 110 }} aria-label="Line remarks" maxLength={200} disabled={readOnly} value={l.remarks} onChange={e => setL(l.key, { remarks: e.target.value })} /></td>
                            <td className="c-act">{!readOnly && (
                              <button type="button" className="del-btn" onClick={() => removeLine(l.key)} aria-label={`Delete ${l.itemName}`} title="Delete line">
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
              {lines.length > 0 && (
                <div className="po-totals">
                  <div><span>Taxable amount</span><b>{cur} {money(taxable)}</b></div>
                  {gstType === 'intra' && <><div><span>CGST</span><b>{money(tax / 2)}</b></div><div><span>SGST</span><b>{money(tax - r2(tax / 2))}</b></div></>}
                  {gstType === 'inter' && <div><span>IGST</span><b>{money(tax)}</b></div>}
                  {gstType === 'import' && <div><span>GST</span><b className="muted">none (import)</b></div>}
                  <div className="po-grand"><span>Total</span><b>{cur} {money(total)}</b></div>
                  {foreign && <div><span>In rupees</span><b>₹ {money(total * n(header.conversionRate))}</b></div>}
                </div>
              )}
            </>)}
          </section>
          <Chatter entity="po" entityId={saved?.id} refreshKey={saved} />
        </div>
      </div>
    </div>
  );
}
