const API_BASE = 'https://localhost:7080';

// TODO: replace with the real signed-in user's ID once Google OAuth/JWT is wired in.
// Every endpoint currently requires this as a placeholder query param.
export const TEMP_USER_ID = '11111111-1111-1111-1111-111111111111';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status} on ${path}: ${body}`);
  }

  if (res.status === 204) return null; // PUT/DELETE endpoints return no body
  return res.json();
}

// ---------- Classes & Subjects ----------

export function getClasses() {
  return apiFetch(`/api/classes?userId=${TEMP_USER_ID}`);
}

export function createClass({ name, colorHex, monthlyLimit }) {
  return apiFetch(`/api/classes?userId=${TEMP_USER_ID}`, {
    method: 'POST',
    body: JSON.stringify({ name, colorHex, monthlyLimit }),
  });
}

export function updateClass(id, { name, colorHex, monthlyLimit }) {
  return apiFetch(`/api/classes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, colorHex, monthlyLimit }),
  });
}

export function deleteClass(id) {
  return apiFetch(`/api/classes/${id}`, { method: 'DELETE' });
}

export function createSubject(classId, name) {
  return apiFetch(`/api/classes/${classId}/subjects`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function updateSubject(id, name) {
  return apiFetch(`/api/subjects/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export function deleteSubject(id) {
  return apiFetch(`/api/subjects/${id}`, { method: 'DELETE' });
}

// ---------- Transactions ----------

export function getTransactions({ fromDate, toDate } = {}) {
  const params = new URLSearchParams({ userId: TEMP_USER_ID });
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);
  return apiFetch(`/api/transactions?${params.toString()}`);
}

export function createTransaction({ subjectId, amount, note, occurredAt }) {
  return apiFetch(`/api/transactions?userId=${TEMP_USER_ID}`, {
    method: 'POST',
    body: JSON.stringify({ subjectId, amount, note, occurredAt }),
  });
}

export function updateTransaction(id, { subjectId, amount, note, occurredAt }) {
  return apiFetch(`/api/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ subjectId, amount, note, occurredAt }),
  });
}

export function deleteTransaction(id) {
  return apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
}

export function getSpendingSummary(year, month) {
  return apiFetch(`/api/summary/spending?userId=${TEMP_USER_ID}&year=${year}&month=${month}`);
}

export function getBalance() {
  return apiFetch(`/api/summary/balance?userId=${TEMP_USER_ID}`);
}

// ---------- Goals ----------

export function getGoals({ includePurchased = false } = {}) {
  return apiFetch(`/api/goals?userId=${TEMP_USER_ID}&includePurchased=${includePurchased}`);
}

export function createGoal(payload) {
  return apiFetch(`/api/goals?userId=${TEMP_USER_ID}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateGoal(id, payload) {
  return apiFetch(`/api/goals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteGoal(id) {
  return apiFetch(`/api/goals/${id}`, { method: 'DELETE' });
}