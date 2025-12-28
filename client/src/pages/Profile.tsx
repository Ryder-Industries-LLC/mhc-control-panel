import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { formatDuration, formatGender } from '../utils/formatting';
// Profile.css removed - fully migrated to Tailwind CSS

interface ProfilePageProps {}

type TabType = 'snapshot' | 'sessions' | 'profile' | 'interactions' | 'images';

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

interface ImageHistoryItem {
  image_url: string;
  observed_at: string;
  session_start: string;
  current_show: string;
  num_users: number;
  room_subject: string;
}

const Profile: React.FC<ProfilePageProps> = () => {
  const { username: urlUsername } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Parse tab from query params
  const queryParams = new URLSearchParams(location.search);
  const tabFromUrl = queryParams.get('tab') as TabType | null;

  const [username, setUsername] = useState(urlUsername || '');
  const [lookupCollapsed, setLookupCollapsed] = useState(!!urlUsername);
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl || 'snapshot');
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [showRawData, setShowRawData] = useState(false);

  // Image history state
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Notes and status state
  const [notes, setNotes] = useState('');
  const [streamSummary, setStreamSummary] = useState('');
  const [bannedMe, setBannedMe] = useState(false);
  const [activeSub, setActiveSub] = useState(false);
  const [firstServiceDate, setFirstServiceDate] = useState('');
  const [lastServiceDate, setLastServiceDate] = useState('');
  const [friendTier, setFriendTier] = useState<number | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);

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

  // Sync notes and status state from profile data
  useEffect(() => {
    if (profileData?.profile) {
      setNotes(profileData.profile.notes || '');
      setStreamSummary(profileData.profile.stream_summary || '');
      setBannedMe(profileData.profile.banned_me || false);
      setActiveSub(profileData.profile.active_sub || false);
      setFirstServiceDate(profileData.profile.first_service_date ? profileData.profile.first_service_date.split('T')[0] : '');
      setLastServiceDate(profileData.profile.last_service_date ? profileData.profile.last_service_date.split('T')[0] : '');
      setFriendTier(profileData.profile.friend_tier || null);
    }
  }, [profileData?.profile]);

  // Fetch image history when profile loads
  useEffect(() => {
    if (profileData?.person?.id) {
      fetch(`http://localhost:3000/api/person/${profileData.person.id}/images?limit=10`)
        .then(response => response.json())
        .then(data => {
          setImageHistory(data.images || []);
          setCurrentImageIndex(0);
        })
        .catch(err => {
          console.error('Failed to fetch image history', err);
          setImageHistory([]);
        });
    }
  }, [profileData?.person?.id]);

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

  const handleSaveNotes = async () => {
    if (!profileData?.person?.username) return;

    setNotesSaving(true);
    setNotesMessage(null);

    try {
      const response = await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          stream_summary: streamSummary,
          banned_me: bannedMe,
          active_sub: activeSub,
          first_service_date: firstServiceDate || null,
          last_service_date: lastServiceDate || null,
          friend_tier: friendTier,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      setNotesMessage('Saved!');
      setTimeout(() => setNotesMessage(null), 3000);
    } catch (err) {
      setNotesMessage('Error saving');
      setTimeout(() => setNotesMessage(null), 3000);
    } finally {
      setNotesSaving(false);
    }
  };

  const handleBannedToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !bannedMe;
    setBannedMe(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned_me: newValue }),
      });
    } catch (err) {
      // Revert on error
      setBannedMe(!newValue);
    }
  };

  const handleActiveSubToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !activeSub;
    const today = new Date().toISOString().split('T')[0];

    // Auto-fill dates based on toggle
    let newFirstServiceDate = firstServiceDate;
    let newLastServiceDate = lastServiceDate;

    if (newValue && !firstServiceDate) {
      // Checking Active Sub: auto-fill first_service_date if empty
      newFirstServiceDate = today;
      setFirstServiceDate(today);
    } else if (!newValue && !lastServiceDate) {
      // Unchecking Active Sub: auto-fill last_service_date if empty
      newLastServiceDate = today;
      setLastServiceDate(today);
    }

    setActiveSub(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_sub: newValue,
          first_service_date: newFirstServiceDate || null,
          last_service_date: newLastServiceDate || null,
        }),
      });
    } catch (err) {
      // Revert on error
      setActiveSub(!newValue);
      setFirstServiceDate(firstServiceDate);
      setLastServiceDate(lastServiceDate);
    }
  };

  const handleFriendTierChange = async (newTier: number | null) => {
    if (!profileData?.person?.username) return;

    const oldTier = friendTier;
    setFriendTier(newTier);

    try {
      await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_tier: newTier }),
      });
    } catch (err) {
      // Revert on error
      setFriendTier(oldTier);
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
              {(imageHistory.length > 0 || getSessionImageUrl(profileData.latestSession, isSessionLive(profileData.latestSession)) || (profileData.profile?.photos && profileData.profile.photos.length > 0)) && (
                <div className="flex-shrink-0 flex flex-col items-center gap-3">
                  {isSessionLive(profileData.latestSession) && (
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-5 py-2 rounded-full font-bold text-sm uppercase tracking-wider shadow-lg animate-pulse border-2 border-white/50">
                      ● LIVE
                    </div>
                  )}
                  {/* Image with navigation arrows */}
                  <div className="relative group">
                    <img
                      src={
                        imageHistory.length > 0
                          ? `http://localhost:3000/images/${imageHistory[currentImageIndex]?.image_url}`
                          : getSessionImageUrl(profileData.latestSession, isSessionLive(profileData.latestSession)) || (profileData.profile.photos.find((p: any) => p.isPrimary)?.url || profileData.profile.photos[0]?.url)
                      }
                      alt={profileData.person.username}
                      className="w-[200px] h-[150px] rounded-lg object-cover border-4 border-white/30 shadow-lg"
                      width="360"
                      height="270"
                    />
                    {/* Navigation arrows - only show if multiple images */}
                    {imageHistory.length > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : imageHistory.length - 1))}
                          className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Previous image"
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => setCurrentImageIndex(prev => (prev < imageHistory.length - 1 ? prev + 1 : 0))}
                          className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Next image"
                        >
                          ›
                        </button>
                        {/* Image counter */}
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          {currentImageIndex + 1} / {imageHistory.length}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Image timestamp */}
                  {imageHistory.length > 0 && imageHistory[currentImageIndex] && (
                    <div className="text-xs text-white/70 text-center">
                      {new Date(imageHistory[currentImageIndex].observed_at).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <span className="inline-block px-3 py-1 rounded-full text-sm font-semibold bg-white/20">{profileData.person.role}</span>
                  {profileData.profile?.following && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/30 border border-emerald-500/50" title="You follow this user">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                      </svg>
                      Following
                    </span>
                  )}
                  {profileData.profile?.follower && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-blue-500/30 border border-blue-500/50" title="Follows you">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                      </svg>
                      Follows You
                    </span>
                  )}
                  {profileData.latestSession?.is_hd && (
                    <span className="text-xl ml-2 inline-block align-middle" title="HD Stream">🎥</span>
                  )}
                  {activeSub && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/30 border border-emerald-500/50" title="Active Subscriber">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                      Active Sub
                    </span>
                  )}
                  {bannedMe && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-500/30 border border-red-500/50" title="This user has banned you">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                      </svg>
                      Banned Me
                    </span>
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

          {/* Notes & Status Section */}
          <div className="bg-mhc-surface rounded-lg shadow-lg mb-5 p-5">
            <div className="flex flex-col gap-4">
              {/* Row 1: Active Sub and Service Dates */}
              <div className="flex flex-wrap items-center gap-6">
                {/* Active Sub Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeSub}
                    onChange={handleActiveSubToggle}
                    className="w-5 h-5 rounded border-2 border-emerald-500/50 bg-mhc-surface-light text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-mhc-text font-medium">Active Sub</span>
                </label>

                {/* First Service Date */}
                <div className="flex items-center gap-2">
                  <label className="text-mhc-text font-medium whitespace-nowrap">First Service:</label>
                  <input
                    type="date"
                    value={firstServiceDate}
                    onChange={(e) => setFirstServiceDate(e.target.value)}
                    className="px-3 py-1.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-sm focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                </div>

                {/* Last Service Date */}
                <div className="flex items-center gap-2">
                  <label className="text-mhc-text font-medium whitespace-nowrap">Last Service:</label>
                  <input
                    type="date"
                    value={lastServiceDate}
                    onChange={(e) => setLastServiceDate(e.target.value)}
                    className="px-3 py-1.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-sm focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                </div>
              </div>

              {/* Row 2: Friend Tier and Banned Me */}
              <div className="flex flex-wrap items-center gap-6">
                {/* Friend Tier Dropdown */}
                <div className="flex items-center gap-2">
                  <label className="text-mhc-text font-medium whitespace-nowrap">Friend Tier:</label>
                  <select
                    value={friendTier || ''}
                    onChange={(e) => handleFriendTierChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                    className="px-3 py-1.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-sm focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20 min-w-[150px]"
                  >
                    <option value="">None</option>
                    <option value="1">Tier 1 - Special</option>
                    <option value="2">Tier 2 - Tipper</option>
                    <option value="3">Tier 3 - Regular</option>
                    <option value="4">Tier 4 - Drive-by</option>
                  </select>
                </div>

                {/* Banned Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bannedMe}
                    onChange={handleBannedToggle}
                    className="w-5 h-5 rounded border-2 border-red-500/50 bg-mhc-surface-light text-red-500 focus:ring-red-500 cursor-pointer"
                  />
                  <span className="text-mhc-text font-medium">Banned Me</span>
                </label>
              </div>

              {/* Row 3: Stream Summary */}
              <div className="flex-1">
                <label className="block text-mhc-text-muted text-sm font-semibold mb-2">Stream Summary</label>
                <textarea
                  value={streamSummary}
                  onChange={(e) => setStreamSummary(e.target.value)}
                  placeholder="Post-broadcast notes and summary..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-base resize-y focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                />
              </div>

              {/* Row 4: Notes and Save Button */}
              <div className="flex-1">
                <label className="block text-mhc-text-muted text-sm font-semibold mb-2">Notes</label>
                <div className="flex gap-3">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add personal notes about this user..."
                    rows={2}
                    className="flex-1 px-4 py-2.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-base resize-y focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <button
                    onClick={handleSaveNotes}
                    disabled={notesSaving}
                    className="px-5 py-2 bg-mhc-primary text-white border-none rounded-md text-sm font-semibold cursor-pointer transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed self-start"
                  >
                    {notesSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
                {notesMessage && (
                  <span className={`text-sm mt-1 block ${notesMessage === 'Saved!' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {notesMessage}
                  </span>
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
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'images'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('images')}
            >
              Images {imageHistory.length > 0 && `(${imageHistory.length})`}
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

            {activeTab === 'images' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Image History</h3>
                {imageHistory.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {imageHistory.map((image, index) => (
                      <div
                        key={image.image_url}
                        className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer hover:border-mhc-primary hover:-translate-y-1 hover:shadow-lg ${
                          currentImageIndex === index ? 'border-mhc-primary ring-2 ring-mhc-primary/50' : 'border-white/10'
                        }`}
                        onClick={() => setCurrentImageIndex(index)}
                      >
                        <div className="aspect-[4/3]">
                          <img
                            src={`http://localhost:3000/images/${image.image_url}`}
                            alt={`${profileData.person.username} - ${new Date(image.observed_at).toLocaleDateString()}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        {/* Overlay with info */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-2 text-white text-xs">
                            <div className="font-semibold">
                              {new Date(image.observed_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </div>
                            <div className="text-white/70">
                              {new Date(image.observed_at).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </div>
                            {image.num_users > 0 && (
                              <div className="text-white/70 mt-1">
                                {image.num_users.toLocaleString()} viewers
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Current indicator */}
                        {currentImageIndex === index && (
                          <div className="absolute top-1 right-1 bg-mhc-primary text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                            Current
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-mhc-text-muted">No images saved yet. Images are captured when the user broadcasts.</p>
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
