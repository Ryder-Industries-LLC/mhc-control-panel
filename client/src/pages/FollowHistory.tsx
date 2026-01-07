import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CollapsibleSection as CollapsibleSectionComponent } from '../components/CollapsibleSection';

interface FollowHistoryRecord {
  id: string;
  person_id: string;
  username: string;
  direction: 'following' | 'follower';
  action: 'follow' | 'unfollow';
  source: 'events_api' | 'profile_scrape' | 'list_scrape' | 'manual_import';
  event_id: string | null;
  created_at: string;
}

interface HistoryStats {
  totalFollows: number;
  totalUnfollows: number;
  followingFollows: number;
  followingUnfollows: number;
  followerFollows: number;
  followerUnfollows: number;
}

// Follower Trends interfaces (moved from Admin)
interface TopMover {
  person_id: string;
  username: string;
  total_change: number;
  current_count: number | null;
}

interface RecentChange {
  id: string;
  username: string;
  follower_count: number;
  delta: number;
  source: string;
  recorded_at: string;
}

interface FollowerTrendsDashboard {
  totalTracked: number;
  totalWithChanges: number;
  topGainers: TopMover[];
  topLosers: TopMover[];
  recentChanges: RecentChange[];
}

type SortField = 'username' | 'action' | 'source' | 'created_at';
type SortDirection = 'asc' | 'desc';

const RECENT_CHANGES_PER_PAGE = 20;

