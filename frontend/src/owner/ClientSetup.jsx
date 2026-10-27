// Owner console: create or change one client.
//   Details tab          company, contact person, licence
//   Access & add-ons tab modules, screens, functions, reports and tools this client gets, with paid till dates
// Anything left unticked (or an add-on past its paid till date) is hidden from the client.
import { useEffect, useState } from 'react';
import { ownerApi } from '../api.js';
import DateInput from '../components/DateInput.jsx';
import AccessEditor from './AccessEditor.jsx';

const blank = {
  name: '', code: '', gstin: '', addressLine: '', city: '', state: '', pin: '', country: 'India',
  contactName: '', contactDesignation: '', contactMobile: '', contactEmail: '',
  licenceValidTill: '', maxUsers: '10', status: 'active', poApprovalLimit: '0',
  adminUsername: 'admin', adminPassword: '', modules: [], features: [], addons: {}
};

export default function ClientSetup({ id, catalog, onBack, onCreated }) {
  const isNew = id === null;
  const [form, setForm] = useState(blank);
  const [saved, setSaved] = useState(null);       // last saved copy, to know about unsaved changes
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [tab, setTab] = useState('details');      // details | access

  useEffect(() => {
    if (isNew) return;
    ownerApi(`/companies/${id}`)
      .then(c => { const f = { ...c, addons: c.addons || {}, maxUsers: String(c.maxUsers), poApprovalLimit: String(c.poApprovalLimit ?? 0) }; setForm(f); setSaved(f); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (patch) => { setMessage(''); setForm(f => ({ ...f, ...patch })); };
  const field = (key) => ({ value: form[key] ?? '', onChange: e => set({ [key]: e.target.value }) });
  const dirty = isNew ? JSON.stringify(form) !== JSON.stringify(blank) : JSON.stringify(form) !== JSON.stringify(saved);

  async function save() {
    setError(''); setMessage(''); setBusy(true);
    try {
      const body = { ...form, maxUsers: Number(form.maxUsers) };
      if (isNew) {
        const r = await ownerApi('/companies', { method: 'POST', body });
        onCreated(r.id);
      } else {
        const c = await ownerApi(`/companies/${id}`, { method: 'PUT', body });
        const f = { ...c, addons: c.addons || {}, maxUsers: String(c.maxUsers), poApprovalLimit: String(c.poApprovalLimit ?? 0) };
        setForm(f); setSaved(f);
        setMessage('Saved. The client sees the change the next time they sign in or reload.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError(''); setMessage('');
    try {
      const r = await ownerApi(`/companies/${id}/reset-admin-password`, { method: 'POST', body: { password: newPassword } });
      setMessage(`Password for "${r.username}" changed. Share it with the client privately.`);
      setResetOpen(false); setNewPassword('');
    } catch (e) {
      setError(e.message);
    }
  }

  // Ctrl+S saves
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function back() {
    if (dirty && !window.confirm('Discard the changes on this screen?')) return;
    onBack();
  }

  if (loading) return <div className="screen"><p className="hint">Loading client…</p></div>;

  return (
    <div className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{isNew ? 'New client' : form.name}</h1>
        {!isNew && <span className={`chip ${form.status === 'active' ? 'chip-teal' : 'chip-amber'}`}>{form.status === 'active' ? 'ACTIVE' : 'SUSPENDED'}</span>}
        {dirty && <span className="chip chip-grey">UNSAVED CHANGES</span>}
        <span className="hint" style={{ marginLeft: 'auto' }}>Fields marked <span className="req">*</span> are required</span>
      </div>

      <div className="toolbar">
        <button type="button" className="tb" onClick={back}>← All clients</button>
        <button type="button" className="tb tb-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? <>Create client <kbd className="tb-kbd">Ctrl S</kbd></> : <>Save <kbd className="tb-kbd">Ctrl S</kbd></>}</button>
        {!isNew && <button type="button" className="tb" style={{ marginLeft: 'auto' }} onClick={() => setResetOpen(o => !o)}>Reset client admin password</button>}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {resetOpen && (
        <div className="panel owner-reset">
          <label className="f"><span>New password for "{form.adminUsername}" (at least 8 characters)</span>
            <input className="inp" type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus />
          </label>
          <button type="button" className="tb tb-primary" onClick={resetPassword}>Set password</button>
          <button type="button" className="tb" onClick={() => { setResetOpen(false); setNewPassword(''); }}>Cancel</button>
        </div>
      )}

      <div className="cs-tabs" role="tablist" aria-label="Client sections">
        <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details</button>
        <button type="button" role="tab" aria-selected={tab === 'access'} className={tab === 'access' ? 'on' : ''} onClick={() => setTab('access')}>Access &amp; add-ons</button>
      </div>

      {tab === 'details' && <div className="owner-cols">
        <section className="panel">
          <div className="panel-head">Client company</div>
          <div className="form-grid owner-grid">
            <label className="f span2"><span>Company name <span className="req">*</span></span><input className="inp" {...field('name')} /></label>
            <label className="f"><span>Short code <span className="req">*</span></span>
              {isNew ? <input className="inp" maxLength={10} placeholder="e.g. ASPS" {...field('code')} onChange={e => set({ code: e.target.value.toUpperCase() })} />
                : <span className="ro">{form.code}</span>}
            </label>
            <label className="f"><span>GSTIN</span><input className="inp" maxLength={15} {...field('gstin')} /></label>
            <label className="f span4"><span>Address <span className="req">*</span></span><input className="inp" {...field('addressLine')} /></label>
            <label className="f"><span>City</span><input className="inp" {...field('city')} /></label>
            <label className="f"><span>State</span><input className="inp" {...field('state')} /></label>
            <label className="f"><span>PIN</span><input className="inp" maxLength={6} {...field('pin')} /></label>
            <label className="f"><span>Country</span><input className="inp" {...field('country')} /></label>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">Contact person &amp; licence</div>
          <div className="form-grid owner-grid two">
            <label className="f"><span>Contact name <span className="req">*</span></span><input className="inp" {...field('contactName')} /></label>
            <label className="f"><span>Designation</span><input className="inp" {...field('contactDesignation')} /></label>
            <label className="f"><span>Mobile</span><input className="inp" {...field('contactMobile')} /></label>
            <label className="f"><span>Email</span><input className="inp" type="email" {...field('contactEmail')} /></label>
            <label className="f" title="Leave empty for no end date. After this date the client can only view data."><span>Licence valid till</span>
              <DateInput ariaLabel="Licence valid till" value={form.licenceValidTill} onChange={v => set({ licenceValidTill: v })} />
            </label>
            <label className="f"><span>Max users <span className="req">*</span>{!isNew && <span className="hint"> · {form.usersUsed} in use</span>}</span>
              <input className="inp" inputMode="numeric" {...field('maxUsers')} onChange={e => set({ maxUsers: e.target.value.replace(/[^\d]/g, '') })} />
            </label>
            <label className="f" title="Used only when the function 'PO needs approval' is ticked for this client. 0 = every PO needs approval."><span>PO approval above (₹)</span>
              <input className="inp" inputMode="numeric" {...field('poApprovalLimit')} onChange={e => set({ poApprovalLimit: e.target.value.replace(/[^\d]/g, '') })} />
            </label>
            {isNew ? (
              <>
                <label className="f"><span>Client admin login <span className="req">*</span></span><input className="inp" autoComplete="off" {...field('adminUsername')} /></label>
                <label className="f"><span>Client admin password <span className="req">*</span></span><input className="inp" type="text" autoComplete="off" placeholder="At least 8 characters" {...field('adminPassword')} /></label>
              </>
            ) : (
              <>
                <label className="f"><span>Client admin login</span><span className="ro">{form.adminUsername || '—'}</span></label>
                <label className="f" title="Suspended clients can't sign in at all"><span>Status</span>
                  <select className="inp" {...field('status')}><option value="active">Active</option><option value="suspended">Suspended</option></select>
                </label>
              </>
            )}
          </div>
        </section>
      </div>}

      {tab === 'access' && (
        <section className="panel acc-panel">
          <AccessEditor catalog={catalog} form={form} set={set} />
        </section>
      )}
    </div>
  );
}
