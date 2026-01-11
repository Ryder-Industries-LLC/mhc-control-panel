import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredPermissions?: string[];
  requiredRole?: string;
  requiredRoles?: string[];
  requireAll?: boolean; // If true, require ALL permissions/roles. If false, require ANY.
  fallbackPath?: string;
}

/**
 * Route guard component that protects routes based on authentication,
 * permissions, and roles.
 *
 * Usage:
 *   <ProtectedRoute>
 *     <SomePage />
 *   </ProtectedRoute>
 *
 *   <ProtectedRoute requiredPermission="admin.manage_settings">
 *     <AdminSettings />
 *   </ProtectedRoute>
 *
 *   <ProtectedRoute requiredRole="owner">
 *     <OwnerPage />
 *   </ProtectedRoute>
 */
export function ProtectedRoute({
  children,
  requiredPermission,
  requiredPermissions,
  requiredRole,
  requiredRoles,
  requireAll = true,
  fallbackPath = '/login'
}: ProtectedRouteProps) {
  const {
    isAuthenticated,
    isLoading,
    requires2FA,
    hasPermission,
    hasAnyPermission,
    hasRole,
    hasAnyRole
  } = useAuth();
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
    return <Navigate to={fallbackPath} state={{ from: location }} replace />;
  }

  // Redirect to 2FA verification if required
  if (requires2FA) {
    return <Navigate to="/verify-2fa" state={{ from: location }} replace />;
  }

  // Check single permission
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Check multiple permissions
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasRequiredPermissions = requireAll
      ? requiredPermissions.every(p => hasPermission(p))
      : hasAnyPermission(...requiredPermissions);

    if (!hasRequiredPermissions) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // Check single role
  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Check multiple roles
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRoles = requireAll
      ? requiredRoles.every(r => hasRole(r))
      : hasAnyRole(...requiredRoles);

    if (!hasRequiredRoles) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <>{children}</>;
}

/**
 * Higher-order component version of ProtectedRoute
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ProtectedRouteProps, 'children'>
) {
  return function AuthenticatedComponent(props: P) {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

export default ProtectedRoute;
