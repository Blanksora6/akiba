import { useEffect, useState } from 'react';
import { getBalance, getSpendingSummary, getClasses, getTransactions } from '../api/client';
import BalanceCard from '../components/dashboard/BalanceCard';
import QuickActions from '../components/dashboard/QuickActions';
import SpendingPie from '../components/dashboard/SpendingPie';
import CategoryList from '../components/dashboard/CategoryList';

export default function HomePage() {
  const [balance, setBalance] = useState(null);
  const [summary, setSummary] = useState(null);
  const [monthTxns, setMonthTxns] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // JS months are 0-indexed, the API's aren't
    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEnd = new Date(year, month, 1).toISOString();

    Promise.all([
      getBalance(),
      getSpendingSummary(year, month),
      getClasses(),
      getTransactions({ fromDate: monthStart, toDate: monthEnd }),
    ])
      .then(([balanceRes, spendingRes, classesRes, txnsRes]) => {
        setBalance(balanceRes.balance);

        // Merge each class's monthlyLimit into the spending summary here —
        // the summary endpoint only returns totals, not limits, so the
        // progress bar in CategoryList needs this joined client-side.
        const summaryWithLimits = spendingRes.map((s) => {
          const cls = classesRes.find((c) => c.id === s.classId);
          return { ...s, limit: cls ? cls.monthlyLimit : null };
        });
        setSummary(summaryWithLimits);
        setMonthTxns(txnsRes);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p style={{ color: 'var(--rust)' }}>Error: {error}</p>;
  if (summary === null) return <p>Loading…</p>;

  return (
    <div>
      <p className="mono" style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px' }}>Today</p>
      <h2 style={{ marginBottom: 20 }}>Hey Karma 👋</h2>

      <div className="grid3">
        <div>
          <BalanceCard balance={balance} />
          <QuickActions />
        </div>
        <div>
          <p className="section-title">Spending by category — this month</p>
          <SpendingPie summary={summary} />
          <CategoryList summary={summary} transactions={monthTxns} />
        </div>
        <div>
          {/* Recent transactions list comes with the Transactions page build */}
        </div>
      </div>
    </div>
  );
}