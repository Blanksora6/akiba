// Static for now — these aren't wired to anything yet. Real "add transaction"
// functionality comes with the Transactions page build, specifically the
// two-level class/subject picker flagged early on as the actual hard part.
export default function QuickActions() {
  return (
    <div className="quick-actions">
      <div className="qa-btn">+ Expense</div>
      <div className="qa-btn">+ Income</div>
      <div className="qa-btn">M-Pesa</div>
    </div>
  );
}