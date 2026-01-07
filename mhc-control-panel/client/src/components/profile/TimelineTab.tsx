import React, { useState, useEffect } from 'react';

interface TimelineEvent {
  id: string;
  type: string;
  content: string;
  timestamp: string;
  source: string;
  metadata: any;
  stream_session_id: string | null;
}

interface TimelineData {
  username: string;
  events: TimelineEvent[];
  total: number;
  limit: number;
  offset: number;
  selectedTypes: string[];
  availableTypes: string[];
}

interface TimelineTabProps {
  username: string;
}

const ALL_EVENT_TYPES = ['USER_ENTER', 'USER_LEAVE', 'CHAT_MESSAGE', 'PRIVATE_MESSAGE', 'TIP_EVENT', 'MEDIA_PURCHASE', 'FANCLUB_JOIN'];

const getEventIcon = (type: string) => {
  switch (type) {
    case 'USER_ENTER':
      return '➡️';
    case 'USER_LEAVE':
      return '⬅️';
    case 'CHAT_MESSAGE':
      return '💬';
    case 'PRIVATE_MESSAGE':
      return '🔒';
    case 'TIP_EVENT':
      return '💰';
    case 'MEDIA_PURCHASE':
      return '🎬';
    case 'FANCLUB_JOIN':
      return '⭐';
    default:
      return '📝';
  }
};

const getEventColor = (type: string) => {
  switch (type) {
    case 'USER_ENTER':
      return 'border-emerald-500/50 bg-emerald-500/10';
    case 'USER_LEAVE':
      return 'border-gray-500/50 bg-gray-500/10';
    case 'CHAT_MESSAGE':
      return 'border-blue-500/50 bg-blue-500/10';
    case 'PRIVATE_MESSAGE':
      return 'border-purple-500/50 bg-purple-500/10';
    case 'TIP_EVENT':
      return 'border-amber-500/50 bg-amber-500/10';
    case 'MEDIA_PURCHASE':
      return 'border-pink-500/50 bg-pink-500/10';
    case 'FANCLUB_JOIN':
      return 'border-yellow-500/50 bg-yellow-500/10';
    default:
      return 'border-white/20 bg-white/5';
  }
};

const getEventLabel = (type: string) => {
  switch (type) {
    case 'USER_ENTER':
      return 'Entered Room';
    case 'USER_LEAVE':
      return 'Left Room';
    case 'CHAT_MESSAGE':
      return 'Chat';
    case 'PRIVATE_MESSAGE':
      return 'Private Message';
    case 'TIP_EVENT':
      return 'Tip';
    case 'MEDIA_PURCHASE':
      return 'Media Purchase';
    case 'FANCLUB_JOIN':
      return 'Fan Club Join';
    default:
      return type;
  }
};

const getFilterButtonColor = (type: string, isActive: boolean) => {
  if (!isActive) return 'bg-white/5 text-mhc-text-muted border-white/10';

  switch (type) {
    case 'USER_ENTER':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
    case 'USER_LEAVE':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    case 'CHAT_MESSAGE':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'PRIVATE_MESSAGE':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 'TIP_EVENT':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    case 'MEDIA_PURCHASE':
      return 'bg-pink-500/20 text-pink-400 border-pink-500/50';
    case 'FANCLUB_JOIN':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    default:
      return 'bg-mhc-primary/20 text-mhc-primary border-mhc-primary/50';
  }
};

export const TimelineTab: React.FC<TimelineTabProps> = ({ username }) => {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(ALL_EVENT_TYPES);
  const limit = 50;

  useEffect(() => {
    if (!username) return;

    const loadTimeline = async () => {
      setLoading(true);
      setError(null);
      try {
        const typesParam = selectedTypes.length === ALL_EVENT_TYPES.length
          ? ''
          : `&types=${selectedTypes.join(',')}`;
        const response = await fetch(`/api/profile/${username}/timeline?limit=${limit}&offset=${offset}${typesParam}`);
        if (!response.ok) {
          throw new Error('Failed to load timeline');
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError('Failed to load timeline');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadTimeline();
  }, [username, offset, selectedTypes]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatTokens = (metadata: any) => {
    if (metadata?.tokens) {
      return `${metadata.tokens.toLocaleString()} tokens`;
    }
    return null;
  };

  const toggleEventType = (type: string) => {
    setOffset(0); // Reset pagination when changing filters
    if (selectedTypes.includes(type)) {
      // Don't allow deselecting all types
      if (selectedTypes.length > 1) {
        setSelectedTypes(selectedTypes.filter(t => t !== type));
      }
    } else {
      setSelectedTypes([...selectedTypes, type]);
    }
  };

  const selectAllTypes = () => {
    setOffset(0);
    setSelectedTypes(ALL_EVENT_TYPES);
  };

  if (loading && !data) {
    return (
      <div className="text-center text-mhc-text-muted py-8">
        Loading timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-400 py-8">
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Event Type Filters */}
      <div className="mb-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-mhc-text-muted mr-1">Filter:</span>
          <button
            onClick={selectAllTypes}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              selectedTypes.length === ALL_EVENT_TYPES.length
                ? 'bg-mhc-primary/20 text-mhc-primary border-mhc-primary/50'
                : 'bg-white/5 text-mhc-text-muted border-white/10 hover:bg-white/10'
            }`}
          >
            All
          </button>
          {ALL_EVENT_TYPES.map(type => (
            <button
              key={type}
              onClick={() => toggleEventType(type)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${getFilterButtonColor(type, selectedTypes.includes(type))}`}
            >
              {getEventIcon(type)} {getEventLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {(!data || data.events.length === 0) && (
        <div className="text-center text-mhc-text-muted py-8">
          No timeline events found{selectedTypes.length < ALL_EVENT_TYPES.length && ' for selected filters'}
        </div>
      )}

      {/* Timeline */}
      {data && data.events.length > 0 && (
        <>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-white/10"></div>

            {/* Events */}
            <div className="space-y-3">
              {data.events.map((event) => (
                <div key={event.id} className="relative pl-12">
                  {/* Dot on timeline */}
                  <div className="absolute left-3.5 top-3 w-3 h-3 rounded-full bg-mhc-surface border-2 border-white/30"></div>

                  {/* Event card */}
                  <div className={`p-3 rounded-lg border ${getEventColor(event.type)}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getEventIcon(event.type)}</span>
                        <span className="text-sm font-medium text-mhc-text">
                          {getEventLabel(event.type)}
                        </span>
                        {event.type === 'TIP_EVENT' && formatTokens(event.metadata) && (
                          <span className="text-xs px-2 py-0.5 bg-amber-500/30 text-amber-300 rounded">
                            {formatTokens(event.metadata)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-mhc-text-muted whitespace-nowrap">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    {event.content && event.type !== 'USER_ENTER' && event.type !== 'USER_LEAVE' && (
                      <div className="text-sm text-mhc-text/80 mt-1 whitespace-pre-wrap">
                        {event.content}
                      </div>
                    )}
                    {event.metadata?.broadcaster && event.metadata.broadcaster !== 'hudson_cage' && (
                      <div className="text-xs text-mhc-text-muted mt-1">
                        in {event.metadata.broadcaster}'s room
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {data.total > limit && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
              <span className="text-sm text-mhc-text-muted">
                Showing {offset + 1}-{Math.min(offset + data.events.length, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0 || loading}
                  className="px-3 py-1 text-sm bg-mhc-surface-light border border-white/10 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= data.total || loading}
                  className="px-3 py-1 text-sm bg-mhc-surface-light border border-white/10 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimelineTab;
