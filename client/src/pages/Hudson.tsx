import React, { useState, useEffect } from 'react';
import { api, HudsonResponse, Session } from '../api/client';
import './Hudson.css';

const Hudson: React.FC = () => {
  const [data, setData] = useState<HudsonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

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
      {data.currentSession && (
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
                  <span className="metric-value">{data.currentSessionStats.totalTips}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Total Interactions</span>
                  <span className="metric-value">{data.currentSessionStats.totalInteractions}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Unique Users</span>
                  <span className="metric-value">{data.currentSessionStats.uniqueUsers}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Duration (min)</span>
                  <span className="metric-value">{data.currentSessionStats.durationMinutes || 0}</span>
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
              <span className="metric-value">{(data.cbStats as any).followers_count || 0}</span>
              {data.cbDelta && typeof (data.cbDelta as any).followers_count === 'number' && (
                <span className={`delta ${(data.cbDelta as any).followers_count >= 0 ? 'positive' : 'negative'}`}>
                  {(data.cbDelta as any).followers_count >= 0 ? '+' : ''}{(data.cbDelta as any).followers_count}
                </span>
              )}
            </div>
            <div className="metric-item">
              <span className="metric-label">Total Viewers</span>
              <span className="metric-value">{(data.cbStats as any).total_viewers || 0}</span>
              {data.cbDelta && typeof (data.cbDelta as any).total_viewers === 'number' && (
                <span className={`delta ${(data.cbDelta as any).total_viewers >= 0 ? 'positive' : 'negative'}`}>
                  {(data.cbDelta as any).total_viewers >= 0 ? '+' : ''}{(data.cbDelta as any).total_viewers}
                </span>
              )}
            </div>
            <div className="metric-item">
              <span className="metric-label">Paid Viewers</span>
              <span className="metric-value">{(data.cbStats as any).paid_viewers || 0}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Total Tokens</span>
              <span className="metric-value">{(data.cbStats as any).total_tokens_earned || 0}</span>
              {data.cbDelta && typeof (data.cbDelta as any).total_tokens_earned === 'number' && (
                <span className={`delta ${(data.cbDelta as any).total_tokens_earned >= 0 ? 'positive' : 'negative'}`}>
                  {(data.cbDelta as any).total_tokens_earned >= 0 ? '+' : ''}{(data.cbDelta as any).total_tokens_earned}
                </span>
              )}
            </div>
            <div className="metric-item">
              <span className="metric-label">Avg Tokens/Show</span>
              <span className="metric-value">{(data.cbStats as any).average_tokens_per_show || 0}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Total Shows</span>
              <span className="metric-value">{(data.cbStats as any).total_shows || 0}</span>
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
            {data.recentInteractions.slice(0, 10).map((interaction) => (
              <div key={interaction.id} className="interaction-item">
                <div className="interaction-header">
                  <span className="interaction-type">{interaction.type}</span>
                  <span className="interaction-date">{formatDate(interaction.occurred_at)}</span>
                </div>
                {interaction.metadata && (
                  <div className="interaction-content">
                    {interaction.type === 'tip' && (interaction.metadata as any).tokens && (
                      <span className="tip-amount">{(interaction.metadata as any).tokens} tokens</span>
                    )}
                    {(interaction.metadata as any).message && (
                      <span className="message-text">&quot;{(interaction.metadata as any).message}&quot;</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Hudson;
