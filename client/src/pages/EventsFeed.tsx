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
}

const EVENT_TABS: EventTab[] = [
  { id: 'all', label: 'All Events' },
  { id: 'chat', label: 'Chat', methods: ['chatmessage'] },
  { id: 'private', label: 'Private Messages', methods: ['privatemessage'] },
  { id: 'tips', label: 'Tips', methods: ['tip'] },
  { id: 'presence', label: 'User Enter/Leave', methods: ['userenter', 'userleave'] },
  { id: 'follows', label: 'Follows', methods: ['follow'] },
  { id: 'broadcasts', label: 'Broadcasts', methods: ['broadcaststart', 'broadcaststop'] },
];

const EventsFeed: React.FC = () => {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');

  const fetchEvents = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/events/recent');
      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  };

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
    if (!tab || !tab.methods) return events;

    return events.filter(e => tab.methods!.includes(e.method.toLowerCase()));
  }, [events, activeTab]);

  // Get counts per tab for badges
  const tabCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: events.length };
    EVENT_TABS.forEach(tab => {
      if (tab.methods) {
        counts[tab.id] = events.filter(e =>
          tab.methods!.includes(e.method.toLowerCase())
        ).length;
      }
    });
    return counts;
  }, [events]);

  // Get event-specific border and text colors
  const getEventStyles = (method: string) => {
    const m = method.toLowerCase();
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
          const styles = getEventStyles(event.method);
          const content = getEventContent(event);
          const method = event.method.toLowerCase();

          return (
            <div
              key={event.id}
              className={`bg-mhc-surface p-5 rounded-lg border-l-4 ${styles.border} ${styles.opacity || ''}`}
            >
              {/* Header with event type, room, and timestamp */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge type={event.method.toUpperCase()} variant="interaction" size="md" />
                  <span className="text-mhc-text-muted text-sm">
                    {formatRoomName(event.broadcaster)}
                  </span>
                  {content?.isFollower && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400">
                      Follower
                    </span>
                  )}
                </div>
                <span className="text-mhc-text-dim text-sm whitespace-nowrap">
                  {formatMilitaryTime(event.timestamp)}
                </span>
              </div>

              {/* From/To display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="flex gap-3 p-2.5 bg-mhc-surface-light rounded-md">
                  <span className="text-mhc-text-dim font-semibold min-w-[60px]">From:</span>
                  <Link
                    to={`/?username=${content?.fromUser || event.username}`}
                    className="text-mhc-primary font-medium hover:underline"
                  >
                    {content?.fromUser || event.username}
                  </Link>
                </div>
                {(method === 'chatmessage' || method === 'privatemessage' || method === 'tip' || method === 'follow') && (
                  <div className="flex gap-3 p-2.5 bg-mhc-surface-light rounded-md">
                    <span className="text-mhc-text-dim font-semibold min-w-[60px]">To:</span>
                    {content?.toUser === 'Public' ? (
                      <span className="text-mhc-text font-medium">Public</span>
                    ) : (
                      <Link
                        to={`/?username=${content?.toUser || event.broadcaster}`}
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
                <div className="mb-4 p-3 bg-mhc-surface-light rounded-md">
                  <p className="text-white/80 leading-relaxed m-0">"{content.message}"</p>
                </div>
              )}

              {/* Raw data toggle */}
              <details className="mt-3">
                <summary className="text-mhc-text-muted cursor-pointer p-2 bg-mhc-surface-light rounded-md text-sm font-semibold select-none hover:bg-gray-600 transition-colors">
                  Raw Event Data
                </summary>
                <pre className="mt-3 p-4 bg-black border border-mhc-surface-light rounded-md text-emerald-500 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(event.rawEvent, null, 2)}
                </pre>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EventsFeed;
