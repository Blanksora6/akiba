// Clicking a goal's name starts editing it. "Mark bought"/"Mark not bought"
// toggles isPurchased directly without opening the form, since that's the
// single most common action on an existing goal.
export default function GoalList({ goals, onEdit, onDelete, onTogglePurchased }) {
  if (!goals || goals.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 12 }}>No planned purchases yet.</p>;
  }

  const today = new Date();

  return (
    <div>
      {goals.map((g) => {
        let chip;
        if (g.isRecurring) {
          chip = <span className="goal-chip recur">Every {g.intervalMonths}mo</span>;
        } else {
          const days = Math.ceil((new Date(g.targetDate) - today) / 86400000);
          const label = days < 0 ? 'Overdue' : `${days}d left`;
          chip = <span className={`goal-chip ${days <= 21 ? 'soon' : 'ok'}`}>{label}</span>;
        }

        return (
          <div className="goal-card" key={g.id} style={g.isPurchased ? { opacity: 0.5 } : undefined}>
            <div className="goal-top">
              <span className="goal-name" style={{ cursor: 'pointer' }} onClick={() => onEdit(g)}>{g.name}</span>
              <span className="goal-price mono">KES {g.price.toLocaleString()}</span>
            </div>
            <div className="goal-meta">
              <span className="goal-class">{g.className}</span>
              {!g.isPurchased && chip}
              {g.isPurchased && <span className="goal-chip ok">Purchased</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onTogglePurchased(g)}>
                {g.isPurchased ? 'Mark not bought' : 'Mark bought'}
              </button>
              <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onDelete(g.id)}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}