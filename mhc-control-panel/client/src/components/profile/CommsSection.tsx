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
  const [showRawData, setShowRawData] = useState(false);

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

  const formatFullDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatMilitaryTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
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

    // Determine if message is from broadcaster (sent by the viewing user)
    const isFromBroadcaster = (msg: Message): boolean => {
      const fromUser = msg.metadata?.fromUser?.toLowerCase();
      const toUser = msg.metadata?.toUser?.toLowerCase();
      const profileUsername = username.toLowerCase();
      // If fromUser is NOT the profile we're viewing, it's from broadcaster (us)
      return fromUser !== profileUsername;
    };

    return (
      <div className="space-y-3 max-h-[400px] overflow-y-auto p-4">
        {messages.map((msg, i) => {
          const prevMsg = messages[i - 1];
          const showDate = !prevMsg ||
            new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();
          const isBroadcaster = isFromBroadcaster(msg);

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div className="text-center text-xs text-white/40 my-4">
                  {formatFullDate(msg.timestamp)}
                </div>
              )}
              <div className={`flex ${isBroadcaster ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    isBroadcaster
                      ? 'bg-mhc-primary text-white'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-1 ${
                    isBroadcaster ? 'text-white/70' : 'text-white/40'
                  }`}>
                    {formatMilitaryTime(msg.timestamp)}
                    {msg.broadcaster && (
                      <span className="ml-2">in {msg.broadcaster}'s room</span>
                    )}
                  </p>
                </div>
              </div>
            </React.Fragment>
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

  const getCurrentMessages = (): Message[] => {
    switch (activeTab) {
      case 'dm': return data.direct_messages;
      case 'pm_my_room': return data.pm_my_room;
      case 'pm_their_room': return data.pm_their_room;
    }
  };

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

        {/* Show Raw Data toggle */}
        <button
          className={`ml-auto px-3 py-1 text-xs font-medium rounded transition-colors ${
            showRawData
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
              : 'text-mhc-text-muted hover:bg-white/5 border border-transparent'
          }`}
          onClick={() => setShowRawData(!showRawData)}
        >
          {showRawData ? 'Hide Raw' : 'Show Raw'}
        </button>
      </div>

      {/* Tab content */}
      {showRawData ? (
        <div className="bg-mhc-surface-light rounded-lg p-4 max-h-[400px] overflow-auto">
          <pre className="text-xs text-mhc-text-muted whitespace-pre-wrap font-mono">
            {JSON.stringify(getCurrentMessages(), null, 2)}
          </pre>
        </div>
      ) : (
        <>
          {activeTab === 'dm' && renderMessages(data.direct_messages)}
          {activeTab === 'pm_my_room' && renderMessages(data.pm_my_room)}
          {activeTab === 'pm_their_room' && renderMessages(data.pm_their_room)}
        </>
      )}
    </div>
  );
};

export default CommsSection;
