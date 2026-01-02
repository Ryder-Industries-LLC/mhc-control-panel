import React, { useState, useEffect, useCallback } from 'react';
import { QuickLookupPanel } from '../components/QuickLookupPanel';

interface Visitor {
  person_id: string;
  username: string;
  visit_count?: number;
  offline_visit_count?: number;
  live_visit_count?: number;
  has_offline_visits?: boolean;
  last_visit: string;
  first_visit?: string;
  first_visit_in_period?: string;
  total_visit_count: number;
  notes_preview?: string;
  tags?: string[];
  friend_tier?: number;
  following?: boolean;
  is_follower?: boolean;
  banned_me?: boolean;
  watch_list?: boolean;
  sub_level?: string;
  dom_level?: string;
  total_tips?: number;
  tip_count?: number;
}

interface VisitorStats {
  total_visits: number;
  unique_visitors: number;
  total_offline_visits: number;
  unique_offline_visitors: number;
  today: { visits: number; unique: number; offline_visits: number; unique_offline: number };
  this_week: { visits: number; unique: number; offline_visits: number; unique_offline: number };
  this_month: { visits: number; unique: number; offline_visits: number; unique_offline: number };
}

interface VisitHistoryItem {
  id: string;
  visited_at: string;
  is_broadcasting: boolean;
  person_id: string;
  username: string;
  friend_tier?: number;
  following?: boolean;
  is_follower?: boolean;
}

type ViewMode = 'recent' | 'top' | 'history';
type SortField = 'last_visit' | 'username' | 'visit_count' | 'total_tips' | 'total_visit_count' | 'offline_visit_count';
type FilterType = 'all' | 'following' | 'followers' | 'tippers' | 'regulars' | 'new' | 'offline';

