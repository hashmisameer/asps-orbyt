// Owner console: create or change one client — company details, licence, and the
// modules, screens and reports this client gets. Anything left unticked is hidden from the client.
import { useEffect, useState } from 'react';
import { ownerApi } from '../api.js';
import DateInput from '../components/DateInput.jsx';

const blank = {
  name: '', code: '', gstin: '', addressLine: '', city: '', state: '', pin: '', country: 'India',
  contactName: '', contactDesignation: '', contactMobile: '', contactEmail: '',
  licenceValidTill: '', maxUsers: '10', status: 'active',
  adminUsername: 'admin', adminPassword: '', modules: [], features: []
};

const CheckIcon = ({ state }) => (
  <span className={`ocb ${state}`} aria-hidden="true" />
);

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

  useEffect(() => {
    if (isNew) return;
    ownerApi(`/companies/${id}`)
      .then(c => { const f = { ...c, maxUsers: String(c.maxUsers) }; setForm(f); setSaved(f); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (patch) => { setMessage(''); setForm(f => ({ ...f, ...patch })); };
  const field = (key) => ({ value: form[key] ?? '', onChange: e => set({ [key]: e.target.value }) });
  const dirty = isNew ? JSON.stringify(form) !== JSON.stringify(blank) : JSON.stringify(form) !== JSON.stringify(saved);

  // ---------- module and screen ticks ----------
  const moduleState = (m) => {
    if (m.alwaysOn) return 'y';
    if (!form.modules.includes(m.code)) return '';
    const on = m.features.filter(f => form.features.includes(f.code)).length;
    return on === m.features.length ? 'y' : 'h';
  };
  function toggleModule(m) {
    if (m.alwaysOn) return;
    const codes = m.features.map(f => f.code);
    if (form.modules.includes(m.code)) {
      set({ modules: form.modules.filter(c => c !== m.code), features: form.features.filter(c => !codes.includes(c)) });
    } else {
      set({ modules: [...form.modules, m.code], features: [...new Set([...form.features, ...codes])] });
    }
  }
  function toggleFeature(m, code) {
    if (m.alwaysOn) return;
    const has = form.features.includes(code);
    const features = has ? form.features.filter(c => c !== code) : [...form.features, code];
    const modules = form.modules.includes(m.code) ? form.modules : [...form.modules, m.code];
    set({ features, modules });
  }

  async function save() {
    setError(''); setMessage(''); setBusy(true);
    try {
      const body = { ...form, maxUsers: Number(form.maxUsers) };
      if (isNew) {
        const r = await ownerApi('/companies', { method: 'POST', body });
        onCreated(r.id);
      } else {
        const c = await ownerApi(`/companies/${id}`, { method: 'PUT', body });
        const f = { ...c, maxUsers: String(c.maxUsers) };
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
        <button type="button" className="tb tb-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create client (Ctrl+S)' : 'Save (Ctrl+S)'}</button>
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

      <div className="owner-cols">
        <section className="panel">
          <div className="panel-head">CLIENT COMPANY</div>
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
          <div className="panel-head">CONTACT PERSON &amp; LICENCE</div>
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
      </div>

      <section className="panel">
        <div className="panel-head panel-head-row"><span>MODULES, SCREENS &amp; REPORTS</span>
          <span className="hint">Tick a module, then the screens and reports this client gets. Anything unticked is hidden from them completely.</span></div>
        <div className="mod-grid">
          {catalog.map(m => {
            const state = moduleState(m);
            const on = m.alwaysOn || form.modules.includes(m.code);
            const groups = [...new Set(m.features.map(f => f.group))];
            const count = m.features.filter(f => m.alwaysOn || form.features.includes(f.code)).length;
            return (
              <div key={m.code} className={`mod-card ${on ? 'on' : 'off'}`}>
                <button type="button" className="mod-head" onClick={() => toggleModule(m)} disabled={m.alwaysOn}
                  aria-pressed={on} aria-label={`${m.name} module`}>
                  <CheckIcon state={state} />
                  <span>{m.name}</span>
                  <span className="mod-count">{m.alwaysOn ? 'Always on' : on ? `${count} of ${m.features.length}` : 'Off'}</span>
                </button>
                <div className="mod-body">
                  {groups.map(g => (
                    <div key={g} className="mod-group">
                      <div className="mod-group-title">{g.toUpperCase()}</div>
                      {m.features.filter(f => f.group === g).map(f => {
                        const ticked = m.alwaysOn || form.features.includes(f.code);
                        return (
                          <label key={f.code} className="mod-item">
                            <input type="checkbox" checked={ticked} disabled={m.alwaysOn} onChange={() => toggleFeature(m, f.code)} />
                            {f.name}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="hint" style={{ padding: '0 12px 12px', margin: 0 }}>Admin (users, roles, settings) is always on, so the client's head can manage their own users.</p>
      </section>
    </div>
  );
}
