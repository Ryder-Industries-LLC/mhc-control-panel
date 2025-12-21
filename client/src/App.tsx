import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';
import Hudson from './pages/Hudson';

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
              <Link to="/hudson" className="nav-link">Hudson</Link>
            </div>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/hudson" element={<Hudson />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
