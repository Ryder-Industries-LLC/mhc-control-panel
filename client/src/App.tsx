import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
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
import GlobalLookup from './components/GlobalLookup';

function App() {

  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-mhc-bg text-mhc-text transition-colors duration-300">
        <nav className="bg-mhc-surface border-b-2 border-mhc-primary sticky top-0 z-50 shadow-lg transition-colors duration-300">
          <div className="max-w-6xl mx-auto px-5 flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-3">
                <img
                  src="/mhc-logo.jpg"
                  alt="MHC"
                  className="h-10 w-10 rounded-md object-contain border-2 border-mhc-primary"
                />
              </Link>
              <GlobalLookup inline />
            </div>
            <div className="flex gap-6 items-center">
              <Link to="/dashboard" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Dashboard
              </Link>
              <Link to="/sessions" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Sessions
              </Link>
              <Link to="/inbox" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Inbox
              </Link>
              <Link to="/people" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                People
              </Link>
              <Link to="/admin" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Admin
              </Link>
            </div>
          </div>
        </nav>

        <main className="flex-1 p-5">
          <Routes>
            <Route path="/" element={<BroadcasterDashboard />} />
            <Route path="/dashboard" element={<BroadcasterDashboard />} />
            <Route path="/hudson" element={<BroadcasterDashboard />} /> {/* Alias for backwards compatibility */}
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/people" element={<Users />} />
            <Route path="/people/:username" element={<Profile />} />
            <Route path="/profile" element={<Profile />} /> {/* Alias for backwards compatibility */}
            <Route path="/profile/:username" element={<Profile />} /> {/* Alias for backwards compatibility */}
            <Route path="/broadcasts" element={<MyBroadcasts />} /> {/* Legacy route */}
            <Route path="/events" element={<EventsFeed />} />
            <Route path="/live" element={<LiveMonitor />} />
            <Route path="/visitors" element={<Visitors />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
