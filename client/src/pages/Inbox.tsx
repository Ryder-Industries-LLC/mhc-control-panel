import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatMilitaryTime, formatFullDate } from '../utils/formatting';

interface PMThread {
  username: string;
  message_count: number;
  last_message_at: string;
  last_message: string;
  is_from_user: boolean;
}

interface PMMessage {
  id: string;
  timestamp: string;
  from_user: string;
  to_user: string;
  message: string;
  is_from_broadcaster: boolean;
}

interface PMStats {
  totalMessages: number;
  uniqueUsers: number;
  messagesReceived: number;
  messagesSent: number;
}

const Inbox: React.FC = () => {
  const [threads, setThreads] = useState<PMThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<PMMessage[]>([]);
  const [stats, setStats] = useState<PMStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PMMessage[] | null>(null);
  const [searching, setSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchThreads();
    fetchStats();
  }, []);

  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread);
    }
  }, [selectedThread]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchThreads = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/inbox/threads?limit=100');
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch (err) {
      setError('Failed to load threads');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (username: string) => {
    try {
      setMessagesLoading(true);
      const res = await fetch(`/api/inbox/thread/${encodeURIComponent(username)}?limit=500`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/inbox/stats?days=30');
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      setSearching(true);
      const res = await fetch(`/api/inbox/search?q=${encodeURIComponent(searchQuery)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return formatMilitaryTime(timestamp);
    } else if (isYesterday) {
      return `Yesterday ${formatMilitaryTime(timestamp)}`;
    } else {
      return formatFullDate(timestamp);
    }
  };

  const getThreadForMessage = (msg: PMMessage): string => {
    return msg.is_from_broadcaster ? msg.to_user : msg.from_user;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-6">
        <p className="text-mhc-text-muted">Loading inbox...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Inbox
          </h1>
          <p className="text-mhc-text-muted">Private messages from your broadcasts</p>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-mhc-primary">{stats.totalMessages}</div>
            <div className="text-xs text-white/60 uppercase">Total Messages</div>
          </div>
          <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-purple-400">{stats.uniqueUsers}</div>
            <div className="text-xs text-white/60 uppercase">Conversations</div>
          </div>
          <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.messagesReceived}</div>
            <div className="text-xs text-white/60 uppercase">Received</div>
          </div>
          <div className="p-4 bg-mhc-surface border border-white/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats.messagesSent}</div>
            <div className="text-xs text-white/60 uppercase">Sent</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search messages..."
            className="flex-1 px-4 py-2 bg-mhc-surface border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-mhc-primary"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2 bg-mhc-primary hover:bg-mhc-primary-dark text-white rounded-lg transition-colors"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
          {searchResults && (
            <button
              onClick={clearSearch}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="mb-6 bg-mhc-surface border border-white/10 rounded-lg">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-semibold text-white">
              Search Results ({searchResults.length})
            </h3>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-white/50">No results found</div>
            ) : (
              searchResults.map(msg => (
                <div
                  key={msg.id}
                  className="p-3 hover:bg-white/5 cursor-pointer"
                  onClick={() => {
                    const thread = getThreadForMessage(msg);
                    setSelectedThread(thread);
                    clearSearch();
                  }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-mhc-primary font-medium">
                      {msg.is_from_broadcaster ? `To: ${msg.to_user}` : `From: ${msg.from_user}`}
                    </span>
                    <span className="text-xs text-white/40">{formatTimestamp(msg.timestamp)}</span>
                  </div>
                  <p className="text-white/70 text-sm line-clamp-2">{msg.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Content - Thread List + Messages */}
      <div className="flex gap-4 h-[600px]">
        {/* Thread List */}
        <div className="w-1/3 bg-mhc-surface border border-white/10 rounded-lg flex flex-col">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-semibold text-white">Conversations ({threads.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 ? (
              <div className="p-4 text-center text-white/50">No conversations yet</div>
            ) : (
              threads.map(thread => (
                <div
                  key={thread.username}
                  onClick={() => setSelectedThread(thread.username)}
                  className={`p-3 border-b border-white/5 cursor-pointer transition-colors ${
                    selectedThread === thread.username
                      ? 'bg-mhc-primary/20'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <Link
                      to={`/profile/${thread.username}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-mhc-primary font-medium hover:underline"
                    >
                      {thread.username}
                    </Link>
                    <span className="text-xs text-white/40">
                      {formatTimestamp(thread.last_message_at)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-white/60 text-sm truncate flex-1 mr-2">
                      {thread.is_from_user ? '' : 'You: '}
                      {thread.last_message}
                    </p>
                    <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded">
                      {thread.message_count}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Message View */}
        <div className="flex-1 bg-mhc-surface border border-white/10 rounded-lg flex flex-col">
          {selectedThread ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Link
                    to={`/profile/${selectedThread}`}
                    className="text-lg font-semibold text-mhc-primary hover:underline"
                  >
                    {selectedThread}
                  </Link>
                </div>
                <button
                  onClick={() => setSelectedThread(null)}
                  className="p-2 hover:bg-white/10 rounded-md text-white/60 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="text-center text-white/50">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-white/50">No messages</div>
                ) : (
                  <>
                    {messages.map((msg, i) => {
                      const prevMsg = messages[i - 1];
                      const showDate = !prevMsg ||
                        new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();

                      return (
                        <React.Fragment key={msg.id}>
                          {showDate && (
                            <div className="text-center text-xs text-white/40 my-4">
                              {formatFullDate(msg.timestamp)}
                            </div>
                          )}
                          <div className={`flex ${msg.is_from_broadcaster ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                msg.is_from_broadcaster
                                  ? 'bg-mhc-primary text-white'
                                  : 'bg-white/10 text-white'
                              }`}
                            >
                              {/* Username label */}
                              <p className={`text-xs font-semibold mb-1 ${
                                msg.is_from_broadcaster ? 'text-white/80' : 'text-mhc-primary'
                              }`}>
                                {msg.is_from_broadcaster ? 'You' : msg.from_user}
                              </p>
                              <p className="break-words">{msg.message}</p>
                              <p className={`text-xs mt-1 ${
                                msg.is_from_broadcaster ? 'text-white/70' : 'text-white/40'
                              }`}>
                                {formatMilitaryTime(msg.timestamp)}
                              </p>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/50">
              Select a conversation to view messages
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
