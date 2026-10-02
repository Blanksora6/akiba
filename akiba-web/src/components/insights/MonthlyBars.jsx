import { useState } from 'react';

const fmt = (n) => `KES ${Math.round(n).toLocaleString()}`;

// Spending per month as bars. One series, so no legend — the section title
// names it. Only the current month is labeled directly; hovering any column
// shows its value. A visually hidden table carries the same numbers for
// screen readers.
export default function MonthlyBars({ months }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(...months.map((m) => m.total), 1);
  const current = months.length - 1;

  return (
    <div className="bars-card">
      <div className="bars" role="img" aria-label="Spending per month, last 6 months">
        {months.map((m, i) => {
          const pct = (m.total / max) * 100;
          return (
            <div
              key={m.key}
              className="bar-col"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
            >
              {(i === current || i === hovered) && (
                <span className={`bar-value mono${i === hovered && i !== current ? ' tip' : ''}`}>{fmt(m.total)}</span>
              )}
              <div
                className={`bar${i === current ? ' current' : ''}${i === hovered ? ' hover' : ''}`}
                style={{ height: m.total > 0 ? `max(${pct}%, 4px)` : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="bar-labels">
        {months.map((m, i) => (
          <span key={m.key} className={i === current ? 'current' : ''}>{m.label}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Spending per month</caption>
        <tbody>
          {months.map((m) => (
            <tr key={m.key}><th scope="row">{m.label}</th><td>{fmt(m.total)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
