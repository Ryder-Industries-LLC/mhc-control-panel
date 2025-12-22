import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, HudsonResponse, Session } from '../api/client';
import { formatDate, formatNumber } from '../utils/formatting';
import './Hudson.css';

const Hudson: React.FC = () => {
  const [data, setData] = useState<HudsonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showRawData, setShowRawData] = useState(false);

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

  if (loading) {
    return (
      <div className="hudson">
        <div className="loading">Loading Hudson's dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hudson">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="hudson">
        <div className="error-message">No data available</div>
      </div>
    );
  }

  return (
    <div className="hudson">
      <div className="header">
        <h1>Hudson Cage Dashboard</h1>
        <div className="header-controls">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (30s)
          </label>
          <button className="btn-primary" onClick={fetchData}>
            Refresh Now
          </button>
        </div>
      </div>

      {/* Current Session */}
      {data.currentSession && !data.currentSession.ended_at && (
        <div className="current-session-card">
          <h2>🔴 Live Now</h2>
          <div className="session-info">
            <div className="session-detail">
              <span className="label">Started:</span>
              <span className="value">{formatDate(data.currentSession.started_at)}</span>
            </div>
            <div className="session-detail">
              <span className="label">Duration:</span>
              <span className="value">{formatDuration(data.currentSession.started_at, data.currentSession.ended_at)}</span>
            </div>
          </div>

          {data.currentSessionStats && (
            <div className="session-stats">
              <h3>Session Stats</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span className="metric-label">Total Tips</span>
                  <span className="metric-value">{formatNumber(data.currentSessionStats.totalTips)}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Total Interactions</span>
                  <span className="metric-value">{formatNumber(data.currentSessionStats.totalInteractions)}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Unique Users</span>
                  <span className="metric-value">{formatNumber(data.currentSessionStats.uniqueUsers)}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Duration (min)</span>
                  <span className="metric-value">{formatNumber(data.currentSessionStats.durationMinutes || 0)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chaturbate Stats */}
      {data.cbStats && (
        <div className="cb-stats-card">
          <h2>Chaturbate Account Stats</h2>
          {data.cbSnapshot && (
            <div className="snapshot-meta">
              <span>Last updated: {formatDate(data.cbSnapshot.created_at)}</span>
            </div>
          )}
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">Followers</span>
              <span className="metric-value">{formatNumber((data.cbStats as any).num_followers)}</span>
              {data.cbDelta && typeof (data.cbDelta as any).num_followers === 'number' && (
                <span className={`delta ${(data.cbDelta as any).num_followers >= 0 ? 'positive' : 'negative'}`}>
                  {(data.cbDelta as any).num_followers >= 0 ? '+' : ''}{formatNumber((data.cbDelta as any).num_followers)}
                </span>
              )}
            </div>
            <div className="metric-item">
              <span className="metric-label">Current Viewers</span>
              <span className="metric-value">{formatNumber((data.cbStats as any).num_viewers)}</span>
              {data.cbDelta && typeof (data.cbDelta as any).num_viewers === 'number' && (
                <span className={`delta ${(data.cbDelta as any).num_viewers >= 0 ? 'positive' : 'negative'}`}>
                  {(data.cbDelta as any).num_viewers >= 0 ? '+' : ''}{formatNumber((data.cbDelta as any).num_viewers)}
                </span>
              )}
            </div>
            <div className="metric-item">
              <span className="metric-label">Tokened Viewers</span>
              <span className="metric-value">{formatNumber((data.cbStats as any).num_tokened_viewers)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Token Balance</span>
              <span className="metric-value">{formatNumber((data.cbStats as any).token_balance)}</span>
              {data.cbDelta && typeof (data.cbDelta as any).token_balance === 'number' && (
                <span className={`delta ${(data.cbDelta as any).token_balance >= 0 ? 'positive' : 'negative'}`}>
                  {(data.cbDelta as any).token_balance >= 0 ? '+' : ''}{formatNumber((data.cbDelta as any).token_balance)}
                </span>
              )}
            </div>
            <div className="metric-item">
              <span className="metric-label">Satisfaction Score</span>
              <span className="metric-value">{formatNumber((data.cbStats as any).satisfaction_score)}%</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Votes (Up/Down)</span>
              <span className="metric-value">{formatNumber((data.cbStats as any).votes_up)} / {formatNumber((data.cbStats as any).votes_down)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {data.recentSessions && data.recentSessions.length > 0 && (
        <div className="recent-sessions-card">
          <h2>Recent Sessions</h2>
          <div className="sessions-list">
            {data.recentSessions.slice(0, 5).map((session: Session) => (
              <div key={session.id} className="session-item">
                <div className="session-header">
                  <span className="session-date">{formatDate(session.started_at)}</span>
                  <span className="session-duration">
                    {formatDuration(session.started_at, session.ended_at)}
                  </span>
                </div>
                {session.ended_at && (
                  <div className="session-ended">
                    Ended: {formatDate(session.ended_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Interactions */}
      {data.recentInteractions && data.recentInteractions.length > 0 && (
        <div className="interactions-card">
          <h3>Recent Activity ({data.recentInteractions.length})</h3>
          <div className="interactions-list">
            {data.recentInteractions.slice(0, 10).map((interaction) => {
              const username = interaction.metadata?.username as string | undefined;
              const fromUser = interaction.metadata?.fromUser as string | undefined;
              const toUser = interaction.metadata?.toUser as string | undefined;

              // Determine interaction type class for color coding
              const getInteractionTypeClass = (type: string) => {
                if (type === 'TIP_EVENT') return 'interaction-type-tip';
                if (type === 'CHAT_MESSAGE') return 'interaction-type-chat';
                if (type === 'PRIVATE_MESSAGE') return 'interaction-type-pm';
                if (type === 'USER_ENTER') return 'interaction-type-enter';
                if (type === 'USER_LEAVE') return 'interaction-type-leave';
                if (type === 'FOLLOW') return 'interaction-type-follow';
                return 'interaction-type-default';
              };

              // Check if this is Hudson's own message
              const isHudsonMessage = username === 'hudson_cage' &&
                (interaction.type === 'CHAT_MESSAGE' || interaction.type === 'PRIVATE_MESSAGE');

              // Render username with link (except for hudson_cage)
              const renderUsername = (user: string | undefined) => {
                if (!user || user === 'hudson_cage') {
                  return <span>{user || 'Unknown'}</span>;
                }
                return <Link to={`/?username=${user}`}>{user}</Link>;
              };

              // For PRIVATE_MESSAGE, render direction with links
              let displayContent;
              if (interaction.type === 'PRIVATE_MESSAGE' && fromUser && toUser) {
                displayContent = (
                  <>
                    {renderUsername(fromUser)} to {renderUsername(toUser)}
                  </>
                );
              } else if (interaction.type === 'PRIVATE_MESSAGE') {
                displayContent = <span>Private Message</span>;
              } else {
                displayContent = renderUsername(username);
              }

              return (
                <div key={interaction.id} className={`interaction-item ${getInteractionTypeClass(interaction.type)} ${isHudsonMessage ? 'hudson-own-message' : ''}`}>
                  <div className="interaction-header">
                    <span className="interaction-username-primary">
                      {displayContent}
                      {interaction.type !== 'PRIVATE_MESSAGE' && <span className="interaction-type-secondary"> - {interaction.type}</span>}
                    </span>
                    <span className="interaction-date">{formatDate(interaction.timestamp)}</span>
                  </div>
                  {interaction.content && (
                    <div className="interaction-content">{interaction.content}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data && (
        <div className="raw-data-section">
          <button
            className="raw-data-toggle"
            onClick={() => setShowRawData(!showRawData)}
          >
            {showRawData ? 'Hide' : 'Show'} Raw Response Data
          </button>
          {showRawData && (
            <div className="raw-data-content">
              <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Hudson;
