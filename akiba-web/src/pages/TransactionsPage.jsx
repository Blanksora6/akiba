import { useEffect, useState } from 'react';
import { getClasses, getTransactions, deleteTransaction } from '../api/client';
import TransactionForm from '../components/transactions/TransactionForm';
import TransactionList from '../components/transactions/TransactionList';

export default function TransactionsPage() {
  const [classes, setClasses] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [editingTxn, setEditingTxn] = useState(null);
  const [error, setError] = useState(null);

  async function refresh() {
    try {
      const [cls, txns] = await Promise.all([getClasses(), getTransactions()]);
      setClasses(cls);
      setTransactions(txns);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleDelete(id) {
    try {
      await deleteTransaction(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSaved() {
    setEditingTxn(null);
    refresh();
  }

  if (error) return <p style={{ color: 'var(--rust)' }}>Error: {error}</p>;
  if (!classes || !transactions) return <p>Loading…</p>;

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>Transactions</h2>
      <div className="grid2">
        <div>
          <p className="section-title">{editingTxn ? 'Edit transaction' : 'Add transaction'}</p>
          <TransactionForm
            classes={classes}
            editingTxn={editingTxn}
            onSaved={handleSaved}
            onCancel={() => setEditingTxn(null)}
            onCategoriesChanged={refresh}
          />
        </div>
        <div>
          <p className="section-title">All transactions</p>
          <TransactionList transactions={transactions} onEdit={setEditingTxn} onDelete={handleDelete} />
        </div>
      </div>
    </div>
  );
}