import { useEffect, useState } from 'react';
import { getBalance, getSpendingSummary, getClasses, getTransactions, getProfile } from '../api/client';
import BalanceCard from '../components/dashboard/BalanceCard';
import QuickActions from '../components/dashboard/QuickActions';
import SpendingPie from '../components/dashboard/SpendingPie';
import CategoryList from '../components/dashboard/CategoryList';
import TransactionForm from '../components/transactions/TransactionForm';
import TransactionList from '../components/transactions/TransactionList';

const RECENT_COUNT = 6;

export default function HomePage() {
  const [balance, setBalance] = useState(null);
  const [summary, setSummary] = useState(null);
  const [monthTxns, setMonthTxns] = useState(null);
  const [recentTxns, setRecentTxns] = useState(null);
  const [classes, setClasses] = useState([]);
  const [addType, setAddType] = useState(null); // 'expense' | 'income' while the quick-add form is open
  const [greetingName, setGreetingName] = useState('');
  const [error, setError] = useState(null);

  function load() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // JS months are 0-indexed, the API's aren't
    // UTC bounds, not local: transaction dates are stored as UTC midnight of
    // the picked calendar day, and the spending summary buckets months in
    // UTC too — local bounds made the pie and the category drill-down
    // disagree about transactions on the 1st of the month.
    const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const monthEnd = new Date(Date.UTC(year, month, 1)).toISOString();

    Promise.all([
      getBalance(),
      getSpendingSummary(year, month),
      getClasses(),
      getTransactions({ fromDate: monthStart, toDate: monthEnd }),
      getProfile(),
      getTransactions({ limit: RECENT_COUNT }),
    ])
      .then(([balanceRes, spendingRes, classesRes, txnsRes, profileRes, recentRes]) => {
        setBalance(balanceRes.balance);
        setGreetingName(profileRes.nickname || profileRes.displayName || '');

        // Merge each class's monthlyLimit into the spending summary here —
        // the summary endpoint only returns totals, not limits, so the
        // progress bar in CategoryList needs this joined client-side.
        const summaryWithLimits = spendingRes.map((s) => {
          const cls = classesRes.find((c) => c.id === s.classId);
          return { ...s, limit: cls ? cls.monthlyLimit : null };
        });
        setSummary(summaryWithLimits);
        setMonthTxns(txnsRes);
        setRecentTxns(recentRes);
        setClasses(classesRes);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  function handleSaved() {
    setAddType(null);
    load();
  }

  if (error) return <p style={{ color: 'var(--rust)' }}>Error: {error}</p>;
  if (summary === null) return <p>Loading…</p>;

  return (
    <div>
      <p className="mono" style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px' }}>Today</p>
      <h2 style={{ marginBottom: 20 }}>Hey {greetingName} 👋</h2>

      <div className="grid3">
        <div>
          <BalanceCard balance={balance} />
          <QuickActions activeType={addType} onAdd={(t) => setAddType(addType === t ? null : t)} />
          {addType && (
            <div style={{ marginBottom: 22 }}>
              <TransactionForm
                classes={classes}
                editingTxn={null}
                initialType={addType}
                cancellable
                onSaved={handleSaved}
                onCancel={() => setAddType(null)}
                onCategoriesChanged={load}
              />
            </div>
          )}
        </div>
        <div>
          <p className="section-title">Spending by category — this month</p>
          <SpendingPie summary={summary} />
          <CategoryList summary={summary} transactions={monthTxns} />
        </div>
        <div>
          <p className="section-title">Recent transactions</p>
          <TransactionList transactions={recentTxns} />
        </div>
      </div>
    </div>
  );
}