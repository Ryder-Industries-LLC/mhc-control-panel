import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, LookupResponse } from '../api/client';
import { formatDate, formatNumber } from '../utils/formatting';
import './Users.css';

interface PersonWithSource {
  id: string;
  username: string;
  platform: string;
  role: string;
  rid: number | null;
  did: number | null;
  first_seen_at: string;
  last_seen_at: string;
  source: string;
  interaction_count: number;
  snapshot_count: number;
  image_url: string | null;
  current_show: string | null;
  tags: string[] | null;
  age: number | null;
}

interface FollowingUser extends PersonWithSource {
  following_since: string | null;
}

interface FollowerUser extends PersonWithSource {
  follower_since: string | null;
}

interface UnfollowedUser extends PersonWithSource {
  follower_since: string | null;
  unfollower_at: string | null;
  days_followed: number | null;
}

interface PriorityLookup {
  id: string;
  username: string;
  priority_level: 1 | 2;
  status: 'pending' | 'completed' | 'active';
  created_at: string;
  completed_at: string | null;
  last_checked_at: string | null;
  notes: string | null;
}

interface FeedCacheStatus {
  exists: boolean;
  fresh: boolean;
  timestamp: string | null;
  ageMs: number | null;
  roomCount: number;
  totalCount: number;
}

type TabType = 'directory' | 'following' | 'followers' | 'unfollowed';

