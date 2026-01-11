import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Verify2FA() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verify2FA, isAuthenticated, requires2FA, isLoading: authLoading } = useAuth();

  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Redirect target after verification
  const from = (location.state as any)?.from?.pathname || '/';

  // Redirect if already authenticated and 2FA not required
  useEffect(() => {
    if (isAuthenticated && !requires2FA && !authLoading) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, requires2FA, authLoading, navigate, from]);

  // Redirect to login if no pending 2FA
  useEffect(() => {
    if (!requires2FA && !authLoading) {
      navigate('/login', { replace: true });
    }
  }, [requires2FA, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await verify2FA(code, trustDevice);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Verification failed');
      setCode('');
      return;
    }

    navigate(from, { replace: true });
  };

  // Auto-focus and format code input
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9A-Za-z-]/g, '').toUpperCase();
    setCode(value);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mhc-bg">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mhc-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-mhc-bg px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-mhc-primary/10">
            <svg
              className="h-8 w-8 text-mhc-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-mhc-text">
            Two-Factor Authentication
          </h2>
          <p className="mt-2 text-sm text-mhc-text-muted">
            Enter the code from your authenticator app or a recovery code
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Verification form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-mhc-text mb-2">
              Verification code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={handleCodeChange}
              disabled={isLoading}
              autoFocus
              className="w-full px-4 py-4 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text text-center text-2xl tracking-widest font-mono placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
              placeholder="000000"
              maxLength={20}
            />
            <p className="mt-2 text-xs text-mhc-text-muted text-center">
              Enter the 6-digit code from your authenticator app, or a recovery code (XXXX-XXXX-XXXX)
            </p>
          </div>

          {/* Trust device checkbox */}
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="trustDevice"
                name="trustDevice"
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 rounded border-white/20 bg-mhc-surface text-mhc-primary focus:ring-mhc-primary focus:ring-offset-0"
              />
            </div>
            <div className="ml-3">
              <label htmlFor="trustDevice" className="text-sm text-mhc-text">
                Remember this device for 30 days
              </label>
              <p className="text-xs text-mhc-text-muted">
                You won't need to enter a code on this device for 30 days
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || code.length < 6}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-mhc-primary hover:bg-mhc-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mhc-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Verifying...
              </div>
            ) : (
              'Verify'
            )}
          </button>
        </form>

        {/* Back to login */}
        <div className="text-center">
          <Link
            to="/login"
            className="text-sm text-mhc-text-muted hover:text-mhc-text transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
