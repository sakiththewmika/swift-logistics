// Simple Network client using fetch with baseURL and optional port
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
    const options = {
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (data && method.toUpperCase() !== 'GET') {
      options.body = typeof data === 'string' ? data : JSON.stringify(data);
    }
    console.log(`Request: ${options.method} ${url}`, data || '');
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    if (!res.ok) {
      const err = new Error(json?.message || text || `${res.status} ${res.statusText}`);
      err.status = res.status;
      err.data = json || text;
      console.log(`Response: ${res.status} ${res.statusText}`, err.data);
      throw err;
    }
    console.log(`Response: ${res.status} ${res.statusText}`, json || text);
    return json;
  }

  get(endpoint, headers) { return this.request('GET', endpoint, undefined, headers); }
  post(endpoint, data, headers) { return this.request('POST', endpoint, data, headers); }
  put(endpoint, data, headers) { return this.request('PUT', endpoint, data, headers); }
  delete(endpoint, data, headers) { return this.request('DELETE', endpoint, data, headers); }
}

const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api/v1';
const PORT = undefined;

const apiClient = new Network(BASE_URL, PORT);

export default apiClient;