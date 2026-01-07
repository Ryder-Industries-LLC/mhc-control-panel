import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatMilitaryTime } from '../utils/formatting';
import Badge from '../components/Badge';
// EventsFeed.css removed - fully migrated to Tailwind CSS

interface EventMessage {
  message?: string;
  fromUser?: string;
  toUser?: string;
  isFollower?: boolean;
  amount?: number;
  tokens?: number;
}

interface EventLog {
  id: string;
  timestamp: string;
  method: string;
  broadcaster: string;
  username: string;
  rawEvent: {
    // Direct structure - no "object" wrapper
    message?: EventMessage;
    user?: {
      isFollower?: boolean;
      username?: string;
    };
    tip?: {
      amount?: number;
      tokens?: number;
      message?: string;
    };
    broadcaster?: string;
    [key: string]: unknown;
  };
}

// Tab configuration for event filtering
interface EventTab {
  id: string;
  label: string;
  methods?: string[];
  customFilter?: (event: EventLog) => boolean;
}

// Helper: Check if a private message is actually a Direct Message (no broadcaster)
const isDirectMessage = (event: EventLog): boolean => {
  return event.method.toLowerCase() === 'privatemessage' && (!event.broadcaster || event.broadcaster === '');
};

// Helper: Check if a private message is a room Private Message (has broadcaster)
const isRoomPrivateMessage = (event: EventLog): boolean => {
  return event.method.toLowerCase() === 'privatemessage' && Boolean(event.broadcaster) && event.broadcaster !== '';
};

