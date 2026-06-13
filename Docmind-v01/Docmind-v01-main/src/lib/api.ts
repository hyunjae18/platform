import axios from 'axios';

const readTokenPayload = (token: string) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload)) as { sub?: string; email?: string; role?: string };
  } catch {
    return null;
  }
};

// Gateway URL (fallback to localhost:8001)
const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,   
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach token from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('docmind_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      const payload = readTokenPayload(token);
      if (payload?.sub) config.headers['X-User-Id'] = payload.sub;
      if (payload?.email) config.headers['X-User-Email'] = payload.email;
      if (payload?.role) config.headers['X-User-Role'] = payload.role;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('docmind_token');
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
