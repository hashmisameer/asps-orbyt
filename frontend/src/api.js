// Small wrapper around fetch for talking to the ORBYT API.
const TOKEN_KEY = 'orbyt_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function saveToken(token, remember) {
  try {
    clearToken();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch { /* storage blocked: user simply signs in again next time */ }
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

// The owner console (/owner) keeps its own login, separate from the client ERP login
const OWNER_KEY = 'orbyt_owner_token';
export function getOwnerToken() {
  try { return sessionStorage.getItem(OWNER_KEY); } catch { return null; }
}
export function saveOwnerToken(token) {
  try { sessionStorage.setItem(OWNER_KEY, token); } catch { /* ignore */ }
}
export function clearOwnerToken() {
  try { sessionStorage.removeItem(OWNER_KEY); } catch { /* ignore */ }
}
export const ownerApi = (path, options = {}) => request(`/owner${path}`, options, getOwnerToken());

export const api = (path, options = {}) => request(path, options, getToken());

async function request(path, { method = 'GET', body } = {}, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Can't reach the ORBYT server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}
