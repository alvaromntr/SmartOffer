const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('so_token');
}

function setSession(token, user) {
  localStorage.setItem('so_token', token);
  localStorage.setItem('so_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('so_token');
  localStorage.removeItem('so_user');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('so_user') || 'null');
  } catch {
    return null;
  }
}

async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (res.status === 401 && auth) {
    clearSession();
    window.location.href = '/login.html?expired=1';
    return Promise.reject(new Error('Sessão expirada.'));
  }

  if (!res.ok) {
    const message = (data && (data.error || (data.details && data.details[0]?.msg))) || 'Ocorreu um erro inesperado.';
    throw new Error(message);
  }

  return data;
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
  }
}
