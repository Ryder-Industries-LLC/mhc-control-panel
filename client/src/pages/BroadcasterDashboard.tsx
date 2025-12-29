import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, HudsonResponse, Session, Interaction } from '../api/client';
import { formatDate, formatNumber, formatFullDate, formatMilitaryTime } from '../utils/formatting';
import Badge from '../components/Badge';
// Hudson.css removed - fully migrated to Tailwind CSS

const BroadcasterDashboard: React.FC = () => {
  const [data, setData] = useState<HudsonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showRawData, setShowRawData] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const result = await api.getHudson();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const durationMs = end - start;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Get interaction-specific styles
  const getInteractionStyles = (type: string, isHudson: boolean) => {
    if (isHudson) {
      return { border: 'border-l-gray-600', text: 'text-mhc-text-dim', opacity: 'opacity-70' };
    }
    switch (type) {
      case 'TIP_EVENT':
        return { border: 'border-l-emerald-500', text: 'text-emerald-500' };
      case 'CHAT_MESSAGE':
        return { border: 'border-l-mhc-primary', text: 'text-mhc-primary' };
      case 'PRIVATE_MESSAGE':
        return { border: 'border-l-purple-400', text: 'text-purple-400' };
      case 'USER_ENTER':
        return { border: 'border-l-teal-500', text: 'text-teal-500' };
      case 'USER_LEAVE':
        return { border: 'border-l-gray-600', text: 'text-mhc-text-dim', opacity: 'opacity-60' };
      case 'FOLLOW':
        return { border: 'border-l-orange-500', text: 'text-orange-500' };
      default:
        return { border: 'border-l-mhc-primary', text: 'text-mhc-primary' };
    }
  };

  // Separate broadcast activity (in MY room) from activity elsewhere
  const getBroadcastActivity = (interactions: Interaction[]) => {
    return interactions.filter(i => {
      const broadcaster = i.metadata?.broadcaster as string | undefined;
      // Activity in my room - where I am the broadcaster
      return broadcaster === 'hudson_cage';
    });
  };

  const getActivityElsewhere = (interactions: Interaction[]) => {
    return interactions.filter(i => {
      const username = i.metadata?.username as string | undefined;
      const broadcaster = i.metadata?.broadcaster as string | undefined;
      // My activity in other rooms
      return username === 'hudson_cage' && broadcaster !== 'hudson_cage';
    });
  };

  // Get activity for a specific session
  // Uses stream_session_id if available, falls back to timestamp filtering
  const getSessionActivity = (session: Session, interactions: Interaction[]) => {
    // First try to find interactions linked directly to this session via stream_session_id
    const linkedInteractions = interactions.filter(i =>
      i.stream_session_id === session.id
    );

    if (linkedInteractions.length > 0) {
      return linkedInteractions;
    }

    // Fallback to timestamp-based filtering for the session time range
    const sessionStart = new Date(session.started_at).getTime();
    const sessionEnd = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();

    // Filter interactions that occurred during this session
    // For my room's activity, check if broadcaster is me OR if there's no broadcaster field
    // (older interactions may not have broadcaster stored)
    return interactions.filter(i => {
      const timestamp = new Date(i.timestamp).getTime();
      const broadcaster = i.metadata?.broadcaster as string | undefined;

      // Must be within the session time range
      if (timestamp < sessionStart || timestamp > sessionEnd) {
        return false;
      }

      // Include if broadcaster is hudson_cage OR if there's no broadcaster field
      // (assume my room if no broadcaster specified and it's in my session timeframe)
      return !broadcaster || broadcaster === 'hudson_cage';
    });
  };

  // Format duration in hours and minutes
  const formatSessionDuration = (startedAt: string, endedAt: string | null) => {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const durationMs = end - start;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-5">
        <div className="text-center py-10 text-mhc-text-dim text-xl">Loading Hudson's dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-5">
        <div className="bg-red-400 text-white p-4 rounded-md mb-5">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto p-5">
        <div className="bg-red-400 text-white p-4 rounded-md mb-5">No data available</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-5">
      <div className="flex justify-between items-center mb-10 py-8 border-b-2 border-mhc-primary">
        <h1 className="text-mhc-primary text-4xl font-bold m-0">Broadcaster Dashboard</h1>
        <div className="flex gap-4 items-center">
          <label className="flex items-center text-mhc-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2 w-4 h-4 cursor-pointer accent-mhc-primary"
            />
            Auto-refresh (30s)
          </label>
          <button
            className="bg-gradient-primary text-white border-none px-6 py-2.5 rounded-md text-sm font-semibold cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mhc-primary/30"
            onClick={fetchData}
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Current Session */}
      {data.currentSession && !data.currentSession.ended_at && (
        <div className="bg-mhc-surface p-6 rounded-xl mb-6 shadow-lg border-2 border-emerald-500">
          <h2 className="text-emerald-500 mt-0 mb-5 text-3xl font-bold">🔴 Live Now</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex justify-between p-3 bg-mhc-surface-light rounded-md">
              <span className="text-mhc-text-muted font-medium text-sm">Started:</span>
              <span className="text-mhc-text font-semibold">{formatDate(data.currentSession.started_at)}</span>
            </div>
            <div className="flex justify-between p-3 bg-mhc-surface-light rounded-md">
              <span className="text-mhc-text-muted font-medium text-sm">Duration:</span>
              <span className="text-mhc-text font-semibold">{formatDuration(data.currentSession.started_at, data.currentSession.ended_at)}</span>
            </div>
          </div>

          {data.currentSessionStats && (
            <div className="mt-5 pt-5 border-t border-mhc-surface-light">
              <h3 className="text-mhc-text mt-0 mb-4 text-lg font-semibold">Session Stats</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md">
                  <span className="text-mhc-text-muted font-medium text-sm mb-2">Total Tips</span>
                  <span className="text-mhc-text font-semibold text-2xl">{formatNumber(data.currentSessionStats.totalTips)}</span>
                </div>
                <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md">
                  <span className="text-mhc-text-muted font-medium text-sm mb-2">Total Interactions</span>
                  <span className="text-mhc-text font-semibold text-2xl">{formatNumber(data.currentSessionStats.totalInteractions)}</span>
                </div>
                <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md">
                  <span className="text-mhc-text-muted font-medium text-sm mb-2">Unique Users</span>
                  <span className="text-mhc-text font-semibold text-2xl">{formatNumber(data.currentSessionStats.uniqueUsers)}</span>
                </div>
                <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md">
                  <span className="text-mhc-text-muted font-medium text-sm mb-2">Duration (min)</span>
                  <span className="text-mhc-text font-semibold text-2xl">{formatNumber(data.currentSessionStats.durationMinutes || 0)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chaturbate Stats */}
      {data.cbStats && (
        <div className="bg-mhc-surface p-6 rounded-xl mb-6 shadow-lg">
          <h2 className="text-mhc-text mt-0 mb-5 text-xl font-semibold border-b-2 border-mhc-primary pb-2">Chaturbate Account Stats</h2>
          {data.cbSnapshot && (
            <div className="p-3 bg-mhc-surface-light rounded-md text-mhc-text-muted text-sm mb-5">
              Last updated: {formatDate(data.cbSnapshot.created_at)}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md relative">
              <span className="text-mhc-text-muted font-medium text-sm mb-2">Followers</span>
              <span className="text-mhc-text font-semibold text-2xl">{formatNumber((data.cbStats as any).num_followers)}</span>
              {data.cbDelta && typeof (data.cbDelta as any).num_followers === 'number' && (
                <span className={`absolute top-3 right-3 text-xs font-semibold px-2 py-1 rounded ${
                  (data.cbDelta as any).num_followers >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-400 bg-red-400/10'
                }`}>
                  {(data.cbDelta as any).num_followers >= 0 ? '+' : ''}{formatNumber((data.cbDelta as any).num_followers)}
                </span>
              )}
            </div>
            <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md relative">
              <span className="text-mhc-text-muted font-medium text-sm mb-2">Current Viewers</span>
              <span className="text-mhc-text font-semibold text-2xl">{formatNumber((data.cbStats as any).num_viewers)}</span>
              {data.cbDelta && typeof (data.cbDelta as any).num_viewers === 'number' && (
                <span className={`absolute top-3 right-3 text-xs font-semibold px-2 py-1 rounded ${
                  (data.cbDelta as any).num_viewers >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-400 bg-red-400/10'
                }`}>
                  {(data.cbDelta as any).num_viewers >= 0 ? '+' : ''}{formatNumber((data.cbDelta as any).num_viewers)}
                </span>
              )}
            </div>
            <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md">
              <span className="text-mhc-text-muted font-medium text-sm mb-2">Tokened Viewers</span>
              <span className="text-mhc-text font-semibold text-2xl">{formatNumber((data.cbStats as any).num_tokened_viewers)}</span>
            </div>
            <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md relative">
              <span className="text-mhc-text-muted font-medium text-sm mb-2">Token Balance</span>
              <span className="text-mhc-text font-semibold text-2xl">{formatNumber((data.cbStats as any).token_balance)}</span>
              {data.cbDelta && typeof (data.cbDelta as any).token_balance === 'number' && (
                <span className={`absolute top-3 right-3 text-xs font-semibold px-2 py-1 rounded ${
                  (data.cbDelta as any).token_balance >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-400 bg-red-400/10'
                }`}>
                  {(data.cbDelta as any).token_balance >= 0 ? '+' : ''}{formatNumber((data.cbDelta as any).token_balance)}
                </span>
              )}
            </div>
            <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md">
              <span className="text-mhc-text-muted font-medium text-sm mb-2">Satisfaction Score</span>
              <span className="text-mhc-text font-semibold text-2xl">{formatNumber((data.cbStats as any).satisfaction_score)}%</span>
            </div>
            <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md">
              <span className="text-mhc-text-muted font-medium text-sm mb-2">Votes (Up/Down)</span>
              <span className="text-mhc-text font-semibold text-2xl">{formatNumber((data.cbStats as any).votes_up)} / {formatNumber((data.cbStats as any).votes_down)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sessions with Expandable Activity */}
      {data.recentSessions && data.recentSessions.length > 0 && (
        <div className="bg-mhc-surface p-6 rounded-xl mb-6 shadow-lg">
          <h2 className="text-mhc-text mt-0 mb-5 text-xl font-semibold border-b-2 border-mhc-primary pb-2">My Broadcasts</h2>
          <div className="flex flex-col gap-3">
            {data.recentSessions.slice(0, 5).map((session: Session) => {
              const sessionActivity = data.recentInteractions ? getSessionActivity(session, data.recentInteractions) : [];
              const isExpanded = expandedSession === session.id;

              return (
                <div key={session.id} className="bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-mhc-surface-lighter transition-colors"
                    onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-mhc-text font-medium">{formatFullDate(session.started_at)}</div>
                        <div className="text-mhc-text-muted text-sm">
                          {formatMilitaryTime(session.started_at)}
                          {session.ended_at && ` - ${formatMilitaryTime(session.ended_at)}`}
                          <span className="text-mhc-primary-light ml-2">
                            ({formatSessionDuration(session.started_at, session.ended_at)})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sessionActivity.length > 0 && (
                          <span className="text-mhc-text-muted text-xs bg-mhc-surface px-2 py-1 rounded">
                            {sessionActivity.length} events
                          </span>
                        )}
                        <span className="text-mhc-text-muted text-sm">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Activity Section */}
                  {isExpanded && sessionActivity.length > 0 && (
                    <div className="border-t border-mhc-surface p-4 bg-mhc-bg/50 max-h-[400px] overflow-y-auto">
                      <h4 className="text-mhc-text-muted text-sm font-semibold mb-3">Broadcast Activity</h4>
                      <div className="flex flex-col gap-2">
                        {sessionActivity.slice(0, 20).map((interaction) => {
                          const username = interaction.metadata?.username as string | undefined;
                          const fromUser = interaction.metadata?.fromUser as string | undefined;
                          const toUser = interaction.metadata?.toUser as string | undefined;
                          const isHudsonMessage = username === 'hudson_cage' &&
                            (interaction.type === 'CHAT_MESSAGE' || interaction.type === 'PRIVATE_MESSAGE');
                          const styles = getInteractionStyles(interaction.type, isHudsonMessage);

                          return (
                            <div
                              key={interaction.id}
                              className={`bg-mhc-surface p-3 rounded-md border-l-4 ${styles.border} ${styles.opacity || ''}`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center gap-2">
                                  <Badge type={interaction.type} variant="interaction" size="sm" />
                                  {interaction.type === 'PRIVATE_MESSAGE' && fromUser && toUser ? (
                                    <span className="text-mhc-text text-sm">
                                      <Link to={`/?username=${fromUser}`} className="font-semibold hover:underline">{fromUser}</Link>
                                      <span className="text-mhc-text-muted mx-1">→</span>
                                      <Link to={`/?username=${toUser}`} className="font-semibold hover:underline">{toUser}</Link>
                                    </span>
                                  ) : username && username !== 'hudson_cage' ? (
                                    <Link to={`/?username=${username}`} className="text-mhc-text text-sm font-semibold hover:underline">
                                      {username}
                                    </Link>
                                  ) : (
                                    <span className="text-mhc-text-dim text-sm">{username || 'Unknown'}</span>
                                  )}
                                </div>
                                <span className="text-mhc-text-dim text-xs">{formatMilitaryTime(interaction.timestamp)}</span>
                              </div>
                              {interaction.content && (
                                <div className="text-gray-300 text-sm leading-relaxed mt-1 pl-2 border-l border-mhc-surface-light">
                                  {interaction.content}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {sessionActivity.length > 20 && (
                          <div className="text-mhc-text-muted text-sm text-center py-2">
                            +{sessionActivity.length - 20} more events
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isExpanded && sessionActivity.length === 0 && (
                    <div className="border-t border-mhc-surface p-4 bg-mhc-bg/50">
                      <p className="text-mhc-text-muted text-sm text-center">No activity recorded for this session</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Activity Elsewhere */}
      {data.recentInteractions && getActivityElsewhere(data.recentInteractions).length > 0 && (
        <div className="bg-mhc-surface p-6 rounded-xl mb-6 shadow-lg">
          <h3 className="text-mhc-text mt-0 mb-5 text-xl font-semibold border-b-2 border-purple-500 pb-2">
            My Activity Elsewhere ({getActivityElsewhere(data.recentInteractions).length})
          </h3>
          <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
            {getActivityElsewhere(data.recentInteractions).slice(0, 10).map((interaction) => {
              const broadcaster = interaction.metadata?.broadcaster as string | undefined;

              return (
                <div
                  key={interaction.id}
                  className={`bg-mhc-surface-light p-4 rounded-md border-l-4 border-purple-500`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <Badge type={interaction.type} variant="interaction" size="sm" />
                      <span className="text-mhc-text-muted text-sm">
                        in{' '}
                        <Link to={`/?username=${broadcaster}`} className="text-purple-400 font-semibold hover:underline">
                          {broadcaster}'s room
                        </Link>
                      </span>
                    </div>
                    <span className="text-mhc-text-dim text-xs">{formatMilitaryTime(interaction.timestamp)}</span>
                  </div>
                  {interaction.content && (
                    <div className="text-gray-300 leading-relaxed text-sm">{interaction.content}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Broadcast Activity */}
      {data.recentInteractions && getBroadcastActivity(data.recentInteractions).length > 0 && (
        <div className="bg-mhc-surface p-6 rounded-xl mb-6 shadow-lg">
          <h3 className="text-mhc-text mt-0 mb-5 text-xl font-semibold border-b-2 border-mhc-primary pb-2">
            Recent Broadcast Activity ({getBroadcastActivity(data.recentInteractions).length})
          </h3>
          <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto">
            {getBroadcastActivity(data.recentInteractions).slice(0, 10).map((interaction) => {
              const username = interaction.metadata?.username as string | undefined;
              const fromUser = interaction.metadata?.fromUser as string | undefined;
              const toUser = interaction.metadata?.toUser as string | undefined;

              // Check if this is Hudson's own message
              const isHudsonMessage = username === 'hudson_cage' &&
                (interaction.type === 'CHAT_MESSAGE' || interaction.type === 'PRIVATE_MESSAGE');

              const styles = getInteractionStyles(interaction.type, isHudsonMessage);

              return (
                <div
                  key={interaction.id}
                  className={`bg-mhc-surface-light p-4 rounded-md border-l-4 ${styles.border} ${styles.opacity || ''}`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <Badge type={interaction.type} variant="interaction" size="sm" />
                      {interaction.type === 'PRIVATE_MESSAGE' && fromUser && toUser ? (
                        <span className="text-mhc-text text-sm">
                          <Link to={`/?username=${fromUser}`} className="font-semibold hover:underline">{fromUser}</Link>
                          <span className="text-mhc-text-muted mx-1">→</span>
                          <Link to={`/?username=${toUser}`} className="font-semibold hover:underline">{toUser}</Link>
                        </span>
                      ) : username && username !== 'hudson_cage' ? (
                        <Link to={`/?username=${username}`} className="text-mhc-text text-sm font-semibold hover:underline">
                          {username}
                        </Link>
                      ) : (
                        <span className="text-mhc-text-dim text-sm">{username || 'Unknown'}</span>
                      )}
                    </div>
                    <span className="text-mhc-text-dim text-xs">{formatMilitaryTime(interaction.timestamp)}</span>
                  </div>
                  {interaction.content && (
                    <div className="text-gray-300 leading-relaxed text-sm">{interaction.content}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data && (
        <div className="mt-5">
          <button
            className="bg-mhc-surface-light text-mhc-text-muted border border-gray-600 px-4 py-2 rounded-md text-sm cursor-pointer transition-all hover:bg-gray-600 hover:border-mhc-primary"
            onClick={() => setShowRawData(!showRawData)}
          >
            {showRawData ? 'Hide' : 'Show'} Raw Response Data
          </button>
          {showRawData && (
            <div className="mt-3 bg-black border border-mhc-surface-light rounded-md p-4 overflow-x-auto">
              <pre className="m-0 text-emerald-500 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BroadcasterDashboard;
