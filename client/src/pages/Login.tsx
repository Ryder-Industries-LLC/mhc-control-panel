import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GoogleLoginButton } from '../components/auth/GoogleLoginButton';

type LoginMethod = 'email' | 'username' | 'subscriberId';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithGoogle, isAuthenticated, isLoading: authLoading } = useAuth();

  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Redirect target after login - go to gate for second auth step
  const from = (location.state as any)?.from?.pathname || '/gate';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const credentials: any = { password };
    if (loginMethod === 'email') {
      credentials.email = identifier;
    } else if (loginMethod === 'username') {
      credentials.username = identifier;
    } else {
      credentials.subscriberId = identifier;
    }

    const result = await login(credentials);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Login failed');
      return;
    }

    if (result.requires2FA) {
      navigate('/verify-2fa', { state: { from, sessionId: result.sessionId } });
      return;
    }

    navigate(from, { replace: true });
  };

  const handleGoogleSuccess = async (credential: string) => {
    setError('');
    setIsLoading(true);

    const result = await loginWithGoogle(credential);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Google login failed');
      return;
    }

    if (result.requires2FA) {
      navigate('/verify-2fa', { state: { from, sessionId: result.sessionId } });
      return;
    }

    navigate(from, { replace: true });
  };

  const getPlaceholder = () => {
    switch (loginMethod) {
      case 'email':
        return 'Enter your email';
      case 'username':
        return 'Enter your username';
      case 'subscriberId':
        return 'Enter your subscriber ID';
    }
  };

  const getInputType = () => {
    return loginMethod === 'email' ? 'email' : 'text';
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
          <img
            src="/mhc-logo.jpg"
            alt="MHC"
            className="mx-auto h-20 w-20 rounded-lg shadow-lg"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <h2 className="mt-6 text-3xl font-bold text-mhc-text">
            Sign in to MHC
          </h2>
          <p className="mt-2 text-sm text-mhc-text-muted">
            Control Panel
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Google OAuth - Primary */}
        <div className="mt-8">
          <GoogleLoginButton
            onSuccess={handleGoogleSuccess}
            onError={(err) => setError(err)}
            disabled={isLoading}
          />
        </div>

        {/* More Options Toggle */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowMoreOptions(!showMoreOptions)}
            className="w-full flex items-center justify-center gap-2 text-sm text-mhc-text-muted hover:text-mhc-text transition-colors py-2"
          >
            <span>{showMoreOptions ? 'Hide' : 'Show'} other sign-in options</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showMoreOptions ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Collapsible Credentials Section */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            showMoreOptions ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-mhc-bg text-mhc-text-muted">
                Sign in with credentials
              </span>
            </div>
          </div>

          {/* Login method tabs */}
          <div className="flex border-b border-white/10">
            <button
              type="button"
              onClick={() => setLoginMethod('email')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                loginMethod === 'email'
                  ? 'border-mhc-primary text-mhc-primary'
                  : 'border-transparent text-mhc-text-muted hover:text-mhc-text'
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('username')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                loginMethod === 'username'
                  ? 'border-mhc-primary text-mhc-primary'
                  : 'border-transparent text-mhc-text-muted hover:text-mhc-text'
              }`}
            >
              Username
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('subscriberId')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                loginMethod === 'subscriberId'
                  ? 'border-mhc-primary text-mhc-primary'
                  : 'border-transparent text-mhc-text-muted hover:text-mhc-text'
              }`}
            >
              Sub ID
            </button>
          </div>

          {/* Login form */}
          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-mhc-text mb-1">
                  {loginMethod === 'email' ? 'Email address' : loginMethod === 'username' ? 'Username' : 'Subscriber ID'}
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  type={getInputType()}
                  autoComplete={loginMethod === 'email' ? 'email' : 'username'}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
                  placeholder={getPlaceholder()}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-mhc-text mb-1">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-mhc-primary hover:text-mhc-primary-light transition-colors"
              >
                Forgot your password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-mhc-primary hover:bg-mhc-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mhc-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Signing in...
                </div>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Sign up link */}
        <p className="mt-6 text-center text-sm text-mhc-text-muted">
          Don't have an account?{' '}
          <Link to="/signup" className="text-mhc-primary hover:text-mhc-primary-light transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
