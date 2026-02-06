import api from './client.ts';
import type { AuthResponse, User } from '../types/index.ts';

const AUTH_STORAGE_KEY = 'clinic_auth';

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export function getStoredAuth(): StoredAuth | null {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as StoredAuth;
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export async function fetchCurrentUser(): Promise<User> {
  const response = await api.get<User>('/auth/me');
  return response.data;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/refresh', {
    refreshToken,
  });
  return response.data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    clearStoredAuth();
  }
}

export function getGoogleAuthUrl(): string {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  return `${baseUrl}/auth/google`;
}
