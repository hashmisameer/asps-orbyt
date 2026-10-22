import { useEffect, useState } from 'react';
import { api, getToken, clearToken } from './api.js';
import Login from './pages/Login.jsx';
import AppShell from './layout/AppShell.jsx';
import OwnerApp from './owner/OwnerApp.jsx';

// /owner opens the ORBYT owner console; everything else is the client ERP
const isOwnerConsole = window.location.pathname.replace(/\/+$/, '') === '/owner';

export default function App() {
  return isOwnerConsole ? <OwnerApp /> : <ClientApp />;
}

function ClientApp() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(!!getToken());

  // If a token is saved, check it is still valid and load the session
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(setSession)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* signing out anyway */ }
    clearToken();
    setSession(null);
  }

  if (checking) return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading ORBYT…</div>;
  if (!session) return <Login onSignedIn={setSession} />;

  return (
    <AppShell session={session} onLogout={logout} />
  );
}
