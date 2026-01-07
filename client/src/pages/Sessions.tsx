import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatFullDate, formatMilitaryTime, formatTimeRange, formatDuration } from '../utils/formatting';
import { TimeRangeSelect, TimeRange, getDateRangeForTimeRange } from '../components/TimeRangeSelect';
import { CollapsibleSection } from '../components/CollapsibleSection';

interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  lastEventAt: string;
  finalizeAt: string | null;
  status: 'active' | 'ended' | 'pending_finalize' | 'finalized';
  durationMinutes: number | null;
  totalTokens: number;
  followersGained: number;
  peakViewers: number;
  avgViewers: number;
  uniqueVisitors: number;
  aiSummary: string | null;
  aiSummaryStatus: string;
  notes: string | null;
  tags: string[];
}

interface SessionStats {
  totalSessions: number;
  totalTokens: number;
  totalFollowers: number;
  avgViewers: number;
  peakViewers: number;
  totalMinutes: number;
}

const Sessions: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('this_month');
  const [hasMore, setHasMore] = useState(false);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const fetchData = async (reset = true) => {
    try {
      if (reset) {
        setLoading(true);
      }

      const dateRange = getDateRangeForTimeRange(timeRange);
      const dateParams = timeRange === 'all_time'
        ? ''
        : `&startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`;

      const [sessionsRes, statsRes] = await Promise.all([
        fetch(`/api/sessions-v2?limit=${PAGE_SIZE}&offset=0${dateParams}`),
        fetch(`/api/sessions-v2/stats?startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`),
      ]);

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions || []);
        setHasMore(data.hasMore || false);
        setTotalSessions(data.total || 0);
      }

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const offset = sessions.length;
      const dateRange = getDateRangeForTimeRange(timeRange);
      const dateParams = timeRange === 'all_time'
        ? ''
        : `&startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`;

      const res = await fetch(`/api/sessions-v2?limit=${PAGE_SIZE}&offset=${offset}${dateParams}`);

      if (res.ok) {
        const data = await res.json();
        setSessions(prev => [...prev, ...(data.sessions || [])]);
        setHasMore(data.hasMore || false);
      }
    } catch (err) {
      setError('Failed to load more sessions');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRebuild = async () => {
    if (!window.confirm('This will rebuild all sessions from events. Continue?')) return;

    setRebuilding(true);
    try {
      const res = await fetch('/api/sessions-v2/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Rebuild complete: ${result.sessions} sessions from ${result.segments} segments`);
        fetchData();
      } else {
        const err = await res.json();
        alert(`Rebuild failed: ${err.error}`);
      }
    } catch (err) {
      alert('Rebuild failed: Network error');
    } finally {
      setRebuilding(false);
    }
  };

  const handleGenerateSummary = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setGeneratingSummary(sessionId);
    try {
      const res = await fetch(`/api/sessions-v2/${sessionId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        // Refresh the session data to get the new summary status
        fetchData(false);
      } else {
        const err = await res.json();
        alert(`Failed to generate summary: ${err.error}`);
      }
    } catch (err) {
      alert('Failed to generate summary: Network error');
    } finally {
      setGeneratingSummary(null);
    }
  };

  const formatDurationMinutes = (minutes: number | null) => {
    if (!minutes) return '-';
    return formatDuration(minutes);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            LIVE
          </span>
        );
      case 'ended':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30">
            Ended
          </span>
        );
      case 'pending_finalize':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Processing
          </span>
        );
      case 'finalized':
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Complete
          </span>
        );
      default:
        return null;
    }
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-6">
        <p className="text-mhc-text-muted">Loading sessions...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Broadcasts
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              rebuilding
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {rebuilding ? 'Rebuilding...' : 'Rebuild'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <CollapsibleSection
          title={
            <div className="flex items-center justify-between w-full">
              <span>Statistics</span>
              <div onClick={(e) => e.stopPropagation()}>
                <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
              </div>
            </div>
          }
          defaultCollapsed={false}
          className="mb-5"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-mhc-primary">{stats.totalSessions}</div>
              <div className="text-xs text-white/60 uppercase">Broadcasts</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-mhc-primary">{formatDurationMinutes(stats.totalMinutes)}</div>
              <div className="text-xs text-white/60 uppercase">Total Time</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-amber-400">{stats.totalTokens.toLocaleString()}</div>
              <div className="text-xs text-white/60 uppercase">Total Tokens</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">{Math.round(stats.avgViewers)}</div>
              <div className="text-xs text-white/60 uppercase">Avg Viewers</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">{stats.peakViewers}</div>
              <div className="text-xs text-white/60 uppercase">Peak Viewers</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-emerald-400">
                {stats.totalFollowers >= 0 ? '+' : ''}{stats.totalFollowers}
              </div>
              <div className="text-xs text-white/60 uppercase">Followers</div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Broadcasts List */}
      <CollapsibleSection
        title={
          <span>
            Broadcasts
            <span className="text-sm text-white/50 font-normal ml-3">
              {sessions.length} of {totalSessions}
            </span>
          </span>
        }
        defaultCollapsed={true}
        className="bg-mhc-surface/60"
      >
        <div className="divide-y divide-white/10">
          {sessions.length === 0 ? (
            <div className="p-10 text-center text-white/60">
              No broadcasts found for this time period.
            </div>
          ) : (
            <>
              {sessions.map(session => (
                <Link
                  key={session.id}
                  to={`/sessions/${session.id}`}
                  className="block p-5 hover:bg-white/5 transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-white font-medium">
                          {formatFullDate(session.startedAt)}
                        </span>
                        {getStatusBadge(session.status)}
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-white/70">
                          {formatTimeRange(session.startedAt, session.endedAt)}
                        </span>
                        <span className="text-mhc-primary font-medium">
                          ({formatDurationMinutes(session.durationMinutes)})
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      {session.status !== 'active' && (
                        session.aiSummaryStatus === 'generated' ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30">
                            AI Summary
                          </span>
                        ) : session.aiSummaryStatus === 'generating' || generatingSummary === session.id ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <span className="animate-spin text-[10px]">&#9696;</span>
                            Generating...
                          </span>
                        ) : (
                          <button
                            onClick={(e) => handleGenerateSummary(e, session.id)}
                            disabled={generatingSummary !== null}
                            className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/70 border border-white/20 hover:bg-mhc-primary/20 hover:text-mhc-primary hover:border-mhc-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Generate Summary
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-white/50">Tokens:</span>{' '}
                      <span className="text-amber-400 font-medium">{session.totalTokens.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-white/50">Followers:</span>{' '}
                      <span className={`font-medium ${session.followersGained >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {session.followersGained >= 0 ? '+' : ''}{session.followersGained}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/50">Peak:</span>{' '}
                      <span className="text-blue-400 font-medium">{session.peakViewers}</span>
                    </div>
                    <div>
                      <span className="text-white/50">Avg:</span>{' '}
                      <span className="text-blue-400 font-medium">{session.avgViewers.toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-white/50">Unique:</span>{' '}
                      <span className="text-purple-400 font-medium">{session.uniqueVisitors}</span>
                    </div>
                  </div>

                  {/* Tags */}
                  {session.tags && session.tags.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {session.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-xs bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes preview */}
                  {session.notes && (
                    <p className="text-white/60 text-sm mt-2 line-clamp-2">{session.notes}</p>
                  )}
                </Link>
              ))}

              {/* Load More */}
              {hasMore && (
                <div className="p-5 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className={`px-6 py-2.5 font-medium rounded-lg transition-colors ${
                      loadingMore
                        ? 'bg-white/10 text-white/40 cursor-not-allowed'
                        : 'bg-mhc-primary/20 hover:bg-mhc-primary/30 text-mhc-primary border border-mhc-primary/30'
                    }`}
                  >
                    {loadingMore ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading...
                      </span>
                    ) : (
                      `Load More (${totalSessions - sessions.length} remaining)`
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default Sessions;
