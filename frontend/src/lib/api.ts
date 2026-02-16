import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Handle premium feature gating
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'PREMIUM_REQUIRED'
    ) {
      const feature = error.response.data.feature || 'this feature';
      const event = new CustomEvent('premium-required', {
        detail: { feature, message: error.response.data.message },
      });
      window.dispatchEvent(event);
    }

    return Promise.reject(error);
  }
);

export default api;
