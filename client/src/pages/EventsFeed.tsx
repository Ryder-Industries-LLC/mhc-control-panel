import React, { useState, useEffect } from 'react';
import { formatDate } from '../utils/formatting';
import './EventsFeed.css';

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

  return (
    <div className="events-feed">
      <div className="header">
        <h1>Events API Feed</h1>
        <div className="header-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Events</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
          <button className="btn-primary" onClick={fetchEvents}>
            Refresh Now
          </button>
        </div>
      </div>

      <div className="events-count">
        Showing {filteredEvents.length} of {events.length} events
      </div>

      <div className="events-list">
        {filteredEvents.map((event) => (
          <div key={event.id} className={`event-item event-${event.method.toLowerCase()}`}>
            <div className="event-header">
              <span className="event-method">{event.method}</span>
              <span className="event-timestamp">{formatDate(event.timestamp)}</span>
            </div>
            <div className="event-details">
              <div className="event-detail-row">
                <span className="label">Broadcaster:</span>
                <span className="value">{event.broadcaster}</span>
              </div>
              <div className="event-detail-row">
                <span className="label">User:</span>
                <span className="value">{event.username}</span>
              </div>
            </div>
            <details className="event-raw">
              <summary>Raw Event Data</summary>
              <pre>{JSON.stringify(event.rawEvent, null, 2)}</pre>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventsFeed;
