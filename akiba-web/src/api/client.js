const API_BASE = 'https://localhost:7080';

const TOKEN_KEY = 'akiba_token';
const USER_ID_KEY = 'akiba_user_id';
const EMAIL_KEY = 'akiba_email';
const NAME_KEY = 'akiba_display_name';

// ---------- Auth storage ----------
// Real sign-in state now, replacing the TEMP_USER_ID placeholder that was
// here since the first version of this file. localStorage persists across
// browser restarts, which is what "stay signed in" means for a web app.

export function getStoredAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);
  if (!token || !userId) return null;
  return {
    token,
    userId,
    email: localStorage.getItem(EMAIL_KEY),
    displayName: localStorage.getItem(NAME_KEY),
  };
}

export function setStoredAuth({ token, userId, email, displayName }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_ID_KEY, userId);
  localStorage.setItem(EMAIL_KEY, email);
  localStorage.setItem(NAME_KEY, displayName);
}

export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(NAME_KEY);
}

function getUserId() {
  const auth = getStoredAuth();
  if (!auth) throw new Error('Not signed in.');
  return auth.userId;
}

// Exchanges a real Google ID token for our own JWT. Does NOT go through
// apiFetch below, since there's no auth token to attach yet at this point —
// this call is what produces the first one.
export async function googleSignIn(idToken) {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
  return res.json(); // { token, userId, email, displayName }
}

async function apiFetch(path, options = {}) {
  const auth = getStoredAuth();
  const headers = { 'Content-Type': 'application/json' };
  if (auth?.token) headers['Authorization'] = `Bearer ${auth.token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers, ...options });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status} on ${path}: ${body}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ---------- Classes & Subjects ----------

export function getClasses() {
  return apiFetch(`/api/classes?userId=${getUserId()}`);
}

export function createClass({ name, colorHex, monthlyLimit }) {
  return apiFetch(`/api/classes?userId=${getUserId()}`, {
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
  const params = new URLSearchParams({ userId: getUserId() });
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);
  return apiFetch(`/api/transactions?${params.toString()}`);
}

export function createTransaction({ subjectId, amount, note, occurredAt }) {
  return apiFetch(`/api/transactions?userId=${getUserId()}`, {
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
  return apiFetch(`/api/summary/spending?userId=${getUserId()}&year=${year}&month=${month}`);
}

export function getBalance() {
  return apiFetch(`/api/summary/balance?userId=${getUserId()}`);
}

// ---------- Goals ----------

export function getGoals({ includePurchased = false } = {}) {
  return apiFetch(`/api/goals?userId=${getUserId()}&includePurchased=${includePurchased}`);
}

export function createGoal(payload) {
  return apiFetch(`/api/goals?userId=${getUserId()}`, {
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

// ---------- Profile ----------

export function getProfile() {
  return apiFetch(`/api/profile?userId=${getUserId()}`);
}

export function updateNickname(nickname) {
  return apiFetch(`/api/profile/nickname?userId=${getUserId()}`, {
    method: 'PUT',
    body: JSON.stringify({ nickname }),
  });
}