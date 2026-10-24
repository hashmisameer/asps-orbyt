// Small window where a signed-in user changes their own password.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function ChangePassword({ onClose, onDone }) {
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);

  const set = (k) => (e) => { setError(''); setForm(f => ({ ...f, [k]: e.target.value })); };

  async function submit(e) {
    e.preventDefault();
    if (!form.current || !form.next || !form.again) { setError('Fill in all three boxes.'); return; }
    if (form.next.length < 8) { setError('The new password must have at least 8 characters.'); return; }
    if (form.next !== form.again) { setError('The two new passwords don\'t match.'); return; }
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: form.current, newPassword: form.next } });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const type = show ? 'text' : 'password';
  return (
    <div className="find-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="find-panel pw-panel" role="dialog" aria-label="Change password" onSubmit={submit} noValidate
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="find-head"><h2>Change password</h2><button type="button" className="tab-x" aria-label="Close" onClick={onClose}>×</button></div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <label className="f"><span>Current password</span>
          <input ref={first} className="inp" type={type} autoComplete="current-password" value={form.current} onChange={set('current')} />
        </label>
        <label className="f"><span>New password (at least 8 characters)</span>
          <input className="inp" type={type} autoComplete="new-password" value={form.next} onChange={set('next')} />
        </label>
        <label className="f"><span>New password again</span>
          <input className="inp" type={type} autoComplete="new-password" value={form.again} onChange={set('again')} />
        </label>
        <label className="check pw-show"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show passwords</label>
        <div className="foot-act">
          <button type="button" className="tb" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button>
          <button type="submit" className="tb tb-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </div>
  );
}
