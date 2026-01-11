import React, { useEffect, useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { api } from '../../api/client';

interface GoogleLoginButtonProps {
  onSuccess: (credential: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

/**
 * Google OAuth login button that handles the OAuth flow
 */
export function GoogleLoginButton({ onSuccess, onError, disabled }: GoogleLoginButtonProps) {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch auth config to get Google client ID
    api.auth.getConfig()
      .then(config => {
        if (config.googleEnabled && config.googleClientId) {
          setGoogleClientId(config.googleClientId);
        } else {
          setConfigError('Google login not configured');
        }
      })
      .catch(() => {
        setConfigError('Failed to load auth configuration');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleSuccess = (response: CredentialResponse) => {
    if (response.credential) {
      onSuccess(response.credential);
    } else {
      onError('No credential received from Google');
    }
  };

  const handleError = () => {
    onError('Google login failed');
  };

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center py-3">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-mhc-primary"></div>
      </div>
    );
  }

  if (configError || !googleClientId) {
    // Show a disabled button with tooltip
    return (
      <button
        disabled
        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-mhc-text-muted cursor-not-allowed"
        title={configError || 'Google login not available'}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </button>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <div className={`w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={handleError}
          type="standard"
          theme="filled_black"
          size="large"
          width="100%"
          text="signin_with"
          shape="rectangular"
          useOneTap={false}
        />
      </div>
    </GoogleOAuthProvider>
  );
}

export default GoogleLoginButton;
