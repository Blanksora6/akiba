import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMpesaSms } from './parse.js';

test('send money to a person', () => {
  const r = parseMpesaSms('SJK3ABCDEF Confirmed. Ksh1,250.00 sent to JOHN DOE 0712345678 on 2/10/26 at 3:45 PM. New M-PESA balance is Ksh5,000.00. Transaction cost, Ksh13.00. Amount you can transact within the day is 498,750.00.');
  assert.deepEqual(r, {
    type: 'expense', amount: 1250, fee: 13, date: '2026-10-02',
    note: 'M-Pesa · John Doe · SJK3ABCDEF (fee KES 13)', code: 'SJK3ABCDEF', party: 'John Doe',
  });
});

test('paybill keeps the business name, drops the account number', () => {
  const r = parseMpesaSms('SJL1XYZ123 Confirmed. Ksh2,000.00 sent to KPLC PREPAID for account 54012345678 on 1/10/26 at 9:15 AM New M-PESA balance is Ksh3,000.00. Transaction cost, Ksh0.00.');
  assert.equal(r.type, 'expense');
  assert.equal(r.amount, 2000);
  assert.equal(r.party, 'Kplc Prepaid');
  assert.equal(r.fee, 0);
  assert.equal(r.note, 'M-Pesa · Kplc Prepaid · SJL1XYZ123');
});

test('buy goods / till', () => {
  const r = parseMpesaSms('SJM9QWERTY Confirmed. Ksh350.00 paid to NAIVAS SUPERMARKET. on 30/9/26 at 6:30 PM.New M-PESA balance is Ksh2,650.00. Transaction cost, Ksh0.00.');
  assert.equal(r.type, 'expense');
  assert.equal(r.amount, 350);
  assert.equal(r.party, 'Naivas Supermarket');
  assert.equal(r.date, '2026-09-30');
});

test('money received is income', () => {
  const r = parseMpesaSms('SJN2ASDFGH Confirmed.You have received Ksh5,000.00 from JANE DOE 0722000000 on 2/10/26 at 11:02 AM New M-PESA balance is Ksh7,650.00.');
  assert.equal(r.type, 'income');
  assert.equal(r.amount, 5000);
  assert.equal(r.party, 'Jane Doe');
});

test('agent withdrawal', () => {
  const r = parseMpesaSms('SJP4ZXCVBN Confirmed.on 2/10/26 at 1:00 PMWithdraw Ksh2,000.00 from 123456 - MAMA MBOGA AGENCIES New M-PESA balance is Ksh650.00. Transaction cost, Ksh29.00.');
  assert.equal(r.type, 'expense');
  assert.equal(r.amount, 2000);
  assert.equal(r.party, 'Withdrawal · Mama Mboga Agencies');
  assert.equal(r.fee, 29);
});

test('airtime', () => {
  const r = parseMpesaSms('SJQ5POIUYT confirmed.You bought Ksh100.00 of airtime on 2/10/26 at 8:00 AM.New M-PESA balance is Ksh550.00. Transaction cost, Ksh0.00.');
  assert.equal(r.type, 'expense');
  assert.equal(r.amount, 100);
  assert.equal(r.party, 'Airtime');
});

test('anything else is not an M-Pesa message', () => {
  assert.equal(parseMpesaSms('Hi, are we still meeting at 5?'), null);
  assert.equal(parseMpesaSms(''), null);
  assert.equal(parseMpesaSms(null), null);
  assert.equal(parseMpesaSms('Confirmed. Your Ksh balance is low.'), null);
});
