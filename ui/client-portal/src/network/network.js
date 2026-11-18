// Simple Network client using fetch with baseURL and optional port
const SENSITIVE_KEYS = new Set(['password', 'confirmPassword', 'token', 'accessToken', 'authorization']);

// Returns a copy that is safe to log: credentials and tokens are masked, never printed.
const redact = (value, depth = 0) => {
  if (value === null || value === undefined || depth > 5) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase()) || SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redact(val, depth + 1),
      ])
    );
  }
  return value;
};

class Network {
  constructor(baseURL, port) {
    this.baseURL = baseURL;
    this.port = port;
  }

  buildUrl(endpoint) {
    return `${this.baseURL}${endpoint}`;
  }

  async request(method, endpoint, data, headers = {}) {
    const url = this.buildUrl(endpoint);
    const authHeaders = {};
    try {
      const stored = localStorage.getItem('swiftlogistics_customer');
      if (stored) {
        const parsed = JSON.parse(stored);
        const token = parsed?.token || parsed?.accessToken;
        if (token) {
          authHeaders['Authorization'] = `Bearer ${token}`;
        }
      }
    } catch {
      // ignore parsing error
    }
    const options = {
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json', ...authHeaders, ...headers },
    };
    if (data && method.toUpperCase() !== 'GET') {
      options.body = typeof data === 'string' ? data : JSON.stringify(data);
    }
    console.log(`Request: ${options.method} ${url}`, redact(data) || '');
    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      if (url.includes(':8080')) {
        const fallbackUrl = url.replace(':8080', ':8000');
        console.warn(`Fetch to ${url} failed; trying fallback ${fallbackUrl}`);
        res = await fetch(fallbackUrl, options);
      } else if (url.includes(':8000')) {
        const fallbackUrl = url.replace(':8000', ':8080');
        console.warn(`Fetch to ${url} failed; trying fallback ${fallbackUrl}`);
        res = await fetch(fallbackUrl, options);
      } else {
        throw networkErr;
      }
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    if (!res.ok) {
      const err = new Error(json?.message || text || `${res.status} ${res.statusText}`);
      err.status = res.status;
      err.data = json || text;
      console.log(`Response: ${res.status} ${res.statusText}`, redact(err.data));
      throw err;
    }
    console.log(`Response: ${res.status} ${res.statusText}`, json ? redact(json) : '[non-JSON body]');
    return json;
  }

  get(endpoint, headers) { return this.request('GET', endpoint, undefined, headers); }
  post(endpoint, data, headers) { return this.request('POST', endpoint, data, headers); }
  put(endpoint, data, headers) { return this.request('PUT', endpoint, data, headers); }
  delete(endpoint, data, headers) { return this.request('DELETE', endpoint, data, headers); }
}

const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api/v1';
const PORT = undefined;

const NETWORK = new Network(BASE_URL, PORT);

export default NETWORK;
