import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDuration, formatGender } from '../utils/formatting';
// Profile.css removed - fully migrated to Tailwind CSS

interface ProfilePageProps {}

type TabType = 'snapshot' | 'sessions' | 'profile' | 'interactions';

// Check if a session is currently live (observed within the last 30 minutes)
const isSessionLive = (session: any): boolean => {
  if (!session?.observed_at || !session?.current_show) return false;
  const observedAt = new Date(session.observed_at);
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return observedAt > thirtyMinutesAgo;
};

// Get the best available image URL
// - If live: use Chaturbate's real-time thumbnail
// - If offline: use our locally cached image
const getSessionImageUrl = (session: any, isLive: boolean): string | null => {
  if (!session) return null;

  if (isLive) {
    // When live, prefer real-time Chaturbate image
    return session.image_url_360x270 || session.image_path_360x270
      ? `http://localhost:3000/images/${session.image_path_360x270}`
      : null;
  }

  // When offline, prefer local cached image
  if (session.image_path_360x270) {
    return `http://localhost:3000/images/${session.image_path_360x270}`;
  }
  // Fall back to external URL if no local cache
  return session.image_url_360x270 || null;
};

const Profile: React.FC<ProfilePageProps> = () => {
  const { username: urlUsername } = useParams<{ username: string }>();
  const navigate = useNavigate();

  const [username, setUsername] = useState(urlUsername || '');
  const [lookupCollapsed, setLookupCollapsed] = useState(!!urlUsername);
  const [activeTab, setActiveTab] = useState<TabType>('snapshot');
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [showRawData, setShowRawData] = useState(false);

  // Auto-load profile if username in URL
  useEffect(() => {
    if (urlUsername) {
      setUsername(urlUsername);
      setLoading(true);
      setError(null);

      fetch(`/api/profile/${urlUsername}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch profile');
          }
          return response.json();
        })
        .then(data => {
          setProfileData(data);
          setLookupCollapsed(true);
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setProfileData(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [urlUsername]);

  // Username autocomplete suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (username.length >= 2) {
        try {
          const suggestions = await api.searchUsernames(username);
          setUsernameSuggestions(suggestions);
        } catch (err) {
          console.error('Failed to fetch username suggestions', err);
          setUsernameSuggestions([]);
        }
      } else {
        setUsernameSuggestions([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [username]);

  const handleLookup = async (lookupUsername?: string) => {
    const usernameToLookup = lookupUsername || username;
    if (!usernameToLookup) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch enriched profile data
      const response = await fetch(`/api/profile/${usernameToLookup}`);
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }
      const data = await response.json();
      setProfileData(data);
      setLookupCollapsed(true);

      // Update URL without reloading
      if (!urlUsername || urlUsername !== usernameToLookup) {
        navigate(`/profile/${usernameToLookup}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setProfileData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLookup();
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-5">
      <h1 className="text-mhc-primary text-4xl font-bold mb-8 py-4 border-b-2 border-mhc-primary">Profile Viewer</h1>

      {/* Lookup Section */}
      <div className="bg-mhc-surface rounded-lg shadow-lg mb-5">
        <div
          className="px-5 py-4 border-b border-gray-700 flex justify-between items-center cursor-pointer hover:bg-mhc-surface-light transition-colors"
          onClick={() => setLookupCollapsed(!lookupCollapsed)}
        >
          <h2 className="m-0 text-xl font-semibold text-mhc-text">Lookup User {lookupCollapsed ? '▼' : '▲'}</h2>
        </div>

        {!lookupCollapsed && (
          <div className="p-5">
            <div className="flex gap-3">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\//g, ''))}
                onKeyPress={handleKeyPress}
                placeholder="Enter username..."
                disabled={loading}
                list="profile-username-suggestions"
                autoComplete="off"
                className="flex-1 px-4 py-2.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-base focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20 disabled:opacity-50"
              />
              <datalist id="profile-username-suggestions">
                {usernameSuggestions.map((suggestion, idx) => (
                  <option key={idx} value={suggestion} />
                ))}
              </datalist>
              <button
                onClick={() => handleLookup()}
                disabled={loading}
                className="px-6 py-2.5 bg-gradient-primary text-white border-none rounded-md text-base font-semibold cursor-pointer transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Lookup'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/20 border-l-4 border-red-500 text-red-300 px-4 py-3 rounded-md mb-5">
          <strong className="font-bold mr-1">Error:</strong> {error}
        </div>
      )}

      {/* Profile Content */}
      {profileData && (
        <div>
          {/* Profile Header */}
          <div className="bg-gradient-primary text-white rounded-lg p-8 mb-5 shadow-lg">
            <div className="flex gap-5 items-center flex-wrap md:flex-nowrap">
              {(getSessionImageUrl(profileData.latestSession, isSessionLive(profileData.latestSession)) || (profileData.profile?.photos && profileData.profile.photos.length > 0)) && (
                <div className="flex-shrink-0 flex flex-col items-center gap-3">
                  {isSessionLive(profileData.latestSession) && (
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-5 py-2 rounded-full font-bold text-sm uppercase tracking-wider shadow-lg animate-pulse border-2 border-white/50">
                      ● LIVE
                    </div>
                  )}
                  <img
                    src={getSessionImageUrl(profileData.latestSession, isSessionLive(profileData.latestSession)) || (profileData.profile.photos.find((p: any) => p.isPrimary)?.url || profileData.profile.photos[0]?.url)}
                    alt={profileData.person.username}
                    className="w-[200px] h-[150px] rounded-lg object-cover border-4 border-white/30 shadow-lg"
                    width="360"
                    height="270"
                  />
                </div>
              )}

              <div className="flex-1">
                <div className="mb-2">
                  <span className="inline-block px-3 py-1 rounded-full text-sm font-semibold bg-white/20">{profileData.person.role}</span>
                  {profileData.latestSession?.is_hd && (
                    <span className="text-xl ml-2 inline-block align-middle" title="HD Stream">🎥</span>
                  )}
                </div>
                <h2 className="m-0 mb-4 text-3xl font-bold">
                  <a
                    href={`https://chaturbate.com/${profileData.person.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white no-underline hover:underline"
                  >
                    {profileData.person.username}
                  </a>
                </h2>
                <div className="flex gap-2.5 flex-wrap">
                  {/* Broadcasting Status */}
                  {isSessionLive(profileData.latestSession) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/30 border border-emerald-500/50 animate-pulse">
                      ● LIVE
                    </span>
                  )}
                  {!isSessionLive(profileData.latestSession) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-500/30 border border-gray-500/50 text-white/80">
                      ○ OFFLINE
                    </span>
                  )}

                  {/* Gender */}
                  {(profileData.profile?.gender || profileData.latestSession?.gender || profileData.latestSnapshot?.normalized_metrics?.gender) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      {formatGender(profileData.profile?.gender || profileData.latestSession?.gender || profileData.latestSnapshot?.normalized_metrics?.gender)}
                    </span>
                  )}

                  {/* Age */}
                  {(profileData.profile?.age || profileData.latestSession?.age) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      {profileData.profile?.age || profileData.latestSession?.age} years
                    </span>
                  )}

                  {/* Location */}
                  {(profileData.profile?.location || profileData.latestSession?.location) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      📍 {profileData.profile?.location || profileData.latestSession?.location}
                    </span>
                  )}

                  {/* Viewers (if live or recent) */}
                  {profileData.latestSession?.num_users !== undefined && profileData.latestSession?.num_users !== null && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      👁 {profileData.latestSession.num_users.toLocaleString()} viewers
                    </span>
                  )}

                  {/* Followers */}
                  {(profileData.latestSession?.num_followers || profileData.latestSnapshot?.normalized_metrics?.followers) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      ❤️ {(profileData.latestSession?.num_followers || profileData.latestSnapshot?.normalized_metrics?.followers || 0).toLocaleString()} followers
                    </span>
                  )}

                  {/* Rank */}
                  {profileData.latestSnapshot?.normalized_metrics?.rank && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      Rank #{Math.round(profileData.latestSnapshot.normalized_metrics.rank).toLocaleString()}
                    </span>
                  )}

                  {/* Show Start Time (if live) or Last Seen (if offline) */}
                  {isSessionLive(profileData.latestSession) ? (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      Live since: {new Date(profileData.latestSession.session_start).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' })} ET
                    </span>
                  ) : (
                    (profileData.latestSession?.observed_at || profileData.profile?.last_seen_online) && (
                      <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                        Last Seen: {new Date(
                          profileData.latestSession?.observed_at || profileData.profile.last_seen_online
                        ).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' })} ET
                      </span>
                    )
                  )}
                </div>

                {/* Room Subject */}
                {profileData.latestSession?.room_subject && (
                  <div className="mt-4 px-4 py-3 bg-white/15 rounded-lg italic text-base leading-relaxed border-l-4 border-white/40">
                    {profileData.latestSession.room_subject}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-mhc-surface rounded-t-lg pt-2.5 px-2.5 shadow-lg flex-wrap">
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'snapshot'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('snapshot')}
            >
              Latest Snapshot
            </button>
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'sessions'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('sessions')}
            >
              Broadcast Sessions
            </button>
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'profile'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('profile')}
            >
              Profile Details
            </button>
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'interactions'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('interactions')}
            >
              Recent Interactions
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-mhc-surface rounded-b-lg shadow-lg p-8 min-h-[400px]">
            {activeTab === 'snapshot' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Latest Snapshot</h3>
                {(profileData.latestSession || profileData.latestSnapshot) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Broadcast Session Data (Affiliate API) */}
                    {profileData.latestSession && (
                      <>
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Last Observed:</span>
                          <span className="block text-mhc-text text-base">{new Date(profileData.latestSession.observed_at).toLocaleString()}</span>
                        </div>
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Current Show:</span>
                          <span className="block text-mhc-text text-base">{profileData.latestSession.current_show || 'N/A'}</span>
                        </div>
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary col-span-1 md:col-span-2 lg:col-span-3">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Room Subject:</span>
                          <span className="block text-mhc-text text-base">{profileData.latestSession.room_subject || 'N/A'}</span>
                        </div>
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Viewers:</span>
                          <span className="block text-mhc-text text-base">{(profileData.latestSession.num_users || 0).toLocaleString()}</span>
                        </div>
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Followers:</span>
                          <span className="block text-mhc-text text-base">{(profileData.latestSession.num_followers || 0).toLocaleString()}</span>
                        </div>
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">HD Stream:</span>
                          <span className="block text-mhc-text text-base">{profileData.latestSession.is_hd ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Online Duration:</span>
                          <span className="block text-mhc-text text-base">{formatDuration(Math.floor(profileData.latestSession.seconds_online / 60))}</span>
                        </div>
                        {profileData.latestSession.tags && profileData.latestSession.tags.length > 0 && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary col-span-1 md:col-span-2 lg:col-span-3">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-2">Tags:</span>
                            <div className="flex flex-wrap gap-2">
                              {profileData.latestSession.tags.map((tag: string, idx: number) => (
                                <span key={idx} className="px-3 py-1 bg-mhc-primary text-white rounded-full text-sm">{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Profile Tags (from scraped data if no session tags) */}
                    {(!profileData.latestSession || !profileData.latestSession.tags || profileData.latestSession.tags.length === 0) &&
                     profileData.profile?.tags && profileData.profile.tags.length > 0 && (
                      <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary col-span-1 md:col-span-2 lg:col-span-3">
                        <span className="block font-semibold text-mhc-text-muted text-sm mb-2">Tags:</span>
                        <div className="flex flex-wrap gap-2">
                          {profileData.profile.tags.map((tag: string, idx: number) => (
                            <span key={idx} className="px-3 py-1 bg-mhc-primary text-white rounded-full text-sm">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Statbate Snapshot Data - Additional Metrics */}
                    {profileData.latestSnapshot?.normalized_metrics && (
                      <>
                        {profileData.latestSnapshot.normalized_metrics.income_usd !== undefined && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-emerald-500">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Income (USD):</span>
                            <span className="block text-emerald-400 text-base font-semibold">${profileData.latestSnapshot.normalized_metrics.income_usd.toLocaleString()}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot.normalized_metrics.income_tokens !== undefined && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-yellow-500">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Income (Tokens):</span>
                            <span className="block text-yellow-400 text-base font-semibold">{profileData.latestSnapshot.normalized_metrics.income_tokens.toLocaleString()}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot.normalized_metrics.session_count !== undefined && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Session Count:</span>
                            <span className="block text-mhc-text text-base">{profileData.latestSnapshot.normalized_metrics.session_count}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot.normalized_metrics.total_duration_minutes !== undefined && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Total Duration:</span>
                            <span className="block text-mhc-text text-base">{formatDuration(profileData.latestSnapshot.normalized_metrics.total_duration_minutes)}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot.normalized_metrics.average_duration_minutes !== undefined && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Avg Duration:</span>
                            <span className="block text-mhc-text text-base">{formatDuration(profileData.latestSnapshot.normalized_metrics.average_duration_minutes)}</span>
                          </div>
                        )}
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Data Source:</span>
                          <span className="block text-mhc-text text-base">{profileData.latestSnapshot.source}</span>
                        </div>
                        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Last Captured:</span>
                          <span className="block text-mhc-text text-base">{new Date(profileData.latestSnapshot.captured_at).toLocaleDateString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-mhc-text-muted">No recent snapshot data available.</p>
                )}
              </div>
            )}

            {activeTab === 'sessions' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Broadcast Sessions</h3>
                {profileData.sessionStats ? (
                  <div className="flex flex-col gap-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{profileData.sessionStats.totalSessions.toLocaleString()}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Total Sessions</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{Math.round(profileData.sessionStats.avgViewersPerSession || 0).toLocaleString()}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Avg Viewers</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{(profileData.sessionStats.peakViewers || 0).toLocaleString()}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Max Viewers</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{Math.round(profileData.sessionStats.avgFollowersGained || 0).toLocaleString()}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Avg Followers Gained</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{formatDuration(profileData.sessionStats.totalMinutesOnline || 0)}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Total Time Online</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">
                          {formatDuration(
                            profileData.sessionStats.totalSessions > 0
                              ? Math.round((profileData.sessionStats.totalMinutesOnline || 0) / profileData.sessionStats.totalSessions)
                              : 0
                          )}
                        </div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Avg Duration</div>
                      </div>
                    </div>

                    {profileData.sessions && profileData.sessions.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        <h4 className="mt-5 mb-4 text-mhc-text-muted text-xl font-semibold">Recent Sessions ({profileData.sessions.length})</h4>
                        {profileData.sessions.map((session: any) => (
                          <div key={session.id} className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                            <div className="flex justify-between items-center mb-3">
                              <span className="font-semibold text-mhc-text">{new Date(session.observed_at).toLocaleString()}</span>
                              <span className="text-mhc-text-muted text-sm">{formatDuration(Math.floor(session.seconds_online / 60))} online</span>
                            </div>
                            <div className="flex gap-4 mb-3 text-sm text-mhc-text-muted">
                              <span>👥 {session.num_users.toLocaleString()} viewers</span>
                              <span>❤️ {session.num_followers.toLocaleString()} followers</span>
                              {session.is_hd && <span>🎥 HD</span>}
                            </div>
                            {session.room_subject && (
                              <div className="p-3 bg-mhc-surface rounded-md italic text-mhc-text">{session.room_subject}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-mhc-text-muted">No session history available.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-mhc-text-muted">No session statistics available.</p>
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div>
                <h3 className="m-0 mb-4 text-mhc-text text-2xl font-semibold">Profile Details</h3>
                {profileData.profile ? (
                  <>
                    <div className="flex gap-8 flex-wrap lg:flex-nowrap">
                      {/* Left side - Profile details */}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {profileData.profile.display_name && (
                          <div className="p-4 bg-mhc-surface-light rounded-md">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Display Name:</span>
                            <span className="block text-mhc-text text-base">{profileData.profile.display_name}</span>
                          </div>
                        )}
                        {profileData.profile.age && (
                          <div className="p-4 bg-mhc-surface-light rounded-md">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Age:</span>
                            <span className="block text-mhc-text text-base">{profileData.profile.age}</span>
                          </div>
                        )}
                        {profileData.profile.gender && (
                          <div className="p-4 bg-mhc-surface-light rounded-md">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Gender:</span>
                            <span className="block text-mhc-text text-base">{formatGender(profileData.profile.gender)}</span>
                          </div>
                        )}
                        {profileData.profile.location && (
                          <div className="p-4 bg-mhc-surface-light rounded-md">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Location:</span>
                            <span className="block text-mhc-text text-base">{profileData.profile.location}</span>
                          </div>
                        )}
                        {profileData.profile.spoken_languages && (
                          <div className="p-4 bg-mhc-surface-light rounded-md">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Languages:</span>
                            <span className="block text-mhc-text text-base">{profileData.profile.spoken_languages}</span>
                          </div>
                        )}
                        {profileData.profile.country && (
                          <div className="p-4 bg-mhc-surface-light rounded-md">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Country:</span>
                            <span className="block text-mhc-text text-base">{profileData.profile.country}</span>
                          </div>
                        )}
                        {profileData.profile.is_new !== null && (
                          <div className="p-4 bg-mhc-surface-light rounded-md">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">New Model:</span>
                            <span className="block text-mhc-text text-base">{profileData.profile.is_new ? 'Yes' : 'No'}</span>
                          </div>
                        )}
                        {profileData.profile.bio && (
                          <div className="p-4 bg-mhc-surface-light rounded-md col-span-1 md:col-span-2">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Bio:</span>
                            <p className="mt-2 mb-0 leading-relaxed text-mhc-text">{profileData.profile.bio}</p>
                          </div>
                        )}
                      </div>

                      {/* Right side - Profile image */}
                      {profileData.profile.photos && profileData.profile.photos.length > 0 && (
                        <div className="flex-shrink-0">
                          <img
                            src={profileData.profile.photos.find((p: any) => p.isPrimary)?.url || profileData.profile.photos[0]?.url}
                            alt={profileData.person.username}
                            className="max-w-[400px] h-auto rounded-lg"
                          />
                        </div>
                      )}
                    </div>

                    {/* Raw Data Toggle Button */}
                    <div className="mt-8 flex justify-center">
                      <button
                        onClick={() => setShowRawData(!showRawData)}
                        className="px-8 py-3 bg-gray-600 text-white border-none rounded-md text-base font-semibold cursor-pointer transition-all hover:bg-gray-500"
                      >
                        {showRawData ? 'Hide Raw Data' : 'Show Raw Data'}
                      </button>
                    </div>

                    {/* Raw Data Display */}
                    {showRawData && (
                      <div className="mt-8">
                        <h4 className="text-mhc-text-muted text-xl font-semibold mb-4">Raw Profile Data</h4>
                        <pre className="bg-black text-emerald-400 p-4 rounded-md overflow-auto text-sm leading-relaxed min-h-[600px] whitespace-pre-wrap break-words border border-gray-700">
                          {JSON.stringify(profileData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-mhc-text-muted">No profile details available.</p>
                )}
              </div>
            )}

            {activeTab === 'interactions' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Recent Interactions</h3>
                {profileData.interactions && profileData.interactions.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {profileData.interactions.map((interaction: any) => (
                      <div key={interaction.id} className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-semibold text-mhc-primary text-sm uppercase">{interaction.type}</span>
                          <span className="text-mhc-text-muted text-sm">{new Date(interaction.timestamp).toLocaleString()}</span>
                        </div>
                        {interaction.content && (
                          <div className="p-3 bg-mhc-surface rounded-md text-mhc-text leading-relaxed">{interaction.content}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-mhc-text-muted">No recent interactions found.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
