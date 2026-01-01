import React, { useState, useEffect } from 'react';
import { useUser } from '../../context/UserContext';

interface Message {
  id: string;
  content: string;
  timestamp: string;
  source: string;
  metadata: any;
  stream_session_id: string | null;
  broadcaster?: string;
}

interface CommunicationsData {
  username: string;
  direct_messages: Message[];
  pm_my_room: Message[];
  pm_their_room: Message[];
  total: number;
}

interface CommsSectionProps {
  username: string;
}

type CommsTab = 'dm' | 'pm_my_room' | 'pm_their_room';

export const CommsSection: React.FC<CommsSectionProps> = ({ username }) => {
  const { currentUsername } = useUser();
  const [activeTab, setActiveTab] = useState<CommsTab>('pm_my_room');
  const [data, setData] = useState<CommunicationsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;

    const loadCommunications = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/profile/${username}/communications?limit=100`);
        if (!response.ok) {
          throw new Error('Failed to load communications');
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError('Failed to load communications');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadCommunications();
  }, [username]);

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

  const renderMessages = (messages: Message[]) => {
    if (messages.length === 0) {
      return (
        <div className="text-center text-mhc-text-muted py-8">
          No messages found
        </div>
      );
    }

    return (
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {messages.map((msg) => {
          const fromUser = msg.metadata?.fromUser;
          const toUser = msg.metadata?.toUser;

          return (
            <div
              key={msg.id}
              className="p-3 bg-mhc-surface-light rounded-lg border border-white/10"
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-mhc-text-muted">
                    {formatTimestamp(msg.timestamp)}
                  </span>
                  {(fromUser || toUser) && (
                    <span className="text-xs text-mhc-text-muted">
                      {fromUser && (
                        <span>
                          <span className="text-blue-400 font-medium">{fromUser}</span>
                          {toUser && <span className="text-white/40"> → </span>}
                        </span>
                      )}
                      {toUser && (
                        <span className="text-emerald-400 font-medium">{toUser}</span>
                      )}
                    </span>
                  )}
                </div>
                {msg.broadcaster && (
                  <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                    in {msg.broadcaster}'s room
                  </span>
                )}
              </div>
              <div className="text-mhc-text whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="text-center text-mhc-text-muted py-8">
        Loading communications...
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

  if (!data) {
    return null;
  }

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex gap-1 mb-4 border-b border-white/10 pb-2">
        <button
          className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
            activeTab === 'dm'
              ? 'bg-mhc-primary text-white'
              : 'text-mhc-text-muted hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('dm')}
        >
          Direct Messages {data.direct_messages.length > 0 && `(${data.direct_messages.length})`}
        </button>
        <button
          className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
            activeTab === 'pm_my_room'
              ? 'bg-mhc-primary text-white'
              : 'text-mhc-text-muted hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('pm_my_room')}
        >
          PMs in {currentUsername}'s Room {data.pm_my_room.length > 0 && `(${data.pm_my_room.length})`}
        </button>
        <button
          className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
            activeTab === 'pm_their_room'
              ? 'bg-mhc-primary text-white'
              : 'text-mhc-text-muted hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('pm_their_room')}
        >
          PMs in {username}'s Room {data.pm_their_room.length > 0 && `(${data.pm_their_room.length})`}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'dm' && renderMessages(data.direct_messages)}
      {activeTab === 'pm_my_room' && renderMessages(data.pm_my_room)}
      {activeTab === 'pm_their_room' && renderMessages(data.pm_their_room)}
    </div>
  );
};

export default CommsSection;
