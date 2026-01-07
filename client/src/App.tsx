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
import GlobalLookup from './components/GlobalLookup';

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
                <NavLink to="/people">Directory</NavLink>
                <NavLink to="/inbox">Inbox</NavLink>
                <NavLink to="/stats">Stats</NavLink>
                <NavLink to="/broadcasts">Broadcasts</NavLink>
                <NavLink to="/follow-history">Follow History</NavLink>
                <NavLink to="/event-log">Event Log</NavLink>
                <NavLink to="/admin">Admin</NavLink>
              </div>
            </div>

            {/* Row 2: Search and contextual actions */}
            <div className="flex items-center justify-between h-10">
              <div className="flex items-center gap-4">
                <GlobalLookup inline />
              </div>
              {/* Space for future contextual tabs/filters per page */}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 p-5">
        <Routes>
          {/* Default landing page is now Directory/People */}
          <Route path="/" element={<Users />} />

          {/* Stats (formerly Dashboard) */}
          <Route path="/stats" element={<BroadcasterDashboard />} />
          <Route path="/dashboard" element={<BroadcasterDashboard />} /> {/* Alias for backwards compatibility */}
          <Route path="/hudson" element={<BroadcasterDashboard />} /> {/* Alias for backwards compatibility */}

          {/* Broadcasts (formerly Sessions) */}
          <Route path="/broadcasts" element={<Sessions />} />
          <Route path="/broadcasts/:id" element={<SessionDetail />} />
          <Route path="/sessions" element={<Sessions />} /> {/* Alias for backwards compatibility */}
          <Route path="/sessions/:id" element={<SessionDetail />} /> {/* Alias for backwards compatibility */}

          {/* Inbox */}
          <Route path="/inbox" element={<Inbox />} />

          {/* Directory/People */}
          <Route path="/people" element={<Users />} />
          <Route path="/people/:username" element={<Profile />} />
          <Route path="/profile" element={<Profile />} /> {/* Alias for backwards compatibility */}
          <Route path="/profile/:username" element={<Profile />} /> {/* Alias for backwards compatibility */}

          {/* Other pages */}
          <Route path="/my-broadcasts" element={<MyBroadcasts />} />
          <Route path="/events" element={<EventsFeed />} />
          <Route path="/event-log" element={<EventLog />} />
          <Route path="/live" element={<LiveMonitor />} />
          <Route path="/visitors" element={<Visitors />} />
          <Route path="/follow-history" element={<FollowHistory />} />
          <Route path="/admin" element={<Admin />} />
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
