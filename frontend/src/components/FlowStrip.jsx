// The strip under a document's title: Order -> Costing -> BOM -> Purchase.
// Each step is done (tick), the current one (filled), needs work (!) or waiting (number); a step can carry a link.
export default function FlowStrip({ steps, warn }) {
  return (
    <div className="flow" role="list" aria-label="Where this order is">
      {steps.map((s, i) => (
        <div key={s.title} className="flow-step-wrap" role="listitem">
          {i > 0 && <span className="flow-arrow" aria-hidden="true">›</span>}
          <div className={`flow-step ${s.state}`}>
            <span className="flow-dot" aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'todo' ? '!' : i + 1}</span>
            <span className="flow-text">
              <b>{s.title}</b>
              {s.action
                ? <button type="button" className="flow-link" onClick={s.action.onClick}>{s.sub}{s.sub ? ' · ' : ''}{s.action.label}</button>
                : <span>{s.sub}</span>}
            </span>
          </div>
        </div>
      ))}
      {warn && <div className="flow-warn">{warn}</div>}
    </div>
  );
}

// Days from today to a 'YYYY-MM-DD' date
export function daysTo(iso) {
  if (!iso) return null;
  const a = Date.parse(`${new Date().toLocaleDateString('en-CA')}T00:00:00Z`);
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - a) / 86400000);
}

// Steps for one order line (Costing and BOM screens). `here` is 'costing' or 'bom'.
export function lineSteps(flow, here, go) {
  const { line, costing, bom } = flow;
  const final = costing && costing.type !== 'initial';
  return [
    { title: 'Order', state: 'done', sub: `${line.orderNo} · ${line.qty.toLocaleString('en-IN')} pcs`, action: go ? { label: 'Open', onClick: () => go('orderEntry', { orderId: line.orderId }) } : null },
    here === 'costing'
      ? { title: 'Costing', state: 'now', sub: costing ? `${costing.costingNo} · ${costing.type === 'final' ? 'Final' : costing.type === 'actual' ? 'Actual' : 'Initial'}` : 'New' }
      : { title: 'Costing', state: final ? 'done' : 'todo', sub: final ? costing.costingNo : 'No Final costing',
        action: { label: costing ? 'Open' : 'Create', onClick: () => go('costing', costing ? { costingId: costing.id } : { newForLine: line.id }) } },
    here === 'bom'
      ? { title: 'BOM', state: 'now', sub: bom ? `${bom.status === 'approved' ? 'Approved' : 'Draft'} · ${bom.lines} item${bom.lines === 1 ? '' : 's'}` : 'Not saved yet' }
      : bom
        ? { title: 'BOM', state: bom.status === 'approved' ? 'done' : 'todo', sub: bom.status === 'approved' ? 'Approved' : 'Draft', action: { label: 'Open', onClick: () => go('bom', { orderLineId: line.id }) } }
        : final
          ? { title: 'BOM', state: 'todo', sub: 'Not made', action: { label: 'Create from costing', onClick: () => go('bom', { orderLineId: line.id }) } }
          : { title: 'BOM', state: 'wait', sub: 'After Final costing' },
    { title: 'Purchase', state: 'wait', sub: bom?.status === 'approved' ? 'Comes with the Purchase module' : 'After BOM approval' }
  ];
}
