import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';
import Hudson from './pages/Hudson';
import Directory from './pages/Directory';
import EventsFeed from './pages/EventsFeed';
import Jobs from './pages/Jobs';
import Profile from './pages/Profile';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="nav">
          <div className="nav-container">
            <div className="nav-brand">
              <span className="nav-title">MHC Control Panel</span>
            </div>
            <div className="nav-links">
              <Link to="/" className="nav-link">Lookup</Link>
              <Link to="/profile" className="nav-link">Profile</Link>
              <Link to="/hudson" className="nav-link">Hudson</Link>
              <Link to="/events" className="nav-link">Events</Link>
              <Link to="/directory" className="nav-link">Directory</Link>
              <Link to="/jobs" className="nav-link">Jobs</Link>
            </div>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:username" element={<Profile />} />
            <Route path="/hudson" element={<Hudson />} />
            <Route path="/events" element={<EventsFeed />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/jobs" element={<Jobs />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
