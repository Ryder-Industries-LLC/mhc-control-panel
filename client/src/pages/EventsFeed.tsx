import React, { useState, useEffect } from 'react';
import { formatDate } from '../utils/formatting';
// EventsFeed.css removed - fully migrated to Tailwind CSS

interface EventLog {
  id: string;
  timestamp: string;
  method: string;
  broadcaster: string;
  username: string;
  rawEvent: Record<string, unknown>;
}

const EventsFeed: React.FC = () => {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<string>('all');

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

  const filteredEvents = filter === 'all'
    ? events
    : events.filter(e => e.method === filter);

  const eventTypes = Array.from(new Set(events.map(e => e.method)));

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

  return (
    <div className="max-w-7xl mx-auto p-5">
      <div className="flex justify-between items-center mb-5 py-8 border-b-2 border-mhc-primary">
        <h1 className="text-mhc-primary text-4xl font-bold m-0">Events API Feed</h1>
        <div className="flex gap-4 items-center">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-mhc-surface-light text-mhc-text-muted border border-gray-600 px-4 py-2 rounded-md text-sm cursor-pointer hover:border-mhc-primary transition-colors"
          >
            <option value="all">All Events</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
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

      <div className="text-mhc-text-muted text-sm mb-4 p-3 bg-mhc-surface-light rounded-md">
        Showing {filteredEvents.length} of {events.length} events
      </div>

      <div className="flex flex-col gap-3">
        {filteredEvents.map((event) => {
          const styles = getEventStyles(event.method);
          return (
            <div
              key={event.id}
              className={`bg-mhc-surface p-5 rounded-lg border-l-4 ${styles.border} ${styles.opacity || ''}`}
            >
              <div className="flex justify-between items-center mb-4">
                <span className={`text-lg font-bold uppercase tracking-wide ${styles.text}`}>
                  {event.method}
                </span>
                <span className="text-mhc-text-dim text-sm">{formatDate(event.timestamp)}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="flex gap-3 p-2.5 bg-mhc-surface-light rounded-md">
                  <span className="text-mhc-text-dim font-semibold min-w-[100px]">Broadcaster:</span>
                  <span className="text-mhc-text font-medium">{event.broadcaster}</span>
                </div>
                <div className="flex gap-3 p-2.5 bg-mhc-surface-light rounded-md">
                  <span className="text-mhc-text-dim font-semibold min-w-[100px]">User:</span>
                  <span className="text-mhc-text font-medium">{event.username}</span>
                </div>
              </div>
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
