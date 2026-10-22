// ORBYT orbit mark. `light` is for dark backgrounds.
export function OrbitMark({ width = 40, light = false }) {
  const height = (width * 28) / 40;
  const back = light ? '#5E9F98' : '#A3CCC8';
  const front = light ? '#5DD3C3' : '#0F766E';
  return (
    <svg width={width} height={height} viewBox="0 0 40 28" aria-hidden="true">
      <ellipse cx="20" cy="14" rx="16" ry="7.5" fill="none" stroke={back} strokeWidth="3.2" transform="rotate(-28 20 14)" />
      <ellipse cx="20" cy="14" rx="16" ry="7.5" fill="none" stroke={front} strokeWidth="3.2" transform="rotate(28 20 14)" />
      <circle cx="20" cy="14" r="4" fill={front} />
    </svg>
  );
}

export function Wordmark({ size = 30, light = false }) {
  return (
    <span className="wordmark" style={{ fontSize: size, color: light ? '#FFFFFF' : 'var(--navy)' }}>
      Orb<span style={{ color: light ? '#5DD3C3' : 'var(--teal)' }}>y</span>t
    </span>
  );
}
