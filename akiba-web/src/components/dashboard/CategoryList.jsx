import { useState } from 'react';

// Subject-level totals aren't a separate API endpoint — deliberately reused
// the already-fetched month's transactions and grouped them here in JS,
// rather than adding another backend endpoint for a tiny personal-app data
// volume. Only expenses count (amount < 0), matching the pie chart.
function buildSubjectBreakdown(transactions) {
  const byClass = {};
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    if (!byClass[t.classId]) byClass[t.classId] = {};
    const subs = byClass[t.classId];
    if (!subs[t.subjectId]) subs[t.subjectId] = { subjectId: t.subjectId, subjectName: t.subjectName, total: 0 };
    subs[t.subjectId].total += -t.amount;
  }
  return byClass;
}

// summary: [{ classId, className, colorHex, total, limit }] — class-level rows.
// transactions: this month's raw transaction list, used only to compute the
// subject breakdown when a class is expanded.
export default function CategoryList({ summary, transactions }) {
  const [openClassId, setOpenClassId] = useState(null);

  if (!summary || summary.length === 0) return null;

  const breakdown = buildSubjectBreakdown(transactions || []);

  return (
    <div>
      {summary.map((c) => {
        const isOpen = openClassId === c.classId;
        const pct = c.limit ? Math.min(100, Math.round((c.total / c.limit) * 100)) : null;
        const subjects = Object.values(breakdown[c.classId] || {});

        return (
          <div className="class-row" key={c.classId}>
            <div className="class-head" onClick={() => setOpenClassId(isOpen ? null : c.classId)}>
              <div className="class-left">
                <span className="class-dot" style={{ background: c.colorHex }} />
                <span className="class-name">{c.className}</span>
              </div>
              <div className="class-right">
                <span className="class-amt mono">KES {c.total.toLocaleString()}</span>
                <svg className={`chevron${isOpen ? ' open' : ''}`} width="10" height="10" viewBox="0 0 10 10">
                  <path d="M3 1l4 4-4 4" stroke="#8B958E" strokeWidth="1.4" fill="none" />
                </svg>
              </div>
            </div>

            {pct !== null && (
              <div className="bar-track" style={{ marginTop: 6 }}>
                <div className="bar-fill" style={{ width: `${pct}%`, background: c.colorHex }} />
              </div>
            )}

            {isOpen && (
              <ul className="subject-list open">
                {subjects.length === 0 && (
                  <li className="subject-row">
                    <span className="sname">No transactions logged yet</span>
                  </li>
                )}
                {subjects.map((s) => (
                  <li className="subject-row" key={s.subjectId}>
                    <span className="sname">{s.subjectName}</span>
                    <span className="mono">{s.total.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}