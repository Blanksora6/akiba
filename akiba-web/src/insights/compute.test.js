import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights, lastMonths, monthKey } from './compute.js';

const now = new Date(2026, 9, 15); // 15 Oct 2026, local time
const food = { id: 'food', name: 'Food', colorHex: '#4FAE8E', monthlyLimit: 10000 };
const fun = { id: 'fun', name: 'Fun', colorHex: '#C9A227', monthlyLimit: 0 };
const txn = (classId, amount, date) => ({ classId, amount, occurredAt: `${date}T00:00:00.000Z` });

test('month keys are UTC calendar months, oldest first', () => {
  assert.deepEqual(lastMonths(now, 3), ['2026-08', '2026-09', '2026-10']);
  assert.equal(monthKey('2026-10-01T00:00:00.000Z'), '2026-10');
  assert.deepEqual(lastMonths(new Date(2026, 0, 5), 2), ['2025-12', '2026-01']);
});

test('monthly totals count expenses only, within the 6-month window', () => {
  const r = buildInsights([
    txn('food', -1000, '2026-10-02'),
    txn('food', 50000, '2026-10-01'), // income: ignored
    txn('food', -400, '2026-09-30'),
    txn('food', -999, '2026-01-01'), // outside the window
  ], [food], now);
  assert.deepEqual(r.monthly.map((m) => m.key), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.equal(r.thisTotal, 1000);
  assert.equal(r.lastTotal, 400);
  assert.equal(r.changeVsLast, 1.5);
});

test('flags over-budget and creeping categories, ignores small or steady ones', () => {
  const r = buildInsights([
    // Food: steady 3k a month, now 11k — over its 10k budget.
    txn('food', -3000, '2026-07-10'), txn('food', -3000, '2026-08-10'), txn('food', -3000, '2026-09-10'),
    txn('food', -11000, '2026-10-05'),
    // Fun: averaged 1k, now 2k — +100% and +1000 KES: creeping.
    txn('fun', -1000, '2026-07-10'), txn('fun', -1000, '2026-08-10'), txn('fun', -1000, '2026-09-10'),
    txn('fun', -2000, '2026-10-05'),
  ], [food, fun], now);
  const byName = Object.fromEntries(r.categories.map((c) => [c.name, c]));
  assert.equal(byName.Food.status, 'over');
  assert.equal(byName.Fun.status, 'creeping');
  assert.equal(byName.Fun.change, 1);
  assert.deepEqual(r.alerts.map((a) => a.name), ['Food', 'Fun']);
});

test('a small jump stays quiet; no history means no change figure', () => {
  const r = buildInsights([
    txn('fun', -100, '2026-09-10'), txn('fun', -300, '2026-10-05'), // +200%, but only +267 KES
    txn('food', -500, '2026-10-05'), // brand new spending: nothing to compare
  ], [food, fun], now);
  const byName = Object.fromEntries(r.categories.map((c) => [c.name, c]));
  assert.equal(byName.Fun.status, 'ok');
  assert.equal(byName.Food.change, null);
  assert.equal(r.alerts.length, 0);
});
