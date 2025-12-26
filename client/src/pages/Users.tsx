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
  session_observed_at: string | null;
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
type StatFilter = 'all' | 'live' | 'priority2' | 'priority1' | 'with_image' | 'models' | 'viewers';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// Check if a session is currently live (observed within the last 30 minutes)
const isPersonLive = (person: PersonWithSource): boolean => {
  if (!person.session_observed_at || !person.current_show) return false;
  const observedAt = new Date(person.session_observed_at);
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return observedAt > thirtyMinutesAgo;
};

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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [statFilter, setStatFilter] = useState<StatFilter>('all');

  // Lookup/Queue integration state
  const [lookupUsername, setLookupUsername] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  // Following tab state
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingStats, setFollowingStats] = useState<any>(null);
  const [followingFilter, setFollowingFilter] = useState<'all' | 'with_image' | 'models' | 'viewers' | 'unknown'>('all');

  // Followers tab state
  const [followerUsers, setFollowerUsers] = useState<FollowerUser[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followersStats, setFollowersStats] = useState<any>(null);
  const [followerRoleFilter, setFollowerRoleFilter] = useState<string>('ALL');
  const [followersFilter, setFollowersFilter] = useState<'all' | 'with_image' | 'models' | 'viewers' | 'unknown'>('all');

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
      // Load all users - use a high limit to get everyone
      const data = await api.getAllPersons(10000, 0);
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
      // Use the dedicated following endpoint which returns all following users
      const response = await fetch('http://localhost:3000/api/followers/following');
      const data = await response.json();
      setFollowingUsers(data.following || []);
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
      // Use the dedicated followers endpoint which returns all followers
      const response = await fetch('http://localhost:3000/api/followers/followers');
      const data = await response.json();
      setFollowerUsers(data.followers || []);
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
    // Apply stat filter
    if (statFilter !== 'all') {
      const priority = getPriorityLookup(p.username);
      switch (statFilter) {
        case 'live':
          if (!isPersonLive(p)) return false;
          break;
        case 'priority2':
          if (!priority || priority.status !== 'active') return false;
          break;
        case 'priority1':
          if (!priority || priority.status !== 'pending') return false;
          break;
        case 'with_image':
          if (!p.image_url) return false;
          break;
        case 'models':
          if (p.role !== 'MODEL') return false;
          break;
        case 'viewers':
          if (p.role !== 'VIEWER') return false;
          break;
      }
    }
    return true;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, searchQuery, tagFilter, statFilter]);

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

  // Pagination calculations
  const totalPages = Math.ceil(sortedPersons.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPersons = sortedPersons.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    // Scroll to top of table
    document.querySelector('.users-content')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleStatClick = (filter: StatFilter) => {
    setStatFilter(statFilter === filter ? 'all' : filter);
  };

  // Pagination component
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) pages.push(i);

      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return (
      <div className="pagination">
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          ‹ Prev
        </button>

        {pages.map((page, idx) => (
          typeof page === 'number' ? (
            <button
              key={idx}
              className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
              onClick={() => handlePageChange(page)}
            >
              {page}
            </button>
          ) : (
            <span key={idx} className="pagination-ellipsis">...</span>
          )
        ))}

        <button
          className="pagination-btn"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Next ›
        </button>

        <select
          className="page-size-select"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setCurrentPage(1);
          }}
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size} per page</option>
          ))}
        </select>

        <span className="pagination-info">
          {startIndex + 1}-{Math.min(endIndex, sortedPersons.length)} of {sortedPersons.length}
        </span>
      </div>
    );
  };

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
      {/* Stats Cards - Clickable to filter */}
      <div className="header-stats">
        <div
          className={`stat-card clickable ${statFilter === 'all' ? 'active' : ''}`}
          onClick={() => handleStatClick('all')}
        >
          <div className="stat-value">{persons.length}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div
          className={`stat-card clickable stat-live ${statFilter === 'live' ? 'active' : ''}`}
          onClick={() => handleStatClick('live')}
        >
          <div className="stat-value">{persons.filter(p => isPersonLive(p)).length}</div>
          <div className="stat-label">Live Now</div>
        </div>
        <div
          className={`stat-card clickable ${statFilter === 'with_image' ? 'active' : ''}`}
          onClick={() => handleStatClick('with_image')}
        >
          <div className="stat-value">{persons.filter(p => p.image_url).length}</div>
          <div className="stat-label">With Images</div>
        </div>
        <div
          className={`stat-card clickable ${statFilter === 'priority2' ? 'active' : ''}`}
          onClick={() => handleStatClick('priority2')}
        >
          <div className="stat-value">{priorityLookups.filter(p => p.status === 'active').length}</div>
          <div className="stat-label">Priority 2 (Active)</div>
        </div>
        <div
          className={`stat-card clickable ${statFilter === 'priority1' ? 'active' : ''}`}
          onClick={() => handleStatClick('priority1')}
        >
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

      {/* Active filter indicator */}
      {statFilter !== 'all' && (
        <div className="active-filter-banner">
          Filtering by: <strong>{statFilter.replace('_', ' ')}</strong>
          <button onClick={() => setStatFilter('all')}>Clear ✕</button>
        </div>
      )}

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

      {/* Pagination - Top */}
      {renderPagination()}

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
            {paginatedPersons.map((person) => {
              const priority = getPriorityLookup(person.username);
              return (
                <tr key={person.id}>
                  <td className="username-cell">
                    <div className="username-with-role">
                      <Link to={`/profile/${person.username}`} className="username-link">
                        {person.username}
                      </Link>
                      <span className={`${getRoleBadgeClass(person.role)} role-small`}>{person.role}</span>
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
                        {isPersonLive(person) && (
                          <span className="live-dot" title="Currently live">●</span>
                        )}
                        <div className="image-popup">
                          <img src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`} alt={person.username} />
                          {isPersonLive(person) && (
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

        {paginatedPersons.length === 0 && (
          <div className="empty-state">
            <p>No users found matching your filters.</p>
          </div>
        )}
      </div>

      {/* Pagination - Bottom */}
      {renderPagination()}
    </>
  );

  const renderFollowingTab = () => {
    const withImages = followingUsers.filter(p => p.image_url).length;
    const models = followingUsers.filter(p => p.role === 'MODEL').length;
    const viewers = followingUsers.filter(p => p.role === 'VIEWER').length;
    const unknown = followingUsers.length - models - viewers;

    // Filter following users based on selected filter
    const filteredFollowing = followingUsers.filter(p => {
      switch (followingFilter) {
        case 'with_image': return !!p.image_url;
        case 'models': return p.role === 'MODEL';
        case 'viewers': return p.role === 'VIEWER';
        case 'unknown': return p.role !== 'MODEL' && p.role !== 'VIEWER';
        default: return true;
      }
    });

    const handleFollowingFilterClick = (filter: typeof followingFilter) => {
      setFollowingFilter(followingFilter === filter ? 'all' : filter);
    };

    return (
    <>
      <div className="tab-header">
        <h2>Following</h2>
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

      {/* Stats Cards for Following - Clickable */}
      <div className="header-stats">
        <div
          className={`stat-card clickable ${followingFilter === 'all' ? 'active' : ''}`}
          onClick={() => handleFollowingFilterClick('all')}
        >
          <div className="stat-value">{followingUsers.length}</div>
          <div className="stat-label">Total Following</div>
        </div>
        <div
          className={`stat-card clickable ${followingFilter === 'with_image' ? 'active' : ''}`}
          onClick={() => handleFollowingFilterClick('with_image')}
        >
          <div className="stat-value">{withImages}</div>
          <div className="stat-label">With Images</div>
        </div>
        <div
          className={`stat-card clickable ${followingFilter === 'models' ? 'active' : ''}`}
          onClick={() => handleFollowingFilterClick('models')}
        >
          <div className="stat-value">{models}</div>
          <div className="stat-label">Models</div>
        </div>
        <div
          className={`stat-card clickable ${followingFilter === 'viewers' ? 'active' : ''}`}
          onClick={() => handleFollowingFilterClick('viewers')}
        >
          <div className="stat-value">{viewers}</div>
          <div className="stat-label">Viewers</div>
        </div>
        <div
          className={`stat-card clickable ${followingFilter === 'unknown' ? 'active' : ''}`}
          onClick={() => handleFollowingFilterClick('unknown')}
        >
          <div className="stat-value">{unknown}</div>
          <div className="stat-label">Unknown</div>
        </div>
      </div>

      {/* Active filter indicator */}
      {followingFilter !== 'all' && (
        <div className="active-filter-banner">
          Filtering by: <strong>{followingFilter.replace('_', ' ')}</strong> ({filteredFollowing.length} users)
          <button onClick={() => setFollowingFilter('all')}>Clear X</button>
        </div>
      )}

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
            {filteredFollowing.map((person) => (
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

        {filteredFollowing.length === 0 && (
          <div className="empty-state">
            <p>{followingUsers.length === 0 ? 'No following users. Upload your following list to populate this tab.' : 'No users match the selected filter.'}</p>
          </div>
        )}
      </div>
    </>
  );
  };

  const renderFollowersTab = () => {
    const withImages = followerUsers.filter(p => p.image_url).length;
    const models = followerUsers.filter(p => p.role === 'MODEL').length;
    const viewers = followerUsers.filter(p => p.role === 'VIEWER').length;
    const unknown = followerUsers.length - models - viewers;

    // Filter followers based on selected filter
    const filteredFollowersList = followerUsers.filter(p => {
      switch (followersFilter) {
        case 'with_image': return !!p.image_url;
        case 'models': return p.role === 'MODEL';
        case 'viewers': return p.role === 'VIEWER';
        case 'unknown': return p.role !== 'MODEL' && p.role !== 'VIEWER';
        default: return true;
      }
    });

    const handleFollowersFilterClick = (filter: typeof followersFilter) => {
      setFollowersFilter(followersFilter === filter ? 'all' : filter);
    };

    return (
    <>
      <div className="tab-header">
        <h2>Followers</h2>
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

      {/* Stats Cards for Followers - Clickable */}
      <div className="header-stats">
        <div
          className={`stat-card clickable ${followersFilter === 'all' ? 'active' : ''}`}
          onClick={() => handleFollowersFilterClick('all')}
        >
          <div className="stat-value">{followerUsers.length}</div>
          <div className="stat-label">Total Followers</div>
        </div>
        <div
          className={`stat-card clickable ${followersFilter === 'with_image' ? 'active' : ''}`}
          onClick={() => handleFollowersFilterClick('with_image')}
        >
          <div className="stat-value">{withImages}</div>
          <div className="stat-label">With Images</div>
        </div>
        <div
          className={`stat-card clickable ${followersFilter === 'models' ? 'active' : ''}`}
          onClick={() => handleFollowersFilterClick('models')}
        >
          <div className="stat-value">{models}</div>
          <div className="stat-label">Models</div>
        </div>
        <div
          className={`stat-card clickable ${followersFilter === 'viewers' ? 'active' : ''}`}
          onClick={() => handleFollowersFilterClick('viewers')}
        >
          <div className="stat-value">{viewers}</div>
          <div className="stat-label">Viewers</div>
        </div>
        <div
          className={`stat-card clickable ${followersFilter === 'unknown' ? 'active' : ''}`}
          onClick={() => handleFollowersFilterClick('unknown')}
        >
          <div className="stat-value">{unknown}</div>
          <div className="stat-label">Unknown</div>
        </div>
      </div>

      {/* Active filter indicator */}
      {followersFilter !== 'all' && (
        <div className="active-filter-banner">
          Filtering by: <strong>{followersFilter.replace('_', ' ')}</strong> ({filteredFollowersList.length} users)
          <button onClick={() => setFollowersFilter('all')}>Clear X</button>
        </div>
      )}

      {followersStats && (
        <div className="stats-banner">
          <div className="stat-item">New Followers: {followersStats.newFollowers}</div>
          <div className="stat-item">Unfollowers: {followersStats.unfollowers}</div>
          <div className="stat-item">Total: {followersStats.total}</div>
        </div>
      )}

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
            {filteredFollowersList.map((person) => (
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

        {filteredFollowersList.length === 0 && (
          <div className="empty-state">
            <p>{followerUsers.length === 0 ? 'No followers found. Upload your followers list to populate this tab.' : 'No users match the selected filter.'}</p>
          </div>
        )}
      </div>
    </>
  );
  };

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
