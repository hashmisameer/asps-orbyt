// ORBYT owner console (super admin), opened at /owner. Separate login from the client ERP.
import { useEffect, useState } from 'react';
import { ownerApi, getOwnerToken, saveOwnerToken, clearOwnerToken } from '../api.js';
import { OrbitMark, Wordmark } from '../components/Logo.jsx';
import ClientList from './ClientList.jsx';
import ClientSetup from './ClientSetup.jsx';
import OwnerAudit from './OwnerAudit.jsx';
import CataloguePrices from './CataloguePrices.jsx';

export default function OwnerApp() {
  const [owner, setOwner] = useState(null);
  const [checking, setChecking] = useState(!!getOwnerToken());

  useEffect(() => {
    if (!getOwnerToken()) return;
    ownerApi('/me').then(r => setOwner(r.owner)).catch(() => clearOwnerToken()).finally(() => setChecking(false));
  }, []);

  if (checking) return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading owner console…</div>;
  if (!owner) return <OwnerLogin onSignedIn={setOwner} />;
  return <OwnerConsole owner={owner} onLogout={() => { clearOwnerToken(); setOwner(null); }} />;
}

function OwnerLogin({ onSignedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Enter your user ID and password.'); return; }
    setBusy(true);
    try {
      const r = await ownerApi('/login', { method: 'POST', body: { username, password } });
      saveOwnerToken(r.token);
      onSignedIn(r.owner);
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
        <div className="login-brand">
          <div className="login-brand-row"><OrbitMark width={48} /><Wordmark size={30} /></div>
          <span className="owner-badge">OWNER CONSOLE</span>
        </div>
        <form className="login-card owner-card" onSubmit={submit} noValidate>
          <h1>Owner sign in</h1>
          <p className="owner-note">Only for the ORBYT owner. Client users sign in on the normal ORBYT page.</p>
          <div className="form">
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <div>
              <label className="label" htmlFor="o-user">User ID</label>
              <input id="o-user" className="input" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="o-pass">Password</label>
              <input id="o-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OwnerConsole({ owner, onLogout }) {
  const [tab, setTab] = useState('clients');
  const [editing, setEditing] = useState(null);   // null = list, 'new' or a company id
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { ownerApi('/catalog').then(setCatalog).catch(e => setError(e.message)); }, []);

  return (
    <div className="owner-shell">
      <header className="owner-top">
        <OrbitMark width={32} />
        <span className="owner-word">ORBYT</span>
        <span className="owner-badge">OWNER CONSOLE</span>
        <span className="owner-who">Signed in as {owner.fullName} ({owner.username})</span>
        <button type="button" className="owner-out" onClick={onLogout}>Sign out</button>
      </header>
      <nav className="owner-nav" aria-label="Owner console">
        <button type="button" className={tab === 'clients' ? 'on' : ''} onClick={() => { setTab('clients'); setEditing(null); }}>Clients</button>
        <button type="button" className={tab === 'catalogue' ? 'on' : ''} onClick={() => setTab('catalogue')}>Catalogue &amp; prices</button>
        <button type="button" className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Owner audit log</button>
      </nav>
      <main className="owner-main">
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {tab === 'audit' && <OwnerAudit catalog={catalog} />}
        {tab === 'catalogue' && catalog && <CataloguePrices catalog={catalog} onChange={setCatalog} />}
        {tab === 'clients' && editing === null && <ClientList onOpen={setEditing} />}
        {tab === 'clients' && editing !== null && catalog && (
          <ClientSetup key={editing} id={editing === 'new' ? null : editing} catalog={catalog}
            onBack={() => setEditing(null)} onCreated={(id) => setEditing(id)} />
        )}
      </main>
    </div>
  );
}
