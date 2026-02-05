import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'X-Tenant-Id': '1',
  },
});

export default api;
