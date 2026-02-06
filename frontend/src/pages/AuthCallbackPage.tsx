import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.tsx';
import type { AuthResponse } from '../types/index.ts';

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = () => {
      const authData = searchParams.get('data');
      const errorMsg = searchParams.get('error');

      if (errorMsg) {
        setError(errorMsg);
        return;
      }

      if (!authData) {
        setError('No authentication data received');
        return;
      }

      try {
        const parsed = JSON.parse(decodeURIComponent(authData)) as AuthResponse;
        login({
          accessToken: parsed.tokens.accessToken,
          refreshToken: parsed.tokens.refreshToken,
          user: parsed.user,
        });
        navigate('/', { replace: true });
      } catch {
        setError('Failed to process authentication data');
      }
    };

    handleCallback();
  }, [searchParams, login, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">Authentication Failed</p>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
        </div>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-500">Signing you in...</p>
      </div>
    </div>
  );
}
