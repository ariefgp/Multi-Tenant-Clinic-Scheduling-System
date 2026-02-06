import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { User } from '../types/index.ts';
import {
  getStoredAuth,
  setStoredAuth,
  clearStoredAuth,
  fetchCurrentUser,
  logout as apiLogout,
  type StoredAuth,
} from '../api/auth.ts';
import api from '../api/client.ts';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (auth: StoredAuth) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedAuth = getStoredAuth();
    if (storedAuth) {
      api.defaults.headers.common['Authorization'] =
        `Bearer ${storedAuth.accessToken}`;
      setUser(storedAuth.user);

      fetchCurrentUser()
        .then((freshUser) => {
          setUser(freshUser);
          setStoredAuth({ ...storedAuth, user: freshUser });
        })
        .catch(() => {
          clearStoredAuth();
          delete api.defaults.headers.common['Authorization'];
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((auth: StoredAuth) => {
    setStoredAuth(auth);
    api.defaults.headers.common['Authorization'] = `Bearer ${auth.accessToken}`;
    setUser(auth.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
