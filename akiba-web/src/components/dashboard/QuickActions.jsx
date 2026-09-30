// Expense/Income open the regular TransactionForm on Home with the type
// preselected. M-Pesa is a placeholder until statement import exists.
export default function QuickActions({ activeType, onAdd }) {
  return (
    <div className="quick-actions">
      <button
        type="button"
        className={`qa-btn${activeType === 'expense' ? ' active-type' : ''}`}
        onClick={() => onAdd('expense')}
      >
        + Expense
      </button>
      <button
        type="button"
        className={`qa-btn${activeType === 'income' ? ' active-type' : ''}`}
        onClick={() => onAdd('income')}
      >
        + Income
      </button>
      <button type="button" className="qa-btn" disabled title="Coming soon" style={{ opacity: 0.5, cursor: 'default' }}>
        M-Pesa
      </button>
    </div>
  );
}
