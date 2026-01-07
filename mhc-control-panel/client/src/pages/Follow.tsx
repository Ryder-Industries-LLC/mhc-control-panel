import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
// Follow.css removed - fully migrated to Tailwind CSS

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
      const response = await fetch('/api/followers/cookies-status');
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
        const response = await fetch('/api/followers/following');
        const data = await response.json();
        setFollowing(data.following || []);
      } else {
        const response = await fetch('/api/followers/followers');
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
        ? '/api/followers/update-following'
        : '/api/followers/update-followers';

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

      const response = await fetch('/api/followers/import-cookies', {
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
        ? '/api/followers/scrape-following'
        : '/api/followers/scrape-followers';

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

  const getRoleBadge = (role: string) => {
    const base = "inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide";
    switch (role.toLowerCase()) {
      case 'broadcaster':
        return `${base} bg-purple-500/20 text-purple-400 border border-purple-500/30`;
      case 'viewer':
        return `${base} bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`;
      default:
        return `${base} bg-gray-500/20 text-gray-400 border border-gray-500/30`;
    }
  };

  const currentData = activeTab === 'following' ? following : followers;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
          Follow Management
        </h1>
        <p className="text-white/60 text-base">
          Track users you're following and users following you
        </p>
      </div>

      <div className="flex gap-2 border-b-2 border-white/10 mb-8">
        <button
          className={`px-6 py-3 bg-transparent border-none border-b-4 text-base font-medium cursor-pointer transition-all -mb-0.5 ${
            activeTab === 'following'
              ? 'text-mhc-primary border-b-mhc-primary bg-mhc-primary/10'
              : 'text-white/60 border-b-transparent hover:text-white/90 hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('following')}
        >
          Following ({following.length})
        </button>
        <button
          className={`px-6 py-3 bg-transparent border-none border-b-4 text-base font-medium cursor-pointer transition-all -mb-0.5 ${
            activeTab === 'followers'
              ? 'text-mhc-primary border-b-mhc-primary bg-mhc-primary/10'
              : 'text-white/60 border-b-transparent hover:text-white/90 hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('followers')}
        >
          Followers ({followers.length})
        </button>
      </div>

      <div className="mb-8">
        <div className="flex flex-col gap-3 p-6 bg-white/5 rounded-lg border border-white/10">
          <div className="flex gap-4 flex-wrap">
            <button
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-none rounded-lg cursor-pointer transition-all font-medium text-base max-w-xs hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/40"
              onClick={() => setShowCookieDialog(true)}
            >
              {hasCookies ? '✓ Cookies Imported' : 'Import Cookies'}
            </button>
            <button
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white border-none rounded-lg cursor-pointer transition-all font-medium text-base max-w-xs hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/40 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={() => handleAutoScrape(activeTab)}
              disabled={scraping || !hasCookies}
            >
              {scraping ? 'Scraping...' : `Auto-Scrape ${activeTab === 'following' ? 'Following' : 'Followers'}`}
            </button>
            <label className="inline-block px-6 py-3 bg-gradient-primary text-white rounded-lg cursor-pointer transition-all font-medium text-center max-w-xs hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mhc-primary/40">
              <input
                type="file"
                accept=".html"
                onChange={(e) => handleFileUpload(activeTab, e)}
                className="hidden"
              />
              Upload {activeTab === 'following' ? 'Following' : 'Followers'} HTML
            </label>
          </div>
          <div className="text-sm text-white/60 leading-relaxed">
            <strong>First time setup:</strong> Click "Import Cookies" to import your Chaturbate session (one-time setup, works with 2FA).
            <br />
            <br />
            {activeTab === 'following' ? (
              <span>
                <strong>Auto-Scrape:</strong> Automatically fetch your following list from Chaturbate (requires cookies to be imported first).
                <br />
                <strong>Manual Upload:</strong> Visit <a href="https://chaturbate.com/followed-cams" target="_blank" rel="noopener noreferrer" className="text-mhc-primary no-underline mx-1 hover:underline">followed-cams</a> and
                <a href="https://chaturbate.com/followed-cams/offline/" target="_blank" rel="noopener noreferrer" className="text-mhc-primary no-underline mx-1 hover:underline"> followed-cams/offline</a>, save the pages as HTML, then upload them here.
              </span>
            ) : (
              <span>
                <strong>Auto-Scrape:</strong> Automatically fetch your followers list from Chaturbate (requires cookies to be imported first).
                <br />
                <strong>Manual Upload:</strong> Visit <a href="https://chaturbate.com/accounts/followers/" target="_blank" rel="noopener noreferrer" className="text-mhc-primary no-underline mx-1 hover:underline">accounts/followers</a>, save the page as HTML, then upload it here.
              </span>
            )}
          </div>
          {cookieStatus && (
            <div className={`p-3 rounded-md text-sm font-medium ${
              cookieStatus.startsWith('✓')
                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : 'bg-red-500/15 text-red-500 border border-red-500/30'
            }`}>
              {cookieStatus}
            </div>
          )}
          {scrapeStatus && (
            <div
              className={`p-3 rounded-md text-sm font-medium ${
                scrapeStatus.startsWith('✓')
                  ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                  : scrapeStatus.startsWith('⏳')
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse'
                    : 'bg-red-500/15 text-red-500 border border-red-500/30'
              }`}
              onClick={() => !scraping && setScrapeStatus(null)}
              style={{ cursor: scraping ? 'default' : 'pointer' }}
            >
              {scrapeStatus}
            </div>
          )}
          {uploadStatus && (
            <div className={`p-3 rounded-md text-sm font-medium ${
              uploadStatus.startsWith('✓')
                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : 'bg-red-500/15 text-red-500 border border-red-500/30'
            }`}>
              {uploadStatus}
            </div>
          )}
        </div>
      </div>

      {showCookieDialog && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCookieDialog(false)}
        >
          <div
            className="bg-mhc-bg rounded-xl border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h2 className="m-0 text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Import Chaturbate Cookies
              </h2>
              <button
                className="bg-transparent border-none text-white/60 text-3xl cursor-pointer w-8 h-8 flex items-center justify-center transition-colors hover:text-white"
                onClick={() => setShowCookieDialog(false)}
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <p className="text-white/80 leading-loose mb-4">
                <strong className="text-white">Step 1:</strong> Log in to Chaturbate in your browser (handle 2FA if needed)
                <br />
                <strong className="text-white">Step 2:</strong> Press F12 to open Developer Tools → Go to Application tab → Storage → Cookies → https://chaturbate.com
                <br />
                <strong className="text-white">Step 3:</strong> Right-click on any cookie → "Show Requests With This Cookie"
                <br />
                <strong className="text-white">Step 4:</strong> In Network tab, click any request → Headers → Request Headers → cookie:
                <br />
                <strong className="text-white">Step 5:</strong> Copy the ENTIRE cookie value (all the key=value pairs separated by semicolons)
                <br />
                <strong className="text-white">Step 6:</strong> Paste this command in Console tab and press Enter:
              </p>
              <pre className="bg-black/40 border border-white/10 rounded-md p-4 overflow-x-auto text-sm text-green-400 my-4 whitespace-pre-wrap break-all">
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
              <p className="text-white/80 mb-4">
                <strong className="text-white">Step 7:</strong> The cookies are now in your clipboard. Paste them below:
              </p>
              <textarea
                className="w-full min-h-[200px] bg-black/30 border border-white/20 rounded-md p-3 text-white/90 font-mono text-sm resize-y mb-4 focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                placeholder="Paste cookies here..."
                value={cookiesInput}
                onChange={(e) => setCookiesInput(e.target.value)}
                rows={10}
              />
              <div className="flex gap-4 justify-end">
                <button
                  className="px-6 py-3 bg-white/5 text-white/80 border border-white/20 rounded-lg cursor-pointer transition-all font-medium hover:bg-white/10 hover:text-white"
                  onClick={() => setShowCookieDialog(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-3 bg-gradient-primary text-white border-none rounded-lg cursor-pointer transition-all font-medium hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mhc-primary/40"
                  onClick={handleImportCookies}
                >
                  Import Cookies
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-lg text-white/60">Loading...</div>
      ) : error ? (
        <div className="text-center py-12 text-lg text-red-500">{error}</div>
      ) : (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="bg-white/5">
              <tr>
                <th className="p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10 w-44">Username</th>
                <th className="p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10 w-36">Image</th>
                <th className="p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10">Role</th>
                <th className="p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10">Tags</th>
                <th className="p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10">Events</th>
                <th className="p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10">Snapshots</th>
                <th className="p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10">Last Seen</th>
                <th className="p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10">Checked</th>
              </tr>
            </thead>
            <tbody>
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-12 text-white/40 italic">
                    No {activeTab === 'following' ? 'users you\'re following' : 'followers'} found.
                    Upload HTML to populate this list.
                  </td>
                </tr>
              ) : (
                currentData.map(person => (
                  <tr key={person.id} className="transition-colors hover:bg-white/5 border-b border-white/5">
                    <td className="p-4 text-white/80 text-sm">
                      <Link to={`/profile/${person.username}`} className="text-mhc-primary no-underline font-medium transition-colors hover:text-mhc-primary-dark hover:underline">
                        {person.username}
                      </Link>
                    </td>
                    <td className="p-2">
                      {person.image_url && (
                        <div className="relative w-28 h-20">
                          <img
                            src={person.image_url.startsWith('http') ? person.image_url : `/images/${person.image_url}`}
                            alt={person.username}
                            className="w-full h-full object-cover rounded-md border-2 border-white/10 transition-all hover:border-mhc-primary hover:scale-105 hover:shadow-lg hover:shadow-mhc-primary/40"
                          />
                          {person.current_show && (
                            <span className="absolute top-0.5 right-0.5 text-red-500 text-xs animate-pulse-live" title="Currently live">●</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-white/80 text-sm">
                      <span className={getRoleBadge(person.role)}>
                        {person.role}
                      </span>
                    </td>
                    <td className="p-2">
                      {person.tags && person.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 items-center">
                          {person.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="inline-block px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 rounded-lg text-xs text-purple-400 whitespace-nowrap">
                              {tag}
                            </span>
                          ))}
                          {person.tags.length > 3 && (
                            <span className="text-xs text-white/40 font-medium">+{person.tags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="p-4 text-center font-mono text-white/60 text-sm">{person.interaction_count || 0}</td>
                    <td className="p-4 text-center font-mono text-white/60 text-sm">{person.snapshot_count || 0}</td>
                    <td className="p-4 text-white/80 text-sm">{formatDate(person.last_seen_at)}</td>
                    <td className="p-4 text-white/80 text-sm">
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
