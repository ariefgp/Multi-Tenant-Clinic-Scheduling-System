import axios from 'axios';
import {
  getStoredAuth,
  setStoredAuth,
  clearStoredAuth,
  refreshAccessToken,
} from './auth.ts';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'X-Tenant-Id': '1',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const auth = getStoredAuth();
    if (auth?.accessToken) {
      config.headers.Authorization = `Bearer ${auth.accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle 401 and refresh token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const auth = getStoredAuth();
      if (!auth?.refreshToken) {
        clearStoredAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const response = await refreshAccessToken(auth.refreshToken);
        const newAuth = {
          accessToken: response.tokens.accessToken,
          refreshToken: response.tokens.refreshToken,
          user: response.user,
        };
        setStoredAuth(newAuth);
        api.defaults.headers.common['Authorization'] =
          `Bearer ${newAuth.accessToken}`;
        processQueue(null, newAuth.accessToken);
        originalRequest.headers.Authorization = `Bearer ${newAuth.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearStoredAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
