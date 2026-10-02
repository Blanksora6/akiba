// Expense/Income open the regular TransactionForm on Home with the type
// preselected; M-Pesa opens a box to paste a confirmation SMS.
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
      <button
        type="button"
        className={`qa-btn${activeType === 'mpesa' ? ' active-type' : ''}`}
        onClick={() => onAdd('mpesa')}
      >
        M-Pesa
      </button>
    </div>
  );
}