const FollowHistory: React.FC = () => {
  const [followingHistory, setFollowingHistory] = useState<FollowHistoryRecord[]>([]);
  const [followerHistory, setFollowerHistory] = useState<FollowHistoryRecord[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followingExpanded, setFollowingExpanded] = useState(false);
  const [followerExpanded, setFollowerExpanded] = useState(false);

  // Follower Trends state (moved from Admin)
  const [followerTrends, setFollowerTrends] = useState<FollowerTrendsDashboard | null>(null);
  const [trendsDays, setTrendsDays] = useState(30);
  const [recentChangesPage, setRecentChangesPage] = useState(0);
  const [trendsLoading, setTrendsLoading] = useState(false);

  // Sorting state for each section
  const [followingSortField, setFollowingSortField] = useState<SortField>('created_at');
  const [followingSortDir, setFollowingSortDir] = useState<SortDirection>('desc');
  const [followerSortField, setFollowerSortField] = useState<SortField>('created_at');
  const [followerSortDir, setFollowerSortDir] = useState<SortDirection>('desc');

  // Filter state
  const [usernameFilter, setUsernameFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'follow' | 'unfollow'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'events_api' | 'profile_scrape' | 'list_scrape' | 'manual_import'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  // Load follower trends when trendsDays changes
  useEffect(() => {
    loadFollowerTrends();
  }, [trendsDays]);

  const loadFollowerTrends = async () => {
    try {
      setTrendsLoading(true);
      const res = await fetch(`/api/followers/trends?days=${trendsDays}`);
      if (res.ok) {
        const data = await res.json();
        setFollowerTrends(data);
        setRecentChangesPage(0); // Reset pagination when data changes
      }
    } catch (err) {
      console.error('Failed to load follower trends', err);
    } finally {
      setTrendsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both directions in parallel - get more records for client-side filtering
      const [followingRes, followerRes, statsRes] = await Promise.all([
        fetch('/api/followers/history?direction=following&limit=1000'),
        fetch('/api/followers/history?direction=follower&limit=1000'),
        fetch('/api/followers/history-stats'),
      ]);

      const followingData = await followingRes.json();
      const followerData = await followerRes.json();
      const statsData = await statsRes.json();

      setFollowingHistory(followingData.records || []);
      setFollowerHistory(followerData.records || []);
      setStats(statsData);
    } catch (err) {
      setError('Failed to load follow history');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month} ${day} ${year} ${hours}:${minutes}`;
  };

  const getActionBadge = (action: 'follow' | 'unfollow') => {
    const base = "inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide";
    if (action === 'follow') {
      return `${base} bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`;
    }
    return `${base} bg-red-500/20 text-red-400 border border-red-500/30`;
  };

  const getSourceBadge = (source: string) => {
    const base = "inline-block px-2 py-0.5 rounded text-xs";
    switch (source) {
      case 'events_api':
        return `${base} bg-blue-500/20 text-blue-400 border border-blue-500/30`;
      case 'profile_scrape':
        return `${base} bg-purple-500/20 text-purple-400 border border-purple-500/30`;
      case 'list_scrape':
        return `${base} bg-amber-500/20 text-amber-400 border border-amber-500/30`;
      case 'manual_import':
        return `${base} bg-gray-500/20 text-gray-400 border border-gray-500/30`;
      default:
        return `${base} bg-gray-500/20 text-gray-400 border border-gray-500/30`;
    }
  };

  const formatSource = (source: string) => {
    switch (source) {
      case 'events_api':
        return 'Events API';
      case 'profile_scrape':
        return 'Profile Scrape';
      case 'list_scrape':
        return 'List Scrape';
      case 'manual_import':
        return 'Manual Import';
      default:
        return source;
    }
  };

  // Filter and sort records
  const filterAndSortRecords = (
    records: FollowHistoryRecord[],
    sortField: SortField,
    sortDir: SortDirection
  ): FollowHistoryRecord[] => {
    let filtered = records;

    // Apply username filter
    if (usernameFilter) {
      const search = usernameFilter.toLowerCase();
      filtered = filtered.filter(r => r.username.toLowerCase().includes(search));
    }

    // Apply action filter
    if (actionFilter !== 'all') {
      filtered = filtered.filter(r => r.action === actionFilter);
    }

    // Apply source filter
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(r => r.source === sourceFilter);
    }

    // Apply date range filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(r => new Date(r.created_at) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => new Date(r.created_at) <= end);
    }

    // Sort
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'username':
          comparison = a.username.localeCompare(b.username);
          break;
        case 'action':
          comparison = a.action.localeCompare(b.action);
          break;
        case 'source':
          comparison = a.source.localeCompare(b.source);
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });
  };

  const filteredFollowingHistory = useMemo(
    () => filterAndSortRecords(followingHistory, followingSortField, followingSortDir),
    [followingHistory, followingSortField, followingSortDir, usernameFilter, actionFilter, sourceFilter, startDate, endDate]
  );

  const filteredFollowerHistory = useMemo(
    () => filterAndSortRecords(followerHistory, followerSortField, followerSortDir),
    [followerHistory, followerSortField, followerSortDir, usernameFilter, actionFilter, sourceFilter, startDate, endDate]
  );

  const handleSort = (
    field: SortField,
    currentField: SortField,
    currentDir: SortDirection,
    setField: (f: SortField) => void,
    setDir: (d: SortDirection) => void
  ) => {
    if (field === currentField) {
      setDir(currentDir === 'asc' ? 'desc' : 'asc');
    } else {
      setField(field);
      setDir('desc');
    }
  };

  const SortIndicator: React.FC<{ field: SortField; currentField: SortField; currentDir: SortDirection }> = ({
    field,
    currentField,
    currentDir,
  }) => {
    if (field !== currentField) {
      return <span className="ml-1 text-white/30">⇅</span>;
    }
    return <span className="ml-1 text-mhc-primary">{currentDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const renderHistoryTable = (
    records: FollowHistoryRecord[],
    emptyMessage: string,
    sortField: SortField,
    sortDir: SortDirection,
    setSortField: (f: SortField) => void,
    setSortDir: (d: SortDirection) => void
  ) => {
    if (records.length === 0) {
      return (
        <div className="text-center py-8 text-white/40 italic">
          {emptyMessage}
        </div>
      );
    }

    const headerClass = "p-4 text-left text-white/80 font-semibold text-sm uppercase tracking-wide border-b-2 border-white/10 cursor-pointer hover:bg-white/5 transition-colors select-none";

    return (
      <table className="w-full border-collapse">
        <thead className="bg-white/5">
          <tr>
            <th
              className={headerClass}
              onClick={() => handleSort('username', sortField, sortDir, setSortField, setSortDir)}
            >
              Username
              <SortIndicator field="username" currentField={sortField} currentDir={sortDir} />
            </th>
            <th
              className={headerClass}
              onClick={() => handleSort('action', sortField, sortDir, setSortField, setSortDir)}
            >
              Action
              <SortIndicator field="action" currentField={sortField} currentDir={sortDir} />
            </th>
            <th
              className={headerClass}
              onClick={() => handleSort('source', sortField, sortDir, setSortField, setSortDir)}
            >
              Source
              <SortIndicator field="source" currentField={sortField} currentDir={sortDir} />
            </th>
            <th
              className={headerClass}
              onClick={() => handleSort('created_at', sortField, sortDir, setSortField, setSortDir)}
            >
              Timestamp
              <SortIndicator field="created_at" currentField={sortField} currentDir={sortDir} />
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.id}
              className="transition-colors hover:bg-white/5 border-b border-white/5"
            >
              <td className="p-4">
                <Link
                  to={`/profile/${record.username}`}
                  className="text-mhc-primary no-underline font-medium transition-colors hover:text-mhc-primary-dark hover:underline"
                >
                  {record.username}
                </Link>
              </td>
              <td className="p-4">
                <span className={getActionBadge(record.action)}>
                  {record.action}
                </span>
              </td>
              <td className="p-4">
                <span className={getSourceBadge(record.source)}>
                  {formatSource(record.source)}
                </span>
              </td>
              <td className="p-4 text-white/60 text-sm font-mono">
                {formatDate(record.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const CollapsibleSection: React.FC<{
    title: string;
    count: number;
    filteredCount: number;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    followCount?: number;
    unfollowCount?: number;
  }> = ({ title, count, filteredCount, expanded, onToggle, children, followCount, unfollowCount }) => (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden mb-6">
      <button
        className="w-full p-4 flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border-none text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold text-white">{title}</span>
          <span className="px-3 py-1 bg-mhc-primary/20 text-mhc-primary rounded-full text-sm font-medium">
            {filteredCount !== count ? `${filteredCount} / ${count}` : count} records
          </span>
          {followCount !== undefined && unfollowCount !== undefined && (
            <div className="flex gap-2">
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                +{followCount} follows
              </span>
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                -{unfollowCount} unfollows
              </span>
            </div>
          )}
        </div>
        <span className={`text-white/60 text-2xl transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/10">
          {children}
        </div>
      )}
    </div>
  );

  const clearFilters = () => {
    setUsernameFilter('');
    setActionFilter('all');
    setSourceFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = usernameFilter || actionFilter !== 'all' || sourceFilter !== 'all' || startDate || endDate;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
          Follow History
        </h1>
        <p className="text-white/60 text-base">
          Track all follow and unfollow events from Events API, profile scrapes, and list imports
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/5 rounded-lg border border-white/10 p-4">
            <div className="text-2xl font-bold text-emerald-400">{stats.totalFollows.toLocaleString()}</div>
            <div className="text-white/60 text-sm">Total Follows</div>
          </div>
          <div className="bg-white/5 rounded-lg border border-white/10 p-4">
            <div className="text-2xl font-bold text-red-400">{stats.totalUnfollows.toLocaleString()}</div>
            <div className="text-white/60 text-sm">Total Unfollows</div>
          </div>
          <div className="bg-white/5 rounded-lg border border-white/10 p-4">
            <div className="text-2xl font-bold text-purple-400">{stats.followingFollows.toLocaleString()}</div>
            <div className="text-white/60 text-sm">I Followed</div>
          </div>
          <div className="bg-white/5 rounded-lg border border-white/10 p-4">
            <div className="text-2xl font-bold text-blue-400">{stats.followerFollows.toLocaleString()}</div>
            <div className="text-white/60 text-sm">Followed Me</div>
          </div>
        </div>
      )}

      {/* Follower Trends Section (moved from Admin) */}
      <CollapsibleSectionComponent
        title={
          <div className="flex items-center justify-between w-full">
            <span>Follower Trends</span>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {[1, 7, 14, 30, 60, 180, 365].map(days => (
                <button
                  key={days}
                  onClick={() => setTrendsDays(days)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                    trendsDays === days
                      ? 'bg-mhc-primary text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {days === 1 ? '24h' : days === 365 ? '1y' : `${days}d`}
                </button>
              ))}
            </div>
          </div>
        }
        defaultCollapsed={true}
        className="mb-6"
      >
        {trendsLoading ? (
          <div className="text-center py-8 text-white/60">Loading follower trends...</div>
        ) : followerTrends ? (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gradient-to-br from-mhc-primary to-mhc-primary-dark rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{followerTrends.totalTracked.toLocaleString()}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Models Tracked</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-mhc-primary to-mhc-primary-dark rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{followerTrends.totalWithChanges.toLocaleString()}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">With Changes</div>
              </div>
            </div>

            {/* Top Gainers */}
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
              <h4 className="text-white font-semibold mb-3">Top Gainers ({trendsDays === 365 ? '1 year' : `${trendsDays} days`})</h4>
              {followerTrends.topGainers.length === 0 ? (
                <p className="text-white/50 text-sm">No data yet.</p>
              ) : (
                <div className="space-y-2">
                  {followerTrends.topGainers.slice(0, 10).map((mover, index) => (
                    <div key={mover.person_id} className="flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-white/40 font-mono text-xs w-5">#{index + 1}</span>
                        <Link to={`/people/${mover.username}`} className="text-mhc-primary hover:underline text-sm">
                          {mover.username}
                        </Link>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-white/50 text-xs">{mover.current_count?.toLocaleString() || 'N/A'}</span>
                        <span className="text-emerald-400 font-bold">+{mover.total_change.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Losers */}
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
              <h4 className="text-white font-semibold mb-3">Top Losers ({trendsDays === 365 ? '1 year' : `${trendsDays} days`})</h4>
              {followerTrends.topLosers.length === 0 ? (
                <p className="text-white/50 text-sm">No data yet.</p>
              ) : (
                <div className="space-y-2">
                  {followerTrends.topLosers.slice(0, 10).map((mover, index) => (
                    <div key={mover.person_id} className="flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-white/40 font-mono text-xs w-5">#{index + 1}</span>
                        <Link to={`/people/${mover.username}`} className="text-mhc-primary hover:underline text-sm">
                          {mover.username}
                        </Link>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-white/50 text-xs">{mover.current_count?.toLocaleString() || 'N/A'}</span>
                        <span className="text-red-400 font-bold">{mover.total_change.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Changes */}
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
              <h4 className="text-white font-semibold mb-3">
                Recent Significant Changes
                {followerTrends.recentChanges.length > 0 && (
                  <span className="text-xs text-white/50 font-normal ml-2">({followerTrends.recentChanges.length})</span>
                )}
              </h4>
              {followerTrends.recentChanges.length === 0 ? (
                <p className="text-white/50 text-sm">No significant changes recorded yet.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-white/10">
                          <th className="pb-2 text-white/70 font-medium">Username</th>
                          <th className="pb-2 text-white/70 font-medium text-right">Count</th>
                          <th className="pb-2 text-white/70 font-medium text-right">Change</th>
                          <th className="pb-2 text-white/70 font-medium text-right">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {followerTrends.recentChanges
                          .slice(recentChangesPage * RECENT_CHANGES_PER_PAGE, (recentChangesPage + 1) * RECENT_CHANGES_PER_PAGE)
                          .map(change => (
                            <tr key={change.id} className="border-b border-white/5 hover:bg-white/5">
                              <td className="py-2">
                                <Link to={`/people/${change.username}`} className="text-mhc-primary hover:underline">
                                  {change.username}
                                </Link>
                              </td>
                              <td className="py-2 text-right text-white/70">{change.follower_count.toLocaleString()}</td>
                              <td className={`py-2 text-right font-bold ${change.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {change.delta > 0 ? '+' : ''}{change.delta.toLocaleString()}
                              </td>
                              <td className="py-2 text-right text-white/50 text-xs">
                                {new Date(change.recorded_at).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {followerTrends.recentChanges.length > RECENT_CHANGES_PER_PAGE && (
                    <div className="flex justify-center items-center gap-4 mt-4">
                      <button
                        onClick={() => setRecentChangesPage(prev => Math.max(0, prev - 1))}
                        disabled={recentChangesPage === 0}
                        className="px-3 py-1 rounded text-xs font-medium transition-all disabled:opacity-40 bg-white/10 text-white hover:bg-mhc-primary"
                      >
                        ← Prev
                      </button>
                      <span className="text-white/50 text-xs">
                        Page {recentChangesPage + 1} of {Math.ceil(followerTrends.recentChanges.length / RECENT_CHANGES_PER_PAGE)}
                      </span>
                      <button
                        onClick={() => setRecentChangesPage(prev => Math.min(Math.ceil(followerTrends.recentChanges.length / RECENT_CHANGES_PER_PAGE) - 1, prev + 1))}
                        disabled={recentChangesPage >= Math.ceil(followerTrends.recentChanges.length / RECENT_CHANGES_PER_PAGE) - 1}
                        className="px-3 py-1 rounded text-xs font-medium transition-all disabled:opacity-40 bg-white/10 text-white hover:bg-mhc-primary"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-white/50">No follower trends data available.</div>
        )}
      </CollapsibleSectionComponent>

      {/* Filters */}
      <div className="bg-white/5 rounded-lg border border-white/10 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-white/60 text-sm mb-1">Username</label>
            <input
              type="text"
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
              placeholder="Filter by username..."
              className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-md text-white placeholder-white/40 focus:outline-none focus:border-mhc-primary"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-white/60 text-sm mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}
              className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
            >
              <option value="all">All Actions</option>
              <option value="follow">Follow</option>
              <option value="unfollow">Unfollow</option>
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-white/60 text-sm mb-1">Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
              className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
            >
              <option value="all">All Sources</option>
              <option value="events_api">Events API</option>
              <option value="profile_scrape">Profile Scrape</option>
              <option value="list_scrape">List Scrape</option>
              <option value="manual_import">Manual Import</option>
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-white/60 text-sm mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
            />
          </div>
          <div className="min-w-[150px]">
            <label className="block text-white/60 text-sm mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/80 rounded-md transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-lg text-white/60">Loading...</div>
      ) : error ? (
        <div className="text-center py-12 text-lg text-red-500">{error}</div>
      ) : (
        <>
          <CollapsibleSection
            title="Following"
            count={followingHistory.length}
            filteredCount={filteredFollowingHistory.length}
            expanded={followingExpanded}
            onToggle={() => setFollowingExpanded(!followingExpanded)}
            followCount={stats?.followingFollows}
            unfollowCount={stats?.followingUnfollows}
          >
            {renderHistoryTable(
              filteredFollowingHistory,
              "No following history yet. Follow/unfollow events will appear here.",
              followingSortField,
              followingSortDir,
              setFollowingSortField,
              setFollowingSortDir
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Followers"
            count={followerHistory.length}
            filteredCount={filteredFollowerHistory.length}
            expanded={followerExpanded}
            onToggle={() => setFollowerExpanded(!followerExpanded)}
            followCount={stats?.followerFollows}
            unfollowCount={stats?.followerUnfollows}
          >
            {renderHistoryTable(
              filteredFollowerHistory,
              "No follower history yet. When someone follows or unfollows you, it will appear here.",
              followerSortField,
              followerSortDir,
              setFollowerSortField,
              setFollowerSortDir
            )}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
};

export default FollowHistory;
