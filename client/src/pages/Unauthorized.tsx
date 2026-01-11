import React from 'react';
import { Link } from 'react-router-dom';

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-mhc-bg px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto h-20 w-20 flex items-center justify-center rounded-full bg-red-500/10">
          <svg
            className="h-10 w-10 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="mt-6 text-3xl font-bold text-mhc-text">
          Access Denied
        </h1>

        <p className="mt-4 text-mhc-text-muted">
          You don't have permission to access this page.
          If you believe this is an error, please contact an administrator.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/"
            className="px-6 py-3 bg-mhc-primary hover:bg-mhc-primary-dark text-white font-medium rounded-lg transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            to="/login"
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-mhc-text font-medium rounded-lg transition-colors"
          >
            Sign in as different user
          </Link>
        </div>
      </div>
    </div>
  );
}
