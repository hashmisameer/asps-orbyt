import { useEffect, useState } from 'react';
import { OrbitMark } from '../components/Logo.jsx';
import { READY_SCREENS } from './menu.js';
import ChangePassword from '../components/ChangePassword.jsx';
import OrderEntry from '../screens/OrderEntry.jsx';
import Costing from '../screens/Costing.jsx';
import Bom from '../screens/Bom.jsx';
import SimpleMaster from '../screens/SimpleMaster.jsx';
import PartyMaster from '../screens/PartyMaster.jsx';
import BrandMaster from '../screens/BrandMaster.jsx';

// Built screens: id -> component, tab title and breadcrumb
const SCREENS = {
  orderEntry: { component: OrderEntry, title: 'Order entry', crumb: 'Order › Order entry' },
  costing: { component: Costing, title: 'Costing', crumb: 'Order › Costing' },
  bom: { component: Bom, title: 'BOM', crumb: 'Order › BOM' },
  party: { component: PartyMaster, title: 'Party master', crumb: 'Masters › Party master' },
  brand: { component: BrandMaster, title: 'Brand master', crumb: 'Masters › Brand master' },
  season: { component: SimpleMaster, props: { kind: 'season' }, title: 'Season', crumb: 'Masters › Season' },
  currency: { component: SimpleMaster, props: { kind: 'currency' }, title: 'Currency', crumb: 'Masters › Currency' },
  itemGroup: { component: SimpleMaster, props: { kind: 'item_group' }, title: 'Summary items', crumb: 'Masters › Item group' },
  item: { component: SimpleMaster, props: { kind: 'item' }, title: 'Items', crumb: 'Masters › Item master' }
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

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'U';
}

