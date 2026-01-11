import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, SignupData } from '../context/AuthContext';
import { GoogleLoginButton } from '../components/auth/GoogleLoginButton';

type AuthMethod = 'email_password' | 'username_password' | 'subscriber_id';

export default function Signup() {
  const navigate = useNavigate();
  const { signup, loginWithGoogle, isAuthenticated, isLoading: authLoading } = useAuth();

  const [authMethod, setAuthMethod] = useState<AuthMethod>('email_password');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [subscriberId, setSubscriberId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const validateForm = (): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
    }
    if (authMethod === 'email_password' && !email) {
      return 'Email is required';
    }
    if (authMethod === 'username_password' && !username) {
      return 'Username is required';
    }
    if (authMethod === 'subscriber_id' && !subscriberId) {
      return 'Subscriber ID is required';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    const data: SignupData = {
      authMethod,
      password,
      displayName: displayName || undefined
    };

    if (authMethod === 'email_password') {
      data.email = email;
    } else if (authMethod === 'username_password') {
      data.username = username;
    } else {
      data.subscriberId = subscriberId;
    }

    const result = await signup(data);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Registration failed');
      return;
    }

    navigate('/', { replace: true });
  };

  const handleGoogleSuccess = async (credential: string) => {
    setError('');
    setIsLoading(true);

    const result = await loginWithGoogle(credential);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Google signup failed');
      return;
    }

    navigate('/', { replace: true });
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
            Create your account
          </h2>
          <p className="mt-2 text-sm text-mhc-text-muted">
            Join MHC Control Panel
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Google OAuth */}
        <div className="mt-8">
          <GoogleLoginButton
            onSuccess={handleGoogleSuccess}
            onError={(err) => setError(err)}
            disabled={isLoading}
          />
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-mhc-bg text-mhc-text-muted">
              Or sign up with credentials
            </span>
          </div>
        </div>

        {/* Auth method selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-mhc-text">
            How would you like to sign in?
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAuthMethod('email_password')}
              className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                authMethod === 'email_password'
                  ? 'border-mhc-primary bg-mhc-primary/10 text-mhc-primary'
                  : 'border-white/10 text-mhc-text-muted hover:border-white/20'
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('username_password')}
              className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                authMethod === 'username_password'
                  ? 'border-mhc-primary bg-mhc-primary/10 text-mhc-primary'
                  : 'border-white/10 text-mhc-text-muted hover:border-white/20'
              }`}
            >
              Username
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('subscriber_id')}
              className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                authMethod === 'subscriber_id'
                  ? 'border-mhc-primary bg-mhc-primary/10 text-mhc-primary'
                  : 'border-white/10 text-mhc-text-muted hover:border-white/20'
              }`}
            >
              Sub ID
            </button>
          </div>
          <p className="text-xs text-mhc-text-muted">
            Note: You can only sign in using the method you choose here.
          </p>
        </div>

        {/* Signup form */}
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Email field */}
            {authMethod === 'email_password' && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-mhc-text mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
                  placeholder="you@example.com"
                />
              </div>
            )}

            {/* Username field */}
            {authMethod === 'username_password' && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-mhc-text mb-1">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
                  placeholder="Choose a username"
                />
              </div>
            )}

            {/* Subscriber ID field */}
            {authMethod === 'subscriber_id' && (
              <div>
                <label htmlFor="subscriberId" className="block text-sm font-medium text-mhc-text mb-1">
                  Subscriber ID
                </label>
                <input
                  id="subscriberId"
                  name="subscriberId"
                  type="text"
                  required
                  value={subscriberId}
                  onChange={(e) => setSubscriberId(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
                  placeholder="Enter your subscriber ID"
                />
                <p className="mt-1 text-xs text-mhc-text-muted">
                  No email required with this option. Recovery is only possible via recovery codes.
                </p>
              </div>
            )}

            {/* Display name (optional) */}
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-mhc-text mb-1">
                Display name <span className="text-mhc-text-muted">(optional)</span>
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
                placeholder="How should we call you?"
              />
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-mhc-text mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
                placeholder="At least 8 characters"
              />
            </div>

            {/* Confirm password field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-mhc-text mb-1">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-mhc-surface border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-mhc-primary hover:bg-mhc-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mhc-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating account...
              </div>
            ) : (
              'Create account'
            )}
          </button>
        </form>

        {/* Sign in link */}
        <p className="mt-6 text-center text-sm text-mhc-text-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-mhc-primary hover:text-mhc-primary-light transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
