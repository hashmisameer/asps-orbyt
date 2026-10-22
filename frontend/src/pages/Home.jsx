// Home page after sign-in: shows the session details. Real screens come from the Menu.
export default function Home({ session }) {
  const { user, company, unit, financialYear, modules } = session;
  return (
    <>
      <h1 className="page-title">Welcome, {user.fullName}</h1>
      <section className="panel" style={{ maxWidth: 900 }}>
        <div className="panel-head">YOUR WORKSPACE</div>
        <div className="panel-body">
          <div className="info-grid">
            <div className="info"><small>Company</small><b>{company.name}</b></div>
            <div className="info"><small>Unit</small><b>{unit ? unit.name : '—'}</b></div>
            <div className="info"><small>Financial year</small><b>{financialYear ? financialYear.label : '—'}</b></div>
            <div className="info"><small>Role</small><b>{user.role}</b></div>
          </div>
          <p style={{ margin: '14px 0 0', color: 'var(--muted)' }}>
            Modules switched on: {modules.join(', ')}. Open <b>Menu</b> to find a screen.
          </p>
        </div>
      </section>
    </>
  );
}
