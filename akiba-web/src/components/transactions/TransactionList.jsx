// Clicking a row starts editing it (reuses TransactionForm above, doesn't
// duplicate it). The ✕ button deletes directly without a confirmation step —
// deletes are soft on the backend, so this is recoverable in the database
// even though there's no undo in the UI yet.
export default function TransactionList({ transactions, onEdit, onDelete }) {
  if (!transactions || transactions.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 12 }}>No transactions yet.</p>;
  }

  return (
    <ul className="txn-list">
      {transactions.map((t) => (
        <li className="txn" key={t.id}>
          <div className="txn-icon" style={{ cursor: 'pointer' }} onClick={() => onEdit(t)}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              {t.amount < 0 ? (
                <path d="M7 2v10M3 8l4 4 4-4" stroke="#C1583D" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M7 12V2M3 6l4-4 4 4" stroke="#4FAE8E" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </div>
          <div className="txn-mid" style={{ cursor: 'pointer' }} onClick={() => onEdit(t)}>
            <p className="txn-name">{t.subjectName}</p>
            <p className="txn-cat">{t.className}{t.note ? ` · ${t.note}` : ''}</p>
          </div>
          <div className={`txn-amt mono ${t.amount < 0 ? 'neg' : 'pos'}`}>
            {t.amount < 0 ? '-' : '+'}KES {Math.abs(t.amount).toLocaleString()}
          </div>
          <button
            type="button"
            style={{ flex: '0 0 auto', padding: '4px 8px', fontSize: 10, marginLeft: 8 }}
            onClick={() => onDelete(t.id)}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}