export default function AppShell({ session, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false); // the Menu panel (modules on the left, screens on the right)
  const [menuMod, setMenuMod] = useState(null);     // module shown in the Menu panel
  const [menuQ, setMenuQ] = useState('');           // search inside the Menu panel
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openList, setOpenList] = useState(false);  // "open screens" switcher
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');                   // text in the command box
  const [sel, setSel] = useState(0);                // highlighted result in the command box
  const [userMenu, setUserMenu] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [tabs, setTabs] = useState([]);             // open screens, e.g. ['orderEntry']
  const [active, setActive] = useState('home');     // 'home' or a screen id
  const [requests, setRequests] = useState({});    // screen id -> record to open there, e.g. { costingId: 5, n: 1 }

  // The server sends only the modules and screens this user may open
  const menu = session.menu || [];

  // Top bar icons: only the ones the owner gave this client (and this user's role may see)
  const hasTool = (code) => Boolean(session.permissions?.[code]);
  const quickLinks = [
    { code: 'tool.favourites', label: 'Favourites', icon: Icon.star },
    { code: 'tool.approvals', label: 'Approvals', icon: Icon.approvals },
    { code: 'tool.calendar', label: 'T&A calendar', icon: Icon.calendar },
    { code: 'tool.reports', label: 'Reports', icon: Icon.reports },
    { code: 'tool.help', label: 'Help', icon: Icon.help },
    { code: 'tool.notifications', label: 'Notifications', icon: Icon.bell }
  ].filter(t => hasTool(t.code));

  // Messages disappear after a few seconds
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Every screen the user may open, with the module it belongs to
  const allItems = menu.flatMap(m => m.groups.flatMap(g => g.items.map(item => ({ ...item, mod: m.code, where: `${m.name} › ${g.title}` }))));
  const moduleOfScreen = (id) => allItems.find(i => READY_SCREENS[i.code] === id)?.mod;
  const activeMod = active === 'home' ? 'home' : moduleOfScreen(active);

  // Command box: open screens first, then screens whose name matches, then screens that match by module or group
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const inName = (i) => words.every(w => i.name.toLowerCase().includes(w));
  const results = [
    ...tabs.filter(id => !words.length || words.every(w => SCREENS[id].title.toLowerCase().includes(w)))
      .map(id => ({ key: `open-${id}`, label: SCREENS[id].title, hint: 'Open now · switch to it', run: () => switchTo(id) })),
    ...(words.length
      ? [...allItems.filter(inName), ...allItems.filter(i => !inName(i) && words.every(w => `${i.name} ${i.where}`.toLowerCase().includes(w)))]
      : allItems.filter(i => READY_SCREENS[i.code]).slice(0, 8)
    ).map(i => ({ key: i.code, label: i.name, hint: i.where, soon: !READY_SCREENS[i.code], run: () => openScreen(i) }))
  ];

  // Ctrl+K opens the command box; Esc closes any drop-down
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setMenuOpen(false); setOpenList(false); setPaletteOpen(true); }
      if (e.key === 'Escape') { setMenuOpen(false); setOpenList(false); setUserMenu(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (!paletteOpen) { setQ(''); setSel(0); } }, [paletteOpen]);
  useEffect(() => { setSel(0); }, [q]);

  function closeAll() { setMenuOpen(false); setOpenList(false); setPaletteOpen(false); setUserMenu(false); }
  function switchTo(id) { closeAll(); setActive(id); }
  function openScreen(item) {
    closeAll();
    const id = READY_SCREENS[item.code];
    if (!id) { setNotice(`"${item.name}" is coming in a later phase.`); return; }
    setTabs(t => (t.includes(id) ? t : [...t, id]));
    setActive(id);
  }
  // Open another screen on one record (links in the flow strip and the Linked panel)
  function goTo(id, request) {
    const code = Object.keys(READY_SCREENS).find(c => READY_SCREENS[c] === id);
    if (!code || !session.permissions?.[code]) { setNotice("You don't have access to that screen. Ask your administrator."); return; }
    closeAll();
    setTabs(t => (t.includes(id) ? t : [...t, id]));
    setActive(id);
    if (request) setRequests(r => ({ ...r, [id]: { ...request, n: Date.now() } }));
  }
  function closeTab(id) {
    const rest = tabs.filter(x => x !== id);
    setTabs(rest);
    if (active === id) setActive(rest.length ? rest[rest.length - 1] : 'home');
  }

  const { user, company, unit, financialYear, licence } = session;
  const place = [unit?.name, financialYear && `FY ${financialYear.label}`].filter(Boolean).join(' · ');
  // Menu panel: the module picked on the left (default: the module of the screen on view), or search results
  const panelMod = menu.find(m => m.code === menuMod) || menu.find(m => m.code === activeMod) || menu[0];
  const menuWords = menuQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const menuFound = menuWords.length ? allItems.filter(i => menuWords.every(w => `${i.name} ${i.where}`.toLowerCase().includes(w))) : [];
  const crumb = active === 'home' ? 'Home' : SCREENS[active]?.crumb || '';

  return (
    <div className="shell">
      <header className="appbar">
        <button type="button" className="appbar-logo" onClick={() => switchTo('home')} aria-label="Home">
          <OrbitMark width={26} /><span>orbyt</span>
        </button>
        <button type="button" className={`appbar-menu ${menuOpen ? 'open' : ''}`} aria-expanded={menuOpen}
          onClick={() => { setOpenList(false); setUserMenu(false); setMenuQ(''); setMenuMod(null); setMenuOpen(o => !o); }}>
          {menuOpen ? Icon.close : Icon.menu}<span>Menu</span>
        </button>
        <span className="appbar-crumb" title={crumb}>{crumb}</span>

        <button type="button" className="appbar-cmd" onClick={() => { closeAll(); setPaletteOpen(true); }}>
          {Icon.search}<span>Jump to a screen…</span><kbd>Ctrl K</kbd>
        </button>

        {tabs.length > 0 && (
          <div className="appbar-pop">
            <button type="button" className="appbar-open" aria-expanded={openList} onClick={() => { setMenuOpen(false); setUserMenu(false); setOpenList(o => !o); }}>
              <b>{tabs.length}</b> open
            </button>
            {openList && (
              <div className="pop-panel open-panel" role="menu">
                <div className="pop-head">Open screens</div>
                {tabs.map(id => (
                  <div key={id} className={`open-row ${active === id ? 'on' : ''}`}>
                    <button type="button" role="menuitem" onClick={() => switchTo(id)}>{SCREENS[id].title}<small>{SCREENS[id].crumb}</small></button>
                    <button type="button" className="tab-x" aria-label={`Close ${SCREENS[id].title}`} onClick={() => closeTab(id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {quickLinks.length > 0 && (
          <div className="appbar-tools">
            {quickLinks.map(t => <button key={t.code} type="button" className="icon-btn" title={t.label} aria-label={t.label}>{t.icon}</button>)}
          </div>
        )}

        <div className="appbar-pop">
          <button type="button" className="appbar-me" aria-haspopup="menu" aria-expanded={userMenu} aria-label={`Account: ${user.username}`}
            onClick={() => { setMenuOpen(false); setOpenList(false); setUserMenu(o => !o); }}>
            <span className="appbar-co"><b>{company.name}</b><span>{place}</span></span>
            <span className="avatar">{initials(user.fullName)}</span>
          </button>
          {userMenu && (
            <div className="pop-panel user-panel" role="menu">
              <div className="user-menu-head"><b>{user.fullName}</b><span>{user.username} · {user.role}</span><span className="um-co">{company.name}<br />{place}</span></div>
              <button type="button" role="menuitem" onClick={() => { setUserMenu(false); setPwOpen(true); }}>Change password</button>
              <button type="button" role="menuitem" className="danger" onClick={() => { setUserMenu(false); onLogout(); }}>Log out</button>
            </div>
          )}
        </div>
      </header>

      {/* Menu panel: modules on the left, their screens on the right, search on top */}
      {menuOpen && (
        <>
          <div className="drop-dim" onMouseDown={() => setMenuOpen(false)} />
          <section className="menu-pop" aria-label="Menu">
            <nav className="menu-pop-mods" aria-label="Modules">
              <button type="button" className="menu-pop-mod" onClick={() => switchTo('home')}><span>Home</span></button>
              {menu.map(m => (
                <button key={m.code} type="button" className={`menu-pop-mod ${!menuWords.length && m.code === panelMod?.code ? 'on' : ''}`}
                  onClick={() => { setMenuQ(''); setMenuMod(m.code); }}>
                  <span>{m.name}</span><small>{m.groups.reduce((n, g) => n + g.items.length, 0)}</small>
                </button>
              ))}
            </nav>
            <div className="menu-pop-body">
              <div className="menu-pop-top">
                <h2>{menuWords.length ? 'Search results' : panelMod?.name}</h2>
                <label className="menu-pop-search">
                  {Icon.search}<span className="sr-only">Search screens</span>
                  <input autoFocus type="search" placeholder="Search screens" value={menuQ} onChange={e => setMenuQ(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && menuFound[0]) openScreen(menuFound[0]); }} />
                </label>
              </div>
              {menuWords.length ? (
                <div className="menu-pop-results">
                  {menuFound.length === 0 && <p className="hint">No screen matches "{menuQ}".</p>}
                  {menuFound.map(i => (
                    <button key={i.code} type="button" className="mod-drop-link" onClick={() => openScreen(i)}>
                      <span>{i.name}<small>{i.where}</small></span>{!READY_SCREENS[i.code] && <span className="soon">soon</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="menu-pop-groups">
                  {(panelMod?.groups || []).map(g => (
                    <div key={g.title} className="mod-drop-group">
                      <h3>{g.title}</h3>
                      {g.items.map(item => (
                        <button key={item.code} type="button" className={`mod-drop-link ${READY_SCREENS[item.code] === active ? 'cur' : ''}`} onClick={() => openScreen(item)}>
                          {item.name}{!READY_SCREENS[item.code] && <span className="soon">soon</span>}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
      {(openList || userMenu) && <div className="drop-dim clear" onMouseDown={() => { setOpenList(false); setUserMenu(false); }} />}

      {/* Command box */}
      {paletteOpen && (
        <div className="palette-back" onMouseDown={e => { if (e.target === e.currentTarget) setPaletteOpen(false); }}>
          <div className="palette" role="dialog" aria-label="Jump to a screen">
            <label className="palette-in">{Icon.search}<span className="sr-only">Screen name</span>
              <input autoFocus placeholder="Type a screen name, e.g. party, costing, bom" value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(i + 1, results.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter' && results[sel]) results[sel].run();
                  if (e.key === 'Escape') setPaletteOpen(false);
                }} />
            </label>
            <div className="palette-list">
              {results.length === 0 && <p className="hint" style={{ padding: '10px 14px' }}>No screen matches "{q}".</p>}
              {results.map((r, i) => (
                <button key={r.key} type="button" className={`palette-row ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={r.run}>
                  <span>{r.label}<small>{r.hint}</small></span>{r.soon && <span className="soon">soon</span>}
                </button>
              ))}
            </div>
            <p className="palette-foot">↑ ↓ to move · Enter to open · Esc to close</p>
          </div>
        </div>
      )}

      <main className="workspace">
        {licence?.expired && (
          <div className="alert alert-error" role="alert">Your ORBYT licence ended on {fmtDate(licence.validTill)}. You can view data, but saving is paused. Contact ORBYT support to renew.</div>
        )}
        {licence?.warn && (
          <div className="alert alert-warn" role="status">Your ORBYT licence ends on {fmtDate(licence.validTill)} ({licence.daysLeft === 0 ? 'today' : `${licence.daysLeft} day${licence.daysLeft === 1 ? '' : 's'} left`}). Contact ORBYT support to renew.</div>
        )}
        {notice && <div className="alert alert-info" role="status">{notice}</div>}
        {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} onDone={() => { setPwOpen(false); setNotice('Your password has been changed. Use the new one next time you sign in.'); }} />}

        {active === 'home' && (
          <div className="home">
            {tabs.length > 0 && (
              <section className="home-box">
                <h2>Open now</h2>
                <div className="home-grid">
                  {tabs.map(id => <button key={id} type="button" onClick={() => switchTo(id)}>{SCREENS[id].title}<small>{SCREENS[id].crumb}</small></button>)}
                </div>
              </section>
            )}
            <section className="home-box">
              <h2>Start something</h2>
              <div className="home-grid">
                {allItems.filter(i => READY_SCREENS[i.code]).map(i => (
                  <button key={i.code} type="button" onClick={() => openScreen(i)}>{i.name}<small>{i.where}</small></button>
                ))}
              </div>
              <p className="hint" style={{ margin: '12px 0 0' }}>Tip: press <kbd>Ctrl K</kbd> anywhere and type a screen name.</p>
            </section>
          </div>
        )}

        {/* Open screens stay mounted so unsaved work is kept when switching */}
        {tabs.map(id => {
          const Screen = SCREENS[id].component;
          return (
            <div key={id} style={{ display: active === id ? 'contents' : 'none' }}>
              <Screen {...(SCREENS[id].props || {})} session={session} active={active === id && !paletteOpen} onNotice={setNotice} onGo={goTo} request={requests[id]} />
            </div>
          );
        })}
      </main>
    </div>
  );
}
