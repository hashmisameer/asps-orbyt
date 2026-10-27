import { useEffect, useState } from 'react';
import { OrbitMark } from '../components/Logo.jsx';
import { READY_SCREENS } from './menu.js';
import ChangePassword from '../components/ChangePassword.jsx';
import OrderEntry from '../screens/OrderEntry.jsx';
import Costing from '../screens/Costing.jsx';
import Bom from '../screens/Bom.jsx';
import PurchaseOrder from '../screens/PurchaseOrder.jsx';
import SimpleMaster from '../screens/SimpleMaster.jsx';
import PartyMaster from '../screens/PartyMaster.jsx';
import BrandMaster from '../screens/BrandMaster.jsx';
import BasicMasters from '../screens/BasicMasters.jsx';

// Built screens: id -> component, tab title and breadcrumb
const SCREENS = {
  productCategory: { component: SimpleMaster, props: { kind: 'style' }, title: 'Product category', crumb: 'Order › Product category' },
  orderEntry: { component: OrderEntry, title: 'Order entry', crumb: 'Order › Order entry' },
  costing: { component: Costing, title: 'Costing', crumb: 'Order › Costing' },
  bom: { component: Bom, title: 'BOM', crumb: 'Order › BOM' },
  party: { component: PartyMaster, title: 'Party master', crumb: 'Masters › Party master' },
  brand: { component: BrandMaster, title: 'Brand master', crumb: 'Masters › Brand master' },
  basic: { component: BasicMasters, title: 'Basic masters', crumb: 'Masters › Basic masters' },
  itemGroup: { component: SimpleMaster, props: { kind: 'item_group' }, title: 'Summary items', crumb: 'Masters › Item group' },
  item: { component: SimpleMaster, props: { kind: 'item' }, title: 'Items', crumb: 'Masters › Item master' },
  purchaseOrder: { component: PurchaseOrder, title: 'Purchase order', crumb: 'Purchase › Purchase order' }
};

const Icon = {
  menu: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  approvals: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  reports: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>,
  help: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4M12 17h.01" /></svg>,
  bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 21h4" /></svg>,
  power: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v9M6.3 6.3a8 8 0 1011.4 0" /></svg>
};

// Screens built with the record layout (list -> form, chatter on the right) fill the page edge to edge
const FLUSH_SCREENS = ['productCategory', 'orderEntry', 'costing', 'bom', 'party', 'brand', 'basic', 'itemGroup', 'item', 'purchaseOrder'];
const TILE_COLOURS = ['#0F766E', '#1D4ED8', '#B45309', '#7C3AED', '#BE123C', '#047857', '#0369A1', '#4D7C0F'];

