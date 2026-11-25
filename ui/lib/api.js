// Thin client for the CodeNex API. The base URL is baked in at build time.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const KEY_STORAGE = 'codenex_api_key';

export function getApiKey() {
  try {
    return window.localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key) {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable: key lives only in component state */
  }
}

// Returns parsed JSON, or throws an Error whose message is safe to show to the user.
export async function apiFetch(path, { method = 'GET', body, apiKey } = {}) {
  const headers = {};
  const key = apiKey ?? getApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach the CodeNex API at ${API_URL}. Is the backend running?`);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 401 ? 'Missing or invalid API key' : `Request failed (HTTP ${response.status})`;
    const err = new Error((data && (data.message || data.detail)) || fallback);
    err.status = response.status;
    throw err;
  }
  return data;
}
