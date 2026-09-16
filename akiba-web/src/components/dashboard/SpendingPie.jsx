// Same arc-drawing math as the original mockup, ported from vanilla JS to React.
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

// summary: [{ classId, className, colorHex, total }] — already sorted
// biggest-first by the API, expenses only.
export default function SpendingPie({ summary }) {
  if (!summary || summary.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 12 }}>No spending recorded this month yet.</p>;
  }

  const total = summary.reduce((sum, c) => sum + c.total, 0);
  const cx = 44, cy = 44, r = 40;
  let angle = 0;

  const slices = summary.map((c) => {
    const sliceAngle = (c.total / total) * 360;
    const d = arcPath(cx, cy, r, angle, angle + sliceAngle);
    angle += sliceAngle;
    return { ...c, d };
  });

  return (
    <>
      <p className="mono" style={{ fontSize: 11, color: 'var(--muted)', margin: '-4px 0 12px' }}>
        KES {total.toLocaleString()} spent this month
      </p>
      <div className="pie-wrap">
        <svg viewBox="0 0 88 88" className="pie-svg">
          {slices.map((s) => (
            <path key={s.classId} d={s.d} fill={s.colorHex} opacity="0.92" stroke="#0E1512" strokeWidth="1.5" />
          ))}
          <circle cx="44" cy="44" r="18" fill="#0E1512" />
        </svg>
        <div className="legend">
          {slices.map((s) => (
            <div className="legend-item" key={s.classId}>
              <span className="legend-dot" style={{ background: s.colorHex }} />
              <span className="legend-name">{s.className}</span>
              <span className="legend-amt mono">
                {Math.round((s.total / total) * 100)}% · {s.total.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}