// App icons on Home (Odoo-style launcher): one picture and colour per module
const P = (d) => <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const MOD_ICONS = {
  masters: ['#0F766E', '#14B8A6', P(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>)],
  order: ['#1D4ED8', '#60A5FA', P(<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>)],
  purchase: ['#B45309', '#F59E0B', P(<><path d="M3 4h2l2.4 11h10.2L20 7H6.2" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>)],
  inventory: ['#7C3AED', '#A78BFA', P(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>)],
  production: ['#BE123C', '#FB7185', P(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></>)],
  finance: ['#047857', '#34D399', P(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>)],
  admin: ['#334155', '#94A3B8', P(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>)],
  cutting: ['#0369A1', '#38BDF8', P(<><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></>)],
  stitching: ['#9D174D', '#F472B6', P(<><path d="M4 20L20 4" /><circle cx="18" cy="6" r="1.5" /><path d="M6 10c2 0 2 4 4 4s2-4 4-4" /></>)],
  finishing: ['#4D7C0F', '#A3E635', P(<><path d="M8 3l-5 4 3 3 2-1v12h8V9l2 1 3-3-5-4c-1 2-2.5 3-4 3S9 5 8 3z" /></>)],
  sampling: ['#C2410C', '#FB923C', P(<><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21h11.6a2 2 0 001.7-2.5L14 9V3" /><path d="M7 15h10" /></>)],
  jobwork: ['#0E7490', '#22D3EE', P(<><path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12" /></>)],
  export: ['#1E40AF', '#818CF8', P(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>)],
  reports: ['#6D28D9', '#C084FC', P(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>)]
};
const modIcon = (code, i) => MOD_ICONS[code] || [TILE_COLOURS[i % TILE_COLOURS.length], TILE_COLOURS[(i + 3) % TILE_COLOURS.length], null];

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'U';
}

export default function AppShell({ session, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false); // the Menu panel (modules on the left, screens on the right)
  const [menuMod, setMenuMod] = useState(null);     // module shown in the Menu panel
  const [menuQ, setMenuQ] = useState('');           // search inside the Menu panel
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');                   // text in the command box
  const [sel, setSel] = useState(0);                // highlighted result in the command box
  const [userMenu, setUserMenu] = useState(false);
  const [navDrop, setNavDrop] = useState('');
  const [homeQ, setHomeQ] = useState('');           // search on Home       // group of the current module whose screens are dropped down
  const [pwOpen, setPwOpen] = useState(false);
  const [tabs, setTabs] = useState([]);             // open screens, e.g. ['orderEntry']
  const [active, setActive] = useState('home');     // 'home' or a screen id
  const [requests, setRequests] = useState({});    // screen id -> record to open there, e.g. { costingId: 5, n: 1 }

  // The server sends only the modules and screens this user may open
  const menu = session.menu || [];

  // Top bar icons: only the ones the owner gave this client (and this user's role may see)
  const hasTool = (code) => Boolean(session.permissions?.[code]);
  const quickLinks = [
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setMenuOpen(false); setPaletteOpen(true); }
      if (e.key === 'Escape') { setMenuOpen(false); setUserMenu(false); setNavDrop(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (!paletteOpen) { setQ(''); setSel(0); } }, [paletteOpen]);
  useEffect(() => { setSel(0); }, [q]);

  function closeAll() { setMenuOpen(false); setPaletteOpen(false); setUserMenu(false); setNavDrop(''); }
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

  const { user, company, unit, financialYear, licence } = session;
  const place = [unit?.name, financialYear && `FY ${financialYear.label}`].filter(Boolean).join(' · ');
  // Menu panel: the module picked on the left (default: the module of the screen on view), or search results
  const panelMod = menu.find(m => m.code === menuMod) || menu.find(m => m.code === activeMod) || menu[0];
  const menuWords = menuQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const menuFound = menuWords.length ? allItems.filter(i => menuWords.every(w => `${i.name} ${i.where}`.toLowerCase().includes(w))) : [];
  // Top bar: the module of the screen on view, with its groups as drop-downs (like Orders / Costing / Reports)
  const navMod = menu.find(m => m.code === activeMod);
  // Module icons on Home: always show that module's screens in the Menu panel
  function openModule(m) { closeAll(); setMenuQ(''); setMenuMod(m.code); setMenuOpen(true); }
  const flush = active === 'home' || FLUSH_SCREENS.includes(active);

  return (
    <div className="shell">
      <header className="appbar o-nav">
        <button type="button" className={`o-apps ${menuOpen ? 'open' : ''}`} aria-expanded={menuOpen} aria-label="Menu: all modules and screens" title="Menu"
          onClick={() => { setUserMenu(false); setNavDrop(''); setMenuQ(''); setMenuMod(null); setMenuOpen(o => !o); }}>
          {menuOpen ? Icon.close : Icon.menu}
        </button>
        <button type="button" className="o-brand" onClick={() => switchTo('home')} aria-label="ORBYT home" title="Home">
          <span className="o-brand-tile"><OrbitMark width={24} /></span>
          <span className="o-brand-word">orb<i>y</i>t</span>
        </button>
        {navMod && <span className="o-modname">{navMod.name}</span>}
        {navMod && (
          <nav className="o-navgroups" aria-label={navMod.name}>
            {navMod.groups.map(g => {
              const on = g.items.some(i => READY_SCREENS[i.code] === active);
              return (
                <div key={g.title} className="o-navg">
                  <button type="button" className={`${on ? 'on' : ''} ${navDrop === g.title ? 'open' : ''}`} aria-expanded={navDrop === g.title}
                    onClick={() => { setMenuOpen(false); setUserMenu(false); setNavDrop(d => (d === g.title ? '' : g.title)); }}>{g.title}</button>
                  {navDrop === g.title && (
                    <div className="pop-panel o-navdrop" role="menu">
                      {g.items.map(item => (
                        <button key={item.code} type="button" role="menuitem" className={`mod-drop-link ${READY_SCREENS[item.code] === active ? 'cur' : ''}`} onClick={() => openScreen(item)}>
                          {item.name}{!READY_SCREENS[item.code] && <span className="soon">soon</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        <div className="o-nav-right">
          <button type="button" className="o-navbtn o-jump" onClick={() => { closeAll(); setPaletteOpen(true); }} title="Jump to a screen (Ctrl K)">
            {Icon.search}<span>Jump to…</span><kbd>Ctrl K</kbd>
          </button>

          {quickLinks.map(t => <button key={t.code} type="button" className="o-navbtn o-navicon" title={t.label} aria-label={t.label}>{t.icon}</button>)}

          <div className="appbar-pop">
            <button type="button" className="o-me" aria-haspopup="menu" aria-expanded={userMenu} aria-label={`Account: ${user.username}`}
              onClick={() => { setMenuOpen(false); setNavDrop(''); setUserMenu(o => !o); }}>
              <span className="o-co">{company.name}{place && <> · {place}</>}</span>
              <span className="o-av">{initials(user.fullName)}</span>
            </button>
            {userMenu && (
              <div className="pop-panel user-panel" role="menu">
                <div className="user-menu-head"><b>{user.fullName}</b><span>{user.username} · {user.role}</span><span className="um-co">{company.name}<br />{place}</span></div>
                <button type="button" role="menuitem" onClick={() => { setUserMenu(false); setPwOpen(true); }}>Change password</button>
                <button type="button" role="menuitem" className="danger" onClick={() => { setUserMenu(false); onLogout(); }}>Log out</button>
              </div>
            )}
          </div>
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
      {(userMenu || navDrop) && <div className="drop-dim clear" onMouseDown={() => { setUserMenu(false); setNavDrop(''); }} />}

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

      <main className={`workspace ${flush ? 'flush' : ''}`}>
        {licence?.expired && (
          <div className="alert alert-error" role="alert">Your ORBYT licence ended on {fmtDate(licence.validTill)}. You can view data, but saving is paused. Contact ORBYT support to renew.</div>
        )}
        {licence?.warn && (
          <div className="alert alert-warn" role="status">Your ORBYT licence ends on {fmtDate(licence.validTill)} ({licence.daysLeft === 0 ? 'today' : `${licence.daysLeft} day${licence.daysLeft === 1 ? '' : 's'} left`}). Contact ORBYT support to renew.</div>
        )}
        {notice && <div className="alert alert-info" role="status">{notice}</div>}
        {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} onDone={() => { setPwOpen(false); setNotice('Your password has been changed. Use the new one next time you sign in.'); }} />}

        {active === 'home' && (() => {
          const hw = homeQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
          const found = hw.length ? allItems.filter(i => hw.every(w => `${i.name} ${i.where}`.toLowerCase().includes(w))) : [];
          return (
            <div className="o-home">
              <label className="o-home-search">
                {Icon.search}<span className="sr-only">Search menus</span>
                <input type="search" placeholder="Search menus…" value={homeQ} onChange={e => setHomeQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && found[0]) { setHomeQ(''); openScreen(found[0]); } if (e.key === 'Escape') setHomeQ(''); }} />
              </label>
              {hw.length > 0 ? (
                <div className="o-home-found">
                  {found.length === 0 && <p>No screen matches "{homeQ}".</p>}
                  {found.slice(0, 12).map(i => (
                    <button key={i.code} type="button" onClick={() => { setHomeQ(''); openScreen(i); }}>
                      <span>{i.name}<small>{i.where}</small></span>{!READY_SCREENS[i.code] && <span className="soon">soon</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <section className="o-apps-grid" aria-label="Modules">
                    {menu.map((m, i) => {
                      const [c1, c2, pic] = modIcon(m.code, i);
                      const ready = m.groups.some(g => g.items.some(it => READY_SCREENS[it.code]));
                      return (
                        <button key={m.code} type="button" className="o-app" onClick={() => openModule(m)} title={ready ? `Open ${m.name}` : `${m.name} · coming soon`}>
                          <span className="o-app-ic" style={{ background: `linear-gradient(145deg, ${c2}, ${c1})` }} aria-hidden="true">{pic || m.name[0]}</span>
                          <span className="o-app-name">{m.name}</span>
                        </button>
                      );
                    })}
                  </section>
                  {tabs.length > 0 && (
                    <div className="o-home-open">
                      <span>Open now</span>
                      {tabs.map(id => <button key={id} type="button" onClick={() => switchTo(id)}>{SCREENS[id].title}</button>)}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

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
