import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Follow.css';

interface FollowPerson {
  id: string;
  username: string;
  platform: string;
  role: string;
  last_seen_at: string;
  interaction_count: number;
  snapshot_count: number;
  image_url: string | null;
  current_show: string | null;
  tags: string[] | null;
  following_checked_at?: string;
  follower_checked_at?: string;
}

const Follow: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'following' | 'followers'>('following');
  const [following, setFollowing] = useState<FollowPerson[]>([]);
  const [followers, setFollowers] = useState<FollowPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [showCookieDialog, setShowCookieDialog] = useState(false);
  const [cookiesInput, setCookiesInput] = useState('');
  const [cookieStatus, setCookieStatus] = useState<string | null>(null);
  const [hasCookies, setHasCookies] = useState(false);

  useEffect(() => {
    loadData();
    checkCookieStatus();
  }, [activeTab]);

  const checkCookieStatus = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/followers/cookies-status');
      const data = await response.json();
      setHasCookies(data.hasCookies);
    } catch (err) {
      console.error('Error checking cookie status:', err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'following') {
        const response = await fetch('http://localhost:3000/api/followers/following');
        const data = await response.json();
        setFollowing(data.following || []);
      } else {
        const response = await fetch('http://localhost:3000/api/followers/followers');
        const data = await response.json();
        setFollowers(data.followers || []);
      }
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (type: 'following' | 'followers', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadStatus(`Processing ${file.name}...`);

      const text = await file.text();
      const endpoint = type === 'following'
        ? 'http://localhost:3000/api/followers/update-following'
        : 'http://localhost:3000/api/followers/update-followers';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: text }),
      });

      const data = await response.json();

      if (data.success) {
        setUploadStatus(`✓ Updated: ${data.stats[type === 'following' ? 'totalFollowing' : 'totalFollowers']} total, ${data.stats[type === 'following' ? 'newFollowing' : 'newFollowers']} new`);
        await loadData();
        setTimeout(() => setUploadStatus(null), 5000);
      } else {
        setUploadStatus('✗ Failed to update');
      }
    } catch (err) {
      console.error(err);
      setUploadStatus('✗ Error processing file');
    }

    // Reset file input
    event.target.value = '';
  };

  const handleImportCookies = async () => {
    try {
      if (!cookiesInput.trim()) {
        setCookieStatus('✗ Please paste cookies first');
        setTimeout(() => setCookieStatus(null), 3000);
        return;
      }

      setCookieStatus('Importing cookies...');

      let cookies;
      try {
        cookies = JSON.parse(cookiesInput);
      } catch (e) {
        setCookieStatus('✗ Invalid JSON format. Please paste the cookies array correctly.');
        setTimeout(() => setCookieStatus(null), 5000);
        return;
      }

      const response = await fetch('http://localhost:3000/api/followers/import-cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies }),
      });

      const data = await response.json();

      if (data.success) {
        setCookieStatus(`✓ ${data.message}`);
        setShowCookieDialog(false);
        setCookiesInput('');
        setHasCookies(true);
        setTimeout(() => setCookieStatus(null), 5000);
      } else {
        setCookieStatus(`✗ ${data.error || 'Failed to import cookies'}`);
        setTimeout(() => setCookieStatus(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setCookieStatus('✗ Error importing cookies');
      setTimeout(() => setCookieStatus(null), 5000);
    }
  };

  const handleAutoScrape = async (type: 'following' | 'followers') => {
    try {
      setScraping(true);
      setScrapeStatus(`⏳ Scraping ${type}... DO NOT navigate away! This may take 2-5 minutes for large lists.`);

      // Warn user if they try to navigate away
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = 'Scraping in progress! Are you sure you want to leave?';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      const endpoint = type === 'following'
        ? 'http://localhost:3000/api/followers/scrape-following'
        : 'http://localhost:3000/api/followers/scrape-followers';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      // Remove navigation warning
      window.removeEventListener('beforeunload', handleBeforeUnload);

      if (data.success) {
        const totalCount = data.stats[type === 'following' ? 'totalFollowing' : 'totalFollowers'];
        const newCount = data.stats[type === 'following' ? 'newFollowing' : 'newFollowers'];
        setScrapeStatus(`✓ Complete! Total: ${totalCount} users, New: ${newCount} users. Click here to dismiss.`);
        await loadData();
        // Don't auto-dismiss - let user click to dismiss
      } else {
        setScrapeStatus(`✗ ${data.error || 'Failed to scrape'}. Click to dismiss.`);
      }
    } catch (err) {
      console.error(err);
      setScrapeStatus('✗ Error during automated scraping. Click to dismiss.');
    } finally {
      setScraping(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const currentData = activeTab === 'following' ? following : followers;

  return (
    <div className="follow-page">
      <div className="follow-header">
        <h1>Follow Management</h1>
        <p className="follow-subtitle">
          Track users you're following and users following you
        </p>
      </div>

      <div className="follow-tabs">
        <button
          className={activeTab === 'following' ? 'follow-tab active' : 'follow-tab'}
          onClick={() => setActiveTab('following')}
        >
          Following ({following.length})
        </button>
        <button
          className={activeTab === 'followers' ? 'follow-tab active' : 'follow-tab'}
          onClick={() => setActiveTab('followers')}
        >
          Followers ({followers.length})
        </button>
      </div>

      <div className="follow-actions">
        <div className="upload-section">
          <div className="action-buttons">
            <button
              className="import-cookies-btn"
              onClick={() => setShowCookieDialog(true)}
            >
              {hasCookies ? '✓ Cookies Imported' : 'Import Cookies'}
            </button>
            <button
              className="auto-scrape-btn"
              onClick={() => handleAutoScrape(activeTab)}
              disabled={scraping || !hasCookies}
            >
              {scraping ? 'Scraping...' : `Auto-Scrape ${activeTab === 'following' ? 'Following' : 'Followers'}`}
            </button>
            <label className="upload-btn">
              <input
                type="file"
                accept=".html"
                onChange={(e) => handleFileUpload(activeTab, e)}
                style={{ display: 'none' }}
              />
              Upload {activeTab === 'following' ? 'Following' : 'Followers'} HTML
            </label>
          </div>
          <div className="upload-instructions">
            <strong>First time setup:</strong> Click "Import Cookies" to import your Chaturbate session (one-time setup, works with 2FA).
            <br />
            <br />
            {activeTab === 'following' ? (
              <span>
                <strong>Auto-Scrape:</strong> Automatically fetch your following list from Chaturbate (requires cookies to be imported first).
                <br />
                <strong>Manual Upload:</strong> Visit <a href="https://chaturbate.com/followed-cams" target="_blank" rel="noopener noreferrer">followed-cams</a> and
                <a href="https://chaturbate.com/followed-cams/offline/" target="_blank" rel="noopener noreferrer"> followed-cams/offline</a>, save the pages as HTML, then upload them here.
              </span>
            ) : (
              <span>
                <strong>Auto-Scrape:</strong> Automatically fetch your followers list from Chaturbate (requires cookies to be imported first).
                <br />
                <strong>Manual Upload:</strong> Visit <a href="https://chaturbate.com/accounts/followers/" target="_blank" rel="noopener noreferrer">accounts/followers</a>, save the page as HTML, then upload it here.
              </span>
            )}
          </div>
          {cookieStatus && (
            <div className={cookieStatus.startsWith('✓') ? 'upload-status success' : 'upload-status error'}>
              {cookieStatus}
            </div>
          )}
          {scrapeStatus && (
            <div
              className={scrapeStatus.startsWith('✓') ? 'upload-status success' : scrapeStatus.startsWith('⏳') ? 'upload-status warning' : 'upload-status error'}
              onClick={() => !scraping && setScrapeStatus(null)}
              style={{ cursor: scraping ? 'default' : 'pointer' }}
            >
              {scrapeStatus}
            </div>
          )}
          {uploadStatus && (
            <div className={uploadStatus.startsWith('✓') ? 'upload-status success' : 'upload-status error'}>
              {uploadStatus}
            </div>
          )}
        </div>
      </div>

      {showCookieDialog && (
        <div className="cookie-dialog-overlay" onClick={() => setShowCookieDialog(false)}>
          <div className="cookie-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="cookie-dialog-header">
              <h2>Import Chaturbate Cookies</h2>
              <button className="close-btn" onClick={() => setShowCookieDialog(false)}>×</button>
            </div>
            <div className="cookie-dialog-content">
              <p className="cookie-instructions">
                <strong>Step 1:</strong> Log in to Chaturbate in your browser (handle 2FA if needed)
                <br />
                <strong>Step 2:</strong> Press F12 to open Developer Tools → Go to Application tab → Storage → Cookies → https://chaturbate.com
                <br />
                <strong>Step 3:</strong> Right-click on any cookie → "Show Requests With This Cookie"
                <br />
                <strong>Step 4:</strong> In Network tab, click any request → Headers → Request Headers → cookie:
                <br />
                <strong>Step 5:</strong> Copy the ENTIRE cookie value (all the key=value pairs separated by semicolons)
                <br />
                <strong>Step 6:</strong> Paste this command in Console tab and press Enter:
              </p>
              <pre className="cookie-command">
{`// Paste your full cookie string in the quotes below, then run:
const cookieStr = "PASTE_COOKIE_STRING_HERE";
copy(JSON.stringify(cookieStr.split('; ').map(c => {
  const [name, ...v] = c.split('=');
  return {
    name,
    value: v.join('='),
    domain: '.chaturbate.com',
    path: '/',
    secure: true,
    httpOnly: name === 'sessionid',
    sameSite: 'Lax'
  };
})))`}
              </pre>
              <p className="cookie-instructions">
                <strong>Step 7:</strong> The cookies are now in your clipboard. Paste them below:
              </p>
              <textarea
                className="cookie-textarea"
                placeholder="Paste cookies here..."
                value={cookiesInput}
                onChange={(e) => setCookiesInput(e.target.value)}
                rows={10}
              />
              <div className="cookie-dialog-actions">
                <button className="cancel-btn" onClick={() => setShowCookieDialog(false)}>
                  Cancel
                </button>
                <button className="import-btn" onClick={handleImportCookies}>
                  Import Cookies
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="follow-loading">Loading...</div>
      ) : error ? (
        <div className="follow-error">{error}</div>
      ) : (
        <div className="follow-content">
          <table className="follow-table">
            <thead>
              <tr>
                <th className="username-column">Username</th>
                <th className="image-column">Image</th>
                <th>Role</th>
                <th>Tags</th>
                <th>Events</th>
                <th>Snapshots</th>
                <th>Last Seen</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="no-data">
                    No {activeTab === 'following' ? 'users you\'re following' : 'followers'} found.
                    Upload HTML to populate this list.
                  </td>
                </tr>
              ) : (
                currentData.map(person => (
                  <tr key={person.id}>
                    <td className="username-cell">
                      <Link to={`/profile/${person.username}`}>
                        {person.username}
                      </Link>
                    </td>
                    <td className="image-cell">
                      {person.image_url && (
                        <div className="image-wrapper">
                          <img
                            src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`}
                            alt={person.username}
                            className="user-image"
                          />
                          {person.current_show && (
                            <span className="live-dot" title="Currently live">●</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`role-badge role-${person.role.toLowerCase()}`}>
                        {person.role}
                      </span>
                    </td>
                    <td className="tags-cell">
                      {person.tags && person.tags.length > 0 ? (
                        <div className="tags-container">
                          {person.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="tag-badge">
                              {tag}
                            </span>
                          ))}
                          {person.tags.length > 3 && (
                            <span className="tag-more">+{person.tags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="no-tags">—</span>
                      )}
                    </td>
                    <td className="count-cell">{person.interaction_count || 0}</td>
                    <td className="count-cell">{person.snapshot_count || 0}</td>
                    <td>{formatDate(person.last_seen_at)}</td>
                    <td>
                      {formatDate(
                        activeTab === 'following'
                          ? person.following_checked_at || person.last_seen_at
                          : person.follower_checked_at || person.last_seen_at
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Follow;
