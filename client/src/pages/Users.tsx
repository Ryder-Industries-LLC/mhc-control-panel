import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import {
  BasePerson,
  FollowingPerson,
  FollowerPerson,
  UnfollowedPerson,
  BannedPerson,
  TipperPerson,
  TabType,
  StatFilter,
  PriorityLookup,
  ActiveFilter,
  RelationshipPerson,
  RelationshipListItem,
  RelationshipStatus,
  TAG_PRESETS,
  DIRECTORY_SORT_OPTIONS,
  isPersonLive,
  buildStandardCounts,
  formatNumber,
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
  getRelationshipColumns,
  getFollowingColumns,
  getFollowersColumns,
  getUnfollowedColumns,
  getBansColumns,
  getWatchlistColumns,
  getTippedByMeColumns,
  getTippedMeColumns,
} from '../components/people';

const Users: React.FC = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('directory');

  // Directory tab state
  const [persons, setPersons] = useState<BasePerson[]>([]);
  const [priorityLookups, setPriorityLookups] = useState<PriorityLookup[]>([]);
  const [, setCacheStatus] = useState<{ lastUpdated: string } | null>(null);
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
  const [, setUsernameSuggestions] = useState<string[]>([]);

  // Standard filter type used across tabs
  type StandardFilter = 'all' | 'live' | 'with_image' | 'with_videos' | 'with_rating' | 'models' | 'viewers' | 'following' | 'friends' | 'watchlist';

  // Following tab state
  const [followingUsers, setFollowingUsers] = useState<FollowingPerson[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [, setFollowingStats] = useState<any>(null);
  const [followingFilter, setFollowingFilter] = useState<StandardFilter>('all');

  // Followers tab state
  const [followerUsers, setFollowerUsers] = useState<FollowerPerson[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [, setFollowersStats] = useState<any>(null);
  const [followersFilter, setFollowersFilter] = useState<StandardFilter>('all');

  // Unfollowed tab state
  const [unfollowedUsers, setUnfollowedUsers] = useState<UnfollowedPerson[]>([]);
  const [unfollowedLoading, setUnfollowedLoading] = useState(false);
  const [timeframeFilter, setTimeframeFilter] = useState<number>(30);

  // Unified Relationships state (Friends/Subs/Doms use same data structure)
  const [relationshipUsers, setRelationshipUsers] = useState<RelationshipPerson[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [relationshipStatusFilter, setRelationshipStatusFilter] = useState<RelationshipStatus | 'all'>('all');

  // Bans tab state
  const [bannedUsers, setBannedUsers] = useState<BannedPerson[]>([]);
  const [bansLoading, setBansLoading] = useState(false);

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
    } else if (activeTab === 'subs' || activeTab === 'doms' || activeTab === 'friends') {
      loadRelationships();
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

  // Reload relationships when status filter changes
  useEffect(() => {
    if (activeTab === 'subs' || activeTab === 'doms' || activeTab === 'friends') {
      loadRelationships();
    }
  }, [relationshipStatusFilter]);

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

  // Unified relationships loader - fetches from /api/relationship/list
  const loadRelationships = async () => {
    try {
      setRelationshipsLoading(true);
      setError(null);

      // Build query params
      const params = new URLSearchParams();
      if (relationshipStatusFilter !== 'all') {
        params.append('status', relationshipStatusFilter);
      }
      // Fetch all relationship types at once, filter by role on client side
      params.append('limit', '500');

      const response = await fetch(`/api/relationship/list?${params.toString()}`);
      const data = await response.json();

      // Map API response to RelationshipPerson format
      const users: RelationshipPerson[] = (data.items || []).map((item: RelationshipListItem) => ({
        ...item.person,
        relationship: item.relationship,
      }));

      setRelationshipUsers(users);
    } catch (err) {
      setError('Failed to load relationships');
      console.error(err);
    } finally {
      setRelationshipsLoading(false);
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

  const handleRatingChange = async (username: string, newRating: number) => {
    try {
      await fetch(`/api/profile/${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating }),
      });
      // Update local state
      setPersons(persons.map(p =>
        p.username === username ? { ...p, rating: newRating } : p
      ));
    } catch (err) {
      console.error('Failed to update rating:', err);
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
          case 'with_videos':
            if (!p.has_videos) return false;
            break;
          case 'with_rating':
            if (!p.rating || p.rating === 0) return false;
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

  // Build counts for Directory stats grid (using standard 8-filter set)
  const directoryCounts = buildStandardCounts(persons);

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
    lookupLoading,
    handleRatingChange
  );

  // Render Directory Tab
  const renderDirectoryTab = () => (
    <>
      <div className="flex justify-between items-center my-6">
        <h2 className="text-2xl text-white font-semibold">People ({formatNumber(persons.length)})</h2>
      </div>

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
          onRatingChange={handleRatingChange}
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
    // Use standard 8-filter set
    const followingCounts = buildStandardCounts(followingUsers, { allLabel: 'All Following' });

    // Apply active filter
    const filteredFollowing = followingUsers.filter(p => {
      switch (followingFilter) {
        case 'live': return isPersonLive(p);
        case 'with_image': return !!p.image_url;
        case 'with_videos': return !!p.has_videos;
        case 'with_rating': return (p.rating || 0) > 0;
        case 'models': return p.role === 'MODEL';
        case 'viewers': return p.role === 'VIEWER';
        case 'following': return p.following;
        case 'friends': return !!p.friend_tier;
        case 'watchlist': return p.watch_list;
        default: return true;
      }
    });

    const followingColumns = getFollowingColumns();

    const activeFilters: ActiveFilter[] = followingFilter !== 'all'
      ? [{ id: followingFilter, label: followingFilter.replace('_', ' '), type: 'stat' as const }]
      : [];

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Following ({formatNumber(followingUsers.length)})</h2>
          <label className="px-4 py-2 bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30 rounded-lg cursor-pointer hover:bg-mhc-primary/30 transition-colors">
            <input type="file" accept=".html" onChange={handleUpdateFollowing} className="hidden" />
            Upload Following HTML
          </label>
        </div>

        <FiltersPanel
          counts={followingCounts}
          activeCountFilters={new Set([followingFilter === 'all' ? '' : followingFilter])}
          onCountFilterToggle={(id) => setFollowingFilter(id === followingFilter ? 'all' : id as typeof followingFilter)}
        />

        <ActiveFiltersBar
          filters={activeFilters}
          resultCount={filteredFollowing.length}
          onRemoveFilter={() => setFollowingFilter('all')}
          onClearAll={() => setFollowingFilter('all')}
          className="mt-4"
        />

        <ResultsToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          totalItems={filteredFollowing.length}
          className="mt-4"
        />

        {followingLoading ? (
          <div className="p-12 text-center text-white/50">Loading following users...</div>
        ) : viewMode === 'grid' ? (
          <PeopleGrid data={filteredFollowing} onTagClick={setTagFilter} onRatingChange={handleRatingChange} className="mt-4" />
        ) : (
          <PeopleTable
            data={filteredFollowing}
            columns={followingColumns}
            emptyMessage="No following users found."
            className="mt-4"
          />
        )}
      </>
    );
  };

  // Render Followers Tab
  const renderFollowersTab = () => {
    // Use standard 8-filter set
    const followerCounts = buildStandardCounts(followerUsers, { allLabel: 'All Followers' });

    // Apply active filter
    const filteredFollowers = followerUsers.filter(p => {
      switch (followersFilter) {
        case 'live': return isPersonLive(p);
        case 'with_image': return !!p.image_url;
        case 'with_videos': return !!p.has_videos;
        case 'with_rating': return (p.rating || 0) > 0;
        case 'models': return p.role === 'MODEL';
        case 'viewers': return p.role === 'VIEWER';
        case 'following': return p.following;
        case 'friends': return !!p.friend_tier;
        case 'watchlist': return p.watch_list;
        default: return true;
      }
    });

    const followersColumns = getFollowersColumns();

    const activeFilters: ActiveFilter[] = followersFilter !== 'all'
      ? [{ id: followersFilter, label: followersFilter.replace('_', ' '), type: 'stat' as const }]
      : [];

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Followers ({formatNumber(followerUsers.length)})</h2>
          <label className="px-4 py-2 bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30 rounded-lg cursor-pointer hover:bg-mhc-primary/30 transition-colors">
            <input type="file" accept=".html" onChange={handleUpdateFollowers} className="hidden" />
            Upload Followers HTML
          </label>
        </div>

        <FiltersPanel
          counts={followerCounts}
          activeCountFilters={new Set([followersFilter === 'all' ? '' : followersFilter])}
          onCountFilterToggle={(id) => setFollowersFilter(id === followersFilter ? 'all' : id as typeof followersFilter)}
        />

        <ActiveFiltersBar
          filters={activeFilters}
          resultCount={filteredFollowers.length}
          onRemoveFilter={() => setFollowersFilter('all')}
          onClearAll={() => setFollowersFilter('all')}
          className="mt-4"
        />

        <ResultsToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          totalItems={filteredFollowers.length}
          className="mt-4"
        />

        {followersLoading ? (
          <div className="p-12 text-center text-white/50">Loading followers...</div>
        ) : viewMode === 'grid' ? (
          <PeopleGrid data={filteredFollowers} onTagClick={setTagFilter} onRatingChange={handleRatingChange} className="mt-4" />
        ) : (
          <PeopleTable
            data={filteredFollowers}
            columns={followersColumns}
            emptyMessage="No followers found."
            className="mt-4"
          />
        )}
      </>
    );
  };

  // Unified Relationships Tab renderer - used by Friends, Subs, and Doms tabs
  const renderRelationshipsTab = (roleFilter: 'Friend' | 'Sub' | 'Dom') => {
    const columns = getRelationshipColumns();

    // Filter users by role
    const filteredUsers = relationshipUsers.filter(u =>
      u.relationship?.roles?.includes(roleFilter)
    );

    // Build standard counts for this role's users
    const relationshipCounts = buildStandardCounts(filteredUsers, { allLabel: `All ${roleFilter}s` });

    // Further filter by status if needed
    const displayUsers = relationshipStatusFilter === 'all'
      ? filteredUsers
      : filteredUsers.filter(u => u.relationship?.status === relationshipStatusFilter);

    const statusOptions: RelationshipStatus[] = [
      'Active', 'Potential', 'Occasional', 'On Hold', 'Inactive', 'Decommissioned', 'Banished'
    ];

    const activeFilters: ActiveFilter[] = relationshipStatusFilter !== 'all'
      ? [{ id: relationshipStatusFilter, label: relationshipStatusFilter, type: 'stat' as const }]
      : [];

    const roleLabels = { Friend: 'Friends', Sub: 'Subs', Dom: 'Doms' };
    const label = roleLabels[roleFilter];

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">{label} ({formatNumber(displayUsers.length)})</h2>
        </div>

        <FiltersPanel
          counts={relationshipCounts}
          activeCountFilters={new Set()}
          onCountFilterToggle={() => {}}
          customFilters={
            <div className="flex gap-2 flex-wrap">
              <span className="text-white/50 text-sm self-center mr-2">Status:</span>
              <button
                className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                  relationshipStatusFilter === 'all' ? 'bg-gradient-primary text-white border-transparent' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                }`}
                onClick={() => setRelationshipStatusFilter('all')}
              >
                All
              </button>
              {statusOptions.map(status => (
                <button
                  key={status}
                  className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                    relationshipStatusFilter === status ? 'bg-gradient-primary text-white border-transparent' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                  onClick={() => setRelationshipStatusFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>
          }
        />

        <ActiveFiltersBar
          filters={activeFilters}
          resultCount={displayUsers.length}
          onRemoveFilter={() => setRelationshipStatusFilter('all')}
          onClearAll={() => setRelationshipStatusFilter('all')}
          className="mt-4"
        />

        <ResultsToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          totalItems={displayUsers.length}
          className="mt-4"
        />

        {relationshipsLoading ? (
          <div className="p-12 text-center text-white/50">Loading {label.toLowerCase()}...</div>
        ) : viewMode === 'grid' ? (
          <PeopleGrid data={displayUsers} onTagClick={setTagFilter} onRatingChange={handleRatingChange} className="mt-4" />
        ) : (
          <PeopleTable
            data={displayUsers}
            columns={columns}
            emptyMessage={`No ${label.toLowerCase()} found.`}
            emptySubMessage="Create relationships from user profile pages."
            className="mt-4"
          />
        )}
      </>
    );
  };

  // Wrapper functions for each tab - all use the unified relationship renderer
  const renderFriendsTab = () => renderRelationshipsTab('Friend');
  const renderSubsTab = () => renderRelationshipsTab('Sub');

  const renderDomsTab = () => renderRelationshipsTab('Dom');

  // Render Unfollowed Tab
  const renderUnfollowedTab = () => {
    const filteredUnfollowed = unfollowedUsers.filter(u => {
      if (!u.unfollower_at) return false;
      const unfollowDate = new Date(u.unfollower_at);
      const daysAgo = (Date.now() - unfollowDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= timeframeFilter;
    });

    // Build standard counts for unfollowed users
    const unfollowedCounts = buildStandardCounts(filteredUnfollowed, { allLabel: 'All Unfollowed' });
    const unfollowedColumns = getUnfollowedColumns();

    const activeFilters: ActiveFilter[] = [
      { id: `days-${timeframeFilter}`, label: `Last ${timeframeFilter} days`, type: 'stat' as const }
    ];

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Unfollowed ({formatNumber(filteredUnfollowed.length)})</h2>
        </div>

        <FiltersPanel
          counts={unfollowedCounts}
          activeCountFilters={new Set()}
          onCountFilterToggle={() => {}}
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

        <ActiveFiltersBar
          filters={activeFilters}
          resultCount={filteredUnfollowed.length}
          onRemoveFilter={() => setTimeframeFilter(30)}
          onClearAll={() => setTimeframeFilter(30)}
          className="mt-4"
        />

        <ResultsToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          totalItems={filteredUnfollowed.length}
          className="mt-4"
        />

        {unfollowedLoading ? (
          <div className="p-12 text-center text-white/50">Loading unfollowed users...</div>
        ) : viewMode === 'grid' ? (
          <PeopleGrid data={filteredUnfollowed} onTagClick={setTagFilter} onRatingChange={handleRatingChange} className="mt-4" />
        ) : (
          <PeopleTable
            data={filteredUnfollowed}
            columns={unfollowedColumns}
            emptyMessage="No unfollowed users in this timeframe."
            className="mt-4"
          />
        )}
      </>
    );
  };

  // Render Bans Tab
  const renderBansTab = () => {
    const bansCounts = buildStandardCounts(bannedUsers, { allLabel: 'All Banned' });
    const bansColumns = getBansColumns();

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Bans ({formatNumber(bannedUsers.length)})</h2>
        </div>

        <FiltersPanel
          counts={bansCounts}
          activeCountFilters={new Set()}
          onCountFilterToggle={() => {}}
        />

        <ActiveFiltersBar
          filters={[]}
          resultCount={bannedUsers.length}
          onRemoveFilter={() => {}}
          onClearAll={() => {}}
          className="mt-4"
        />

        <ResultsToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          totalItems={bannedUsers.length}
          className="mt-4"
        />

        {bansLoading ? (
          <div className="p-12 text-center text-white/50">Loading banned users...</div>
        ) : viewMode === 'grid' ? (
          <PeopleGrid data={bannedUsers} onTagClick={setTagFilter} onRatingChange={handleRatingChange} className="mt-4" />
        ) : (
          <PeopleTable
            data={bannedUsers}
            columns={bansColumns}
            emptyMessage="No banned users found."
            className="mt-4"
          />
        )}
      </>
    );
  };

  // Render Watchlist Tab
  const renderWatchlistTab = () => {
    const watchlistCounts = buildStandardCounts(watchlistUsers, { allLabel: 'All Watchlist' });
    const watchlistColumns = getWatchlistColumns();

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Watchlist ({formatNumber(watchlistUsers.length)})</h2>
        </div>

        <FiltersPanel
          counts={watchlistCounts}
          activeCountFilters={new Set()}
          onCountFilterToggle={() => {}}
        />

        <ActiveFiltersBar
          filters={[]}
          resultCount={watchlistUsers.length}
          onRemoveFilter={() => {}}
          onClearAll={() => {}}
          className="mt-4"
        />

        <ResultsToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          totalItems={watchlistUsers.length}
          className="mt-4"
        />

        {watchlistLoading ? (
          <div className="p-12 text-center text-white/50">Loading watchlist...</div>
        ) : viewMode === 'grid' ? (
          <PeopleGrid data={watchlistUsers} onTagClick={setTagFilter} onRatingChange={handleRatingChange} className="mt-4" />
        ) : (
          <PeopleTable
            data={watchlistUsers}
            columns={watchlistColumns}
            emptyMessage="No users on watchlist."
            className="mt-4"
          />
        )}
      </>
    );
  };

  // Render Tipped By Me Tab
  const renderTippedByMeTab = () => {
    const tippedByMeCounts = buildStandardCounts(tippedByMeUsers, { allLabel: 'All Tipped' });
    const tippedByMeColumns = getTippedByMeColumns();

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Tipped By Me ({formatNumber(tippedByMeUsers.length)})</h2>
        </div>

        <FiltersPanel
          counts={tippedByMeCounts}
          activeCountFilters={new Set()}
          onCountFilterToggle={() => {}}
        />

        <ActiveFiltersBar
          filters={[]}
          resultCount={tippedByMeUsers.length}
          onRemoveFilter={() => {}}
          onClearAll={() => {}}
          className="mt-4"
        />

        <ResultsToolbar
          viewMode="list"
          onViewModeChange={() => {}}
          totalItems={tippedByMeUsers.length}
          showViewToggle={false}
          className="mt-4"
        />

        {tippedByMeLoading ? (
          <div className="p-12 text-center text-white/50">Loading users you tipped...</div>
        ) : (
          <PeopleTable
            data={tippedByMeUsers}
            columns={tippedByMeColumns}
            emptyMessage="No tip records found."
            className="mt-4"
          />
        )}
      </>
    );
  };

  // Render Tipped Me Tab
  const renderTippedMeTab = () => {
    const tippedMeCounts = buildStandardCounts(tippedMeUsers, { allLabel: 'All Tippers' });
    const tippedMeColumns = getTippedMeColumns();

    return (
      <>
        <div className="flex justify-between items-center my-6">
          <h2 className="text-2xl text-white font-semibold">Tipped Me ({formatNumber(tippedMeUsers.length)})</h2>
        </div>

        <FiltersPanel
          counts={tippedMeCounts}
          activeCountFilters={new Set()}
          onCountFilterToggle={() => {}}
        />

        <ActiveFiltersBar
          filters={[]}
          resultCount={tippedMeUsers.length}
          onRemoveFilter={() => {}}
          onClearAll={() => {}}
          className="mt-4"
        />

        <ResultsToolbar
          viewMode="list"
          onViewModeChange={() => {}}
          totalItems={tippedMeUsers.length}
          showViewToggle={false}
          className="mt-4"
        />

        {tippedMeLoading ? (
          <div className="p-12 text-center text-white/50">Loading users who tipped you...</div>
        ) : (
          <PeopleTable
            data={tippedMeUsers}
            columns={tippedMeColumns}
            emptyMessage="No tip records found."
            className="mt-4"
          />
        )}
      </>
    );
  };

  // Main render
  return (
    <PeopleLayout
      title={`People (${persons.length.toLocaleString()})`}
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
