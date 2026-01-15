import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const GATE_STORAGE_KEY = 'mhc-gate-access-time';
const ACCESS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface GatedRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard that requires both OAuth authentication AND second gate (password).
 * Use this for all protected routes in the app.
 *
 * Flow:
 * 1. Check if user is authenticated via OAuth -> if not, redirect to /login
 * 2. Check if user has passed the second gate -> if not, redirect to /gate
 * 3. If both checks pass, render children
 */
export function GatedRoute({ children }: GatedRouteProps) {
  const { isAuthenticated, isLoading, requires2FA } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-mhc-bg">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mhc-primary"></div>
          <span className="text-mhc-text-muted">Loading...</span>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect to 2FA verification if required
  if (requires2FA) {
    return <Navigate to="/verify-2fa" state={{ from: location }} replace />;
  }

  // Check second gate (use localStorage so it persists across tabs)
  const accessTime = localStorage.getItem(GATE_STORAGE_KEY);
  const hasValidAccess = accessTime && (Date.now() - parseInt(accessTime, 10)) < ACCESS_DURATION;

  if (!hasValidAccess) {
    return <Navigate to="/gate" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default GatedRoute;
