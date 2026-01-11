import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../api/client';

// Types
export interface User {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  authMethod: string;
  totpEnabled: boolean;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  roles: string[];
  permissions: string[];
  csrfToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requires2FA: boolean;
  pendingSessionId: string | null;
}

export interface LoginCredentials {
  email?: string;
  username?: string;
  subscriberId?: string;
  password: string;
}

export interface SignupData {
  authMethod: 'email_password' | 'subscriber_id' | 'username_password';
  email?: string;
  username?: string;
  subscriberId?: string;
  password: string;
  displayName?: string;
}

export interface LoginResult {
  success: boolean;
  requires2FA?: boolean;
  sessionId?: string;
  error?: string;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  loginWithGoogle: (credential: string) => Promise<LoginResult>;
  signup: (data: SignupData) => Promise<LoginResult>;
  verify2FA: (code: string, trustDevice?: boolean) => Promise<LoginResult>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<{ sessionsRevoked: number }>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (...roles: string[]) => boolean;
  refreshUser: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const initialState: AuthState = {
  user: null,
  roles: [],
  permissions: [],
  csrfToken: null,
  isLoading: true,
  isAuthenticated: false,
  requires2FA: false,
  pendingSessionId: null
};

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState);

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const response = await api.auth.me();
      setState({
        user: response.user,
        roles: response.roles || [],
        permissions: response.permissions || [],
        csrfToken: response.csrfToken,
        isLoading: false,
        isAuthenticated: true,
        requires2FA: false,
        pendingSessionId: null
      });
    } catch {
      setState({
        ...initialState,
        isLoading: false
      });
    }
  };

  const login = useCallback(async (credentials: LoginCredentials): Promise<LoginResult> => {
    try {
      const response = await api.auth.login(credentials);

      if ('requires2FA' in response && response.requires2FA) {
        setState(prev => ({
          ...prev,
          requires2FA: true,
          pendingSessionId: response.sessionId
        }));
        return { success: true, requires2FA: true, sessionId: response.sessionId };
      }

      // Type narrow to AuthResponse
      const authResponse = response as { user: any; roles: string[]; permissions: string[]; csrfToken: string };
      setState({
        user: authResponse.user,
        roles: authResponse.roles || [],
        permissions: authResponse.permissions || [],
        csrfToken: authResponse.csrfToken,
        isLoading: false,
        isAuthenticated: true,
        requires2FA: false,
        pendingSessionId: null
      });

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  }, []);

  const loginWithGoogle = useCallback(async (credential: string): Promise<LoginResult> => {
    try {
      const response = await api.auth.google(credential);

      if ('requires2FA' in response && response.requires2FA) {
        setState(prev => ({
          ...prev,
          requires2FA: true,
          pendingSessionId: response.sessionId
        }));
        return { success: true, requires2FA: true, sessionId: response.sessionId };
      }

      // Type narrow to AuthResponse
      const authResponse = response as { user: any; roles: string[]; permissions: string[]; csrfToken: string };
      setState({
        user: authResponse.user,
        roles: authResponse.roles || [],
        permissions: authResponse.permissions || [],
        csrfToken: authResponse.csrfToken,
        isLoading: false,
        isAuthenticated: true,
        requires2FA: false,
        pendingSessionId: null
      });

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Google login failed'
      };
    }
  }, []);

  const signup = useCallback(async (data: SignupData): Promise<LoginResult> => {
    try {
      const response = await api.auth.signup(data);

      setState({
        user: response.user,
        roles: response.roles || [],
        permissions: response.permissions || [],
        csrfToken: response.csrfToken,
        isLoading: false,
        isAuthenticated: true,
        requires2FA: false,
        pendingSessionId: null
      });

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed'
      };
    }
  }, []);

  const verify2FA = useCallback(async (code: string, trustDevice = false): Promise<LoginResult> => {
    if (!state.pendingSessionId) {
      return { success: false, error: 'No pending 2FA verification' };
    }

    try {
      const response = await api.auth.verify2FA(
        state.pendingSessionId,
        code,
        trustDevice
      );

      setState({
        user: response.user,
        roles: response.roles || [],
        permissions: response.permissions || [],
        csrfToken: response.csrfToken,
        isLoading: false,
        isAuthenticated: true,
        requires2FA: false,
        pendingSessionId: null
      });

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || '2FA verification failed'
      };
    }
  }, [state.pendingSessionId]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setState({
        ...initialState,
        isLoading: false
      });
    }
  }, []);

  const logoutAll = useCallback(async () => {
    const result = await api.auth.logoutAll();
    return result;
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    return state.permissions.includes(permission);
  }, [state.permissions]);

  const hasAnyPermission = useCallback((...permissions: string[]): boolean => {
    return permissions.some(p => state.permissions.includes(p));
  }, [state.permissions]);

  const hasRole = useCallback((role: string): boolean => {
    return state.roles.includes(role);
  }, [state.roles]);

  const hasAnyRole = useCallback((...roles: string[]): boolean => {
    return roles.some(r => state.roles.includes(r));
  }, [state.roles]);

  const refreshUser = useCallback(async () => {
    await checkSession();
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    loginWithGoogle,
    signup,
    verify2FA,
    logout,
    logoutAll,
    hasPermission,
    hasAnyPermission,
    hasRole,
    hasAnyRole,
    refreshUser,
    isOwner: state.roles.includes('owner'),
    isAdmin: state.roles.includes('admin') || state.roles.includes('owner')
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
