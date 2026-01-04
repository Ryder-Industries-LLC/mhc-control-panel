import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, LookupResponse } from '../api/client';
import { formatDate, formatNumber } from '../utils/formatting';
import {
  BasePerson,
  FollowingPerson,
  FollowerPerson,
  UnfollowedPerson,
  SubPerson,
  FriendPerson,
  DomPerson,
  BannedPerson,
  TipperPerson,
  TabType,
  StatFilter,
  PriorityLookup,
  CountItem,
  ActiveFilter,
  TAG_PRESETS,
  DIRECTORY_SORT_OPTIONS,
  isPersonLive,
  getLastActiveTime,
  getImageUrl,
  getRoleBadgeClass,
  getFriendTierBadge,
} from '../types/people';
import {
  PeopleLayout,
  FiltersPanel,
  ActiveFiltersBar,
  ResultsToolbar,
  Pagination,
  PeopleTable,
  PeopleGrid,
  getDirectoryColumns,
  getFriendsColumns,
  getSubsColumns,
  getDomsColumns,
} from '../components/people';

const Users: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('directory');

  // Directory tab state
  const [persons, setPersons] = useState<BasePerson[]>([]);
  const [priorityLookups, setPriorityLookups] = useState<PriorityLookup[]>([]);
  const [_cacheStatus, setCacheStatus] = useState<{ lastUpdated: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof BasePerson>('session_observed_at');
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
  const [statFilters, setStatFilters] = useState<Set<StatFilter>>(new Set());

  // Text filter for username search within filtered results
  const [textFilter, setTextFilter] = useState('');

  // Lookup/Queue integration state
  const [lookupUsername, setLookupUsername] = useState('');
  const [_lookupResult, setLookupResult] = useState<LookupResponse | null>(null);
  const [_usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  // Following tab state
  const [followingUsers, setFollowingUsers] = useState<FollowingPerson[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [_followingStats, setFollowingStats] = useState<any>(null);
  const [followingFilter, setFollowingFilter] = useState<'all' | 'live' | 'with_image' | 'models' | 'viewers' | 'unknown'>('all');

  // Followers tab state
  const [followerUsers, setFollowerUsers] = useState<FollowerPerson[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [_followersStats, setFollowersStats] = useState<any>(null);
  const [_followerRoleFilter, setFollowerRoleFilter] = useState<string>('ALL');
  const [followersFilter, setFollowersFilter] = useState<'all' | 'live' | 'with_image' | 'models' | 'viewers' | 'unknown'>('all');

  // Unfollowed tab state
  const [unfollowedUsers, setUnfollowedUsers] = useState<UnfollowedPerson[]>([]);
  const [unfollowedLoading, setUnfollowedLoading] = useState(false);
  const [timeframeFilter, setTimeframeFilter] = useState<number>(30);

  // Subs tab state
  const [subUsers, setSubUsers] = useState<SubPerson[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsFilter, setSubsFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Friends tab state
  const [friendUsers, setFriendUsers] = useState<FriendPerson[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendTierFilter, setFriendTierFilter] = useState<number | null>(null);

  // Bans tab state
  const [bannedUsers, setBannedUsers] = useState<BannedPerson[]>([]);
  const [bansLoading, setBansLoading] = useState(false);

  // Doms tab state
  const [domUsers, setDomUsers] = useState<DomPerson[]>([]);
  const [domsLoading, setDomsLoading] = useState(false);
  const [domsFilter, setDomsFilter] = useState<string>('all');

  // Watchlist tab state
  const [watchlistUsers, setWatchlistUsers] = useState<BasePerson[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Tippers tabs state
  const [tippedByMeUsers, setTippedByMeUsers] = useState<TipperPerson[]>([]);
  const [tippedByMeLoading, setTippedByMeLoading] = useState(false);
  const [tippedMeUsers, setTippedMeUsers] = useState<TipperPerson[]>([]);
  const [tippedMeLoading, setTippedMeLoading] = useState(false);

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
    } else if (activeTab === 'subs') {
      loadSubs();
    } else if (activeTab === 'doms') {
      loadDoms();
    } else if (activeTab === 'friends') {
      loadFriends();
    } else if (activeTab === 'bans') {
      loadBans();
    } else if (activeTab === 'watchlist') {
      loadWatchlist();
    } else if (activeTab === 'tipped-by-me') {
      loadTippedByMe();
    } else if (activeTab === 'tipped-me') {
      loadTippedMe();
    }
  }, [activeTab]);

  // Reload subs when filter changes
  useEffect(() => {
    if (activeTab === 'subs') {
      loadSubs();
    }
  }, [subsFilter]);

  // Reload friends when tier filter changes
  useEffect(() => {
    if (activeTab === 'friends') {
      loadFriends();
    }
  }, [friendTierFilter]);

  // Reload doms when filter changes
  useEffect(() => {
    if (activeTab === 'doms') {
      loadDoms();
    }
  }, [domsFilter]);

  // Handle URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const usernameParam = params.get('username');
    const tabParam = params.get('tab') as TabType | null;
    const roleParam = params.get('role');

    if (usernameParam && lookupUsername !== usernameParam) {
      setLookupUsername(usernameParam);
      setActiveTab('directory');
    }

    if (tabParam && ['directory', 'following', 'followers', 'unfollowed', 'subs', 'doms', 'friends', 'bans', 'watchlist'].includes(tabParam)) {
      setActiveTab(tabParam);
    }

    if (roleParam && ['MODEL', 'VIEWER', 'UNKNOWN'].includes(roleParam)) {
      setRoleFilter(roleParam);
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

  // Data loading functions
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
      const data = await api.getAllPersons(250000, 0);
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
      const response = await fetch('/api/followers/following');
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
      const response = await fetch('/api/followers/followers');
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

  const loadSubs = async () => {
    try {
      setSubsLoading(true);
      setError(null);
      const response = await fetch(`/api/followers/subs?filter=${subsFilter}`);
      const data = await response.json();
      setSubUsers(data.subs || []);
    } catch (err) {
      setError('Failed to load subscribers');
      console.error(err);
    } finally {
      setSubsLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      setFriendsLoading(true);
      setError(null);
      const url = friendTierFilter
        ? `/api/followers/friends?tier=${friendTierFilter}`
        : '/api/followers/friends';
      const response = await fetch(url);
      const data = await response.json();
      setFriendUsers(data.friends || []);
    } catch (err) {
      setError('Failed to load friends');
      console.error(err);
    } finally {
      setFriendsLoading(false);
    }
  };

  const loadBans = async () => {
    try {
      setBansLoading(true);
      setError(null);
      const response = await fetch('/api/followers/bans');
      const data = await response.json();
      setBannedUsers(data.bans || []);
    } catch (err) {
      setError('Failed to load banned users');
      console.error(err);
    } finally {
      setBansLoading(false);
    }
  };

  const loadDoms = async () => {
    try {
      setDomsLoading(true);
      setError(null);
      const url = domsFilter !== 'all'
        ? `/api/followers/doms?filter=${domsFilter}`
        : '/api/followers/doms';
      const response = await fetch(url);
      const data = await response.json();
      setDomUsers(data.doms || []);
    } catch (err) {
      setError('Failed to load doms');
      console.error(err);
    } finally {
      setDomsLoading(false);
    }
  };

  const loadWatchlist = async () => {
    try {
      setWatchlistLoading(true);
      setError(null);
      const response = await fetch('/api/followers/watchlist');
      const data = await response.json();
      setWatchlistUsers(data.watchlist || []);
    } catch (err) {
      setError('Failed to load watchlist');
      console.error(err);
    } finally {
      setWatchlistLoading(false);
    }
  };

  const loadTippedByMe = async () => {
    try {
      setTippedByMeLoading(true);
      setError(null);
      const response = await fetch('/api/followers/tipped-by-me');
      const data = await response.json();
      setTippedByMeUsers(data.tipped || []);
    } catch (err) {
      setError('Failed to load users you tipped');
      console.error(err);
    } finally {
      setTippedByMeLoading(false);
    }
  };

  const loadTippedMe = async () => {
    try {
      setTippedMeLoading(true);
      setError(null);
      const response = await fetch('/api/followers/tipped-me');
      const data = await response.json();
      setTippedMeUsers(data.tippers || []);
    } catch (err) {
      setError('Failed to load users who tipped you');
      console.error(err);
    } finally {
      setTippedMeLoading(false);
    }
  };

  // Action handlers
  const handleUpdateFollowing = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setFollowingLoading(true);
      const text = await file.text();
      const response = await fetch('/api/followers/update-following', {
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
      const response = await fetch('/api/followers/update-followers', {
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

  const handleSort = (field: string) => {
    const typedField = field as keyof BasePerson;
    if (sortField === typedField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(typedField);
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

  const getPriorityLookup = (username: string): PriorityLookup | null => {
    return priorityLookups.find(p => p.username.toLowerCase() === username.toLowerCase()) || null;
  };

  const handleStatClick = (filter: StatFilter) => {
    setStatFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(filter)) {
        newFilters.delete(filter);
      } else {
        newFilters.add(filter);
      }
      return newFilters;
    });
  };

  const clearAllFilters = () => {
    setStatFilters(new Set());
    setTextFilter('');
    setTagFilter('');
    setSearchQuery('');
    setRoleFilter('ALL');
  };

  // Filtering logic
  const filteredPersons = persons.filter(p => {
    if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
    if (searchQuery && !p.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (tagFilter) {
      if (!p.tags || p.tags.length === 0) return false;
      const hasTag = p.tags.some(tag => tag.toLowerCase().includes(tagFilter.toLowerCase()));
      if (!hasTag) return false;
    }
    if (textFilter && !p.username.toLowerCase().includes(textFilter.toLowerCase())) return false;

    if (statFilters.size > 0) {
      for (const filter of Array.from(statFilters)) {
        switch (filter) {
          case 'live':
            if (!isPersonLive(p)) return false;
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
          case 'following':
            if (!p.following) return false;
            break;
          case 'friends':
            if (!p.friend_tier) return false;
            break;
          case 'watchlist':
            if (!p.watch_list) return false;
            break;
        }
      }
    }
    return true;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, searchQuery, tagFilter, statFilters, textFilter]);

  // Sorting
  const sortedPersons = [...filteredPersons].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    let comparison = 0;

    if (sortField === 'last_seen_at' || sortField === 'first_seen_at' || sortField === 'session_observed_at') {
      const aDate = new Date(aValue as string).getTime();
      const bDate = new Date(bValue as string).getTime();
      comparison = aDate - bDate;
    } else if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Pagination
  const totalPages = Math.ceil(sortedPersons.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPersons = sortedPersons.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    document.querySelector('.users-content')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Build counts for Directory stats grid
  const directoryCounts: CountItem[] = [
    { id: 'all', label: 'All People', value: persons.length, color: 'default', clickable: false },
    { id: 'live', label: 'Live Now', value: persons.filter(p => isPersonLive(p)).length, color: 'red' },
    { id: 'with_image', label: 'With Images', value: persons.filter(p => p.image_url).length, color: 'primary' },
    { id: 'models', label: 'Models', value: persons.filter(p => p.role === 'MODEL').length, color: 'purple' },
    { id: 'viewers', label: 'Viewers', value: persons.filter(p => p.role === 'VIEWER').length, color: 'blue' },
    { id: 'following', label: 'Following', value: persons.filter(p => p.following).length, color: 'emerald' },
    { id: 'friends', label: 'Friends', value: persons.filter(p => p.friend_tier).length, color: 'yellow' },
    { id: 'watchlist', label: 'Watchlist', value: persons.filter(p => p.watch_list).length, color: 'orange' },
  ];

  // Build active filters array for display
  const activeFiltersArray: ActiveFilter[] = [
    ...Array.from(statFilters).map(f => ({
      id: f,
      label: f.replace('_', ' '),
      type: 'stat' as const,
    })),
    ...(textFilter ? [{ id: 'text', label: `"${textFilter}"`, type: 'text' as const }] : []),
    ...(tagFilter ? [{ id: 'tag', label: `#${tagFilter}`, type: 'tag' as const }] : []),
    ...(roleFilter !== 'ALL' ? [{ id: 'role', label: roleFilter, type: 'role' as const }] : []),
  ];

  const handleRemoveFilter = (filterId: string) => {
    if (filterId === 'text') {
      setTextFilter('');
    } else if (filterId === 'tag') {
      setTagFilter('');
    } else if (filterId === 'role') {
      setRoleFilter('ALL');
    } else {
      setStatFilters(prev => {
        const newFilters = new Set(prev);
        newFilters.delete(filterId as StatFilter);
        return newFilters;
      });
    }
  };

  // Directory columns with actions
  const directoryColumns = getDirectoryColumns(
    getPriorityLookup,
    handleAddToPriority,
    handleOnDemandLookup,
    handleDelete,
    lookupLoading
  );

  // Render Directory Tab
  const renderDirectoryTab = () => (
    <>
      {/* Filters Panel with Counts inside */}
      <FiltersPanel
        defaultExpanded={true}
        counts={directoryCounts}
        activeCountFilters={statFilters as Set<string>}
        onCountFilterToggle={(id) => handleStatClick(id as StatFilter)}
        tagPresets={TAG_PRESETS}
        activeTagPreset={tagFilter}
        onTagPresetSelect={setTagFilter}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        textFilterValue={textFilter}
        onTextFilterChange={setTextFilter}
        tagFilterValue={tagFilter}
        onTagFilterChange={setTagFilter}
        showRoleFilter={true}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        roleCounts={{
          all: persons.length,
          model: persons.filter(p => p.role === 'MODEL').length,
          viewer: persons.filter(p => p.role === 'VIEWER').length,
        }}
        className="mt-4"
      />

      {/* Active Filters Bar */}
      <ActiveFiltersBar
        filters={activeFiltersArray}
        resultCount={sortedPersons.length}
        onRemoveFilter={handleRemoveFilter}
        onClearAll={clearAllFilters}
        className="mt-4"
      />

      {/* Results Toolbar */}
      <ResultsToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sortOptions={DIRECTORY_SORT_OPTIONS}
        sortValue={`${sortField}-${sortDirection}`}
        onSortChange={(value) => {
          const [field, dir] = value.split('-') as [keyof BasePerson, 'asc' | 'desc'];
          setSortField(field);
          setSortDirection(dir);
        }}
        totalItems={sortedPersons.length}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCurrentPage(1);
        }}
        className="mt-4"
      />

      {/* Results */}
      {viewMode === 'grid' ? (
        <PeopleGrid
          data={paginatedPersons}
          loading={false}
          emptyMessage="No users found matching your filters."
          getPriorityLookup={getPriorityLookup}
          onTagClick={setTagFilter}
          className="mt-4"
        />
      ) : (
        <PeopleTable
          data={paginatedPersons}
          columns={directoryColumns}
          loading={false}
          emptyMessage="No users found matching your filters."
          sortField={String(sortField)}
          sortDirection={sortDirection}
          onSort={handleSort}
          onTagClick={setTagFilter}
          className="mt-4 users-content"
        />
      )}

      {/* Bottom Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={sortedPersons.length}
        startIndex={startIndex}
        endIndex={endIndex}
        onPageChange={handlePageChange}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCurrentPage(1);
        }}
      />
    </>
  );

  // Render Following Tab
  const renderFollowingTab = () => {
    const withImages = followingUsers.filter(p => p.image_url).length;
    const models = followingUsers.filter(p => p.role === 'MODEL').length;
    const viewers = followingUsers.filter(p => p.role === 'VIEWER').length;
    const unknown = followingUsers.length - models - viewers;
    const liveFollowing = followingUsers.filter(p => isPersonLive(p)).length;

    const filteredFollowing = followingUsers.filter(p => {
      switch (followingFilter) {
        case 'live': return isPersonLive(p);
        case 'with_image': return !!p.image_url;
        case 'models': return p.role === 'MODEL';
        case 'viewers': return p.role === 'VIEWER';
        case 'unknown': return p.role !== 'MODEL' && p.role !== 'VIEWER';
        default: return true;
      }
    });

    const followingCounts: CountItem[] = [
      { id: 'all', label: 'All', value: followingUsers.length, color: 'default' },
      { id: 'live', label: 'Live', value: liveFollowing, color: 'red' },
      { id: 'with_image', label: 'With Images', value: withImages, color: 'primary' },
      { id: 'models', label: 'Models', value: models, color: 'purple' },
      { id: 'viewers', label: 'Viewers', value: viewers, color: 'blue' },
      { id: 'unknown', label: 'Unknown', value: unknown, color: 'default' },
    ];

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Following ({followingUsers.length})</h2>
          <label className="px-4 py-2 bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30 rounded-lg cursor-pointer hover:bg-mhc-primary/30 transition-colors">
            <input type="file" accept=".html" onChange={handleUpdateFollowing} className="hidden" />
            Upload Following HTML
          </label>
        </div>

        {followingLoading ? (
          <div className="p-12 text-center text-white/50">Loading following users...</div>
        ) : (
          <>
            <FiltersPanel
              counts={followingCounts}
              activeCountFilters={new Set([followingFilter === 'all' ? '' : followingFilter])}
              onCountFilterToggle={(id) => setFollowingFilter(id === followingFilter ? 'all' : id as typeof followingFilter)}
            />

            <div className="flex items-center justify-between mt-4 mb-4">
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'list' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'grid' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
              </div>
              <span className="text-white/50 text-sm">{filteredFollowing.length} users</span>
            </div>

            {viewMode === 'grid' ? (
              <PeopleGrid data={filteredFollowing} onTagClick={setTagFilter} />
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Username</th>
                      <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Image</th>
                      <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Following Since</th>
                      <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFollowing.map((person) => (
                      <tr
                        key={person.id}
                        className="border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer"
                        onClick={() => navigate(`/profile/${person.username}`)}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                            <Link to={`/profile/${person.username}`} className="text-mhc-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                              {person.username}
                            </Link>
                            {isPersonLive(person) && (
                              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {person.image_url && (
                            <img src={getImageUrl(person.image_url) || ''} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
                          )}
                        </td>
                        <td className="px-4 py-4 text-white/80">{person.following_since ? formatDate(person.following_since, { includeTime: false }) : '—'}</td>
                        <td className="px-4 py-4 text-white/80">{getLastActiveTime(person) ? formatDate(getLastActiveTime(person)!, { relative: true }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredFollowing.length === 0 && (
                  <div className="p-12 text-center text-white/50">No following users found.</div>
                )}
              </div>
            )}
          </>
        )}
      </>
    );
  };

  // Render Followers Tab (similar structure to Following)
  const renderFollowersTab = () => {
    const withImages = followerUsers.filter(p => p.image_url).length;
    const models = followerUsers.filter(p => p.role === 'MODEL').length;
    const viewers = followerUsers.filter(p => p.role === 'VIEWER').length;
    const unknown = followerUsers.length - models - viewers;
    const liveFollowers = followerUsers.filter(p => isPersonLive(p)).length;

    const filteredFollowers = followerUsers.filter(p => {
      switch (followersFilter) {
        case 'live': return isPersonLive(p);
        case 'with_image': return !!p.image_url;
        case 'models': return p.role === 'MODEL';
        case 'viewers': return p.role === 'VIEWER';
        case 'unknown': return p.role !== 'MODEL' && p.role !== 'VIEWER';
        default: return true;
      }
    });

    const followerCounts: CountItem[] = [
      { id: 'all', label: 'All', value: followerUsers.length, color: 'default' },
      { id: 'live', label: 'Live', value: liveFollowers, color: 'red' },
      { id: 'with_image', label: 'With Images', value: withImages, color: 'primary' },
      { id: 'models', label: 'Models', value: models, color: 'purple' },
      { id: 'viewers', label: 'Viewers', value: viewers, color: 'blue' },
      { id: 'unknown', label: 'Unknown', value: unknown, color: 'default' },
    ];

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Followers ({followerUsers.length})</h2>
          <label className="px-4 py-2 bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30 rounded-lg cursor-pointer hover:bg-mhc-primary/30 transition-colors">
            <input type="file" accept=".html" onChange={handleUpdateFollowers} className="hidden" />
            Upload Followers HTML
          </label>
        </div>

        {followersLoading ? (
          <div className="p-12 text-center text-white/50">Loading followers...</div>
        ) : (
          <>
            <FiltersPanel
              counts={followerCounts}
              activeCountFilters={new Set([followersFilter === 'all' ? '' : followersFilter])}
              onCountFilterToggle={(id) => setFollowersFilter(id === followersFilter ? 'all' : id as typeof followersFilter)}
            />

            <div className="flex items-center justify-between mt-4 mb-4">
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'list' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'grid' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
              </div>
              <span className="text-white/50 text-sm">{filteredFollowers.length} users</span>
            </div>

            {viewMode === 'grid' ? (
              <PeopleGrid data={filteredFollowers} onTagClick={setTagFilter} />
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Username</th>
                      <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Image</th>
                      <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Follower Since</th>
                      <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-mhc-primary/30">Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFollowers.map((person) => (
                      <tr
                        key={person.id}
                        className="border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer"
                        onClick={() => navigate(`/profile/${person.username}`)}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                            <Link to={`/profile/${person.username}`} className="text-mhc-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                              {person.username}
                            </Link>
                            {isPersonLive(person) && (
                              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {person.image_url && (
                            <img src={getImageUrl(person.image_url) || ''} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
                          )}
                        </td>
                        <td className="px-4 py-4 text-white/80">{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '—'}</td>
                        <td className="px-4 py-4 text-white/80">{getLastActiveTime(person) ? formatDate(getLastActiveTime(person)!, { relative: true }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredFollowers.length === 0 && (
                  <div className="p-12 text-center text-white/50">No followers found.</div>
                )}
              </div>
            )}
          </>
        )}
      </>
    );
  };

  // Render Friends Tab with FiltersPanel
  const renderFriendsTab = () => {
    const friendsColumns = getFriendsColumns();

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Friends ({friendUsers.length})</h2>
        </div>

        <FiltersPanel
          customFilters={
            <div className="flex gap-2">
              <button
                className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                  friendTierFilter === null ? 'bg-gradient-primary text-white border-transparent' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                }`}
                onClick={() => setFriendTierFilter(null)}
              >
                All
              </button>
              {[1, 2, 3, 4].map(tier => {
                const badge = getFriendTierBadge(tier);
                return (
                  <button
                    key={tier}
                    className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                      friendTierFilter === tier ? badge?.class || '' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                    }`}
                    onClick={() => setFriendTierFilter(tier)}
                  >
                    Tier {tier} - {badge?.label}
                  </button>
                );
              })}
            </div>
          }
        />

        {friendsLoading ? (
          <div className="p-12 text-center text-white/50">Loading friends...</div>
        ) : (
          <>
            <div className="flex items-center justify-between mt-4 mb-4">
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'list' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'grid' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
              </div>
              <span className="text-white/50 text-sm">{friendUsers.length} friends</span>
            </div>

            {viewMode === 'grid' ? (
              <PeopleGrid data={friendUsers} onTagClick={setTagFilter} />
            ) : (
              <PeopleTable
                data={friendUsers}
                columns={friendsColumns}
                emptyMessage="No friends found."
                emptySubMessage="Add friend tiers on user profiles."
              />
            )}
          </>
        )}
      </>
    );
  };

  // Render Subs Tab with FiltersPanel
  const renderSubsTab = () => {
    const subsColumns = getSubsColumns();

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Subs ({subUsers.length})</h2>
        </div>

        <FiltersPanel
          customFilters={
            <div className="flex gap-2">
              {['all', 'active', 'inactive'].map(filter => (
                <button
                  key={filter}
                  className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all capitalize ${
                    subsFilter === filter ? 'bg-gradient-primary text-white border-transparent' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                  onClick={() => setSubsFilter(filter as typeof subsFilter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          }
        />

        {subsLoading ? (
          <div className="p-12 text-center text-white/50">Loading subs...</div>
        ) : (
          <>
            <div className="flex items-center justify-between mt-4 mb-4">
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'list' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'grid' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
              </div>
              <span className="text-white/50 text-sm">{subUsers.length} subs</span>
            </div>

            {viewMode === 'grid' ? (
              <PeopleGrid data={subUsers} onTagClick={setTagFilter} />
            ) : (
              <PeopleTable
                data={subUsers}
                columns={subsColumns}
                emptyMessage="No subscribers found."
              />
            )}
          </>
        )}
      </>
    );
  };

  // Render Doms Tab with FiltersPanel
  const renderDomsTab = () => {
    const domsColumns = getDomsColumns();
    const domLevels = ['all', 'Potential', 'Actively Serving', 'Ended', 'Paused'];

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Doms ({domUsers.length})</h2>
        </div>

        <FiltersPanel
          customFilters={
            <div className="flex gap-2">
              {domLevels.map(level => (
                <button
                  key={level}
                  className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                    domsFilter === level ? 'bg-gradient-primary text-white border-transparent' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                  onClick={() => setDomsFilter(level)}
                >
                  {level === 'all' ? 'All' : level}
                </button>
              ))}
            </div>
          }
        />

        {domsLoading ? (
          <div className="p-12 text-center text-white/50">Loading doms...</div>
        ) : (
          <>
            <div className="flex items-center justify-between mt-4 mb-4">
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'list' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
                <button
                  className={`px-3 py-2 text-sm transition-all ${viewMode === 'grid' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
              </div>
              <span className="text-white/50 text-sm">{domUsers.length} doms</span>
            </div>

            {viewMode === 'grid' ? (
              <PeopleGrid data={domUsers} onTagClick={setTagFilter} />
            ) : (
              <PeopleTable
                data={domUsers}
                columns={domsColumns}
                emptyMessage="No doms found."
                emptySubMessage="Add Dom relationships from the profile page."
              />
            )}
          </>
        )}
      </>
    );
  };

  // Render Unfollowed Tab
  const renderUnfollowedTab = () => {
    const filteredUnfollowed = unfollowedUsers.filter(u => {
      if (!u.unfollower_at) return false;
      const unfollowDate = new Date(u.unfollower_at);
      const daysAgo = (Date.now() - unfollowDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= timeframeFilter;
    });

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Unfollowed ({filteredUnfollowed.length})</h2>
        </div>

        <FiltersPanel
          customFilters={
            <div className="flex gap-2 items-center">
              <span className="text-white/70 text-sm">Show unfollowed in last:</span>
              {[7, 14, 30, 60, 90].map(days => (
                <button
                  key={days}
                  className={`px-3 py-1.5 rounded-md text-sm cursor-pointer transition-all ${
                    timeframeFilter === days ? 'bg-gradient-primary text-white' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                  onClick={() => setTimeframeFilter(days)}
                >
                  {days} days
                </button>
              ))}
            </div>
          }
        />

        {unfollowedLoading ? (
          <div className="p-12 text-center text-white/50">Loading unfollowed users...</div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden mt-4">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-gray-500/30">Username</th>
                  <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-gray-500/30">Image</th>
                  <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-gray-500/30">Follower Since</th>
                  <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-gray-500/30">Unfollowed At</th>
                  <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-gray-500/30">Days Followed</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnfollowed.map((person) => (
                  <tr
                    key={person.id}
                    className="border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer"
                    onClick={() => navigate(`/profile/${person.username}`)}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                        <Link to={`/profile/${person.username}`} className="text-mhc-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {person.username}
                        </Link>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {person.image_url && (
                        <img src={getImageUrl(person.image_url) || ''} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
                      )}
                    </td>
                    <td className="px-4 py-4 text-white/80">{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '—'}</td>
                    <td className="px-4 py-4 text-white/80">{person.unfollower_at ? formatDate(person.unfollower_at, { includeTime: false }) : '—'}</td>
                    <td className="px-4 py-4 text-white/80">{person.days_followed || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUnfollowed.length === 0 && (
              <div className="p-12 text-center text-white/50">No unfollowed users in this timeframe.</div>
            )}
          </div>
        )}
      </>
    );
  };

  // Render Bans Tab
  const renderBansTab = () => (
    <>
      <div className="flex justify-between items-center my-6">
        <h2 className="text-2xl text-white font-semibold">Bans ({bannedUsers.length})</h2>
      </div>

      {bansLoading ? (
        <div className="p-12 text-center text-white/50">Loading banned users...</div>
      ) : (
        <>
          <div className="flex items-center justify-between mt-4 mb-4">
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button
                className={`px-3 py-2 text-sm transition-all ${viewMode === 'list' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
              <button
                className={`px-3 py-2 text-sm transition-all ${viewMode === 'grid' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                onClick={() => setViewMode('grid')}
              >
                Grid
              </button>
            </div>
            <span className="text-white/50 text-sm">{bannedUsers.length} users who banned you</span>
          </div>

          {viewMode === 'grid' ? (
            <PeopleGrid data={bannedUsers} onTagClick={setTagFilter} />
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-red-500/30">Username</th>
                    <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-red-500/30">Image</th>
                    <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-red-500/30">Banned At</th>
                    <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-red-500/30">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {bannedUsers.map((person) => (
                    <tr
                      key={person.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer"
                      onClick={() => navigate(`/profile/${person.username}`)}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                          <Link to={`/profile/${person.username}`} className="text-mhc-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {person.username}
                          </Link>
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">Banned</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {person.image_url && (
                          <img src={getImageUrl(person.image_url) || ''} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
                        )}
                      </td>
                      <td className="px-4 py-4 text-white/80">{person.banned_at ? formatDate(person.banned_at, { includeTime: false }) : '—'}</td>
                      <td className="px-4 py-4 text-white/70 max-w-[200px] truncate">{person.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bannedUsers.length === 0 && (
                <div className="p-12 text-center text-white/50">No banned users found.</div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );

  // Render Watchlist Tab
  const renderWatchlistTab = () => (
    <>
      <div className="flex justify-between items-center my-6">
        <h2 className="text-2xl text-white font-semibold">Watchlist ({watchlistUsers.length})</h2>
      </div>

      {watchlistLoading ? (
        <div className="p-12 text-center text-white/50">Loading watchlist...</div>
      ) : (
        <>
          <div className="flex items-center justify-between mt-4 mb-4">
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button
                className={`px-3 py-2 text-sm transition-all ${viewMode === 'list' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
              <button
                className={`px-3 py-2 text-sm transition-all ${viewMode === 'grid' ? 'bg-gradient-primary text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                onClick={() => setViewMode('grid')}
              >
                Grid
              </button>
            </div>
            <span className="text-white/50 text-sm">{watchlistUsers.length} users on watchlist</span>
          </div>

          {viewMode === 'grid' ? (
            <PeopleGrid data={watchlistUsers} onTagClick={setTagFilter} />
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-orange-500/30">Username</th>
                    <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-orange-500/30">Image</th>
                    <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-orange-500/30">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlistUsers.map((person) => (
                    <tr
                      key={person.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer"
                      onClick={() => navigate(`/profile/${person.username}`)}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                          <Link to={`/profile/${person.username}`} className="text-mhc-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {person.username}
                          </Link>
                          {isPersonLive(person) && (
                            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {person.image_url && (
                          <img src={getImageUrl(person.image_url) || ''} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
                        )}
                      </td>
                      <td className="px-4 py-4 text-white/80">{getLastActiveTime(person) ? formatDate(getLastActiveTime(person)!, { relative: true }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {watchlistUsers.length === 0 && (
                <div className="p-12 text-center text-white/50">No users on watchlist.</div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );

  // Render Tipped By Me Tab
  const renderTippedByMeTab = () => (
    <>
      <div className="flex justify-between items-center my-6">
        <h2 className="text-2xl text-white font-semibold">Tipped By Me ({tippedByMeUsers.length})</h2>
      </div>

      {tippedByMeLoading ? (
        <div className="p-12 text-center text-white/50">Loading users you tipped...</div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-amber-500/30">Username</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-amber-500/30">Image</th>
                <th className="px-4 py-4 text-center font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-amber-500/30">Total Tokens</th>
                <th className="px-4 py-4 text-center font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-amber-500/30">Tip Count</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-amber-500/30">Last Tip</th>
              </tr>
            </thead>
            <tbody>
              {tippedByMeUsers.map((person) => (
                <tr
                  key={person.id}
                  className="border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer"
                  onClick={() => navigate(`/profile/${person.username}`)}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                      <Link to={`/profile/${person.username}`} className="text-mhc-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {person.username}
                      </Link>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {person.image_url && (
                      <img src={getImageUrl(person.image_url) || ''} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
                    )}
                  </td>
                  <td className="px-4 py-4 text-center font-mono text-amber-400">{formatNumber(person.total_tokens || 0)}</td>
                  <td className="px-4 py-4 text-center text-white/80">{person.tip_count || 0}</td>
                  <td className="px-4 py-4 text-white/80">{person.last_tip_date ? formatDate(person.last_tip_date, { relative: true }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tippedByMeUsers.length === 0 && (
            <div className="p-12 text-center text-white/50">No tip records found.</div>
          )}
        </div>
      )}
    </>
  );

  // Render Tipped Me Tab
  const renderTippedMeTab = () => (
    <>
      <div className="flex justify-between items-center my-6">
        <h2 className="text-2xl text-white font-semibold">Tipped Me ({tippedMeUsers.length})</h2>
      </div>

      {tippedMeLoading ? (
        <div className="p-12 text-center text-white/50">Loading users who tipped you...</div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-emerald-500/30">Username</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-emerald-500/30">Image</th>
                <th className="px-4 py-4 text-center font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-emerald-500/30">Total Tokens</th>
                <th className="px-4 py-4 text-center font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-emerald-500/30">Tip Count</th>
                <th className="px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide bg-[#1e2536] border-b-2 border-emerald-500/30">Last Tip</th>
              </tr>
            </thead>
            <tbody>
              {tippedMeUsers.map((person) => (
                <tr
                  key={person.id}
                  className="border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer"
                  onClick={() => navigate(`/profile/${person.username}`)}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                      <Link to={`/profile/${person.username}`} className="text-mhc-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {person.username}
                      </Link>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {person.image_url && (
                      <img src={getImageUrl(person.image_url) || ''} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
                    )}
                  </td>
                  <td className="px-4 py-4 text-center font-mono text-emerald-400">{formatNumber(person.total_tokens || 0)}</td>
                  <td className="px-4 py-4 text-center text-white/80">{person.tip_count || 0}</td>
                  <td className="px-4 py-4 text-white/80">{person.last_tip_date ? formatDate(person.last_tip_date, { relative: true }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tippedMeUsers.length === 0 && (
            <div className="p-12 text-center text-white/50">No tip records found.</div>
          )}
        </div>
      )}
    </>
  );

  // Main render
  return (
    <PeopleLayout
      activeSegment={activeTab}
      onSegmentChange={setActiveTab}
      error={error}
      loading={loading && activeTab === 'directory'}
    >
      {/* Tab Content */}
      {activeTab === 'directory' && renderDirectoryTab()}
      {activeTab === 'following' && renderFollowingTab()}
      {activeTab === 'followers' && renderFollowersTab()}
      {activeTab === 'unfollowed' && renderUnfollowedTab()}
      {activeTab === 'subs' && renderSubsTab()}
      {activeTab === 'doms' && renderDomsTab()}
      {activeTab === 'friends' && renderFriendsTab()}
      {activeTab === 'bans' && renderBansTab()}
      {activeTab === 'watchlist' && renderWatchlistTab()}
      {activeTab === 'tipped-by-me' && renderTippedByMeTab()}
      {activeTab === 'tipped-me' && renderTippedMeTab()}

      {/* Priority Queue Modal */}
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
    </PeopleLayout>
  );
};

export default Users;
