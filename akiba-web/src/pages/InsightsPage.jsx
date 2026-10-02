import { useEffect, useState } from 'react';
import { getClasses, getTransactions } from '../api/client';
import { buildInsights, CREEP_RATIO } from '../insights/compute';
import MonthlyBars from '../components/insights/MonthlyBars';

const fmt = (n) => `KES ${Math.round(n).toLocaleString()}`;
const pct = (r) => `${r > 0 ? '+' : ''}${Math.round(r * 100)}%`;

// Status always carries an icon + words, never color alone.
const STATUS = {
  over: { icon: '●', label: 'Over budget', cls: 'over' },
  creeping: { icon: '▲', label: 'Creeping up', cls: 'creeping' },
  ok: { icon: '', label: '', cls: '' },
};

export default function InsightsPage() {
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getTransactions(), getClasses()])
      .then(([txns, classes]) => setInsights(buildInsights(txns, classes)))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p style={{ color: 'var(--rust)' }}>Error: {error}</p>;
  if (!insights) return <p>Loading…</p>;

  const { monthly, thisTotal, lastTotal, changeVsLast, categories, alerts } = insights;

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>Insights</h2>

      <div className="stat-row">
        <div className="stat-tile">
          <p className="stat-label">Spent this month so far</p>
          <p className="stat-value mono">{fmt(thisTotal)}</p>
        </div>
        <div className="stat-tile">
          <p className="stat-label">Last month</p>
          <p className="stat-value mono">{fmt(lastTotal)}</p>
          {changeVsLast !== null && (
            <p className="stat-note">This month so far: {pct(changeVsLast)} vs last month</p>
          )}
        </div>
      </div>

      <div className="grid2">
        <div className="section-block">
          <p className="section-title">Spending per month</p>
          <MonthlyBars months={monthly} />
        </div>

        <div className="section-block">
          <p className="section-title">Watch list</p>
          {alerts.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Nothing unusual — no category is over budget or running {Math.round((CREEP_RATIO - 1) * 100)}%+ above its
              3-month average.
            </p>
          ) : (
            <ul className="alert-list">
              {alerts.map((c) => (
                <li key={c.classId} className={`alert ${STATUS[c.status].cls}`}>
                  <span className="alert-icon" aria-hidden="true">{STATUS[c.status].icon}</span>
                  <span>
                    <strong>{STATUS[c.status].label}:</strong> {c.name} — {fmt(c.current)} this month
                    {c.status === 'over' ? ` against a ${fmt(c.limit)} budget` : ` vs ${fmt(c.average)} on average`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="section-title">By category — this month vs. 3-month average</p>
      {categories.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>No spending in the last few months yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="insight-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="num">This month</th>
                <th scope="col" className="num">3-mo average</th>
                <th scope="col" className="num">Change</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.classId}>
                  <td>
                    <span className="class-dot" style={{ background: c.colorHex, display: 'inline-block', marginRight: 8 }} />
                    {c.name}
                  </td>
                  <td className="num mono">{fmt(c.current)}</td>
                  <td className="num mono">{fmt(c.average)}</td>
                  <td className="num mono">{c.change === null ? '—' : pct(c.change)}</td>
                  <td>
                    {c.status !== 'ok' && (
                      <span className={`status-chip ${STATUS[c.status].cls}`}>
                        {STATUS[c.status].icon} {STATUS[c.status].label}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
