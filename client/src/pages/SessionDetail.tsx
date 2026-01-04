import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { formatFullDate, formatMilitaryTime, formatTimeRange, formatDuration } from '../utils/formatting';

interface Segment {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  source: string;
}

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
  aiSummaryGeneratedAt: string | null;
  notes: string | null;
  tags: string[];
  segments: Segment[];
}

interface EventRecord {
  id: string;
  timestamp: string;
  method: string;
  raw_event: any;
}

interface Audience {
  visitors: Array<{ username: string; entered_at: string }>;
  tippers: Array<{ username: string; totalTokens: number; tipCount: number }>;
  followers: Array<{ username: string; followed_at: string }>;
}

type TabType = 'summary' | 'events' | 'audience';

const SessionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('events');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [tagsValue, setTagsValue] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('');
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsHasMore, setEventsHasMore] = useState(false);

  useEffect(() => {
    if (id) {
      fetchSession();
    }
  }, [id]);

  useEffect(() => {
    if (id && activeTab === 'events' && events.length === 0) {
      fetchEvents();
    }
    if (id && activeTab === 'audience' && !audience) {
      fetchAudience();
    }
  }, [id, activeTab]);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/sessions-v2/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        setNotesValue(data.notes || '');
        setTagsValue((data.tags || []).join(', '));
      } else {
        setError('Session not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async (append = false) => {
    try {
      setEventsLoading(true);
      const offset = append ? events.length : 0;
      const filterParam = eventFilter ? `&method=${eventFilter}` : '';
      const res = await fetch(`/api/sessions-v2/${id}/events?limit=100&offset=${offset}${filterParam}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setEvents(prev => [...prev, ...data.events]);
        } else {
          setEvents(data.events || []);
        }
        setEventsTotal(data.total);
        setEventsHasMore(data.hasMore);
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setEventsLoading(false);
    }
  };

  const fetchAudience = async () => {
    try {
      const res = await fetch(`/api/sessions-v2/${id}/audience`);
      if (res.ok) {
        setAudience(await res.json());
      }
    } catch (err) {
      console.error('Failed to load audience:', err);
    }
  };

  const handleSaveNotes = async () => {
    try {
      const res = await fetch(`/api/sessions-v2/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notesValue || null,
          tags: tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSession(prev => prev ? { ...prev, notes: updated.notes, tags: updated.tags } : null);
        setEditingNotes(false);
      }
    } catch (err) {
      console.error('Failed to save notes:', err);
    }
  };

  const handleGenerateSummary = async () => {
    if (!session || session.status === 'active') return;

    setGeneratingSummary(true);
    try {
      const res = await fetch(`/api/sessions-v2/${id}/summary`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setSession(prev => prev ? {
          ...prev,
          aiSummary: data.summary,
          aiSummaryStatus: 'generated',
        } : null);
      } else {
        const err = await res.json();
        alert(`Failed to generate summary: ${err.error}`);
      }
    } catch (err) {
      alert('Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleRecompute = async () => {
    try {
      const res = await fetch(`/api/sessions-v2/${id}/recompute`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchSession();
      }
    } catch (err) {
      console.error('Failed to recompute:', err);
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
          <span className="px-3 py-1 rounded-full text-sm bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            LIVE
          </span>
        );
      case 'ended':
        return (
          <span className="px-3 py-1 rounded-full text-sm bg-orange-500/20 text-orange-400 border border-orange-500/30">
            Ended
          </span>
        );
      case 'pending_finalize':
        return (
          <span className="px-3 py-1 rounded-full text-sm bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Processing
          </span>
        );
      case 'finalized':
        return (
          <span className="px-3 py-1 rounded-full text-sm bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Complete
          </span>
        );
      default:
        return null;
    }
  };

  const getEventBadgeColor = (method: string) => {
    switch (method) {
      case 'tip': return 'bg-amber-500/20 text-amber-400';
      case 'follow': return 'bg-emerald-500/20 text-emerald-400';
      case 'unfollow': return 'bg-red-500/20 text-red-400';
      case 'userEnter': return 'bg-blue-500/20 text-blue-400';
      case 'userLeave': return 'bg-gray-500/20 text-gray-400';
      case 'chatMessage': return 'bg-purple-500/20 text-purple-400';
      case 'broadcastStart': return 'bg-green-500/20 text-green-400';
      case 'broadcastStop': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-white/10 text-white/60';
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-6">
        <p className="text-mhc-text-muted">Loading session...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-6">
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error || 'Session not found'}
        </div>
        <Link to="/sessions" className="mt-4 inline-block text-mhc-primary hover:underline">
          Back to Sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link to="/sessions" className="text-mhc-primary hover:underline text-sm">
          Sessions
        </Link>
        <span className="text-white/40 mx-2">/</span>
        <span className="text-white/60 text-sm">{formatFullDate(session.startedAt)}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-2xl font-bold text-white">
              {formatFullDate(session.startedAt)}
            </h1>
            {getStatusBadge(session.status)}
          </div>
          <p className="text-white/60">
            {formatTimeRange(session.startedAt, session.endedAt)}
            <span className="text-mhc-primary font-medium ml-2">
              ({formatDurationMinutes(session.durationMinutes)})
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRecompute}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors"
          >
            Recompute Stats
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
          <div className="text-2xl font-bold text-amber-400">{session.totalTokens.toLocaleString()}</div>
          <div className="text-xs text-white/60 uppercase mt-1">Tokens</div>
        </div>
        <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
          <div className={`text-2xl font-bold ${session.followersGained >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {session.followersGained >= 0 ? '+' : ''}{session.followersGained}
          </div>
          <div className="text-xs text-white/60 uppercase mt-1">Followers</div>
        </div>
        <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-400">{session.peakViewers}</div>
          <div className="text-xs text-white/60 uppercase mt-1">Peak Viewers</div>
        </div>
        <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-400">{session.avgViewers.toFixed(1)}</div>
          <div className="text-xs text-white/60 uppercase mt-1">Avg Viewers</div>
        </div>
        <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
          <div className="text-2xl font-bold text-purple-400">{session.uniqueVisitors}</div>
          <div className="text-xs text-white/60 uppercase mt-1">Unique Visitors</div>
        </div>
      </div>

      {/* Segments */}
      {session.segments && session.segments.length > 1 && (
        <div className="mb-6 p-4 bg-mhc-surface border border-white/10 rounded-lg">
          <h3 className="text-sm font-semibold text-white/70 mb-3 uppercase">
            Segments ({session.segments.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {session.segments.map((seg, i) => (
              <div key={seg.id} className="px-3 py-2 bg-white/5 rounded-lg text-sm">
                <span className="text-white/40 mr-2">#{i + 1}</span>
                <span className="text-white">{formatMilitaryTime(seg.startedAt)}</span>
                <span className="text-white/40 mx-1">-</span>
                <span className="text-white">{seg.endedAt ? formatMilitaryTime(seg.endedAt) : 'active'}</span>
                <span className="text-mhc-primary ml-2">({formatDurationMinutes(seg.durationMinutes)})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-white/10 mb-6">
        <div className="flex gap-1">
          {(['summary', 'events', 'audience'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-mhc-primary border-mhc-primary'
                  : 'text-white/60 border-transparent hover:text-white hover:border-white/30'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* AI Summary */}
          <div className="bg-mhc-surface border border-white/10 rounded-lg p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">AI Summary</h3>
              {session.status !== 'active' && (
                <button
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    generatingSummary
                      ? 'bg-white/10 text-white/40 cursor-not-allowed'
                      : 'bg-mhc-primary/20 hover:bg-mhc-primary/30 text-mhc-primary'
                  }`}
                >
                  {generatingSummary ? 'Generating...' : session.aiSummary ? 'Regenerate' : 'Generate Summary'}
                </button>
              )}
            </div>

            {session.aiSummary ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{session.aiSummary}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-white/50">
                {session.status === 'active'
                  ? 'AI summary will be available after the session ends.'
                  : 'No AI summary generated yet. Click "Generate Summary" to create one.'}
              </p>
            )}

            {session.aiSummaryGeneratedAt && (
              <p className="text-xs text-white/40 mt-4">
                Generated: {new Date(session.aiSummaryGeneratedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="bg-mhc-surface border border-white/10 rounded-lg p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Notes & Tags</h3>
              {editingNotes ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-md transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingNotes(false);
                      setNotesValue(session.notes || '');
                      setTagsValue((session.tags || []).join(', '));
                    }}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {editingNotes ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={tagsValue}
                    onChange={(e) => setTagsValue(e.target.value)}
                    placeholder="e.g., gaming, chill, late night"
                    className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Notes</label>
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    rows={5}
                    placeholder="Add notes about this session..."
                    className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary resize-y"
                  />
                </div>
              </div>
            ) : (
              <>
                {session.tags && session.tags.length > 0 && (
                  <div className="flex gap-2 mb-4 flex-wrap">
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
                {session.notes ? (
                  <p className="text-white/80 whitespace-pre-wrap">{session.notes}</p>
                ) : (
                  <p className="text-white/50">No notes added yet.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="bg-mhc-surface border border-white/10 rounded-lg">
          {/* Event filter */}
          <div className="p-4 border-b border-white/10 flex justify-between items-center">
            <select
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value);
                setEvents([]);
                setTimeout(fetchEvents, 0);
              }}
              className="px-3 py-1.5 bg-mhc-surface-light border border-white/20 rounded-md text-white text-sm focus:outline-none focus:border-mhc-primary"
            >
              <option value="">All Events</option>
              <option value="tip">Tips</option>
              <option value="follow">Follows</option>
              <option value="unfollow">Unfollows</option>
              <option value="chatMessage">Chat Messages</option>
              <option value="userEnter">Room Entries</option>
              <option value="userLeave">Room Exits</option>
            </select>
            <span className="text-sm text-white/50">{eventsTotal} events</span>
          </div>

          {/* Event list */}
          <div className="max-h-96 overflow-y-auto">
            {eventsLoading && events.length === 0 ? (
              <div className="p-4 text-center text-white/50">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="p-4 text-center text-white/50">No events found</div>
            ) : (
              <div className="divide-y divide-white/5">
                {events.map(event => (
                  <div key={event.id} className="px-4 py-2 flex items-start gap-3">
                    <span className="text-xs text-white/40 font-mono">
                      {formatMilitaryTime(event.timestamp)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getEventBadgeColor(event.method)}`}>
                      {event.method}
                    </span>
                    <span className="text-sm text-white/80 flex-1">
                      {event.raw_event?.user?.username && (
                        <Link
                          to={`/profile/${event.raw_event.user.username}`}
                          className="text-mhc-primary hover:underline"
                        >
                          {event.raw_event.user.username}
                        </Link>
                      )}
                      {event.method === 'tip' && event.raw_event?.tip && (
                        <span className="text-amber-400 ml-2">
                          {event.raw_event.tip.tokens} tokens
                          {event.raw_event.tip.message && (
                            <span className="text-white/60 ml-2">"{event.raw_event.tip.message}"</span>
                          )}
                        </span>
                      )}
                      {event.method === 'chatMessage' && event.raw_event?.message?.message && (
                        <span className="text-white/60 ml-2">
                          "{event.raw_event.message.message}"
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Load more */}
          {eventsHasMore && (
            <div className="p-4 border-t border-white/10 text-center">
              <button
                onClick={() => fetchEvents(true)}
                disabled={eventsLoading}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors"
              >
                {eventsLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'audience' && (
        <div className="grid md:grid-cols-3 gap-6">
          {/* Tippers */}
          <div className="bg-mhc-surface border border-white/10 rounded-lg">
            <div className="p-4 border-b border-white/10">
              <h3 className="font-semibold text-amber-400">
                Top Tippers ({audience?.tippers.length || 0})
              </h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {audience?.tippers.map((tipper, i) => (
                <div key={tipper.username} className="px-4 py-2 flex justify-between items-center border-b border-white/5 last:border-0">
                  <Link
                    to={`/profile/${tipper.username}`}
                    className="text-mhc-primary hover:underline"
                  >
                    {tipper.username}
                  </Link>
                  <span className="text-amber-400 font-medium">
                    {tipper.totalTokens} ({tipper.tipCount})
                  </span>
                </div>
              ))}
              {!audience?.tippers.length && (
                <div className="p-4 text-center text-white/50">No tippers</div>
              )}
            </div>
          </div>

          {/* New Followers */}
          <div className="bg-mhc-surface border border-white/10 rounded-lg">
            <div className="p-4 border-b border-white/10">
              <h3 className="font-semibold text-emerald-400">
                New Followers ({audience?.followers.length || 0})
              </h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {audience?.followers.map(follower => (
                <div key={follower.username} className="px-4 py-2 flex justify-between items-center border-b border-white/5 last:border-0">
                  <Link
                    to={`/profile/${follower.username}`}
                    className="text-mhc-primary hover:underline"
                  >
                    {follower.username}
                  </Link>
                  <span className="text-xs text-white/40">
                    {formatMilitaryTime(follower.followed_at)}
                  </span>
                </div>
              ))}
              {!audience?.followers.length && (
                <div className="p-4 text-center text-white/50">No new followers</div>
              )}
            </div>
          </div>

          {/* Visitors */}
          <div className="bg-mhc-surface border border-white/10 rounded-lg">
            <div className="p-4 border-b border-white/10">
              <h3 className="font-semibold text-purple-400">
                Visitors ({audience?.visitors.length || 0})
              </h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {audience?.visitors.slice(0, 50).map(visitor => (
                <div key={visitor.username} className="px-4 py-2 flex justify-between items-center border-b border-white/5 last:border-0">
                  <Link
                    to={`/profile/${visitor.username}`}
                    className="text-mhc-primary hover:underline"
                  >
                    {visitor.username}
                  </Link>
                  <span className="text-xs text-white/40">
                    {formatMilitaryTime(visitor.entered_at)}
                  </span>
                </div>
              ))}
              {!audience?.visitors.length && (
                <div className="p-4 text-center text-white/50">No visitors</div>
              )}
              {(audience?.visitors.length || 0) > 50 && (
                <div className="p-2 text-center text-white/40 text-sm">
                  +{audience!.visitors.length - 50} more
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionDetail;
