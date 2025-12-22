import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api, LookupResponse } from '../api/client';
import { formatDate, formatNumber, formatNumberWithoutCommas, formatLabel, formatValue } from '../utils/formatting';
import './Home.css';

const Home: React.FC = () => {
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pasteType, setPasteType] = useState<'PM' | 'DM' | 'PROFILE' | 'NOTES'>('PM');
  const [showPasteField, setShowPasteField] = useState(false);
  const [rolePreference, setRolePreference] = useState<'MODEL' | 'VIEWER'>('MODEL');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [apiRequest, setApiRequest] = useState<any>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

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
        includeStatbate: true,
        role: rolePreference,
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

  // Handle username from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const usernameParam = params.get('username');
    if (usernameParam && username !== usernameParam) {
      setUsername(usernameParam);
    }
  }, [location.search]);

  // Auto-trigger lookup when username is set from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const usernameParam = params.get('username');
    if (usernameParam && username === usernameParam && !result && !loading) {
      handleLookup();
    }
  }, [username, location.search]);

  // Autocomplete username search with debouncing
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (username.length >= 2) {
        try {
          const suggestions = await api.searchUsernames(username);
          setUsernameSuggestions(suggestions);
        } catch (err) {
          console.error('Failed to fetch username suggestions', err);
          setUsernameSuggestions([]);
        }
      } else {
        setUsernameSuggestions([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [username]);

  return (
    <div className="home">
      <div className="header">
        <h1>MHC Control Panel</h1>
        <p>Streaming Intelligence & Memory System</p>
      </div>

      <div className="lookup-section">
        <div className="lookup-header">
          <h2>Lookup User</h2>
          <div className="role-toggle-wrapper-inline">
            <label>Role</label>
            <div className="role-toggle-switch">
              <button
                type="button"
                className={`toggle-switch-option ${rolePreference === 'MODEL' ? 'active' : ''}`}
                onClick={() => setRolePreference('MODEL')}
                disabled={loading}
              >
                Model
              </button>
              <button
                type="button"
                className={`toggle-switch-option ${rolePreference === 'VIEWER' ? 'active' : ''}`}
                onClick={() => setRolePreference('VIEWER')}
                disabled={loading}
              >
                Viewer
              </button>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username..."
            disabled={loading}
            list="username-suggestions"
            autoComplete="off"
          />
          <datalist id="username-suggestions">
            {usernameSuggestions.map((suggestion, idx) => (
              <option key={idx} value={suggestion} />
            ))}
          </datalist>
        </div>

        <div className="button-row">
          <button onClick={handleLookup} disabled={loading} className="btn-primary">
            {loading ? 'Looking up...' : 'Lookup'}
          </button>
          {!showPasteField && (
            <button
              type="button"
              onClick={() => setShowPasteField(true)}
              className="btn-secondary"
              disabled={loading}
            >
              + Paste Text
            </button>
          )}
        </div>

        {showPasteField && (
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>Or Paste Text</label>
              <button
                type="button"
                onClick={() => {
                  setShowPasteField(false);
                  setPastedText('');
                }}
                className="btn-collapse"
                disabled={loading}
              >
                Collapse
              </button>
            </div>

            <div className="paste-type-selector">
              <label className="paste-type-label">
                <input
                  type="radio"
                  name="pasteType"
                  value="PM"
                  checked={pasteType === 'PM'}
                  onChange={(e) => setPasteType(e.target.value as 'PM')}
                  disabled={loading}
                />
                PM
              </label>
              <label className="paste-type-label">
                <input
                  type="radio"
                  name="pasteType"
                  value="DM"
                  checked={pasteType === 'DM'}
                  onChange={(e) => setPasteType(e.target.value as 'DM')}
                  disabled={loading}
                />
                DM
              </label>
              <label className="paste-type-label">
                <input
                  type="radio"
                  name="pasteType"
                  value="PROFILE"
                  checked={pasteType === 'PROFILE'}
                  onChange={(e) => setPasteType(e.target.value as 'PROFILE')}
                  disabled={loading}
                />
                Profile
              </label>
              <label className="paste-type-label">
                <input
                  type="radio"
                  name="pasteType"
                  value="NOTES"
                  checked={pasteType === 'NOTES'}
                  onChange={(e) => setPasteType(e.target.value as 'NOTES')}
                  disabled={loading}
                />
                Notes
              </label>
            </div>

            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste profile text, chat logs, etc..."
              rows={4}
              disabled={loading}
            />
          </div>
        )}
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
            <div className="person-card-header">
              <h3>
                <a
                  href={`https://chaturbate.com/${result.person.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="username-link"
                >
                  {result.person.username}
                </a>
              </h3>
              <span className="person-role">{result.person.role}</span>
            </div>
            <div className="details-grid">
              {result.latestSnapshot?.normalized_metrics?.gender !== undefined && (
                <div className="detail-item">
                  <span className="label">Gender</span>
                  <span className="value">{formatValue(result.latestSnapshot.normalized_metrics.gender, 'gender')}</span>
                </div>
              )}
              {result.latestSnapshot?.normalized_metrics?.rank !== undefined && (
                <div className="detail-item">
                  <span className="label">Rank</span>
                  <span className="value">{formatValue(result.latestSnapshot.normalized_metrics.rank, 'rank')}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="label">Last Seen</span>
                <span className="value">{formatDate(result.person.last_seen_at)}</span>
              </div>
            </div>
          </div>

          {result.latestSnapshot && (
            <div className="snapshot-card">
              <h3>Latest Snapshot</h3>
              <div className="snapshot-meta">
                <span>Source: {result.latestSnapshot.source}</span>
                <span>Last Captured: {formatDate(result.latestSnapshot.captured_at, { includeTime: false })}</span>
              </div>

              {result.latestSnapshot.normalized_metrics && (
                <>
                  <div className="metrics-grid">
                    {(() => {
                      const metrics = result.latestSnapshot.normalized_metrics;
                      const metricOrder = [
                        'income_usd',
                        'income_tokens',
                        'session_count',
                        'total_duration_minutes',
                        'average_duration_minutes'
                      ];

                      // Create ordered list
                      const orderedMetrics: [string, any][] = [];

                      // Add metrics in specified order
                      metricOrder.forEach(key => {
                        if (metrics[key] !== undefined) {
                          orderedMetrics.push([key, metrics[key]]);
                        }
                      });

                      // Add First Seen, RID, and DID as metric cards
                      orderedMetrics.splice(4, 0, ['first_seen', result.person.first_seen_at]);
                      if (result.person.rid) {
                        orderedMetrics.push(['rid', result.person.rid]);
                      }
                      if (result.person.did) {
                        orderedMetrics.push(['did', result.person.did]);
                      }

                      return orderedMetrics.map(([key, value]) => (
                        <div key={key} className="metric-item">
                          <span className="metric-label">{formatLabel(key)}:</span>
                          <span className="metric-value">
                            {key === 'first_seen' ? formatDate(value, { includeTime: false }) :
                             key === 'rid' || key === 'did' ? formatNumberWithoutCommas(value as number) :
                             formatValue(value, key)}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                  {result.latestSnapshot.normalized_metrics.tags && (
                    <div className="tags-row">
                      <span className="metric-label">Tags:</span>
                      <span className="metric-value">{formatValue(result.latestSnapshot.normalized_metrics.tags, 'tags')}</span>
                    </div>
                  )}
                </>
              )}

              {result.delta && Object.keys(result.delta).length > 0 && (
                <div className="delta-section">
                  <h4>Changes Since Last Snapshot</h4>
                  <div className="delta-grid">
                    {Object.entries(result.delta)
                      .filter(([key]) => key !== 'tags' && key !== 'gender')
                      .map(([key, value]) => {
                        // Check if value is actually a number type (not null, not array, not object)
                        const isNumber = typeof value === 'number' && !isNaN(value);
                        const numValue = isNumber ? value : 0;

                        return (
                          <div key={key} className="delta-item">
                            <span className="delta-label">{formatLabel(key)}:</span>
                            <span className={`delta-value ${isNumber && numValue > 0 ? 'positive' : isNumber && numValue < 0 ? 'negative' : ''}`}>
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
                {result.interactions.slice(0, 10).map((interaction) => {
                  const username = interaction.metadata?.username as string | undefined;
                  const fromUser = interaction.metadata?.fromUser as string | undefined;
                  const toUser = interaction.metadata?.toUser as string | undefined;

                  // For PRIVATE_MESSAGE, show direction using fromUser/toUser if available
                  let displayText = username || 'Unknown';
                  if (interaction.type === 'PRIVATE_MESSAGE' && fromUser && toUser) {
                    displayText = `${fromUser} to ${toUser}`;
                  } else if (interaction.type === 'PRIVATE_MESSAGE' && username) {
                    // Fallback for old data without fromUser/toUser
                    displayText = `${username} to hudson_cage`;
                  }

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

                  return (
                    <div key={interaction.id} className={`interaction-item ${getInteractionTypeClass(interaction.type)}`}>
                      <div className="interaction-header">
                        <span className="interaction-username-primary">
                          {displayText}
                          {username && <span className="interaction-type-secondary"> - {interaction.type}</span>}
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
        </div>
      )}
    </div>
  );
};

export default Home;
