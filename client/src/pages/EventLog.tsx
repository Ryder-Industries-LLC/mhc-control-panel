import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatFullDate, formatMilitaryTime } from '../utils/formatting';
import { CollapsibleSection } from '../components/CollapsibleSection';

interface EventLogEntry {
  id: string;
  timestamp: string;
  method: string;
  broadcaster: string;
  username: string;
  rawEvent: Record<string, unknown>;
}

const EventLog: React.FC = () => {
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [showRawJson, setShowRawJson] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Available event methods for filtering
  const eventMethods = [
    { value: 'all', label: 'All Events' },
    { value: 'mediaPurchase', label: 'Media Purchase' },
    { value: 'tip', label: 'Tip' },
    { value: 'follow', label: 'Follow' },
    { value: 'unfollow', label: 'Unfollow' },
    { value: 'fanclubJoin', label: 'Fanclub Join' },
    { value: 'directMessage', label: 'Direct Message' },
    { value: 'privateMessage', label: 'Private Message' },
    { value: 'roomSubjectChange', label: 'Room Subject Change' },
    { value: 'broadcastStart', label: 'Broadcast Start' },
    { value: 'broadcastStop', label: 'Broadcast Stop' },
    { value: 'userEnter', label: 'User Enter' },
    { value: 'userLeave', label: 'User Leave' },
    { value: 'chatMessage', label: 'Chat Message' },
  ];

  useEffect(() => {
    fetchEvents();
  }, [methodFilter]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const methodParam = methodFilter !== 'all' ? `&method=${methodFilter}` : '';
      const res = await fetch(`/api/events/recent?limit=200${methodParam}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      } else {
        throw new Error('Failed to fetch events');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const getMethodBadge = (method: string) => {
    const base = "inline-block px-2 py-0.5 rounded text-xs font-semibold";
    switch (method) {
      case 'tip':
        return `${base} bg-amber-500/20 text-amber-400 border border-amber-500/30`;
      case 'follow':
        return `${base} bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`;
      case 'unfollow':
        return `${base} bg-red-500/20 text-red-400 border border-red-500/30`;
      case 'mediaPurchase':
        return `${base} bg-purple-500/20 text-purple-400 border border-purple-500/30`;
      case 'fanclubJoin':
        return `${base} bg-pink-500/20 text-pink-400 border border-pink-500/30`;
      case 'directMessage':
        return `${base} bg-indigo-500/20 text-indigo-400 border border-indigo-500/30`;
      case 'privateMessage':
        return `${base} bg-blue-500/20 text-blue-400 border border-blue-500/30`;
      case 'chatMessage':
        return `${base} bg-teal-500/20 text-teal-400 border border-teal-500/30`;
      case 'broadcastStart':
      case 'broadcastStop':
        return `${base} bg-cyan-500/20 text-cyan-400 border border-cyan-500/30`;
      case 'userEnter':
      case 'userLeave':
        return `${base} bg-gray-500/20 text-gray-400 border border-gray-500/30`;
      default:
        return `${base} bg-white/10 text-white/60 border border-white/20`;
    }
  };

  const formatEventDetails = (event: EventLogEntry) => {
    const raw = event.rawEvent as Record<string, unknown>;
    const details: string[] = [];

    if (raw.tokens && typeof raw.tokens === 'number') {
      details.push(`${raw.tokens} tokens`);
    }
    if (raw.message && typeof raw.message === 'string') {
      details.push(`"${raw.message.substring(0, 50)}${raw.message.length > 50 ? '...' : ''}"`);
    }
    if (raw.media && typeof raw.media === 'object') {
      const media = raw.media as Record<string, unknown>;
      if (media.type) details.push(`(${media.type})`);
    }

    return details.join(' - ');
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-5 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-mhc-primary mx-auto"></div>
        <p className="text-white/60 mt-4">Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-5">
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-5">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Event Log
          </h1>
          <p className="text-mhc-text-muted">
            Real-time events from Chaturbate Events API
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <label className="flex items-center gap-2 text-white/60 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showRawJson}
              onChange={(e) => setShowRawJson(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/30 text-mhc-primary focus:ring-mhc-primary cursor-pointer"
            />
            Show Raw JSON
          </label>
          <button
            onClick={fetchEvents}
            className="px-4 py-2 bg-mhc-primary text-white rounded-lg hover:bg-mhc-primary/80 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/5 rounded-lg border border-white/10 p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {eventMethods.map(method => (
            <button
              key={method.value}
              onClick={() => setMethodFilter(method.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                methodFilter === method.value
                  ? 'bg-mhc-primary text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
              }`}
            >
              {method.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white/5 rounded-lg border border-white/10 p-4 text-center">
          <div className="text-2xl font-bold text-mhc-primary">{events.length.toLocaleString()}</div>
          <div className="text-white/60 text-sm">Events Loaded</div>
        </div>
        <div className="bg-white/5 rounded-lg border border-white/10 p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">
            {events.filter(e => e.method === 'tip').length.toLocaleString()}
          </div>
          <div className="text-white/60 text-sm">Tips</div>
        </div>
        <div className="bg-white/5 rounded-lg border border-white/10 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {events.filter(e => e.method === 'follow').length.toLocaleString()}
          </div>
          <div className="text-white/60 text-sm">Follows</div>
        </div>
        <div className="bg-white/5 rounded-lg border border-white/10 p-4 text-center">
          <div className="text-2xl font-bold text-indigo-400">
            {events.filter(e => e.method === 'directMessage').length.toLocaleString()}
          </div>
          <div className="text-white/60 text-sm">DMs</div>
        </div>
        <div className="bg-white/5 rounded-lg border border-white/10 p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">
            {events.filter(e => e.method === 'privateMessage').length.toLocaleString()}
          </div>
          <div className="text-white/60 text-sm">PMs</div>
        </div>
      </div>

      {/* Events List */}
      <CollapsibleSection
        title={`Events (${events.length})`}
        defaultCollapsed={false}
        className="bg-mhc-surface"
      >
        <div className="divide-y divide-white/10">
          {events.length === 0 ? (
            <div className="p-8 text-center text-white/50">
              No events found for this filter.
            </div>
          ) : (
            events.map(event => (
              <div
                key={event.id}
                className="p-4 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
              >
                <div className="flex items-center gap-4">
                  {/* Timestamp */}
                  <div className="text-sm text-white/50 font-mono min-w-[140px]">
                    {formatMilitaryTime(event.timestamp)}
                    <div className="text-xs text-white/30">{formatFullDate(event.timestamp)}</div>
                  </div>

                  {/* Method badge */}
                  <div className="min-w-[120px]">
                    <span className={getMethodBadge(event.method)}>{event.method}</span>
                  </div>

                  {/* Username */}
                  <div className="flex-1">
                    {event.username ? (
                      <Link
                        to={`/profile/${event.username}`}
                        className="text-mhc-primary hover:underline font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.username}
                      </Link>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                    <span className="text-white/50 text-sm ml-2">
                      {formatEventDetails(event)}
                    </span>
                  </div>

                  {/* Expand indicator */}
                  <div className="text-white/30">
                    {expandedEvent === event.id ? '▼' : '▶'}
                  </div>
                </div>

                {/* Expanded view with both raw and processed data */}
                {(showRawJson || expandedEvent === event.id) && expandedEvent === event.id && (
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Our Processed Data */}
                    <div className="p-4 bg-mhc-primary/10 border border-mhc-primary/30 rounded-lg overflow-x-auto">
                      <div className="text-xs font-semibold text-mhc-primary mb-2 uppercase tracking-wide">
                        Our Processed Data
                      </div>
                      <pre className="text-xs text-white/70 font-mono">
{JSON.stringify({
  id: event.id,
  method: event.method,
  broadcaster: event.broadcaster,
  username: event.username,
  timestamp: event.timestamp,
}, null, 2)}
                      </pre>
                    </div>
                    {/* Raw Chaturbate API Data */}
                    <div className="p-4 bg-black/30 rounded-lg overflow-x-auto">
                      <div className="text-xs font-semibold text-white/50 mb-2 uppercase tracking-wide">
                        Raw Chaturbate API Data
                      </div>
                      <pre className="text-xs text-white/70 font-mono">
                        {JSON.stringify(event.rawEvent, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default EventLog;