const Visitors: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [visitHistory, setVisitHistory] = useState<VisitHistoryItem[]>([]);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and sorting
  const [days, setDays] = useState(7);
  const [sortField, setSortField] = useState<SortField>('last_visit');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Quick lookup
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [showQuickLookup, setShowQuickLookup] = useState(false);

  // History pagination
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/visitors/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setStats(data);
      } catch (err) {
        console.error('Error fetching stats:', err);
      }
    };
    fetchStats();
  }, []);

  // Fetch visitors based on view mode
  useEffect(() => {
    const fetchVisitors = async () => {
      setLoading(true);
      setError(null);

      try {
        let url = '';
        if (viewMode === 'recent') {
          url = `/api/visitors/recent?days=${days}&limit=200`;
        } else if (viewMode === 'top') {
          url = `/api/visitors/top?limit=200`;
        } else if (viewMode === 'history') {
          url = `/api/visitors/history?limit=50&offset=${historyOffset}`;
          const response = await fetch(url);
          if (!response.ok) throw new Error('Failed to fetch history');
          const data = await response.json();
          setVisitHistory(data.visits);
          setHistoryTotal(data.total);
          setHistoryHasMore(data.hasMore);
          setLoading(false);
          return;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch visitors');
        const data = await response.json();
        setVisitors(data.visitors);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchVisitors();
  }, [viewMode, days, historyOffset]);

  // Filter and sort visitors
  const filteredVisitors = useCallback(() => {
    let result = [...visitors];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(v => v.username.toLowerCase().includes(term));
    }

    // Apply type filter
    switch (filter) {
      case 'following':
        result = result.filter(v => v.following);
        break;
      case 'followers':
        result = result.filter(v => v.is_follower);
        break;
      case 'tippers':
        result = result.filter(v => v.total_tips && v.total_tips > 0);
        break;
      case 'regulars':
        result = result.filter(v => v.total_visit_count >= 3);
        break;
      case 'new':
        result = result.filter(v => v.total_visit_count <= 1);
        break;
      case 'offline':
        result = result.filter(v => v.has_offline_visits || (v.offline_visit_count && v.offline_visit_count > 0));
        break;
    }

    // Apply sort
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case 'last_visit':
          aVal = new Date(a.last_visit).getTime();
          bVal = new Date(b.last_visit).getTime();
          break;
        case 'username':
          aVal = a.username.toLowerCase();
          bVal = b.username.toLowerCase();
          break;
        case 'visit_count':
          aVal = a.visit_count || 0;
          bVal = b.visit_count || 0;
          break;
        case 'offline_visit_count':
          aVal = a.offline_visit_count || 0;
          bVal = b.offline_visit_count || 0;
          break;
        case 'total_tips':
          aVal = a.total_tips || 0;
          bVal = b.total_tips || 0;
          break;
        case 'total_visit_count':
          aVal = a.total_visit_count || 0;
          bVal = b.total_visit_count || 0;
          break;
      }
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [visitors, searchTerm, filter, sortField, sortAsc]);

  const handleUserClick = (username: string) => {
    setSelectedUsername(username);
    setShowQuickLookup(true);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getBadges = (visitor: Visitor) => {
    const badges: React.ReactElement[] = [];

    // Friend tier badge
    if (visitor.friend_tier && visitor.friend_tier > 0) {
      badges.push(
        <span key="friend" className="px-1.5 py-0.5 bg-amber-500/30 text-amber-400 text-xs rounded font-medium">
          Friend T{visitor.friend_tier}
        </span>
      );
    }
    // Sub level badge
    if (visitor.sub_level) {
      badges.push(
        <span key="sub" className="px-1.5 py-0.5 bg-purple-600/30 text-purple-400 text-xs rounded">
          Sub: {visitor.sub_level}
        </span>
      );
    }
    // Dom level badge
    if (visitor.dom_level) {
      badges.push(
        <span key="dom" className="px-1.5 py-0.5 bg-pink-600/30 text-pink-400 text-xs rounded">
          Dom: {visitor.dom_level}
        </span>
      );
    }
    // Following/Follower badges
    if (visitor.following) {
      badges.push(
        <span key="fol" className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-xs rounded">Following</span>
      );
    }
    if (visitor.is_follower) {
      badges.push(
        <span key="flr" className="px-1.5 py-0.5 bg-blue-600/30 text-blue-400 text-xs rounded">Follower</span>
      );
    }
    // Watch list badge
    if (visitor.watch_list) {
      badges.push(
        <span key="watch" className="px-1.5 py-0.5 bg-yellow-600/30 text-yellow-400 text-xs rounded">Watch</span>
      );
    }
    // Banned badge
    if (visitor.banned_me) {
      badges.push(
        <span key="ban" className="px-1.5 py-0.5 bg-red-600/30 text-red-400 text-xs rounded">Banned</span>
      );
    }
    // Tags (show first 3)
    if (visitor.tags && visitor.tags.length > 0) {
      visitor.tags.slice(0, 3).forEach((tag, i) => {
        badges.push(
          <span key={`tag-${i}`} className="px-1.5 py-0.5 bg-mhc-surface-light text-mhc-text-muted text-xs rounded">
            {tag}
          </span>
        );
      });
    }

    return badges;
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const displayedVisitors = filteredVisitors();

  return (
    <div className="min-h-screen bg-mhc-dark">
      {/* Header */}
      <div className="sticky top-0 bg-mhc-dark border-b border-mhc-border p-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Profile Visitors</h1>
            <span className="text-mhc-text-muted text-sm">
              Track who visits your profile (including when offline)
            </span>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="flex gap-6 mb-4 text-sm">
            <div className="bg-mhc-surface px-4 py-2 rounded-lg">
              <div className="text-mhc-text-muted">Today</div>
              <div className="text-white font-bold">{stats.today.unique} <span className="text-mhc-text-muted font-normal">visitors</span></div>
              {stats.today.unique_offline > 0 && (
                <div className="text-orange-400 text-xs">{stats.today.unique_offline} offline</div>
              )}
            </div>
            <div className="bg-mhc-surface px-4 py-2 rounded-lg">
              <div className="text-mhc-text-muted">This Week</div>
              <div className="text-white font-bold">{stats.this_week.unique} <span className="text-mhc-text-muted font-normal">visitors</span></div>
              {stats.this_week.unique_offline > 0 && (
                <div className="text-orange-400 text-xs">{stats.this_week.unique_offline} offline</div>
              )}
            </div>
            <div className="bg-mhc-surface px-4 py-2 rounded-lg">
              <div className="text-mhc-text-muted">This Month</div>
              <div className="text-white font-bold">{stats.this_month.unique} <span className="text-mhc-text-muted font-normal">visitors</span></div>
              {stats.this_month.unique_offline > 0 && (
                <div className="text-orange-400 text-xs">{stats.this_month.unique_offline} offline</div>
              )}
            </div>
            <div className="bg-mhc-surface px-4 py-2 rounded-lg">
              <div className="text-mhc-text-muted">All Time</div>
              <div className="text-white font-bold">{stats.unique_visitors.toLocaleString()} <span className="text-mhc-text-muted font-normal">unique</span></div>
              {stats.unique_offline_visitors > 0 && (
                <div className="text-orange-400 text-xs">{stats.unique_offline_visitors.toLocaleString()} offline</div>
              )}
            </div>
          </div>
        )}

        {/* View mode tabs */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex gap-2">
            {([
              { mode: 'recent' as ViewMode, label: 'Recent Visitors' },
              { mode: 'top' as ViewMode, label: 'Top Visitors' },
              { mode: 'history' as ViewMode, label: 'Visit History' },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => {
                  setViewMode(mode);
                  setHistoryOffset(0);
                }}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-mhc-primary text-white'
                    : 'bg-mhc-surface text-mhc-text-muted hover:bg-mhc-surface-light'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Days selector for recent view */}
          {viewMode === 'recent' && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-mhc-text-muted text-sm">Period:</span>
              {[1, 7, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2 py-1 rounded text-sm ${
                    days === d
                      ? 'bg-mhc-primary text-white'
                      : 'bg-mhc-surface text-mhc-text-muted hover:bg-mhc-surface-light'
                  }`}
                >
                  {d === 1 ? '24h' : `${d}d`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters (for recent/top views) */}
        {viewMode !== 'history' && (
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search username..."
              className="px-3 py-2 bg-mhc-surface border border-mhc-border rounded text-white placeholder-mhc-text-muted focus:outline-none focus:border-mhc-primary w-48"
            />

            {/* Filter buttons */}
            <div className="flex gap-2">
              {(['all', 'offline', 'following', 'followers', 'tippers', 'regulars', 'new'] as FilterType[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    filter === f
                      ? f === 'offline' ? 'bg-orange-500 text-white' : 'bg-mhc-primary text-white'
                      : 'bg-mhc-surface text-mhc-text-muted hover:bg-mhc-surface-light'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Sort buttons */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-mhc-text-muted text-sm">Sort:</span>
              {[
                { field: 'last_visit' as SortField, label: 'Last Visit' },
                { field: 'username' as SortField, label: 'Name' },
                { field: viewMode === 'recent' ? 'visit_count' as SortField : 'total_visit_count' as SortField, label: 'Visits' },
                { field: 'total_tips' as SortField, label: 'Tips' },
              ].map(({ field, label }) => (
                <button
                  key={field}
                  onClick={() => handleSort(field)}
                  className={`px-2 py-1 rounded text-sm ${
                    sortField === field
                      ? 'bg-mhc-primary text-white'
                      : 'bg-mhc-surface text-mhc-text-muted hover:bg-mhc-surface-light'
                  }`}
                >
                  {label} {sortField === field && (sortAsc ? '↑' : '↓')}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="p-4">
        {loading ? (
          <div className="text-center text-mhc-text-muted py-16">Loading...</div>
        ) : error ? (
          <div className="text-center text-red-400 py-16">{error}</div>
        ) : viewMode === 'history' ? (
          /* History view */
          <div>
            <div className="grid gap-2">
              {visitHistory.map(visit => (
                <div
                  key={visit.id}
                  onClick={() => handleUserClick(visit.username)}
                  className="flex items-center justify-between p-3 bg-mhc-surface rounded-lg cursor-pointer hover:bg-mhc-surface-light transition-colors border border-transparent hover:border-mhc-primary"
                >
                  <div className="flex items-center gap-3">
                    {/* Offline/Live indicator */}
                    <span className={`w-2 h-2 rounded-full ${visit.is_broadcasting ? 'bg-green-400' : 'bg-orange-400'}`} title={visit.is_broadcasting ? 'During broadcast' : 'Offline visit'} />
                    <span className="text-white font-medium">{visit.username}</span>
                    <div className="flex gap-1">
                      {!visit.is_broadcasting && (
                        <span className="px-1.5 py-0.5 bg-orange-600/30 text-orange-400 text-xs rounded">Offline</span>
                      )}
                      {visit.following && (
                        <span className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-xs rounded">Following</span>
                      )}
                      {visit.is_follower && (
                        <span className="px-1.5 py-0.5 bg-blue-600/30 text-blue-400 text-xs rounded">Follower</span>
                      )}
                      {visit.friend_tier && visit.friend_tier > 0 && (
                        <span className="px-1.5 py-0.5 bg-amber-500/30 text-amber-400 text-xs rounded">
                          Friend T{visit.friend_tier}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-mhc-text-muted text-sm">
                    {formatTimeAgo(visit.visited_at)}
                    <span className="text-mhc-text-muted/50 ml-2">
                      {new Date(visit.visited_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-mhc-border">
              <span className="text-mhc-text-muted text-sm">
                Showing {historyOffset + 1}-{Math.min(historyOffset + visitHistory.length, historyTotal)} of {historyTotal.toLocaleString()} visits
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setHistoryOffset(Math.max(0, historyOffset - 50))}
                  disabled={historyOffset === 0}
                  className="px-4 py-2 bg-mhc-surface text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-mhc-surface-light"
                >
                  Previous
                </button>
                <button
                  onClick={() => setHistoryOffset(historyOffset + 50)}
                  disabled={!historyHasMore}
                  className="px-4 py-2 bg-mhc-surface text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-mhc-surface-light"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : displayedVisitors.length === 0 ? (
          <div className="text-center text-mhc-text-muted py-16">
            {visitors.length === 0 ? 'No visitors recorded yet' : 'No visitors match your filters'}
          </div>
        ) : (
          /* Recent/Top visitor list */
          <div className="grid gap-2">
            {displayedVisitors.map(visitor => (
              <div
                key={visitor.person_id}
                onClick={() => handleUserClick(visitor.username)}
                className="flex items-center justify-between p-3 bg-mhc-surface rounded-lg cursor-pointer hover:bg-mhc-surface-light transition-colors border border-transparent hover:border-mhc-primary"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{visitor.username}</span>
                      <div className="flex gap-1 flex-wrap">
                        {getBadges(visitor)}
                      </div>
                    </div>
                    {visitor.notes_preview && (
                      <div className="text-mhc-text-muted text-sm mt-1 truncate max-w-md">
                        {visitor.notes_preview}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 text-sm">
                  {/* Offline indicator */}
                  {viewMode === 'recent' && visitor.offline_visit_count && visitor.offline_visit_count > 0 && (
                    <div className="text-center">
                      <div className="text-orange-400 font-bold">{visitor.offline_visit_count}</div>
                      <div className="text-orange-400/70 text-xs">offline</div>
                    </div>
                  )}

                  {/* Tips */}
                  {(visitor.total_tips || 0) > 0 && (
                    <div className="text-center">
                      <div className="text-amber-400 font-bold">{visitor.total_tips?.toLocaleString()}</div>
                      <div className="text-mhc-text-muted text-xs">tokens</div>
                    </div>
                  )}

                  {/* Period visits (for recent view) */}
                  {viewMode === 'recent' && visitor.visit_count && (
                    <div className="text-center">
                      <div className="text-green-400 font-bold">{visitor.visit_count}</div>
                      <div className="text-mhc-text-muted text-xs">in {days}d</div>
                    </div>
                  )}

                  {/* Total visits */}
                  <div className="text-center">
                    <div className="text-white font-bold">{visitor.total_visit_count}</div>
                    <div className="text-mhc-text-muted text-xs">total</div>
                  </div>

                  {/* Last visit */}
                  <div className="text-center min-w-[80px]">
                    <div className="text-mhc-text-muted text-xs">
                      {formatTimeAgo(visitor.last_visit)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Lookup Panel */}
      <QuickLookupPanel
        isOpen={showQuickLookup}
        onClose={() => {
          setShowQuickLookup(false);
          setSelectedUsername(null);
        }}
        initialUsername={selectedUsername || ''}
      />
    </div>
  );
};

export default Visitors;
