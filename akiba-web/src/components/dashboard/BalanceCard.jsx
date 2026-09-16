// No sparkline, no "vs last month" delta — those were fabricated numbers in
// the mockup with nothing behind them. Adding them back later needs real
// historical balance snapshots, which don't exist yet. A real balance next
// to a fake trend line is worse than no trend line at all.
export default function BalanceCard({ balance }) {
  const formatted =
    balance == null
      ? '—'
      : `KES ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="balance-card">
      <p className="balance-label">Available balance</p>
      <p className="balance-amount mono">{formatted}</p>
      <svg className="torn-edge" viewBox="0 0 300 12" preserveAspectRatio="none">
        <path
          d="M0,0 L10,10 L20,2 L30,9 L40,1 L50,10 L60,3 L70,9 L80,1 L90,10 L100,2 L110,9 L120,1 L130,10 L140,3 L150,9 L160,1 L170,10 L180,2 L190,9 L200,1 L210,10 L220,3 L230,9 L240,1 L250,10 L260,2 L270,9 L280,1 L290,10 L300,2 L300,12 L0,12 Z"
          fill="#0E1512"
        />
      </svg>
    </div>
  );
}