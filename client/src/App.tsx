import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
// App.css removed - fully migrated to Tailwind CSS
import Hudson from './pages/Hudson';
import Users from './pages/Users';
import EventsFeed from './pages/EventsFeed';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import { useTheme, ThemeName } from './context/ThemeContext';

const themeLabels: Record<ThemeName, string> = {
  midnight: 'Midnight',
  charcoal: 'Charcoal',
  ocean: 'Ocean',
  forest: 'Forest',
  ember: 'Ember',
};

function App() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-mhc-bg text-mhc-text transition-colors duration-300">
        <nav className="bg-mhc-surface border-b-2 border-mhc-primary sticky top-0 z-50 shadow-lg transition-colors duration-300">
          <div className="max-w-6xl mx-auto px-5 flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                MHC Control Panel
              </span>
            </div>
            <div className="flex gap-6 items-center">
              <Link to="/" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Users
              </Link>
              <Link to="/profile" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Profile
              </Link>
              <Link to="/hudson" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Hudson
              </Link>
              <Link to="/events" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Events
              </Link>
              <Link to="/admin" className="text-mhc-text-muted no-underline font-medium px-4 py-2 rounded-md transition-all hover:bg-mhc-surface-light hover:text-mhc-primary">
                Admin
              </Link>
              <div className="border-l border-mhc-surface-light h-6 mx-2" />
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeName)}
                className="bg-mhc-surface-light text-mhc-text-muted border border-mhc-surface-lighter px-3 py-1.5 rounded-md text-sm cursor-pointer transition-all hover:border-mhc-primary focus:outline-none focus:border-mhc-primary"
              >
                {themes.map((t) => (
                  <option key={t} value={t} className="bg-mhc-surface text-mhc-text">
                    {themeLabels[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </nav>

        <main className="flex-1 p-5">
          <Routes>
            <Route path="/" element={<Users />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:username" element={<Profile />} />
            <Route path="/hudson" element={<Hudson />} />
            <Route path="/events" element={<EventsFeed />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
