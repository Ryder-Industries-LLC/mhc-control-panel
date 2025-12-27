import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, LookupResponse } from '../api/client';
import { formatDate, formatNumber } from '../utils/formatting';
// Users.css removed - fully migrated to Tailwind CSS

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

  // View mode state (list or grid)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    const saved = localStorage.getItem('mhc-view-mode');
    return (saved === 'grid' || saved === 'list') ? saved : 'list';
  });

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem('mhc-view-mode', viewMode);
  }, [viewMode]);

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

  // Helper functions for styling
  const getRoleBadgeClass = (role: string) => {
    const base = "inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide";
    switch (role) {
      case 'MODEL':
        return `${base} bg-purple-500/20 text-purple-400 border border-purple-500/30`;
      case 'VIEWER':
        return `${base} bg-blue-500/20 text-blue-400 border border-blue-500/30`;
      default:
        return `${base} bg-gray-500/20 text-gray-400 border border-gray-500/30`;
    }
  };

  const getPriorityBadgeClass = (priority: PriorityLookup) => {
    const base = "inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide";
    if (priority.priority_level === 1 && priority.status === 'pending') {
      return `${base} bg-yellow-500/20 text-yellow-400 border border-yellow-500/30`;
    }
    if (priority.priority_level === 1 && priority.status === 'completed') {
      return `${base} bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`;
    }
    if (priority.priority_level === 2 && priority.status === 'active') {
      return `${base} bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse`;
    }
    return base;
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

  // Get image URL with fallback handling
  const getImageUrl = (imageUrl: string | null): string | null => {
    if (!imageUrl) return null;
    return imageUrl.startsWith('http') ? imageUrl : `http://localhost:3000/images/${imageUrl}`;
  };

  // View mode toggle component
  const renderViewModeToggle = () => (
    <div className="flex gap-1 bg-mhc-surface-light rounded-lg p-1">
      <button
        onClick={() => setViewMode('list')}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
          viewMode === 'list'
            ? 'bg-gradient-primary text-white shadow-md'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        List
      </button>
      <button
        onClick={() => setViewMode('grid')}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
          viewMode === 'grid'
            ? 'bg-gradient-primary text-white shadow-md'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        Grid
      </button>
    </div>
  );

  // User grid card component
  const renderUserGridCard = (person: PersonWithSource) => {
    const imageUrl = getImageUrl(person.image_url);
    const isLive = isPersonLive(person);

    return (
      <Link
        key={person.id}
        to={`/profile/${person.username}`}
        className="group block bg-mhc-surface rounded-lg overflow-hidden border border-white/5 transition-all hover:border-mhc-primary/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-mhc-primary/20"
      >
        {/* Image container with 4:3 aspect ratio */}
        <div className="relative aspect-[4/3] bg-mhc-surface-light overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={person.username}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-5xl text-white/20">
              <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          )}
          {/* Live indicator */}
          {isLive && (
            <div className="absolute top-2 right-2 bg-red-500/90 text-white px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide animate-pulse flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full" />
              LIVE
            </div>
          )}
          {/* Priority indicator */}
          {getPriorityLookup(person.username) && (
            <div className="absolute top-2 left-2 bg-yellow-500/90 text-black px-1.5 py-0.5 rounded text-xs font-bold">
              P{getPriorityLookup(person.username)?.priority_level}
            </div>
          )}
        </div>
        {/* Info section */}
        <div className="p-3">
          <div className="font-semibold text-white truncate group-hover:text-mhc-primary transition-colors">
            {person.username}
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs">
            <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.65rem]`}>
              {person.role}
            </span>
            <span className="text-white/40">•</span>
            <span className="text-white/50 truncate">
              {formatDate(person.last_seen_at, { relative: true })}
            </span>
          </div>
          {person.tags && person.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {person.tags.slice(0, 3).map((tag, idx) => (
                <span key={idx} className="text-[0.6rem] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded">
                  {tag}
                </span>
              ))}
              {person.tags.length > 3 && (
                <span className="text-[0.6rem] text-white/30">+{person.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </Link>
    );
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
      <div className="flex items-center justify-center gap-2 p-4 my-4 flex-wrap">
        <button
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white/70 text-sm cursor-pointer transition-all hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          ‹ Prev
        </button>

        {pages.map((page, idx) => (
          typeof page === 'number' ? (
            <button
              key={idx}
              className={`min-w-[40px] px-3 py-2 border rounded-md text-sm cursor-pointer transition-all text-center ${
                currentPage === page
                  ? 'bg-gradient-primary text-white border-transparent'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              onClick={() => handlePageChange(page)}
            >
              {page}
            </button>
          ) : (
            <span key={idx} className="text-white/40 px-1">...</span>
          )
        ))}

        <button
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white/70 text-sm cursor-pointer transition-all hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Next ›
        </button>

        <select
          className="ml-4 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white cursor-pointer text-sm focus:outline-none focus:border-mhc-primary"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setCurrentPage(1);
          }}
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size} className="bg-mhc-surface text-white">{size} per page</option>
          ))}
        </select>

        <span className="ml-4 text-white/50 text-sm">
          {startIndex + 1}-{Math.min(endIndex, sortedPersons.length)} of {sortedPersons.length}
        </span>
      </div>
    );
  };

  const renderDirectoryTab = () => (
    <>
      {/* Stats Cards - Clickable to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            statFilter === 'all' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleStatClick('all')}
        >
          <div className="text-3xl font-bold text-white mb-1">{persons.length}</div>
          <div className="text-sm text-white/70">Total Users</div>
        </div>
        <div
          className={`border rounded-lg p-4 text-center cursor-pointer transition-all hover:-translate-y-0.5 ${
            statFilter === 'live'
              ? 'border-red-500 bg-red-500/20 shadow-lg shadow-red-500/30'
              : 'border-red-500/30 bg-red-500/10 hover:border-red-500/50'
          }`}
          onClick={() => handleStatClick('live')}
        >
          <div className="text-3xl font-bold text-red-400 mb-1">{persons.filter(p => isPersonLive(p)).length}</div>
          <div className="text-sm text-red-300">Live Now</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            statFilter === 'with_image' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleStatClick('with_image')}
        >
          <div className="text-3xl font-bold text-white mb-1">{persons.filter(p => p.image_url).length}</div>
          <div className="text-sm text-white/70">With Images</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            statFilter === 'priority2' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleStatClick('priority2')}
        >
          <div className="text-3xl font-bold text-white mb-1">{priorityLookups.filter(p => p.status === 'active').length}</div>
          <div className="text-sm text-white/70">Priority 2 (Active)</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            statFilter === 'priority1' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleStatClick('priority1')}
        >
          <div className="text-3xl font-bold text-white mb-1">{priorityLookups.filter(p => p.status === 'pending').length}</div>
          <div className="text-sm text-white/70">Priority 1 (Pending)</div>
        </div>
        {cacheStatus && (
          <div className={`border rounded-lg p-4 text-center ${
            cacheStatus.fresh ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-orange-500/30 bg-orange-500/10'
          }`}>
            <div className="text-3xl font-bold text-white mb-1">{cacheStatus.roomCount}</div>
            <div className="text-sm text-white/70">
              Cached ({cacheStatus.fresh ? formatCacheAge(cacheStatus.ageMs) : 'Stale'})
            </div>
          </div>
        )}
      </div>

      {/* Active filter indicator */}
      {statFilter !== 'all' && (
        <div className="flex items-center gap-4 px-4 py-3 bg-mhc-primary/15 border border-mhc-primary/30 rounded-lg mt-4 text-indigo-300 text-sm">
          Filtering by: <strong className="text-white capitalize">{statFilter.replace('_', ' ')}</strong>
          <button
            onClick={() => setStatFilter('all')}
            className="ml-auto bg-transparent border border-white/20 text-white/70 px-3 py-1 rounded text-xs cursor-pointer transition-all hover:bg-white/10 hover:text-white"
          >
            Clear ✕
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap items-center mt-4">
        <div className="flex-1 min-w-[250px]">
          <input
            type="text"
            placeholder="Search usernames..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-base placeholder:text-white/40 focus:outline-none focus:border-mhc-primary focus:bg-white/8"
          />
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Filter by tag..."
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-base placeholder:text-white/40 focus:outline-none focus:border-mhc-primary focus:bg-white/8"
          />
          {tagFilter && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-white/40 cursor-pointer text-base p-1 transition-colors hover:text-red-400"
              onClick={() => setTagFilter('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
              roleFilter === 'ALL'
                ? 'bg-gradient-primary text-white border-transparent'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            onClick={() => setRoleFilter('ALL')}
          >
            All ({persons.length})
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
              roleFilter === 'MODEL'
                ? 'bg-gradient-primary text-white border-transparent'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            onClick={() => setRoleFilter('MODEL')}
          >
            Models ({persons.filter(p => p.role === 'MODEL').length})
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
              roleFilter === 'VIEWER'
                ? 'bg-gradient-primary text-white border-transparent'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            onClick={() => setRoleFilter('VIEWER')}
          >
            Viewers ({persons.filter(p => p.role === 'VIEWER').length})
          </button>
        </div>
      </div>

      {/* Preset Tag Filters */}
      <div className="flex flex-wrap gap-2 mt-4 p-4 bg-white/3 rounded-lg border border-white/5">
        {['smoke', 'master', 'leather', 'bdsm', 'findom', 'dirty', 'fetish', 'daddy', 'alpha', 'dom', 'slave', 'bulge'].map(tag => (
          <button
            key={tag}
            className={`px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all ${
              tagFilter.toLowerCase() === tag
                ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-transparent shadow-lg shadow-purple-500/40'
                : 'bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/40 hover:-translate-y-0.5'
            }`}
            onClick={() => setTagFilter(tagFilter.toLowerCase() === tag ? '' : tag)}
          >
            #{tag}
          </button>
        ))}
      </div>

      {/* View Mode Toggle & Pagination Row */}
      <div className="flex items-center justify-between mt-4 flex-wrap gap-4">
        {renderViewModeToggle()}
        <div className="flex-1">{renderPagination()}</div>
      </div>

      {/* Directory Content - Grid or List */}
      {viewMode === 'grid' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-4">
            {paginatedPersons.map(person => renderUserGridCard(person))}
          </div>
          {paginatedPersons.length === 0 && (
            <div className="p-12 text-center text-white/50 bg-white/5 border border-white/10 rounded-xl mt-4">
              <p>No users found matching your filters.</p>
            </div>
          )}
        </>
      ) : (
      /* Directory Table */
      <div className="users-content bg-white/5 border border-white/10 rounded-xl overflow-auto max-h-[calc(100vh-400px)] min-h-[400px] mt-4">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th
                onClick={() => handleSort('username')}
                className="w-[180px] px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30 cursor-pointer select-none hover:bg-white/8"
              >
                Username {sortField === 'username' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="w-[140px] px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Image</th>
              <th
                onClick={() => handleSort('age')}
                className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30 cursor-pointer select-none hover:bg-white/8"
              >
                Age {sortField === 'age' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="w-[200px] px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Tags</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Priority</th>
              <th
                onClick={() => handleSort('interaction_count')}
                className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30 cursor-pointer select-none hover:bg-white/8"
              >
                Events {sortField === 'interaction_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('snapshot_count')}
                className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30 cursor-pointer select-none hover:bg-white/8"
              >
                Snapshots {sortField === 'snapshot_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('last_seen_at')}
                className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30 cursor-pointer select-none hover:bg-white/8"
              >
                Last Seen {sortField === 'last_seen_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="w-[150px] px-4 py-4 text-center font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedPersons.map((person) => {
              const priority = getPriorityLookup(person.username);
              return (
                <tr key={person.id} className="border-b border-white/5 transition-colors hover:bg-white/3">
                  <td className="px-4 py-4 text-white/80">
                    <div className="flex items-center gap-2">
                      <Link to={`/profile/${person.username}`} className="text-white no-underline font-semibold text-base transition-colors hover:text-mhc-primary hover:underline">
                        {person.username}
                      </Link>
                      <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>{person.role}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {person.image_url && (
                      <div className="relative w-[120px] h-[90px] cursor-pointer group">
                        <img
                          src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`}
                          alt={person.username}
                          className="w-full h-full object-cover rounded-md border-2 border-white/10 transition-all group-hover:border-mhc-primary group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-mhc-primary/40"
                        />
                        {isPersonLive(person) && (
                          <span className="absolute top-0.5 right-0.5 text-red-500 text-xs animate-pulse drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]">●</span>
                        )}
                        <div className="hidden group-hover:block absolute left-[130px] top-1/2 -translate-y-1/2 z-[100] bg-[#1a1a2e] border-2 border-white/20 rounded-lg p-2 shadow-2xl pointer-events-none">
                          <img src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`} alt={person.username} className="w-[360px] h-[270px] object-cover rounded" />
                          {isPersonLive(person) && (
                            <div className="absolute top-3 left-3 bg-red-500/90 text-white px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide animate-pulse">● LIVE</div>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-white/80">{person.age || '—'}</td>
                  <td className="px-2 py-2">
                    {person.tags && person.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1 items-center">
                        {person.tags.slice(0, 5).map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 rounded-xl text-xs text-purple-400 cursor-pointer transition-all whitespace-nowrap hover:bg-purple-500/25 hover:border-purple-500/50 hover:scale-105"
                            onClick={() => setTagFilter(tag)}
                          >
                            {tag}
                          </span>
                        ))}
                        {person.tags.length > 5 && (
                          <span className="text-xs text-white/40 font-medium">+{person.tags.length - 5}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {priority ? (
                      <div className="flex items-center gap-2">
                        <span className={getPriorityBadgeClass(priority)}>
                          P{priority.priority_level} - {priority.status.toUpperCase()}
                        </span>
                        <button
                          className="bg-transparent border-none text-white/40 cursor-pointer text-sm px-2 py-1 transition-colors hover:text-red-400"
                          onClick={() => handleRemoveFromPriority(person.username)}
                          title="Remove from priority queue"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center font-mono text-white/60">{person.interaction_count}</td>
                  <td className="px-4 py-4 text-center font-mono text-white/60">{person.snapshot_count}</td>
                  <td className="px-4 py-4 text-white/80">{formatDate(person.last_seen_at, { relative: true })}</td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex gap-2 justify-center">
                      {!priority && (
                        <button
                          className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-yellow-500/20 hover:border-yellow-500/30 hover:scale-110"
                          onClick={() => handleAddToPriority(person.username)}
                          title="Add to priority queue"
                        >
                          ★
                        </button>
                      )}
                      <button
                        className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-blue-500/20 hover:border-blue-500/30 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleOnDemandLookup(person.username)}
                        disabled={lookupLoading === person.username}
                        title="On-demand lookup"
                      >
                        {lookupLoading === person.username ? '⟳' : '🔍'}
                      </button>
                      <button
                        className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-red-500/20 hover:border-red-500/30 hover:scale-110"
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
          <div className="p-12 text-center text-white/50">
            <p>No users found matching your filters.</p>
          </div>
        )}
      </div>
      )}

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
      <div className="flex justify-between items-center my-6">
        <h2 className="text-2xl text-white font-semibold">Following</h2>
        <div className="flex gap-4">
          <label className="bg-gradient-primary text-white px-6 py-3 rounded-md font-medium cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mhc-primary/40">
            {followingLoading ? 'Updating...' : 'Update Following List'}
            <input
              type="file"
              accept=".html,.htm"
              onChange={handleUpdateFollowing}
              className="hidden"
              disabled={followingLoading}
            />
          </label>
        </div>
      </div>

      {/* Stats Cards for Following - Clickable */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followingFilter === 'all' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowingFilterClick('all')}
        >
          <div className="text-3xl font-bold text-white mb-1">{followingUsers.length}</div>
          <div className="text-sm text-white/70">Total Following</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followingFilter === 'with_image' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowingFilterClick('with_image')}
        >
          <div className="text-3xl font-bold text-white mb-1">{withImages}</div>
          <div className="text-sm text-white/70">With Images</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followingFilter === 'models' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowingFilterClick('models')}
        >
          <div className="text-3xl font-bold text-white mb-1">{models}</div>
          <div className="text-sm text-white/70">Models</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followingFilter === 'viewers' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowingFilterClick('viewers')}
        >
          <div className="text-3xl font-bold text-white mb-1">{viewers}</div>
          <div className="text-sm text-white/70">Viewers</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followingFilter === 'unknown' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowingFilterClick('unknown')}
        >
          <div className="text-3xl font-bold text-white mb-1">{unknown}</div>
          <div className="text-sm text-white/70">Unknown</div>
        </div>
      </div>

      {/* Active filter indicator */}
      {followingFilter !== 'all' && (
        <div className="flex items-center gap-4 px-4 py-3 bg-mhc-primary/15 border border-mhc-primary/30 rounded-lg mt-4 text-indigo-300 text-sm">
          Filtering by: <strong className="text-white capitalize">{followingFilter.replace('_', ' ')}</strong> ({filteredFollowing.length} users)
          <button onClick={() => setFollowingFilter('all')} className="ml-auto bg-transparent border border-white/20 text-white/70 px-3 py-1 rounded text-xs cursor-pointer transition-all hover:bg-white/10 hover:text-white">Clear X</button>
        </div>
      )}

      {followingStats && (
        <div className="flex gap-8 p-4 bg-mhc-primary/10 border border-mhc-primary/30 rounded-lg mb-4 mt-4">
          <div className="text-white text-sm">New Follows: {followingStats.newFollows}</div>
          <div className="text-white text-sm">Unfollowed: {followingStats.unfollows}</div>
          <div className="text-white text-sm">Total: {followingStats.total}</div>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between mt-4 mb-4">
        {renderViewModeToggle()}
        <span className="text-white/50 text-sm">{filteredFollowing.length} users</span>
      </div>

      {/* Following Content - Grid or List */}
      {viewMode === 'grid' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredFollowing.map(person => renderUserGridCard(person))}
          </div>
          {filteredFollowing.length === 0 && (
            <div className="p-12 text-center text-white/50 bg-white/5 border border-white/10 rounded-xl mt-4">
              <p>{followingUsers.length === 0 ? 'No following users. Upload your following list to populate this tab.' : 'No users match the selected filter.'}</p>
            </div>
          )}
        </>
      ) : (
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Username</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Image</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Age</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Tags</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Following Since</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Last Seen</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFollowing.map((person) => (
              <tr key={person.id} className="border-b border-white/5 transition-colors hover:bg-white/3">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                    <Link to={`/profile/${person.username}`} className="text-mhc-primary no-underline font-medium transition-colors hover:text-indigo-400 hover:underline">{person.username}</Link>
                  </div>
                </td>
                <td className="px-2 py-2">
                  {person.image_url && (
                    <img
                      src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`}
                      alt={person.username}
                      className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
                    />
                  )}
                </td>
                <td className="px-4 py-4 text-white/80">{person.age || '—'}</td>
                <td className="px-2 py-2">
                  {person.tags && person.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {person.tags.slice(0, 5).map((tag, idx) => (
                        <span key={idx} className="inline-block px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 rounded-xl text-xs text-purple-400">{tag}</span>
                      ))}
                      {person.tags.length > 5 && <span className="text-xs text-white/40">+{person.tags.length - 5}</span>}
                    </div>
                  ) : <span className="text-white/30">—</span>}
                </td>
                <td className="px-4 py-4 text-white/80">{person.following_since ? formatDate(person.following_since, { includeTime: false }) : '—'}</td>
                <td className="px-4 py-4 text-white/80">{formatDate(person.last_seen_at, { relative: true })}</td>
                <td className="px-4 py-4 text-center">
                  <button
                    className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-blue-500/20 hover:border-blue-500/30 hover:scale-110"
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
          <div className="p-12 text-center text-white/50">
            <p>{followingUsers.length === 0 ? 'No following users. Upload your following list to populate this tab.' : 'No users match the selected filter.'}</p>
          </div>
        )}
      </div>
      )}
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
      <div className="flex justify-between items-center my-6">
        <h2 className="text-2xl text-white font-semibold">Followers</h2>
        <div className="flex gap-4">
          <label className="bg-gradient-primary text-white px-6 py-3 rounded-md font-medium cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mhc-primary/40">
            {followersLoading ? 'Updating...' : 'Update Followers List'}
            <input
              type="file"
              accept=".html,.htm"
              onChange={handleUpdateFollowers}
              className="hidden"
              disabled={followersLoading}
            />
          </label>
        </div>
      </div>

      {/* Stats Cards for Followers - Clickable */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followersFilter === 'all' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowersFilterClick('all')}
        >
          <div className="text-3xl font-bold text-white mb-1">{followerUsers.length}</div>
          <div className="text-sm text-white/70">Total Followers</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followersFilter === 'with_image' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowersFilterClick('with_image')}
        >
          <div className="text-3xl font-bold text-white mb-1">{withImages}</div>
          <div className="text-sm text-white/70">With Images</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followersFilter === 'models' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowersFilterClick('models')}
        >
          <div className="text-3xl font-bold text-white mb-1">{models}</div>
          <div className="text-sm text-white/70">Models</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followersFilter === 'viewers' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowersFilterClick('viewers')}
        >
          <div className="text-3xl font-bold text-white mb-1">{viewers}</div>
          <div className="text-sm text-white/70">Viewers</div>
        </div>
        <div
          className={`bg-white/5 border rounded-lg p-4 text-center cursor-pointer transition-all hover:bg-white/8 hover:-translate-y-0.5 ${
            followersFilter === 'unknown' ? 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30' : 'border-white/10 hover:border-mhc-primary/40'
          }`}
          onClick={() => handleFollowersFilterClick('unknown')}
        >
          <div className="text-3xl font-bold text-white mb-1">{unknown}</div>
          <div className="text-sm text-white/70">Unknown</div>
        </div>
      </div>

      {/* Active filter indicator */}
      {followersFilter !== 'all' && (
        <div className="flex items-center gap-4 px-4 py-3 bg-mhc-primary/15 border border-mhc-primary/30 rounded-lg mt-4 text-indigo-300 text-sm">
          Filtering by: <strong className="text-white capitalize">{followersFilter.replace('_', ' ')}</strong> ({filteredFollowersList.length} users)
          <button onClick={() => setFollowersFilter('all')} className="ml-auto bg-transparent border border-white/20 text-white/70 px-3 py-1 rounded text-xs cursor-pointer transition-all hover:bg-white/10 hover:text-white">Clear X</button>
        </div>
      )}

      {followersStats && (
        <div className="flex gap-8 p-4 bg-mhc-primary/10 border border-mhc-primary/30 rounded-lg mb-4 mt-4">
          <div className="text-white text-sm">New Followers: {followersStats.newFollowers}</div>
          <div className="text-white text-sm">Unfollowers: {followersStats.unfollowers}</div>
          <div className="text-white text-sm">Total: {followersStats.total}</div>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between mt-4 mb-4">
        {renderViewModeToggle()}
        <span className="text-white/50 text-sm">{filteredFollowersList.length} users</span>
      </div>

      {/* Followers Content - Grid or List */}
      {viewMode === 'grid' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredFollowersList.map(person => renderUserGridCard(person))}
          </div>
          {filteredFollowersList.length === 0 && (
            <div className="p-12 text-center text-white/50 bg-white/5 border border-white/10 rounded-xl mt-4">
              <p>{followerUsers.length === 0 ? 'No followers found. Upload your followers list to populate this tab.' : 'No users match the selected filter.'}</p>
            </div>
          )}
        </>
      ) : (
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Username</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Image</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Age</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Follower Since</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Last Seen</th>
              <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFollowersList.map((person) => (
              <tr key={person.id} className="border-b border-white/5 transition-colors hover:bg-white/3">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                    <Link to={`/profile/${person.username}`} className="text-mhc-primary no-underline font-medium transition-colors hover:text-indigo-400 hover:underline">{person.username}</Link>
                  </div>
                </td>
                <td className="px-2 py-2">
                  {person.image_url && (
                    <img
                      src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`}
                      alt={person.username}
                      className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
                    />
                  )}
                </td>
                <td className="px-4 py-4 text-white/80">{person.age || '—'}</td>
                <td className="px-4 py-4 text-white/80">{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '—'}</td>
                <td className="px-4 py-4 text-white/80">{formatDate(person.last_seen_at, { relative: true })}</td>
                <td className="px-4 py-4 text-center">
                  <button
                    className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-blue-500/20 hover:border-blue-500/30 hover:scale-110"
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
          <div className="p-12 text-center text-white/50">
            <p>{followerUsers.length === 0 ? 'No followers found. Upload your followers list to populate this tab.' : 'No users match the selected filter.'}</p>
          </div>
        )}
      </div>
      )}
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
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Unfollowed ({totalUnfollows})</h2>
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                timeframeFilter === 7
                  ? 'bg-gradient-primary text-white border-transparent'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              onClick={() => setTimeframeFilter(7)}
            >
              Last 7 Days
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                timeframeFilter === 30
                  ? 'bg-gradient-primary text-white border-transparent'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              onClick={() => setTimeframeFilter(30)}
            >
              Last 30 Days
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                timeframeFilter === 90
                  ? 'bg-gradient-primary text-white border-transparent'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              onClick={() => setTimeframeFilter(90)}
            >
              Last 90 Days
            </button>
          </div>
        </div>

        {totalUnfollows > 0 && (
          <div className="flex gap-8 p-6 bg-purple-500/10 border border-purple-500/30 rounded-lg mb-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-400 mb-1">{totalUnfollows}</div>
              <div className="text-sm text-white/70">Total Unfollows</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-400 mb-1">{avgDuration.toFixed(1)}</div>
              <div className="text-sm text-white/70">Avg Days Followed</div>
            </div>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="flex items-center justify-between mt-4 mb-4">
          {renderViewModeToggle()}
          <span className="text-white/50 text-sm">{filteredUnfollowed.length} users</span>
        </div>

        {/* Unfollowed Content - Grid or List */}
        {viewMode === 'grid' ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredUnfollowed.map(person => renderUserGridCard(person))}
            </div>
            {filteredUnfollowed.length === 0 && (
              <div className="p-12 text-center text-white/50 bg-white/5 border border-white/10 rounded-xl mt-4">
                <p>No unfollowed users in the selected timeframe.</p>
              </div>
            )}
          </>
        ) : (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Username</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Image</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Age</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Followed On</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Unfollowed On</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Days Followed</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Last Seen</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnfollowed.map((person) => (
                <tr key={person.id} className="border-b border-white/5 transition-colors hover:bg-white/3">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                      <Link to={`/profile/${person.username}`} className="text-mhc-primary no-underline font-medium transition-colors hover:text-indigo-400 hover:underline">{person.username}</Link>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {person.image_url && (
                      <img
                        src={person.image_url.startsWith('http') ? person.image_url : `http://localhost:3000/images/${person.image_url}`}
                        alt={person.username}
                        className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
                      />
                    )}
                  </td>
                  <td className="px-4 py-4 text-white/80">{person.age || '—'}</td>
                  <td className="px-4 py-4 text-white/80">{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '—'}</td>
                  <td className="px-4 py-4 text-white/80">{person.unfollower_at ? formatDate(person.unfollower_at, { includeTime: false }) : '—'}</td>
                  <td className="px-4 py-4 text-white/80">{person.days_followed !== null ? `${person.days_followed} days` : '—'}</td>
                  <td className="px-4 py-4 text-white/80">{formatDate(person.last_seen_at, { relative: true })}</td>
                  <td className="px-4 py-4 text-center">
                    <button
                      className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-blue-500/20 hover:border-blue-500/30 hover:scale-110"
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
            <div className="p-12 text-center text-white/50">
              <p>No unfollowed users in the selected timeframe.</p>
            </div>
          )}
        </div>
        )}
      </>
    );
  };

  if (loading && activeTab === 'directory') {
    return (
      <div className="max-w-[1600px] mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl mb-4 bg-gradient-primary bg-clip-text text-transparent font-bold">Users</h1>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-6">
          <h1 className="text-3xl mb-4 bg-gradient-primary bg-clip-text text-transparent font-bold">Users</h1>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mt-6 border-b-2 border-white/10">
          <button
            className={`px-6 py-3 rounded-t-lg text-base cursor-pointer transition-all mr-2 border border-b-2 -mb-0.5 ${
              activeTab === 'directory'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary font-semibold'
                : 'bg-[rgba(45,55,72,0.6)] text-white/90 border-white/20 border-b-transparent hover:bg-white/8 hover:text-white hover:border-white/30'
            }`}
            onClick={() => setActiveTab('directory')}
          >
            Directory
          </button>
          <button
            className={`px-6 py-3 rounded-t-lg text-base cursor-pointer transition-all mr-2 border border-b-2 -mb-0.5 ${
              activeTab === 'following'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary font-semibold'
                : 'bg-[rgba(45,55,72,0.6)] text-white/90 border-white/20 border-b-transparent hover:bg-white/8 hover:text-white hover:border-white/30'
            }`}
            onClick={() => setActiveTab('following')}
          >
            Following
          </button>
          <button
            className={`px-6 py-3 rounded-t-lg text-base cursor-pointer transition-all mr-2 border border-b-2 -mb-0.5 ${
              activeTab === 'followers'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary font-semibold'
                : 'bg-[rgba(45,55,72,0.6)] text-white/90 border-white/20 border-b-transparent hover:bg-white/8 hover:text-white hover:border-white/30'
            }`}
            onClick={() => setActiveTab('followers')}
          >
            Followers
          </button>
          <button
            className={`px-6 py-3 rounded-t-lg text-base cursor-pointer transition-all mr-2 border border-b-2 -mb-0.5 ${
              activeTab === 'unfollowed'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary font-semibold'
                : 'bg-[rgba(45,55,72,0.6)] text-white/90 border-white/20 border-b-transparent hover:bg-white/8 hover:text-white hover:border-white/30'
            }`}
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] backdrop-blur-sm" onClick={() => setShowPriorityModal(false)}>
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl max-w-[500px] w-[90%] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="m-0 p-6 border-b border-white/10 text-white text-xl">Add to Priority Queue</h2>
            <div className="p-6">
              <div className="mb-6">
                <label className="block mb-2 text-white/90 font-medium text-sm">Username:</label>
                <input type="text" value={selectedUsername} disabled className="w-full px-3 py-3 bg-white/3 border border-white/10 rounded-md text-white/50 text-base" />
              </div>

              <div className="mb-6">
                <label className="block mb-2 text-white/90 font-medium text-sm">Priority Level:</label>
                <div className="flex flex-col gap-4">
                  <label className="flex items-start gap-3 p-4 bg-white/3 border border-white/10 rounded-lg cursor-pointer transition-all hover:bg-white/5 hover:border-white/20">
                    <input
                      type="radio"
                      name="priority"
                      checked={priorityLevel === 1}
                      onChange={() => setPriorityLevel(1)}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-white font-medium block mb-1">Priority 1 - Initial Population</span>
                      <p className="text-sm text-white/50 m-0">Fetched once, then marked complete</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-4 bg-white/3 border border-white/10 rounded-lg cursor-pointer transition-all hover:bg-white/5 hover:border-white/20">
                    <input
                      type="radio"
                      name="priority"
                      checked={priorityLevel === 2}
                      onChange={() => setPriorityLevel(2)}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-white font-medium block mb-1">Priority 2 - Frequent Tracking</span>
                      <p className="text-sm text-white/50 m-0">Checked on every poll cycle</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="mb-6">
                <label className="block mb-2 text-white/90 font-medium text-sm">Notes (optional):</label>
                <textarea
                  value={priorityNotes}
                  onChange={(e) => setPriorityNotes(e.target.value)}
                  placeholder="Add notes about this user..."
                  className="w-full px-3 py-3 bg-white/5 border border-white/10 rounded-md text-white text-base font-inherit resize-y placeholder:text-white/40 focus:outline-none focus:border-mhc-primary focus:bg-white/8"
                  rows={3}
                />
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex gap-4 justify-end">
              <button
                className="px-6 py-3 bg-white/5 text-white/70 border border-white/10 rounded-md text-base font-medium cursor-pointer transition-all hover:bg-white/10 hover:text-white"
                onClick={() => setShowPriorityModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-6 py-3 bg-gradient-primary text-white border-none rounded-md text-base font-medium cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mhc-primary/40"
                onClick={handleSubmitPriority}
              >
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
