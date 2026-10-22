// Date box that always shows DD-MM-YYYY, whatever the computer's language setting.
// Type the date (22-10-2026, 22/10/2026 or 22102026) or click the calendar button.
// `value` and `onChange` use YYYY-MM-DD, the format the server expects.
import { useEffect, useRef, useState } from 'react';

const toText = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

// "22-10-2026", "22/10/26", "22102026" -> "2026-10-22"; anything invalid -> null
function parse(text) {
  const t = text.trim();
  if (!t) return '';
  let d, m, y;
  const parts = t.split(/[-/.\s]+/);
  if (parts.length === 3) [d, m, y] = parts;
  else if (/^\d{8}$/.test(t)) { d = t.slice(0, 2); m = t.slice(2, 4); y = t.slice(4); }
  else if (/^\d{6}$/.test(t)) { d = t.slice(0, 2); m = t.slice(2, 4); y = t.slice(4); }
  else return null;
  if (String(y).length === 2) y = `20${y}`;
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso ? iso : null;
}

export default function DateInput({ value, onChange, className = '', ariaLabel, onKeyDown, ...rest }) {
  const [text, setText] = useState(toText(value));
  const [wrong, setWrong] = useState(false);
  const picker = useRef(null);

  // Keep the box in step when the value changes from outside
  useEffect(() => { setText(toText(value)); setWrong(false); }, [value]);

  function commit() {
    const iso = parse(text);
    if (iso === null) { setWrong(true); return; }
    setWrong(false);
    if (iso !== (value || '')) onChange(iso);
    else setText(toText(value));
  }

  function openPicker() {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  }

  return (
    <span className={`date-in ${wrong ? 'bad' : ''} ${className}`}>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        placeholder="DD-MM-YYYY"
        aria-label={ariaLabel}
        aria-invalid={wrong || undefined}
        title={wrong ? 'Use DD-MM-YYYY, for example 22-10-2026' : undefined}
        value={text}
        onChange={e => { setText(e.target.value); setWrong(false); }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (onKeyDown) onKeyDown(e); }}
      />
      <button type="button" className="date-btn" tabIndex={-1} aria-label={`Pick ${ariaLabel || 'date'} from calendar`} onClick={openPicker}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      </button>
      <input ref={picker} type="date" className="date-hidden" tabIndex={-1} aria-hidden="true"
        value={value || ''} onChange={e => onChange(e.target.value)} />
    </span>
  );
}
