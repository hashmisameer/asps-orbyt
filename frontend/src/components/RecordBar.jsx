// Pieces of the record pages (list -> form), the same on every screen:
//   ControlPanel  breadcrumb (Orders / ORD/26-27/UTH/0011) and buttons
//   StatusBar     action buttons on the left, the record's stages on the right (Draft › Saved › Costing final …)

export function ControlPanel({ crumbs, children }) {
  return (
    <div className="o-cp">
      <nav className="o-bc" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="o-bc-item">
            {i > 0 && <span className="o-bc-sep" aria-hidden="true">/</span>}
            {c.onClick ? <button type="button" onClick={c.onClick}>{c.label}</button> : <b>{c.label}</b>}
          </span>
        ))}
      </nav>
      <div className="o-cp-btns">{children}</div>
    </div>
  );
}

export function StatusBar({ children, steps = [] }) {
  return (
    <div className="o-sb">
      <div className="o-sb-acts">{children}</div>
      {steps.length > 0 && (
        <ol className="o-steps" aria-label="Stages">
          {steps.map(s => <li key={s.label} className={s.state} aria-current={s.state === 'on' ? 'step' : undefined}>{s.label}</li>)}
        </ol>
      )}
    </div>
  );
}


// One label-left field of a record sheet: "Brand   Urban Thread (UTH)"
export function Field({ label, req, title, wide, children }) {
  return (
    <div className={`o-row ${wide ? 'wide' : ''}`} title={title}>
      <span className="o-lbl">{label}{req && <span className="req"> *</span>}</span>
      <div className="o-val">{children}</div>
    </div>
  );
}

// "All orders (F3)" – back to the list of saved records, on every record screen
export function AllButton({ label, onClick }) {
  return (
    <button type="button" className="tb" onClick={onClick} title={`See all saved ${label.replace(/^All /, '')}, search and open one`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
      {label} <kbd className="tb-kbd">F3</kbd>
    </button>
  );
}

// Tabs inside a sheet: [['lines', 'Order lines (2)'], ['other', 'Other info']]
export function SheetTabs({ tabs, value, onChange }) {
  return (
    <div className="o-tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}
