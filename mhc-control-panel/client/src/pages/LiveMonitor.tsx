import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QuickLookupPanel } from '../components/QuickLookupPanel';

interface RoomOccupant {
  person_id: string;
  username: string;
  entered_at: string;
  user_data?: {
    inFanclub?: boolean;
    hasTipped?: boolean;
    isMod?: boolean;
  };
  // Enriched data
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
  stream_visit_count: number;
  total_visit_count: number;
  last_visit_at?: string;
}

interface RoomEvent {
  type: 'user_enter' | 'user_leave' | 'presence_sync';
  timestamp: string;
  user?: RoomOccupant;
  occupants?: RoomOccupant[];
  occupantCount?: number;
}

type SortField = 'entered_at' | 'username' | 'total_tips' | 'total_visit_count';
type FilterType = 'all' | 'following' | 'followers' | 'tippers' | 'regulars' | 'new';

const LiveMonitor: React.FC = () => {
  const [occupants, setOccupants] = useState<RoomOccupant[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('entered_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [showQuickLookup, setShowQuickLookup] = useState(false);
  const [eventLog, setEventLog] = useState<Array<{ type: string; username: string; time: Date }>>([]);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE stream
  useEffect(() => {
    const connect = () => {
      const eventSource = new EventSource('/api/room/presence/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: RoomEvent = JSON.parse(event.data);

          switch (data.type) {
            case 'presence_sync':
              setOccupants(data.occupants || []);
              break;

            case 'user_enter':
              if (data.user) {
                const enterUser = data.user;
                setOccupants(prev => {
                  // Remove existing entry if present, then add new
                  const filtered = prev.filter(o => o.person_id !== enterUser.person_id);
                  return [...filtered, enterUser];
                });
                setEventLog(prev => [
                  { type: 'enter', username: enterUser.username, time: new Date() },
                  ...prev.slice(0, 99), // Keep last 100 events
                ]);
              }
              break;

            case 'user_leave':
              if (data.user) {
                const leaveUser = data.user;
                setOccupants(prev => prev.filter(o => o.person_id !== leaveUser.person_id));
                setEventLog(prev => [
                  { type: 'leave', username: leaveUser.username, time: new Date() },
                  ...prev.slice(0, 99),
                ]);
              }
              break;
          }
        } catch (err) {
          console.error('Error parsing SSE event:', err);
        }
      };

      eventSource.onerror = () => {
        setConnected(false);
        setError('Connection lost. Reconnecting...');
        eventSource.close();
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Filter and sort occupants
  const filteredOccupants = useCallback(() => {
    let result = [...occupants];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(o => o.username.toLowerCase().includes(term));
    }

    // Apply type filter
    switch (filter) {
      case 'following':
        result = result.filter(o => o.following);
        break;
      case 'followers':
        result = result.filter(o => o.is_follower);
        break;
      case 'tippers':
        result = result.filter(o => o.total_tips && o.total_tips > 0);
        break;
      case 'regulars':
        result = result.filter(o => o.total_visit_count >= 3);
        break;
      case 'new':
        result = result.filter(o => o.total_visit_count <= 1);
        break;
    }

    // Apply sort
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case 'entered_at':
          aVal = new Date(a.entered_at).getTime();
          bVal = new Date(b.entered_at).getTime();
          break;
        case 'username':
          aVal = a.username.toLowerCase();
          bVal = b.username.toLowerCase();
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
  }, [occupants, searchTerm, filter, sortField, sortAsc]);

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

  const getBadges = (occupant: RoomOccupant) => {
    const badges: React.ReactElement[] = [];

    // Mod badge (highest priority)
    if (occupant.user_data?.isMod) {
      badges.push(
        <span key="mod" className="px-1.5 py-0.5 bg-red-600 text-white text-xs rounded font-bold">MOD</span>
      );
    }
    // Fan club badge
    if (occupant.user_data?.inFanclub) {
      badges.push(
        <span key="fc" className="px-1.5 py-0.5 bg-purple-600 text-white text-xs rounded">FC</span>
      );
    }
    // Friend tier badge (with tier number)
    if (occupant.friend_tier && occupant.friend_tier > 0) {
      badges.push(
        <span key="friend" className="px-1.5 py-0.5 bg-amber-500/30 text-amber-400 text-xs rounded font-medium">
          Friend T{occupant.friend_tier}
        </span>
      );
    }
    // Sub level badge (with level)
    if (occupant.sub_level) {
      badges.push(
        <span key="sub" className="px-1.5 py-0.5 bg-purple-600/30 text-purple-400 text-xs rounded">
          Sub: {occupant.sub_level}
        </span>
      );
    }
    // Dom level badge (with level)
    if (occupant.dom_level) {
      badges.push(
        <span key="dom" className="px-1.5 py-0.5 bg-pink-600/30 text-pink-400 text-xs rounded">
          Dom: {occupant.dom_level}
        </span>
      );
    }
    // Following/Follower badges
    if (occupant.following) {
      badges.push(
        <span key="fol" className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-xs rounded">Following</span>
      );
    }
    if (occupant.is_follower) {
      badges.push(
        <span key="flr" className="px-1.5 py-0.5 bg-blue-600/30 text-blue-400 text-xs rounded">Follower</span>
      );
    }
    // Watch list badge
    if (occupant.watch_list) {
      badges.push(
        <span key="watch" className="px-1.5 py-0.5 bg-yellow-600/30 text-yellow-400 text-xs rounded">⚠ Watch</span>
      );
    }
    // Banned badge
    if (occupant.banned_me) {
      badges.push(
        <span key="ban" className="px-1.5 py-0.5 bg-red-600/30 text-red-400 text-xs rounded">🚫 Banned</span>
      );
    }
    // Tags (show first 3)
    if (occupant.tags && occupant.tags.length > 0) {
      occupant.tags.slice(0, 3).forEach((tag, i) => {
        badges.push(
          <span key={`tag-${i}`} className="px-1.5 py-0.5 bg-mhc-surface-light text-mhc-text-muted text-xs rounded">
            {tag}
          </span>
        );
      });
    }

    return badges;
  };

  const displayedOccupants = filteredOccupants();

  return (
    <div className="min-h-screen bg-mhc-dark">
      {/* Header */}
      <div className="sticky top-0 bg-mhc-dark border-b border-mhc-border p-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Live Room Monitor</h1>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${connected ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <div className="text-mhc-text-muted">
            <span className="text-white font-bold text-xl">{occupants.length}</span> users in room
          </div>
        </div>

        {error && (
          <div className="text-yellow-400 text-sm mb-4">{error}</div>
        )}

        {/* Filters */}
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
            {(['all', 'following', 'followers', 'tippers', 'regulars', 'new'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${filter === f ? 'bg-mhc-primary text-white' : 'bg-mhc-surface text-mhc-text-muted hover:bg-mhc-surface-light'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Sort buttons */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-mhc-text-muted text-sm">Sort:</span>
            {[
              { field: 'entered_at' as SortField, label: 'Time' },
              { field: 'username' as SortField, label: 'Name' },
              { field: 'total_tips' as SortField, label: 'Tips' },
              { field: 'total_visit_count' as SortField, label: 'Visits' },
            ].map(({ field, label }) => (
              <button
                key={field}
                onClick={() => handleSort(field)}
                className={`px-2 py-1 rounded text-sm ${sortField === field ? 'bg-mhc-primary text-white' : 'bg-mhc-surface text-mhc-text-muted hover:bg-mhc-surface-light'}`}
              >
                {label} {sortField === field && (sortAsc ? '↑' : '↓')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content - split view */}
      <div className="flex">
        {/* User list */}
        <div className="flex-1 p-4">
          {displayedOccupants.length === 0 ? (
            <div className="text-center text-mhc-text-muted py-16">
              {occupants.length === 0 ? 'No users in room' : 'No users match your filters'}
            </div>
          ) : (
            <div className="grid gap-2">
              {displayedOccupants.map(occupant => (
                <div
                  key={occupant.person_id}
                  onClick={() => handleUserClick(occupant.username)}
                  className="flex items-center justify-between p-3 bg-mhc-surface rounded-lg cursor-pointer hover:bg-mhc-surface-light transition-colors border border-transparent hover:border-mhc-primary"
                >
                  <div className="flex items-center gap-3">
                    {/* Username and badges */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{occupant.username}</span>
                        <div className="flex gap-1">
                          {getBadges(occupant)}
                        </div>
                      </div>
                      {/* Notes preview */}
                      {occupant.notes_preview && (
                        <div className="text-mhc-text-muted text-sm mt-1 truncate max-w-md">
                          {occupant.notes_preview}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 text-sm">
                    {/* Tips */}
                    {(occupant.total_tips || 0) > 0 && (
                      <div className="text-center">
                        <div className="text-amber-400 font-bold">{occupant.total_tips?.toLocaleString()}</div>
                        <div className="text-mhc-text-muted text-xs">tokens</div>
                      </div>
                    )}

                    {/* Visits */}
                    <div className="text-center">
                      <div className="text-white font-bold">{occupant.total_visit_count}</div>
                      <div className="text-mhc-text-muted text-xs">visits</div>
                    </div>

                    {/* Time in room */}
                    <div className="text-center min-w-[60px]">
                      <div className="text-mhc-text-muted text-xs">
                        {new Date(occupant.entered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Event log sidebar */}
        <div className="w-64 border-l border-mhc-border p-4 bg-mhc-surface-dark">
          <h3 className="text-mhc-text-muted text-sm font-semibold mb-3">Recent Activity</h3>
          <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
            {eventLog.map((event, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm py-1"
              >
                <span className={event.type === 'enter' ? 'text-green-400' : 'text-red-400'}>
                  {event.type === 'enter' ? '→' : '←'}
                </span>
                <span
                  className="text-white hover:text-mhc-primary cursor-pointer truncate"
                  onClick={() => handleUserClick(event.username)}
                >
                  {event.username}
                </span>
                <span className="text-mhc-text-muted text-xs ml-auto">
                  {event.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {eventLog.length === 0 && (
              <div className="text-mhc-text-muted text-sm">No activity yet</div>
            )}
          </div>
        </div>
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

export default LiveMonitor;
