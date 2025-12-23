import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './Profile.css';

interface ProfilePageProps {}

type TabType = 'snapshot' | 'sessions' | 'profile' | 'interactions';

const Profile: React.FC<ProfilePageProps> = () => {
  const { username: urlUsername } = useParams<{ username: string }>();
  const navigate = useNavigate();

  const [username, setUsername] = useState(urlUsername || '');
  const [lookupCollapsed, setLookupCollapsed] = useState(!!urlUsername);
  const [activeTab, setActiveTab] = useState<TabType>('snapshot');
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-load profile if username in URL
  useEffect(() => {
    if (urlUsername) {
      setUsername(urlUsername);
      setLoading(true);
      setError(null);

      fetch(`/api/profile/${urlUsername}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch profile');
          }
          return response.json();
        })
        .then(data => {
          setProfileData(data);
          setLookupCollapsed(true);
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setProfileData(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [urlUsername]);

  const handleLookup = async (lookupUsername?: string) => {
    const usernameToLookup = lookupUsername || username;
    if (!usernameToLookup) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch enriched profile data
      const response = await fetch(`/api/profile/${usernameToLookup}`);
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }
      const data = await response.json();
      setProfileData(data);
      setLookupCollapsed(true);

      // Update URL without reloading
      if (!urlUsername || urlUsername !== usernameToLookup) {
        navigate(`/profile/${usernameToLookup}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setProfileData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLookup();
    }
  };

  return (
    <div className="profile-page">
      <h1>Profile Viewer</h1>

      {/* Lookup Section */}
      <div className="lookup-card">
        <div
          className="lookup-header"
          onClick={() => setLookupCollapsed(!lookupCollapsed)}
          style={{ cursor: 'pointer' }}
        >
          <h2>Lookup User {lookupCollapsed ? '▼' : '▲'}</h2>
        </div>

        {!lookupCollapsed && (
          <div className="lookup-body">
            <div className="lookup-input-group">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\//g, ''))}
                onKeyPress={handleKeyPress}
                placeholder="Enter username..."
                disabled={loading}
              />
              <button
                onClick={() => handleLookup()}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? 'Loading...' : 'Lookup'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Profile Content */}
      {profileData && (
        <div className="profile-content">
          {/* Profile Header */}
          <div className="profile-header-card">
            <div className="profile-header-content">
              {((profileData.latestSession?.image_url) || (profileData.profile?.photos && profileData.profile.photos.length > 0)) && (
                <div className="profile-image-container">
                  <img
                    src={profileData.latestSession?.image_url || (profileData.profile.photos.find((p: any) => p.isPrimary)?.url || profileData.profile.photos[0]?.url)}
                    alt={profileData.person.username}
                    className="profile-image"
                  />
                </div>
              )}
              <div className="profile-header-text">
                <h2>
                  <a
                    href={`https://chaturbate.com/${profileData.person.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="username-link"
                  >
                    {profileData.person.username}
                  </a>
                </h2>
                <div className="profile-header-meta">
                  <span className="role-badge">{profileData.person.role}</span>
                  {(profileData.profile?.gender || profileData.latestSnapshot?.normalized_metrics?.gender) && (
                    <span className="gender-badge">
                      {profileData.profile?.gender || profileData.latestSnapshot?.normalized_metrics?.gender}
                    </span>
                  )}
                  {profileData.latestSnapshot?.normalized_metrics?.rank && (
                    <span className="rank-badge">
                      Rank: {profileData.latestSnapshot.normalized_metrics.rank}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'snapshot' ? 'active' : ''}`}
              onClick={() => setActiveTab('snapshot')}
            >
              Latest Snapshot
            </button>
            <button
              className={`tab ${activeTab === 'sessions' ? 'active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              Broadcast Sessions
            </button>
            <button
              className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile Details
            </button>
            <button
              className={`tab ${activeTab === 'interactions' ? 'active' : ''}`}
              onClick={() => setActiveTab('interactions')}
            >
              Recent Interactions
            </button>
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === 'snapshot' && (
              <div className="tab-panel">
                <h3>Latest Snapshot</h3>
                {(profileData.latestSession || profileData.latestSnapshot) ? (
                  <div className="snapshot-grid">
                    {/* Broadcast Session Data (Affiliate API) */}
                    {profileData.latestSession && (
                      <>
                        <div className="snapshot-item">
                          <span className="label">Last Observed:</span>
                          <span className="value">{new Date(profileData.latestSession.observed_at).toLocaleString()}</span>
                        </div>
                        <div className="snapshot-item">
                          <span className="label">Current Show:</span>
                          <span className="value">{profileData.latestSession.current_show || 'N/A'}</span>
                        </div>
                        <div className="snapshot-item">
                          <span className="label">Room Subject:</span>
                          <span className="value">{profileData.latestSession.room_subject || 'N/A'}</span>
                        </div>
                        <div className="snapshot-item">
                          <span className="label">Viewers:</span>
                          <span className="value">{profileData.latestSession.num_users || 0}</span>
                        </div>
                        <div className="snapshot-item">
                          <span className="label">Followers:</span>
                          <span className="value">{profileData.latestSession.num_followers || 0}</span>
                        </div>
                        <div className="snapshot-item">
                          <span className="label">HD Stream:</span>
                          <span className="value">{profileData.latestSession.is_hd ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="snapshot-item">
                          <span className="label">Online Duration:</span>
                          <span className="value">{Math.floor(profileData.latestSession.seconds_online / 60)} minutes</span>
                        </div>
                        {profileData.latestSession.tags && profileData.latestSession.tags.length > 0 && (
                          <div className="snapshot-item full-width">
                            <span className="label">Tags:</span>
                            <div className="tags-container">
                              {profileData.latestSession.tags.map((tag: string, idx: number) => (
                                <span key={idx} className="tag">{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Statbate Snapshot Data - Additional Metrics */}
                    {profileData.latestSnapshot?.normalized_metrics && (
                      <>
                        {profileData.latestSnapshot.normalized_metrics.income_usd !== undefined && (
                          <div className="snapshot-item">
                            <span className="label">Income (USD):</span>
                            <span className="value">${profileData.latestSnapshot.normalized_metrics.income_usd.toLocaleString()}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot.normalized_metrics.income_tokens !== undefined && (
                          <div className="snapshot-item">
                            <span className="label">Income (Tokens):</span>
                            <span className="value">{profileData.latestSnapshot.normalized_metrics.income_tokens.toLocaleString()}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot.normalized_metrics.session_count !== undefined && (
                          <div className="snapshot-item">
                            <span className="label">Session Count:</span>
                            <span className="value">{profileData.latestSnapshot.normalized_metrics.session_count}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot.normalized_metrics.total_duration_minutes !== undefined && (
                          <div className="snapshot-item">
                            <span className="label">Total Duration:</span>
                            <span className="value">{profileData.latestSnapshot.normalized_metrics.total_duration_minutes} min</span>
                          </div>
                        )}
                        {profileData.latestSnapshot.normalized_metrics.average_duration_minutes !== undefined && (
                          <div className="snapshot-item">
                            <span className="label">Avg Duration:</span>
                            <span className="value">{Math.round(profileData.latestSnapshot.normalized_metrics.average_duration_minutes)} min</span>
                          </div>
                        )}
                        <div className="snapshot-item">
                          <span className="label">Data Source:</span>
                          <span className="value">{profileData.latestSnapshot.source}</span>
                        </div>
                        <div className="snapshot-item">
                          <span className="label">Last Captured:</span>
                          <span className="value">{new Date(profileData.latestSnapshot.captured_at).toLocaleDateString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p>No recent snapshot data available.</p>
                )}
              </div>
            )}

            {activeTab === 'sessions' && (
              <div className="tab-panel">
                <h3>Broadcast Sessions</h3>
                {profileData.sessionStats ? (
                  <div className="sessions-content">
                    <div className="stats-summary">
                      <div className="stat-box">
                        <div className="stat-value">{profileData.sessionStats.totalSessions}</div>
                        <div className="stat-label">Total Sessions</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-value">{profileData.sessionStats.avgViewers}</div>
                        <div className="stat-label">Avg Viewers</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-value">{profileData.sessionStats.maxViewers}</div>
                        <div className="stat-label">Max Viewers</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-value">{profileData.sessionStats.totalFollowers}</div>
                        <div className="stat-label">Followers Gained</div>
                      </div>
                    </div>

                    {profileData.sessions && profileData.sessions.length > 0 ? (
                      <div className="sessions-list">
                        <h4>Recent Sessions ({profileData.sessions.length})</h4>
                        {profileData.sessions.map((session: any) => (
                          <div key={session.id} className="session-card">
                            <div className="session-header">
                              <span className="session-date">{new Date(session.observed_at).toLocaleString()}</span>
                              <span className="session-duration">{Math.floor(session.seconds_online / 60)}m online</span>
                            </div>
                            <div className="session-details">
                              <span>👥 {session.num_users} viewers</span>
                              <span>❤️ {session.num_followers} followers</span>
                              {session.is_hd && <span>🎥 HD</span>}
                            </div>
                            {session.room_subject && (
                              <div className="session-subject">{session.room_subject}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>No session history available.</p>
                    )}
                  </div>
                ) : (
                  <p>No session statistics available.</p>
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="tab-panel">
                <h3>Profile Details</h3>
                {profileData.profile ? (
                  <div className="profile-details-grid">
                    {profileData.profile.display_name && (
                      <div className="detail-item">
                        <span className="label">Display Name:</span>
                        <span className="value">{profileData.profile.display_name}</span>
                      </div>
                    )}
                    {profileData.profile.age && (
                      <div className="detail-item">
                        <span className="label">Age:</span>
                        <span className="value">{profileData.profile.age}</span>
                      </div>
                    )}
                    {profileData.profile.gender && (
                      <div className="detail-item">
                        <span className="label">Gender:</span>
                        <span className="value">{profileData.profile.gender}</span>
                      </div>
                    )}
                    {profileData.profile.location && (
                      <div className="detail-item">
                        <span className="label">Location:</span>
                        <span className="value">{profileData.profile.location}</span>
                      </div>
                    )}
                    {profileData.profile.bio && (
                      <div className="detail-item full-width">
                        <span className="label">Bio:</span>
                        <p className="bio-text">{profileData.profile.bio}</p>
                      </div>
                    )}
                    {profileData.profile.spoken_languages && (
                      <div className="detail-item">
                        <span className="label">Languages:</span>
                        <span className="value">{profileData.profile.spoken_languages}</span>
                      </div>
                    )}
                    {profileData.profile.country && (
                      <div className="detail-item">
                        <span className="label">Country:</span>
                        <span className="value">{profileData.profile.country}</span>
                      </div>
                    )}
                    {profileData.profile.is_new !== null && (
                      <div className="detail-item">
                        <span className="label">New Model:</span>
                        <span className="value">{profileData.profile.is_new ? 'Yes' : 'No'}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p>No profile details available.</p>
                )}
              </div>
            )}

            {activeTab === 'interactions' && (
              <div className="tab-panel">
                <h3>Recent Interactions</h3>
                {profileData.interactions && profileData.interactions.length > 0 ? (
                  <div className="interactions-list">
                    {profileData.interactions.map((interaction: any) => (
                      <div key={interaction.id} className="interaction-card">
                        <div className="interaction-header">
                          <span className="interaction-type">{interaction.type}</span>
                          <span className="interaction-date">{new Date(interaction.timestamp).toLocaleString()}</span>
                        </div>
                        {interaction.content && (
                          <div className="interaction-content">{interaction.content}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No recent interactions found.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