const Users: React.FC = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('directory');

  // Directory tab state
  const [persons, setPersons] = useState<PersonWithSource[]>([]);
  const [priorityLookups, setPriorityLookups] = useState<PriorityLookup[]>([]);
  const [cacheStatus, setCacheStatus] = useState<FeedCacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof PersonWithSource>('last_seen_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [priorityLevel, setPriorityLevel] = useState<1 | 2>(1);
  const [priorityNotes, setPriorityNotes] = useState('');
  const [lookupLoading, setLookupLoading] = useState<string | null>(null);

  // Lookup/Queue integration state
  const [lookupUsername, setLookupUsername] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  // Following tab state
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingStats, setFollowingStats] = useState<any>(null);

  // Followers tab state
  const [followerUsers, setFollowerUsers] = useState<FollowerUser[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followersStats, setFollowersStats] = useState<any>(null);
  const [followerRoleFilter, setFollowerRoleFilter] = useState<string>('ALL');

  // Unfollowed tab state
  const [unfollowedUsers, setUnfollowedUsers] = useState<UnfollowedUser[]>([]);
  const [unfollowedLoading, setUnfollowedLoading] = useState(false);
  const [timeframeFilter, setTimeframeFilter] = useState<number>(30); // days

  useEffect(() => {
    if (activeTab === 'directory') {
      loadData();
    } else if (activeTab === 'following') {
      loadFollowing();
    } else if (activeTab === 'followers') {
      loadFollowers();
    } else if (activeTab === 'unfollowed') {
      loadUnfollowed();
    }
  }, [activeTab]);

  // Handle username from URL query parameter (for lookup integration)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const usernameParam = params.get('username');
    if (usernameParam && lookupUsername !== usernameParam) {
      setLookupUsername(usernameParam);
      setActiveTab('directory');
    }
  }, [location.search]);

  // Autocomplete username search with debouncing
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (lookupUsername.length >= 2) {
        try {
          const suggestions = await api.searchUsernames(lookupUsername);
          setUsernameSuggestions(suggestions);
        } catch (err) {
          console.error('Failed to fetch username suggestions', err);
          setUsernameSuggestions([]);
        }
      } else {
        setUsernameSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [lookupUsername]);

  const loadData = async () => {
    await Promise.all([
      loadPersons(),
      loadPriorityLookups(),
      loadCacheStatus(),
    ]);
  };

  const loadPersons = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAllPersons(1000, 0);
      setPersons(data.persons);
    } catch (err) {
      setError('Failed to load persons');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadPriorityLookups = async () => {
    try {
      const lookups = await api.getPriorityLookups();
      setPriorityLookups(lookups);
    } catch (err) {
      console.error('Failed to load priority lookups', err);
    }
  };

  const loadCacheStatus = async () => {
    try {
      const status = await api.getFeedCacheStatus();
      setCacheStatus(status);
    } catch (err) {
      console.error('Failed to load cache status', err);
    }
  };

  const loadFollowing = async () => {
    try {
      setFollowingLoading(true);
      setError(null);
      // TODO: Implement API endpoint to get following users with following_since
      // For now, filter from persons
      const data = await api.getAllPersons(1000, 0);
      const following = data.persons.filter((p: any) => p.following === true);
      setFollowingUsers(following);
    } catch (err) {
      setError('Failed to load following users');
      console.error(err);
    } finally {
      setFollowingLoading(false);
    }
  };

  const loadFollowers = async () => {
    try {
      setFollowersLoading(true);
      setError(null);
      // TODO: Implement API endpoint to get followers with follower_since
      const data = await api.getAllPersons(1000, 0);
      const followers = data.persons.filter((p: any) => p.follower === true);
      setFollowerUsers(followers);
    } catch (err) {
      setError('Failed to load followers');
      console.error(err);
    } finally {
      setFollowersLoading(false);
    }
  };

  const loadUnfollowed = async () => {
    try {
      setUnfollowedLoading(true);
      setError(null);
      const response = await api.getUnfollowed();
      setUnfollowedUsers(response.unfollowed);
    } catch (err) {
      setError('Failed to load unfollowed users');
      console.error(err);
    } finally {
      setUnfollowedLoading(false);
    }
  };

  const handleLookup = async () => {
    if (!lookupUsername) {
      setError('Please enter a username');
      return;
    }

    // Check if user exists in directory
    const existingUser = persons.find(p => p.username.toLowerCase() === lookupUsername.toLowerCase());

    if (existingUser) {
      // User exists - trigger refresh
      handleOnDemandLookup(lookupUsername);
    } else {
      // User not found - show add to queue option
      setError(`User "${lookupUsername}" not found in database.`);
      setSelectedUsername(lookupUsername);
      setShowPriorityModal(true);
    }
  };

  const handleUpdateFollowing = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setFollowingLoading(true);
      const text = await file.text();
      const response = await fetch('http://localhost:3000/api/followers/update-following', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: text }),
      });
      const data = await response.json();
      setFollowingStats(data.stats);
      await loadFollowing();
      setError(null);
    } catch (err) {
      setError('Failed to update following list');
      console.error(err);
    } finally {
      setFollowingLoading(false);
    }
  };

  const handleUpdateFollowers = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setFollowersLoading(true);
      const text = await file.text();
      const response = await fetch('http://localhost:3000/api/followers/update-followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: text }),
      });
      const data = await response.json();
      setFollowersStats(data.stats);
      await loadFollowers();
      setError(null);
    } catch (err) {
      setError('Failed to update followers list');
      console.error(err);
    } finally {
      setFollowersLoading(false);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!window.confirm(`Are you sure you want to delete ${username}? This will remove all associated data.`)) {
      return;
    }

    try {
      await api.deletePerson(id);
      setPersons(persons.filter(p => p.id !== id));
    } catch (err) {
      setError(`Failed to delete ${username}`);
      console.error(err);
    }
  };

  const handleSort = (field: keyof PersonWithSource) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleAddToPriority = (username: string) => {
    setSelectedUsername(username);
    setShowPriorityModal(true);
  };

  const handleSubmitPriority = async () => {
    try {
      await api.addPriorityLookup(selectedUsername, priorityLevel, priorityNotes || undefined);
      await loadPriorityLookups();
      setShowPriorityModal(false);
      setSelectedUsername('');
      setPriorityNotes('');
      setPriorityLevel(1);
      setLookupUsername('');
      setError(null);
    } catch (err) {
      setError('Failed to add to priority queue');
      console.error(err);
    }
  };

  const handleRemoveFromPriority = async (username: string) => {
    if (!window.confirm(`Remove ${username} from priority queue?`)) {
      return;
    }

    try {
      await api.removePriorityLookup(username);
      await loadPriorityLookups();
    } catch (err) {
      setError('Failed to remove from priority queue');
      console.error(err);
    }
  };

  const handleOnDemandLookup = async (username: string) => {
    try {
      setLookupLoading(username);
      await api.affiliateLookup(username);
      await loadPersons();
      setError(null);
    } catch (err: any) {
      setError(`Lookup failed for ${username}: ${err.response?.data?.error || err.message}`);
    } finally {
      setLookupLoading(null);
    }
  };

  const getPriorityLookup = (username: string): PriorityLookup | undefined => {
    return priorityLookups.find(p => p.username.toLowerCase() === username.toLowerCase());
  };

  const filteredPersons = persons.filter(p => {
    if (roleFilter !== 'ALL' && p.role !== roleFilter) {
      return false;
    }
    if (searchQuery && !p.username.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (tagFilter) {
      if (!p.tags || p.tags.length === 0) return false;
      const hasTag = p.tags.some(tag => tag.toLowerCase().includes(tagFilter.toLowerCase()));
      if (!hasTag) return false;
    }
    return true;
  });

  const filteredFollowers = followerUsers.filter(p => {
    if (followerRoleFilter !== 'ALL' && p.role !== followerRoleFilter) {
      return false;
    }
    return true;
  });

  const filteredUnfollowed = unfollowedUsers.filter(u => {
    if (!u.unfollower_at) return false;
    const unfollowDate = new Date(u.unfollower_at);
    const daysAgo = (Date.now() - unfollowDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= timeframeFilter;
  });

  const sortedPersons = [...filteredPersons].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'MODEL':
        return 'role-badge role-model';
      case 'VIEWER':
        return 'role-badge role-viewer';
      default:
        return 'role-badge role-unknown';
    }
  };

  const getPriorityBadgeClass = (priority: PriorityLookup) => {
    const level = priority.priority_level === 1 ? 'p1' : 'p2';
    const status = priority.status;
    return `priority-badge priority-${level} priority-${status}`;
  };

  const formatCacheAge = (ageMs: number | null): string => {
    if (ageMs === null) return 'N/A';
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return `${seconds}s`;
    return `${minutes}m ${seconds % 60}s`;
  };

  const calculateDaysFollowed = (since: string | null, until: string | null): number | null => {
    if (!since || !until) return null;
    const start = new Date(since);
    const end = new Date(until);
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const renderDirectoryTab = () => (
    <>
      {/* Lookup/Search Section */}
      <div className="lookup-section">
        <div className="lookup-header">
          <h2>Lookup / Add User</h2>
        </div>
        <div className="lookup-controls">
          <div className="form-group">
            <input
              type="text"
              value={lookupUsername}
              onChange={(e) => setLookupUsername(e.target.value.replace(/\//g, ''))}
              placeholder="Enter username to lookup or add..."
              className="lookup-input"
              list="username-suggestions"
              autoComplete="off"
            />
            <datalist id="username-suggestions">
              {usernameSuggestions.map((suggestion, idx) => (
                <option key={idx} value={suggestion} />
              ))}
            </datalist>
          </div>
          <button onClick={handleLookup} className="btn-primary">
            Lookup / Queue
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="header-stats">
        <div className="stat-card">
          <div className="stat-value">{persons.length}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{priorityLookups.filter(p => p.status === 'active').length}</div>
          <div className="stat-label">Priority 2 (Active)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{priorityLookups.filter(p => p.status === 'pending').length}</div>
          <div className="stat-label">Priority 1 (Pending)</div>
        </div>
        {cacheStatus && (
          <div className={`stat-card ${cacheStatus.fresh ? 'stat-success' : 'stat-warning'}`}>
            <div className="stat-value">{cacheStatus.roomCount}</div>
            <div className="stat-label">
              Cached ({cacheStatus.fresh ? formatCacheAge(cacheStatus.ageMs) : 'Stale'})
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="filter-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search usernames..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="tag-search-box">
          <input
            type="text"
            placeholder="Filter by tag..."
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="search-input"
          />
          {tagFilter && (
            <button className="clear-tag-btn" onClick={() => setTagFilter('')}>
              ✕
            </button>
          )}
        </div>

        <div className="role-filters">
          <button
            className={roleFilter === 'ALL' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setRoleFilter('ALL')}
          >
            All ({persons.length})
          </button>
          <button
            className={roleFilter === 'MODEL' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setRoleFilter('MODEL')}
          >
            Models ({persons.filter(p => p.role === 'MODEL').length})
          </button>
          <button
            className={roleFilter === 'VIEWER' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setRoleFilter('VIEWER')}
          >
            Viewers ({persons.filter(p => p.role === 'VIEWER').length})
          </button>
        </div>
      </div>

      {/* Preset Tag Filters */}
      <div className="preset-tags">
        {['smoke', 'master', 'leather', 'bdsm', 'findom', 'dirty', 'fetish', 'daddy', 'alpha', 'dom', 'slave', 'bulge'].map(tag => (
          <button
            key={tag}
            className={tagFilter.toLowerCase() === tag ? 'tag-filter-btn active' : 'tag-filter-btn'}
            onClick={() => setTagFilter(tagFilter.toLowerCase() === tag ? '' : tag)}
          >
            #{tag}
          </button>
        ))}
      </div>

      {/* Directory Table */}
      <div className="users-content">
        <table className="users-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('username')} className="sortable username-column">
                Username {sortField === 'username' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="image-column">Image</th>
              <th onClick={() => handleSort('age')} className="sortable">
                Age {sortField === 'age' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="tags-column">Tags</th>
              <th>Priority</th>
              <th onClick={() => handleSort('interaction_count')} className="sortable">
                Events {sortField === 'interaction_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('snapshot_count')} className="sortable">
                Snapshots {sortField === 'snapshot_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('last_seen_at')} className="sortable">
                Last Seen {sortField === 'last_seen_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="actions-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPersons.map((person) => {
              const priority = getPriorityLookup(person.username);
              return (
                <tr key={person.id}>
                  <td className="username-cell">
                    <div className="username-with-role">
                      <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                      <Link to={`/profile/${person.username}`}>
                        {person.username}
                      </Link>
                    </div>
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
                        <div className="image-popup">
                          <img src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`} alt={person.username} />
                          {person.current_show && (
                            <div className="popup-live-badge">● LIVE</div>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td>{person.age || '—'}</td>
                  <td className="tags-cell">
                    {person.tags && person.tags.length > 0 ? (
                      <div className="tags-container">
                        {person.tags.slice(0, 5).map((tag, idx) => (
                          <span key={idx} className="tag-badge" onClick={() => setTagFilter(tag)}>
                            {tag}
                          </span>
                        ))}
                        {person.tags.length > 5 && (
                          <span className="tag-more">+{person.tags.length - 5}</span>
                        )}
                      </div>
                    ) : (
                      <span className="no-tags">—</span>
                    )}
                  </td>
                  <td>
                    {priority ? (
                      <div className="priority-cell">
                        <span className={getPriorityBadgeClass(priority)}>
                          P{priority.priority_level} - {priority.status.toUpperCase()}
                        </span>
                        <button
                          className="btn-remove-priority"
                          onClick={() => handleRemoveFromPriority(person.username)}
                          title="Remove from priority queue"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span className="no-priority">—</span>
                    )}
                  </td>
                  <td className="count-cell">{person.interaction_count}</td>
                  <td className="count-cell">{person.snapshot_count}</td>
                  <td>{formatDate(person.last_seen_at, { relative: true })}</td>
                  <td className="actions-cell">
                    <div className="action-buttons">
                      {!priority && (
                        <button
                          className="btn-action btn-priority"
                          onClick={() => handleAddToPriority(person.username)}
                          title="Add to priority queue"
                        >
                          ★
                        </button>
                      )}
                      <button
                        className="btn-action btn-lookup"
                        onClick={() => handleOnDemandLookup(person.username)}
                        disabled={lookupLoading === person.username}
                        title="On-demand lookup"
                      >
                        {lookupLoading === person.username ? '⟳' : '🔍'}
                      </button>
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDelete(person.id, person.username)}
                        title="Delete user"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedPersons.length === 0 && (
          <div className="empty-state">
            <p>No users found matching your filters.</p>
          </div>
        )}
      </div>
    </>
  );

  const renderFollowingTab = () => (
    <>
      <div className="tab-header">
        <h2>Following ({followingUsers.length})</h2>
        <div className="tab-actions">
          <label className="btn-primary file-upload-btn">
            {followingLoading ? 'Updating...' : 'Update Following List'}
            <input
              type="file"
              accept=".html,.htm"
              onChange={handleUpdateFollowing}
              style={{ display: 'none' }}
              disabled={followingLoading}
            />
          </label>
        </div>
      </div>

      {followingStats && (
        <div className="stats-banner">
          <div className="stat-item">New Follows: {followingStats.newFollows}</div>
          <div className="stat-item">Unfollowed: {followingStats.unfollows}</div>
          <div className="stat-item">Total: {followingStats.total}</div>
        </div>
      )}

      <div className="users-content">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Image</th>
              <th>Age</th>
              <th>Tags</th>
              <th>Following Since</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {followingUsers.map((person) => (
              <tr key={person.id}>
                <td className="username-cell">
                  <div className="username-with-role">
                    <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                    <Link to={`/profile/${person.username}`}>{person.username}</Link>
                  </div>
                </td>
                <td className="image-cell">
                  {person.image_url && (
                    <img
                      src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`}
                      alt={person.username}
                      className="user-image"
                    />
                  )}
                </td>
                <td>{person.age || '—'}</td>
                <td className="tags-cell">
                  {person.tags && person.tags.length > 0 ? (
                    <div className="tags-container">
                      {person.tags.slice(0, 5).map((tag, idx) => (
                        <span key={idx} className="tag-badge">{tag}</span>
                      ))}
                      {person.tags.length > 5 && <span className="tag-more">+{person.tags.length - 5}</span>}
                    </div>
                  ) : <span className="no-tags">—</span>}
                </td>
                <td>{person.following_since ? formatDate(person.following_since, { includeTime: false }) : '—'}</td>
                <td>{formatDate(person.last_seen_at, { relative: true })}</td>
                <td className="actions-cell">
                  <button
                    className="btn-action btn-lookup"
                    onClick={() => handleOnDemandLookup(person.username)}
                    title="Refresh data"
                  >
                    🔍
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {followingUsers.length === 0 && (
          <div className="empty-state">
            <p>No following users. Upload your following list to populate this tab.</p>
          </div>
        )}
      </div>
    </>
  );

  const renderFollowersTab = () => (
    <>
      <div className="tab-header">
        <h2>Followers ({followerUsers.length})</h2>
        <div className="tab-actions">
          <label className="btn-primary file-upload-btn">
            {followersLoading ? 'Updating...' : 'Update Followers List'}
            <input
              type="file"
              accept=".html,.htm"
              onChange={handleUpdateFollowers}
              style={{ display: 'none' }}
              disabled={followersLoading}
            />
          </label>
        </div>
      </div>

      {followersStats && (
        <div className="stats-banner">
          <div className="stat-item">New Followers: {followersStats.newFollowers}</div>
          <div className="stat-item">Unfollowers: {followersStats.unfollowers}</div>
          <div className="stat-item">Total: {followersStats.total}</div>
        </div>
      )}

      <div className="filter-controls">
        <div className="role-filters">
          <button
            className={followerRoleFilter === 'ALL' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFollowerRoleFilter('ALL')}
          >
            All ({followerUsers.length})
          </button>
          <button
            className={followerRoleFilter === 'MODEL' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFollowerRoleFilter('MODEL')}
          >
            Models ({followerUsers.filter(p => p.role === 'MODEL').length})
          </button>
          <button
            className={followerRoleFilter === 'VIEWER' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFollowerRoleFilter('VIEWER')}
          >
            Viewers ({followerUsers.filter(p => p.role === 'VIEWER').length})
          </button>
        </div>
      </div>

      <div className="users-content">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Image</th>
              <th>Age</th>
              <th>Follower Since</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFollowers.map((person) => (
              <tr key={person.id}>
                <td className="username-cell">
                  <div className="username-with-role">
                    <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                    <Link to={`/profile/${person.username}`}>{person.username}</Link>
                  </div>
                </td>
                <td className="image-cell">
                  {person.image_url && (
                    <img
                      src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`}
                      alt={person.username}
                      className="user-image"
                    />
                  )}
                </td>
                <td>{person.age || '—'}</td>
                <td>{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '—'}</td>
                <td>{formatDate(person.last_seen_at, { relative: true })}</td>
                <td className="actions-cell">
                  <button
                    className="btn-action btn-lookup"
                    onClick={() => handleOnDemandLookup(person.username)}
                    title="Refresh data"
                  >
                    🔍
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredFollowers.length === 0 && (
          <div className="empty-state">
            <p>No followers found. Upload your followers list to populate this tab.</p>
          </div>
        )}
      </div>
    </>
  );

  const renderUnfollowedTab = () => {
    const totalUnfollows = filteredUnfollowed.length;
    const avgDuration = totalUnfollows > 0
      ? filteredUnfollowed.reduce((sum, u) => sum + (u.days_followed || 0), 0) / totalUnfollows
      : 0;

    return (
      <>
        <div className="tab-header">
          <h2>Unfollowed ({totalUnfollows})</h2>
          <div className="timeframe-filters">
            <button
              className={timeframeFilter === 7 ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setTimeframeFilter(7)}
            >
              Last 7 Days
            </button>
            <button
              className={timeframeFilter === 30 ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setTimeframeFilter(30)}
            >
              Last 30 Days
            </button>
            <button
              className={timeframeFilter === 90 ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setTimeframeFilter(90)}
            >
              Last 90 Days
            </button>
          </div>
        </div>

        {totalUnfollows > 0 && (
          <div className="insights-banner">
            <div className="insight-item">
              <div className="insight-value">{totalUnfollows}</div>
              <div className="insight-label">Total Unfollows</div>
            </div>
            <div className="insight-item">
              <div className="insight-value">{avgDuration.toFixed(1)}</div>
              <div className="insight-label">Avg Days Followed</div>
            </div>
          </div>
        )}

        <div className="users-content">
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Image</th>
                <th>Age</th>
                <th>Followed On</th>
                <th>Unfollowed On</th>
                <th>Days Followed</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnfollowed.map((person) => (
                <tr key={person.id}>
                  <td className="username-cell">
                    <div className="username-with-role">
                      <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                      <Link to={`/profile/${person.username}`}>{person.username}</Link>
                    </div>
                  </td>
                  <td className="image-cell">
                    {person.image_url && (
                      <img
                        src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`}
                        alt={person.username}
                        className="user-image"
                      />
                    )}
                  </td>
                  <td>{person.age || '—'}</td>
                  <td>{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '—'}</td>
                  <td>{person.unfollower_at ? formatDate(person.unfollower_at, { includeTime: false }) : '—'}</td>
                  <td>{person.days_followed !== null ? `${person.days_followed} days` : '—'}</td>
                  <td>{formatDate(person.last_seen_at, { relative: true })}</td>
                  <td className="actions-cell">
                    <button
                      className="btn-action btn-lookup"
                      onClick={() => handleOnDemandLookup(person.username)}
                      title="Refresh data"
                    >
                      🔍
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUnfollowed.length === 0 && (
            <div className="empty-state">
              <p>No unfollowed users in the selected timeframe.</p>
            </div>
          )}
        </div>
      </>
    );
  };

  if (loading && activeTab === 'directory') {
    return (
      <div className="users">
        <div className="users-header">
          <h1>Users</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users">
      {/* Header */}
      <div className="users-header">
        <div className="header-main">
          <h1>Users</h1>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* Tabs */}
        <div className="tabs">
          <button
            className={activeTab === 'directory' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('directory')}
          >
            Directory
          </button>
          <button
            className={activeTab === 'following' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('following')}
          >
            Following
          </button>
          <button
            className={activeTab === 'followers' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('followers')}
          >
            Followers
          </button>
          <button
            className={activeTab === 'unfollowed' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('unfollowed')}
          >
            Unfollowed
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'directory' && renderDirectoryTab()}
      {activeTab === 'following' && renderFollowingTab()}
      {activeTab === 'followers' && renderFollowersTab()}
      {activeTab === 'unfollowed' && renderUnfollowedTab()}

      {/* Add to Priority Modal */}
      {showPriorityModal && (
        <div className="modal-overlay" onClick={() => setShowPriorityModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add to Priority Queue</h2>
            <div className="modal-body">
              <div className="form-field">
                <label>Username:</label>
                <input type="text" value={selectedUsername} disabled className="input-disabled" />
              </div>

              <div className="form-field">
                <label>Priority Level:</label>
                <div className="priority-options">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="priority"
                      checked={priorityLevel === 1}
                      onChange={() => setPriorityLevel(1)}
                    />
                    <span>Priority 1 - Initial Population</span>
                    <p className="help-text">Fetched once, then marked complete</p>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="priority"
                      checked={priorityLevel === 2}
                      onChange={() => setPriorityLevel(2)}
                    />
                    <span>Priority 2 - Frequent Tracking</span>
                    <p className="help-text">Checked on every poll cycle</p>
                  </label>
                </div>
              </div>

              <div className="form-field">
                <label>Notes (optional):</label>
                <textarea
                  value={priorityNotes}
                  onChange={(e) => setPriorityNotes(e.target.value)}
                  placeholder="Add notes about this user..."
                  className="textarea"
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowPriorityModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSubmitPriority}>
                Add to Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
