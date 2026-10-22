import { useEffect, useState } from 'react';
import { api, saveToken } from '../api.js';
import { OrbitMark, Wordmark } from '../components/Logo.jsx';

export default function Login({ onSignedIn }) {
  const [company, setCompany] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Show which company workspace this is
  useEffect(() => {
    api('/companies/public').then(setCompany).catch(() => setCompany(null));
  }, []);

  const userMissing = tried && !username.trim();
  const passMissing = tried && !password;

  async function submit(e) {
    e.preventDefault();
    setTried(true);
    setError('');
    if (!username.trim() || !password) return;
    setBusy(true);
    try {
      const { token, session } = await api('/auth/login', { method: 'POST', body: { username, password } });
      saveToken(token, remember);
      onSignedIn(session);
    } catch (err) {
      setError(err.message);
      setPassword('');
      setTried(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <svg className="login-bg" viewBox="0 0 40 28" aria-hidden="true">
        <ellipse cx="20" cy="14" rx="16" ry="7.5" fill="none" stroke="#D3E6E3" strokeWidth="0.12" transform="rotate(-28 20 14)" />
        <ellipse cx="20" cy="14" rx="16" ry="7.5" fill="none" stroke="#D3E6E3" strokeWidth="0.12" transform="rotate(28 20 14)" />
      </svg>

      <div className="login-wrap">
        <div className="login-brand">
          <div className="login-brand-row"><OrbitMark width={48} /><Wordmark size={30} /></div>
          <span className="tagline">OPERATIONS · RESOURCES · BUSINESS · YIELD</span>
        </div>

        <form className="login-card" onSubmit={submit} noValidate>
          <h1>Sign in to your workspace</h1>
          <div className="chip-row">
            {company && (
              <span className="company-chip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 21V5l8-3 8 3v16" /><path d="M9 21v-5h6v5" /></svg>
                {company.name}
              </span>
            )}
          </div>

          <div className="form">
            {error && <div className="alert alert-error" role="alert">{error}</div>}

            <div>
              <label className="label" htmlFor="username">User ID or email</label>
              <input id="username" className={`input ${userMissing ? 'invalid' : ''}`} autoComplete="username" placeholder="rahul.k"
                value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
              {userMissing && <div className="field-error">Enter your user ID or email.</div>}
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="pw-wrap">
                <input id="password" className={`input ${passMissing ? 'invalid' : ''}`} type={show ? 'text' : 'password'}
                  autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
              {passMissing && <div className="field-error">Enter your password.</div>}
            </div>

            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Keep me signed in on this computer
            </label>

            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </div>
        </form>

        <div className="login-foot">
          <span>Need access? Contact your ORBYT administrator.</span>
          <span>© 2026 Orbyt · v1.0 · Secure connection</span>
        </div>
      </div>
    </div>
  );
}
