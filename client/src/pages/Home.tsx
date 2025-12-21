import React, { useState } from 'react';
import { api, LookupResponse } from '../api/client';
import { formatDate, formatNumber, formatLabel, formatValue } from '../utils/formatting';
import './Home.css';

const Home: React.FC = () => {
  const [username, setUsername] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [includeStatbate, setIncludeStatbate] = useState(false);
  const [rolePreference, setRolePreference] = useState<'AUTO' | 'MODEL' | 'VIEWER'>('AUTO');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [apiRequest, setApiRequest] = useState<any>(null);

  const handleLookup = async () => {
    if (!username && !pastedText) {
      setError('Please enter a username or paste text');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const requestParams = {
        username: username || undefined,
        pastedText: pastedText || undefined,
        includeStatbate,
        role: rolePreference === 'AUTO' ? undefined : rolePreference,
      };
      setApiRequest(requestParams);
      const data = await api.lookup(requestParams);
      setResult(data);
    } catch (err) {
      setError('Failed to lookup user. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home">
      <div className="header">
        <h1>MHC Control Panel</h1>
        <p>Streaming Intelligence & Memory System</p>
      </div>

      <div className="lookup-section">
        <h2>Lookup User</h2>

        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username..."
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label>Or Paste Text</label>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste profile text, chat logs, etc..."
            rows={4}
            disabled={loading}
          />
        </div>

        <div className="form-group checkbox">
          <label>
            <input
              type="checkbox"
              checked={includeStatbate}
              onChange={(e) => setIncludeStatbate(e.target.checked)}
              disabled={loading}
            />
            Include Statbate Data
          </label>
        </div>

        {includeStatbate && (
          <div className="form-group role-selector">
            <label>Role</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="role"
                  value="AUTO"
                  checked={rolePreference === 'AUTO'}
                  onChange={(e) => setRolePreference(e.target.value as 'AUTO')}
                  disabled={loading}
                />
                Auto (Model → Viewer)
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="role"
                  value="MODEL"
                  checked={rolePreference === 'MODEL'}
                  onChange={(e) => setRolePreference(e.target.value as 'MODEL')}
                  disabled={loading}
                />
                Model Only
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="role"
                  value="VIEWER"
                  checked={rolePreference === 'VIEWER'}
                  onChange={(e) => setRolePreference(e.target.value as 'VIEWER')}
                  disabled={loading}
                />
                Viewer Only
              </label>
            </div>
          </div>
        )}

        <button onClick={handleLookup} disabled={loading} className="btn-primary">
          {loading ? 'Looking up...' : 'Lookup'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {result && (
        <div className="results-section">
          <h2>
            <span>Results</span>
            <label className="results-header-toggle">
              <input
                type="checkbox"
                checked={showRawData}
                onChange={(e) => setShowRawData(e.target.checked)}
              />
              Show Raw Data
            </label>
          </h2>

          {showRawData && (
            <div className="raw-data-content">
              <div style={{ marginBottom: '20px', borderBottom: '1px solid #2d3748', paddingBottom: '10px' }}>
                <h4 style={{ color: '#667eea', margin: '0 0 10px 0' }}>API Request</h4>
                <pre>{JSON.stringify(apiRequest, null, 2)}</pre>
              </div>
              {result.statbateApiUrl && (
                <div style={{ marginBottom: '20px', borderBottom: '1px solid #2d3748', paddingBottom: '10px' }}>
                  <h4 style={{ color: '#667eea', margin: '0 0 10px 0' }}>Statbate API URL</h4>
                  <pre>{result.statbateApiUrl}</pre>
                </div>
              )}
              <div>
                <h4 style={{ color: '#667eea', margin: '0 0 10px 0' }}>API Response</h4>
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </div>
            </div>
          )}

          {result.extractedUsernames.length > 1 && (
            <div className="extracted-usernames">
              <h3>Extracted Usernames</h3>
              <div className="username-list">
                {result.extractedUsernames.map((user, idx) => (
                  <span key={idx} className="username-tag">{user}</span>
                ))}
              </div>
            </div>
          )}

          <div className="person-card">
            <h3>Person Details</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="label">Username</span>
                <span className="value">{result.person.username}</span>
              </div>
              <div className="detail-item">
                <span className="label">Role</span>
                <span className="value">{result.person.role}</span>
              </div>
              <div className="detail-item">
                <span className="label">First Seen</span>
                <span className="value">{formatDate(result.person.first_seen_at)}</span>
              </div>
              <div className="detail-item">
                <span className="label">Last Seen</span>
                <span className="value">{formatDate(result.person.last_seen_at)}</span>
              </div>
              {result.person.did && (
                <div className="detail-item">
                  <span className="label">Donor ID</span>
                  <span className="value">{formatNumber(result.person.did)}</span>
                </div>
              )}
            </div>
          </div>

          {result.latestSnapshot && (
            <div className="snapshot-card">
              <h3>Latest Snapshot</h3>
              <div className="snapshot-meta">
                <span>Source: {result.latestSnapshot.source}</span>
                <span>Captured: {formatDate(result.latestSnapshot.captured_at)}</span>
              </div>

              {result.latestSnapshot.normalized_metrics && (
                <div className="metrics-grid">
                  {Object.entries(result.latestSnapshot.normalized_metrics).map(([key, value]) => (
                    <div key={key} className="metric-item">
                      <span className="metric-label">{formatLabel(key)}:</span>
                      <span className="metric-value">
                        {formatValue(value, key)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {result.delta && Object.keys(result.delta).length > 0 && (
                <div className="delta-section">
                  <h4>Changes Since Last Snapshot</h4>
                  <div className="delta-grid">
                    {Object.entries(result.delta).map(([key, value]) => {
                      const numValue = Number(value);
                      const isNumber = typeof value === 'number' && !isNaN(numValue);
                      return (
                        <div key={key} className="delta-item">
                          <span className="delta-label">{formatLabel(key)}:</span>
                          <span className={`delta-value ${numValue > 0 ? 'positive' : numValue < 0 ? 'negative' : ''}`}>
                            {value === null ? 'N/A' : isNumber ? (numValue > 0 ? `+${formatNumber(numValue)}` : formatNumber(numValue)) : formatValue(value, key)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {result.interactions.length > 0 && (
            <div className="interactions-card">
              <h3>Recent Interactions ({result.interactions.length})</h3>
              <div className="interactions-list">
                {result.interactions.slice(0, 10).map((interaction) => (
                  <div key={interaction.id} className="interaction-item">
                    <div className="interaction-header">
                      <span className="interaction-type">{interaction.type}</span>
                      <span className="interaction-date">{formatDate(interaction.occurred_at)}</span>
                    </div>
                    {interaction.content && (
                      <div className="interaction-content">{interaction.content}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