// GUARDRAIL: Deduplicate events using strict key matching
// Dedup only when ALL of: timestamp, fromUser, toUser, message, broadcaster match exactly
const dedupeEvents = (events: EventLog[]): EventLog[] => {
  const seen = new Set<string>();
  return events.filter(e => {
    const message = e.rawEvent?.message;
    const fromUser = message?.fromUser || e.username || '';
    const toUser = message?.toUser || e.broadcaster || '';
    const msgText = message?.message || '';
    const broadcaster = e.broadcaster || 'DM';

    // Strict key: timestamp|fromUser|toUser|message|broadcaster
    const key = `${e.timestamp}|${fromUser}|${toUser}|${msgText}|${broadcaster}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const EVENT_TABS: EventTab[] = [
  { id: 'all', label: 'All Events' },
  { id: 'chat', label: 'Chat', methods: ['chatmessage'] },
  { id: 'direct', label: 'Direct', customFilter: isDirectMessage },
  { id: 'private', label: 'Private', customFilter: isRoomPrivateMessage },
  { id: 'tips', label: 'Tips', methods: ['tip'] },
  { id: 'presence', label: 'Enter/Leave', methods: ['userenter', 'userleave'] },
  { id: 'follows', label: 'Follows', methods: ['follow'] },
  { id: 'broadcasts', label: 'Broadcasts', methods: ['broadcaststart', 'broadcaststop'] },
];

const EventsFeed: React.FC = () => {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('');

  const fetchEvents = async () => {
    try {
      // Fetch more events (500) for important tabs, fewer for presence events
      const response = await fetch('/api/events/recent?limit=500');
      const data = await response.json();
      // Apply deduplication to prevent showing duplicate events
      setEvents(dedupeEvents(data.events || []));
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  };

  // Get unique tags from users in events
  const availableTags = React.useMemo(() => {
    // This would require fetching tags from profiles - for now, leave empty
    // Tags would come from the users' profile data
    return [] as string[];
  }, []);

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchEvents();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Filter events based on active tab
  const filteredEvents = React.useMemo(() => {
    if (activeTab === 'all') return events;

    const tab = EVENT_TABS.find(t => t.id === activeTab);
    if (!tab) return events;

    // Use custom filter if provided, otherwise filter by methods
    if (tab.customFilter) {
      return events.filter(tab.customFilter);
    } else if (tab.methods) {
      return events.filter(e => tab.methods!.includes(e.method.toLowerCase()));
    }

    return events;
  }, [events, activeTab]);

  // Get counts per tab for badges
  const tabCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: events.length };
    EVENT_TABS.forEach(tab => {
      if (tab.customFilter) {
        counts[tab.id] = events.filter(tab.customFilter).length;
      } else if (tab.methods) {
        counts[tab.id] = events.filter(e =>
          tab.methods!.includes(e.method.toLowerCase())
        ).length;
      }
    });
    return counts;
  }, [events]);

  // Get event-specific border and text colors
  const getEventStyles = (method: string, event?: EventLog) => {
    const m = method.toLowerCase();

    // Special handling for private messages - check if it's actually a direct message
    if (m === 'privatemessage' && event && isDirectMessage(event)) {
      return { border: 'border-l-cyan-400', text: 'text-cyan-400' };
    }

    switch (m) {
      case 'broadcaststart':
        return { border: 'border-l-emerald-500', text: 'text-emerald-500' };
      case 'broadcaststop':
        return { border: 'border-l-red-400', text: 'text-red-400' };
      case 'chatmessage':
        return { border: 'border-l-mhc-primary', text: 'text-mhc-primary' };
      case 'privatemessage':
        return { border: 'border-l-purple-400', text: 'text-purple-400' };
      case 'tip':
        return { border: 'border-l-yellow-400', text: 'text-yellow-400' };
      case 'follow':
        return { border: 'border-l-orange-500', text: 'text-orange-500' };
      case 'userenter':
        return { border: 'border-l-teal-500', text: 'text-teal-500' };
      case 'userleave':
        return { border: 'border-l-gray-600', text: 'text-gray-500', opacity: 'opacity-70' };
      case 'fanclubjoin':
        return { border: 'border-l-pink-400', text: 'text-pink-400' };
      default:
        return { border: 'border-l-mhc-primary', text: 'text-mhc-primary' };
    }
  };

  // Get display label for event type (including Direct vs Private distinction)
  const getEventTypeLabel = (event: EventLog): string => {
    if (isDirectMessage(event)) {
      return 'DIRECT MESSAGE';
    }
    // Add spaces to event type names
    const method = event.method.toUpperCase();
    return method
      .replace('PRIVATEMESSAGE', 'PRIVATE MESSAGE')
      .replace('CHATMESSAGE', 'CHAT MESSAGE')
      .replace('USERENTER', 'USER ENTER')
      .replace('USERLEAVE', 'USER LEAVE')
      .replace('BROADCASTSTART', 'BROADCAST START')
      .replace('BROADCASTSTOP', 'BROADCAST STOP')
      .replace('FANCLUBJOIN', 'FANCLUB JOIN');
  };

  // Extract message content and metadata from event
  const getEventContent = (event: EventLog) => {
    const rawEvent = event.rawEvent;
    if (!rawEvent) return null;

    const method = event.method.toLowerCase();

    // For chat and private messages
    if (method === 'chatmessage' || method === 'privatemessage') {
      const msg = rawEvent.message;
      const user = rawEvent.user;
      return {
        message: msg?.message || null,
        // For private messages: prefer message.fromUser, fallback to user.username, then event.username
        fromUser: msg?.fromUser || user?.username || event.username,
        // For private messages: prefer message.toUser, fallback to broadcaster for PM, 'Public' for chat
        toUser: msg?.toUser || (method === 'chatmessage' ? 'Public' : event.broadcaster),
        isFollower: user?.isFollower || msg?.isFollower || false,
      };
    }

    // For tips
    if (method === 'tip') {
      const tip = rawEvent.tip;
      return {
        message: tip?.message || null,
        amount: tip?.tokens || tip?.amount || 0,
        fromUser: event.username,
        toUser: event.broadcaster,
        isFollower: rawEvent.user?.isFollower || false,
      };
    }

    // For follows
    if (method === 'follow') {
      return {
        fromUser: event.username,
        toUser: event.broadcaster,
        isFollower: true,
      };
    }

    // For user enter/leave
    if (method === 'userenter' || method === 'userleave') {
      return {
        fromUser: event.username,
        isFollower: rawEvent.user?.isFollower || false,
      };
    }

    return null;
  };

  // Format room display name
  const formatRoomName = (broadcaster: string) => {
    // Capitalize first letter of broadcaster name
    const formatted = broadcaster.charAt(0).toUpperCase() + broadcaster.slice(1).replace(/_/g, ' ');
    return `${formatted}'s Room`;
  };

  return (
    <div className="max-w-7xl mx-auto p-5">
      <div className="flex justify-between items-center mb-5 py-8 border-b-2 border-mhc-primary">
        <h1 className="text-mhc-primary text-4xl font-bold m-0">Events API Feed</h1>
        <div className="flex gap-4 items-center">
          <label className="flex items-center text-mhc-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2 w-4 h-4 cursor-pointer accent-mhc-primary"
            />
            Auto-refresh (5s)
          </label>
          <button
            className="bg-gradient-primary text-white border-none px-6 py-2.5 rounded-md text-sm font-semibold cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mhc-primary/30"
            onClick={fetchEvents}
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Event Type Tabs */}
      <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-700 pb-4">
        {EVENT_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-mhc-primary text-white'
                : 'bg-mhc-surface-light text-mhc-text-muted hover:bg-mhc-surface hover:text-white'
            }`}
          >
            {tab.label}
            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
              activeTab === tab.id
                ? 'bg-white/20'
                : 'bg-gray-600'
            }`}>
              {tabCounts[tab.id] || 0}
            </span>
          </button>
        ))}
      </div>

      <div className="text-mhc-text-muted text-sm mb-4 p-3 bg-mhc-surface-light rounded-md">
        Showing {filteredEvents.length} of {events.length} events
      </div>

      <div className="flex flex-col gap-4">
        {filteredEvents.map((event) => {
          const styles = getEventStyles(event.method, event);
          const content = getEventContent(event);
          const method = event.method.toLowerCase();
          const eventTypeLabel = getEventTypeLabel(event);
          const isDirect = isDirectMessage(event);

          return (
            <div
              key={event.id}
              className={`bg-mhc-surface p-5 rounded-lg border-l-4 ${styles.border} ${styles.opacity || ''}`}
            >
              {/* Header with event type, badges, and overflow menu */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Event type badge */}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                    isDirect
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : styles.text.replace('text-', 'text-') + ' bg-white/10 border border-white/20'
                  }`}>
                    {eventTypeLabel}
                  </span>
                  {/* Room indicator - only show if there's a broadcaster */}
                  {event.broadcaster && (
                    <span className="text-mhc-text-muted text-sm">
                      {formatRoomName(event.broadcaster)}
                    </span>
                  )}
                  {content?.isFollower && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">
                      Followed by you
                    </span>
                  )}
                </div>
                {/* Overflow menu with Raw Data option */}
                <div className="relative group">
                  <button className="p-1.5 rounded hover:bg-white/10 transition-colors text-mhc-text-muted hover:text-white">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-40 bg-mhc-surface-light border border-white/10 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <details className="cursor-pointer">
                      <summary className="px-3 py-2 text-sm text-mhc-text hover:bg-white/5 rounded-md list-none">
                        View Raw Data
                      </summary>
                      <div className="absolute right-full top-0 mr-2 w-[400px] max-h-[400px] overflow-auto bg-black border border-white/20 rounded-md shadow-xl">
                        <pre className="p-3 text-emerald-500 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                          {JSON.stringify(event.rawEvent, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                </div>
              </div>

              {/* Stacked From/To with full date/time */}
              <div className="space-y-2 mb-4">
                {/* From row */}
                <div className="flex items-center gap-3 p-2.5 bg-mhc-surface-light rounded-md">
                  <span className="text-mhc-text-dim font-semibold min-w-[50px]">From:</span>
                  <Link
                    to={`/profile/${content?.fromUser || event.username}`}
                    className="text-mhc-primary font-medium hover:underline"
                  >
                    {content?.fromUser || event.username}
                  </Link>
                  <span className="ml-auto text-mhc-text-dim text-xs">
                    {new Date(event.timestamp).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </span>
                </div>
                {/* To row */}
                {(method === 'chatmessage' || method === 'privatemessage' || method === 'tip' || method === 'follow') && (
                  <div className="flex items-center gap-3 p-2.5 bg-mhc-surface-light rounded-md">
                    <span className="text-mhc-text-dim font-semibold min-w-[50px]">To:</span>
                    {content?.toUser === 'Public' ? (
                      <span className="text-mhc-text font-medium">Public</span>
                    ) : (
                      <Link
                        to={`/profile/${content?.toUser || event.broadcaster}`}
                        className="text-mhc-primary font-medium hover:underline"
                      >
                        {content?.toUser || event.broadcaster}
                      </Link>
                    )}
                  </div>
                )}
              </div>

              {/* Tip amount display */}
              {method === 'tip' && content?.amount && (
                <div className="mb-4 p-3 bg-yellow-500/10 rounded-md border border-yellow-500/20">
                  <span className="text-yellow-400 font-bold text-lg">
                    {content.amount} tokens
                  </span>
                </div>
              )}

              {/* Message content inline */}
              {content?.message && (
                <div className="p-3 bg-mhc-surface-light rounded-md">
                  <p className="text-white/80 leading-relaxed m-0">{content.message}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EventsFeed;
