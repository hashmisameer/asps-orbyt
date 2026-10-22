import { useEffect, useMemo, useState } from 'react';
import { OrbitMark, Wordmark } from '../components/Logo.jsx';
import { MENU, READY_SCREENS } from './menu.js';
import OrderEntry from '../screens/OrderEntry.jsx';

// Built screens: id -> component, tab title and breadcrumb
const SCREENS = {
  orderEntry: { component: OrderEntry, title: 'Order entry', crumb: 'Order › Order entry' }
};

const Icon = {
  menu: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  star: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></svg>,
  approvals: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  reports: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>,
  help: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4M12 17h.01" /></svg>,
  bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 21h4" /></svg>,
  power: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v9M6.3 6.3a8 8 0 1011.4 0" /></svg>
};

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'U';
}

export default function AppShell({ session, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mod, setMod] = useState('masters');
  const [notice, setNotice] = useState('');
  const [tabs, setTabs] = useState([]);          // open screens, e.g. ['orderEntry']
  const [active, setActive] = useState('home');  // 'home' or a screen id

  // Only modules switched on for this company appear in the menu
  const menu = useMemo(() => MENU.filter(m => session.modules.includes(m.code)), [session.modules]);
  const current = menu.find(m => m.code === mod) || menu[0];

  // Messages disappear after a few seconds
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  function openScreen(name) {
    setMenuOpen(false);
    const id = READY_SCREENS[name];
    if (!id) { setNotice(`"${name}" is coming in a later phase.`); return; }
    setTabs(t => (t.includes(id) ? t : [...t, id]));
    setActive(id);
  }

  function closeTab(id) {
    setTabs(t => t.filter(x => x !== id));
    if (active === id) setActive('home');
  }

  const { user, company, unit, financialYear } = session;
  const place = [unit?.name, financialYear && `FY ${financialYear.label}`].filter(Boolean).join(' · ');
  const crumb = menuOpen ? 'Menu' : (SCREENS[active]?.crumb || 'Home');

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-row1">
          <div className="brand">
            <OrbitMark width={40} />
            <div>
              <div className="brand-name">{company.name}</div>
              <div className="brand-sub">{place}</div>
            </div>
          </div>
          <label className="search">
            {Icon.search}
            <span className="sr-only">Search</span>
            <input type="search" placeholder="Search screens, orders, styles or POs" />
            <span className="kbd">Ctrl K</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="icon-btn" aria-label="Help">{Icon.help}</button>
            <button type="button" className="icon-btn" aria-label="Notifications">{Icon.bell}</button>
            <button type="button" className="user-btn" aria-label={`Account: ${user.username}`}>
              <span className="avatar">{initials(user.fullName)}</span>
              <span className="user-text"><b>{user.fullName}</b><span>{user.role}</span></span>
            </button>
            <button type="button" className="icon-btn" aria-label="Log out" style={{ color: 'var(--danger)' }} onClick={onLogout}>{Icon.power}</button>
          </div>
        </div>
        <div className="topbar-row2">
          <button type="button" className="menu-btn" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? Icon.close : Icon.menu}{menuOpen ? 'Close menu' : 'Menu'}
          </button>
          <span className="vsep" aria-hidden="true" />
          <button type="button" className="tool-btn">{Icon.star}Favourites</button>
          <button type="button" className="tool-btn">{Icon.approvals}Approvals</button>
          <button type="button" className="tool-btn">{Icon.calendar}T&amp;A calendar</button>
          <button type="button" className="tool-btn">{Icon.reports}Reports</button>
          <nav className="crumb" aria-label="Breadcrumb">{crumb}</nav>
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={active === 'home'} className={`tab ${active === 'home' ? 'active' : ''}`}
          onClick={() => { setActive('home'); setMenuOpen(false); }}>Home</button>
        {tabs.map(id => (
          <div key={id} role="tab" aria-selected={active === id} className={`tab ${active === id ? 'active' : ''}`}>
            <button type="button" className="tab-label" onClick={() => { setActive(id); setMenuOpen(false); }}>{SCREENS[id].title}</button>
            <button type="button" className="tab-x" aria-label={`Close ${SCREENS[id].title}`} onClick={() => closeTab(id)}>×</button>
          </div>
        ))}
      </div>

      <main className="workspace">
        <div className="watermark" aria-hidden="true"><OrbitMark width={230} /><Wordmark size={170} /></div>

        {notice && <div className="alert alert-info" role="status">{notice}</div>}

        {menuOpen && (
          <section className="menu-panel" aria-label="Menu">
            <nav className="menu-mods" aria-label="Modules">
              {menu.map(m => (
                <button key={m.code} type="button" className={`menu-mod ${m.code === current.code ? 'active' : ''}`} onClick={() => setMod(m.code)}>
                  <span>{m.name}</span>
                  <span style={{ fontSize: 11 }}>{m.groups.reduce((n, g) => n + g.items.length, 0)}</span>
                </button>
              ))}
            </nav>
            <div className="menu-body">
              <h2>{current.name}</h2>
              <div className="menu-groups">
                {current.groups.map(g => (
                  <div key={g.title}>
                    <div className="menu-group-title">{g.title.toUpperCase()}</div>
                    {g.items.map(item => (
                      <button key={item} type="button" className="menu-link" onClick={() => openScreen(item)}>
                        {item}{!READY_SCREENS[item] && <span className="soon">soon</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Open screens stay mounted so unsaved work is kept when switching tabs */}
        {tabs.map(id => {
          const Screen = SCREENS[id].component;
          return (
            <div key={id} style={{ display: !menuOpen && active === id ? 'contents' : 'none' }}>
              <Screen session={session} active={!menuOpen && active === id} onNotice={setNotice} />
            </div>
          );
        })}
      </main>

      <footer className="statusbar">
        <span className="ok">● Ready</span>
        <span>User: {user.username} ({user.role})</span>
        <span>Company: {company.name}{unit ? ` · ${unit.name}` : ''}</span>
        {financialYear && <span>FY {financialYear.label}</span>}
        <span className="right">Powered by <b style={{ color: '#fff' }}>Orbyt</b> v1.0</span>
      </footer>
    </div>
  );
}
