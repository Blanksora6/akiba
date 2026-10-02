// Pure calculations behind the Insights page, kept apart from React so they
// can be unit-tested (compute.test.js). Months are UTC calendar months, the
// same rule the dashboard and the server's spending summary use — dates are
// stored as UTC midnight of the picked day.

// A category is "creeping up" when this month already beats its recent
// average by this much...
export const CREEP_RATIO = 1.2;
// ...and by at least this many shillings, so tiny categories don't flag on noise.
export const CREEP_MIN_KES = 500;

export function monthKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// The `count` month keys ending at `now`'s month, oldest first.
export function lastMonths(now, count) {
  const keys = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(monthKey(Date.UTC(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return keys;
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
}

// transactions: the API's TransactionDto list. classes: the API's ClassDto list.
export function buildInsights(transactions, classes, now = new Date()) {
  const months = lastMonths(now, 6);
  const [thisMonth, lastMonth] = [months[5], months[4]];
  const previous3 = months.slice(2, 5);

  const spendByMonth = Object.fromEntries(months.map((k) => [k, 0]));
  const spendByClass = {}; // classId -> { monthKey -> total }
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const key = monthKey(t.occurredAt);
    if (!(key in spendByMonth)) continue;
    spendByMonth[key] += -t.amount;
    (spendByClass[t.classId] ??= {})[key] = (spendByClass[t.classId][key] ?? 0) + -t.amount;
  }

  const monthly = months.map((key) => ({ key, label: monthLabel(key), total: spendByMonth[key] }));
  const thisTotal = spendByMonth[thisMonth];
  const lastTotal = spendByMonth[lastMonth];

  const categories = classes
    .map((c) => {
      const byMonth = spendByClass[c.id] ?? {};
      const current = byMonth[thisMonth] ?? 0;
      const average = previous3.reduce((sum, k) => sum + (byMonth[k] ?? 0), 0) / previous3.length;
      const overBudget = c.monthlyLimit > 0 && current > c.monthlyLimit;
      const creeping = average > 0 && current >= average * CREEP_RATIO && current - average >= CREEP_MIN_KES;
      return {
        classId: c.id,
        name: c.name,
        colorHex: c.colorHex,
        limit: c.monthlyLimit,
        current,
        average,
        change: average > 0 ? (current - average) / average : null,
        status: overBudget ? 'over' : creeping ? 'creeping' : 'ok',
      };
    })
    .filter((c) => c.current > 0 || c.average > 0)
    .sort((a, b) => b.current - a.current);

  return {
    monthly,
    thisTotal,
    lastTotal,
    // null when there's nothing to compare against
    changeVsLast: lastTotal > 0 ? (thisTotal - lastTotal) / lastTotal : null,
    categories,
    alerts: categories.filter((c) => c.status !== 'ok'),
  };
}
