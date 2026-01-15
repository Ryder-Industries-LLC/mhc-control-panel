import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GATE_STORAGE_KEY = 'mhc-gate-access-time';
const ACCESS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export default function SecondGate() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [gatePassword, setGatePassword] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Check if already has valid access
  useEffect(() => {
    const accessTime = localStorage.getItem(GATE_STORAGE_KEY);
    if (accessTime) {
      const elapsed = Date.now() - parseInt(accessTime, 10);
      if (elapsed < ACCESS_DURATION) {
        // Still have valid access, redirect to directory
        navigate('/people', { replace: true });
        return;
      }
      // Access expired, clear it
      localStorage.removeItem(GATE_STORAGE_KEY);
    }
  }, [navigate]);

  // Fetch the gate password from settings
  useEffect(() => {
    const fetchGatePassword = async () => {
      try {
        const response = await fetch('/api/settings/gate_password');
        if (response.ok) {
          const data = await response.json();
          setGatePassword(data.value || null);
        } else {
          // Setting doesn't exist yet
          setGatePassword(null);
        }
      } catch (err) {
        console.error('Failed to fetch gate password setting:', err);
        setGatePassword(null);
      } finally {
        setSettingsLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchGatePassword();
    }
  }, [isAuthenticated]);

  // If no gate password is configured, skip this gate
  useEffect(() => {
    if (!settingsLoading && (gatePassword === null || gatePassword === '')) {
      // No password configured, grant access and redirect
      localStorage.setItem(GATE_STORAGE_KEY, Date.now().toString());
      navigate('/people', { replace: true });
    }
  }, [settingsLoading, gatePassword, navigate]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Check password against stored setting
    if (password === gatePassword) {
      // Grant access
      localStorage.setItem(GATE_STORAGE_KEY, Date.now().toString());
      setAccessGranted(true);

      // Brief delay to show success, then redirect
      setTimeout(() => {
        navigate('/people', { replace: true });
      }, 1000);
    } else {
      setError('Invalid access code');
    }

    setIsLoading(false);
  };

  // Show loading while checking auth or settings
  if (authLoading || settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mhc-bg">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mhc-primary"></div>
      </div>
    );
  }

  // Access granted screen
  if (accessGranted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mhc-bg px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-8">
            <svg
              className="mx-auto h-16 w-16 text-green-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-2xl font-bold text-green-400 mb-2">Access Granted</h2>
            <p className="text-mhc-text-muted">Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  // Password entry screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-mhc-bg px-4">
      <div className="max-w-md w-full">
        <div className="bg-mhc-surface border border-white/10 rounded-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <svg
              className="mx-auto h-16 w-16 text-mhc-primary mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h2 className="text-2xl font-bold text-mhc-text">Restricted Access</h2>
            <p className="mt-2 text-sm text-mhc-text-muted">
              Enter the access code to continue
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-center">
              {error}
            </div>
          )}

          {/* Password form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Access code"
                autoFocus
                disabled={isLoading}
                className="w-full px-4 py-3 bg-mhc-bg border border-white/10 rounded-lg text-mhc-text placeholder-mhc-text-muted text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-mhc-primary focus:border-transparent disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !password}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-mhc-primary hover:bg-mhc-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mhc-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Verifying...
                </div>
              ) : (
                'Enter'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
