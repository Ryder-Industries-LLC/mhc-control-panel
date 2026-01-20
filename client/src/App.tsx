import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
// App.css removed - fully migrated to Tailwind CSS
import BroadcasterDashboard from './pages/BroadcasterDashboard';
import Users from './pages/Users';
import EventsFeed from './pages/EventsFeed';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import MyBroadcasts from './pages/MyBroadcasts';
import LiveMonitor from './pages/LiveMonitor';
import Visitors from './pages/Visitors';
import Sessions from './pages/Sessions';
import SessionDetail from './pages/SessionDetail';
import Inbox from './pages/Inbox';
import FollowHistory from './pages/FollowHistory';
import EventLog from './pages/EventLog';
import Favorites from './pages/Favorites';
import GlobalLookup from './components/GlobalLookup';

// Auth pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import Verify2FA from './pages/Verify2FA';
import Unauthorized from './pages/Unauthorized';
import SecondGate from './pages/SecondGate';

// Auth
import { useAuth } from './context/AuthContext';
import { GatedRoute } from './components/auth/GatedRoute';

// User menu component for auth state
function UserMenu() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState(false);
  const [cachedAvatarUrl, setCachedAvatarUrl] = React.useState<string | null>(null);

  // Load cached avatar on mount
  React.useEffect(() => {
    const cached = localStorage.getItem('mhc_cached_avatar');
    if (cached) {
      setCachedAvatarUrl(cached);
    }
  }, []);

  // Cache avatar URL when it successfully loads
  const handleAvatarLoad = React.useCallback(() => {
    if (user?.avatarUrl) {
      localStorage.setItem('mhc_cached_avatar', user.avatarUrl);
      setCachedAvatarUrl(user.avatarUrl);
    }
  }, [user?.avatarUrl]);

  // Handle avatar error - try cached version first
  const handleAvatarError = React.useCallback(() => {
    if (!avatarError && cachedAvatarUrl && cachedAvatarUrl !== user?.avatarUrl) {
      // Try cached version - don't set error yet
      setAvatarError(true);
    } else {
      // Cached version also failed or doesn't exist
      setAvatarError(true);
    }
  }, [avatarError, cachedAvatarUrl, user?.avatarUrl]);

  if (isLoading) {
    return (
      <div className="text-sm text-mhc-text-muted">Loading...</div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Link
        to="/login"
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-mhc-primary text-white hover:bg-mhc-primary/80 transition-colors"
      >
        Sign In
      </Link>
    );
  }

  const handleLogout = async () => {
    await logout();
    setShowDropdown(false);
  };

  // Determine which avatar URL to use
  const effectiveAvatarUrl = avatarError && cachedAvatarUrl ? cachedAvatarUrl : user?.avatarUrl;
  const showAvatar = effectiveAvatarUrl && !(avatarError && (!cachedAvatarUrl || cachedAvatarUrl === user?.avatarUrl));

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 text-sm font-medium px-2 py-1 rounded-md hover:bg-mhc-surface-light transition-colors"
      >
        {showAvatar ? (
          <img
            src={effectiveAvatarUrl}
            alt={user?.displayName || 'User'}
            className="w-6 h-6 rounded-full object-cover"
            onLoad={handleAvatarLoad}
            onError={handleAvatarError}
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-mhc-primary/20 flex items-center justify-center text-mhc-primary text-xs font-bold">
            {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
          </div>
        )}
        <span className="text-mhc-text hidden sm:inline">
          {user?.displayName || user?.email || 'User'}
        </span>
        <svg
          className={`w-4 h-4 text-mhc-text-muted transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-mhc-surface border border-mhc-border rounded-lg shadow-lg z-50">
            <div className="px-4 py-3 border-b border-mhc-border">
              <p className="text-sm font-medium text-mhc-text truncate">
                {user?.displayName || 'User'}
              </p>
              <p className="text-xs text-mhc-text-muted truncate">
                {user?.email || ''}
              </p>
            </div>
            <div className="py-1">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-mhc-surface-light transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Navigation link component with active state
function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to ||
    (to === '/people' && location.pathname.startsWith('/people')) ||
    (to === '/stats' && (location.pathname === '/dashboard' || location.pathname === '/stats')) ||
    (to === '/broadcasts' && (location.pathname === '/sessions' || location.pathname.startsWith('/sessions/') || location.pathname === '/broadcasts')) ||
    (to === '/event-log' && location.pathname === '/event-log');

  return (
    <Link
      to={to}
      className={`no-underline font-medium px-3 py-1.5 rounded-md transition-all text-sm ${
        isActive
          ? 'bg-mhc-primary/20 text-mhc-primary'
          : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-primary'
      }`}
    >
      {children}
    </Link>
  );
}

function AppContent() {
  return (
    <div className="min-h-screen flex flex-col bg-mhc-bg text-mhc-text transition-colors duration-300">
      {/* Two-row navigation with logo spanning both rows */}
      <nav className="bg-mhc-surface border-b-2 border-mhc-primary sticky top-0 z-50 shadow-lg transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4">
          {/* Grid layout: logo spans 2 rows on left, content on right */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4">
            {/* Logo - spans both rows */}
            <div className="row-span-2 flex items-center py-2">
              <Link to="/people" className="flex items-center">
                <img
                  src="/mhc-logo.jpg"
                  alt="MHC"
                  className="h-16 w-16 rounded-lg object-contain border-2 border-mhc-primary shadow-md"
                />
              </Link>
            </div>

            {/* Row 1: Main navigation links */}
            <div className="flex items-center justify-between h-10 border-b border-white/5">
              <div className="flex items-center gap-1">
                <NavLink to="/people">People</NavLink>
                <NavLink to="/inbox">Inbox</NavLink>
                <NavLink to="/stats">Stats</NavLink>
                <NavLink to="/broadcasts">Broadcasts</NavLink>
                <NavLink to="/follow-history">Follow History</NavLink>
                <NavLink to="/favorites">Favorites</NavLink>
                <NavLink to="/event-log">Event Log</NavLink>
                <NavLink to="/admin">Admin</NavLink>
              </div>
              <UserMenu />
            </div>

            {/* Row 2: Search centered (MHC-1101) */}
            <div className="flex items-center justify-center h-10">
              <GlobalLookup inline />
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 p-5">
        <Routes>
          {/* Auth routes - not protected */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-2fa" element={<Verify2FA />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/gate" element={<SecondGate />} />

          {/* Protected routes - require OAuth + second gate */}
          {/* Default landing page is now Directory/People */}
          <Route path="/" element={<GatedRoute><Users /></GatedRoute>} />

          {/* Stats (formerly Dashboard) */}
          <Route path="/stats" element={<GatedRoute><BroadcasterDashboard /></GatedRoute>} />
          <Route path="/dashboard" element={<GatedRoute><BroadcasterDashboard /></GatedRoute>} /> {/* Alias for backwards compatibility */}
          <Route path="/hudson" element={<GatedRoute><BroadcasterDashboard /></GatedRoute>} /> {/* Alias for backwards compatibility */}

          {/* Broadcasts (formerly Sessions) */}
          <Route path="/broadcasts" element={<GatedRoute><Sessions /></GatedRoute>} />
          <Route path="/broadcasts/:id" element={<GatedRoute><SessionDetail /></GatedRoute>} />
          <Route path="/sessions" element={<GatedRoute><Sessions /></GatedRoute>} /> {/* Alias for backwards compatibility */}
          <Route path="/sessions/:id" element={<GatedRoute><SessionDetail /></GatedRoute>} /> {/* Alias for backwards compatibility */}

          {/* Inbox */}
          <Route path="/inbox" element={<GatedRoute><Inbox /></GatedRoute>} />

          {/* Directory/People */}
          <Route path="/people" element={<GatedRoute><Users /></GatedRoute>} />
          <Route path="/people/:username" element={<GatedRoute><Profile /></GatedRoute>} />
          <Route path="/profile" element={<GatedRoute><Profile /></GatedRoute>} /> {/* Alias for backwards compatibility */}
          <Route path="/profile/:username" element={<GatedRoute><Profile /></GatedRoute>} /> {/* Alias for backwards compatibility */}

          {/* Other pages */}
          <Route path="/my-broadcasts" element={<GatedRoute><MyBroadcasts /></GatedRoute>} />
          <Route path="/events" element={<GatedRoute><EventsFeed /></GatedRoute>} />
          <Route path="/event-log" element={<GatedRoute><EventLog /></GatedRoute>} />
          <Route path="/live" element={<GatedRoute><LiveMonitor /></GatedRoute>} />
          <Route path="/visitors" element={<GatedRoute><Visitors /></GatedRoute>} />
          <Route path="/follow-history" element={<GatedRoute><FollowHistory /></GatedRoute>} />
          <Route path="/favorites" element={<GatedRoute><Favorites /></GatedRoute>} />
          <Route path="/admin" element={<GatedRoute><Admin /></GatedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
