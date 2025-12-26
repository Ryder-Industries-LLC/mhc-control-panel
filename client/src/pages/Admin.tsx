import React, { useState, useEffect } from 'react';
import './Admin.css';

interface JobConfig {
  intervalMinutes: number;
  gender: string;
  limit: number;
  enabled: boolean;
}

interface JobStats {
  lastRun: string | null;
  totalRuns: number;
  totalEnriched: number;
  totalFailed: number;
  lastRunEnriched: number;
  lastRunFailed: number;
}

interface JobStatus {
  isRunning: boolean;
  isPaused: boolean;
  config: JobConfig;
  stats: JobStats;
}

interface SystemStats {
  diskUsage?: {
    total: number;
    database: number;
    images: number;
  };
  userCounts?: {
    total: number;
    bySource: Record<string, number>;
    byRole: Record<string, number>;
  };
  queueStats?: {
    priority1Pending: number;
    priority2Active: number;
    failedLookups24h: number;
  };
  dataFreshness?: {
    affiliate: {
      lastPoll: string | null;
      modelsTracked: number;
      onlineNow: number;
    };
    cbhours: {
      lastPoll: string | null;
      modelsWithTrophy: number;
      currentlyOnline: number;
    };
  };
}

type AdminTab = 'jobs' | 'system-stats' | 'data-sources' | 'scraper';

const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('jobs');
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(true);
  const [configForm, setConfigForm] = useState<JobConfig>({
    intervalMinutes: 30,
    gender: 'm',
    limit: 0,
    enabled: false,
  });

  // Scraper state
  const [hasCookies, setHasCookies] = useState(false);
  const [showCookieDialog, setShowCookieDialog] = useState(false);
  const [cookiesInput, setCookiesInput] = useState('');
  const [cookieStatus, setCookieStatus] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);

  // Auto-refresh job status when on Jobs tab
  useEffect(() => {
    if (activeTab === 'jobs') {
      fetchJobStatus();
      const interval = setInterval(fetchJobStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Load system stats when on System Stats tab
  useEffect(() => {
    if (activeTab === 'system-stats') {
      fetchSystemStats();
    }
  }, [activeTab]);

  // Check cookie status when on Scraper tab
  useEffect(() => {
    if (activeTab === 'scraper') {
      checkCookieStatus();
    }
  }, [activeTab]);

  // Update form when job status changes
  useEffect(() => {
    if (jobStatus) {
      setConfigForm(jobStatus.config);
    }
  }, [jobStatus]);

  const fetchJobStatus = async () => {
    try {
      const response = await fetch('/api/job/affiliate/status');
      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }
      const data = await response.json();
      setJobStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStats = async () => {
    try {
      setLoading(true);
      // TODO: Implement system stats API endpoint
      // For now, using placeholder data
      setSystemStats({
        diskUsage: {
          total: 0,
          database: 0,
          images: 0,
        },
        userCounts: {
          total: 0,
          bySource: {},
          byRole: {},
        },
        queueStats: {
          priority1Pending: 0,
          priority2Active: 0,
          failedLookups24h: 0,
        },
        dataFreshness: {
          affiliate: {
            lastPoll: null,
            modelsTracked: 0,
            onlineNow: 0,
          },
          cbhours: {
            lastPoll: null,
            modelsWithTrophy: 0,
            currentlyOnline: 0,
          },
        },
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const checkCookieStatus = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/followers/cookies-status');
      const data = await response.json();
      setHasCookies(data.hasCookies);
    } catch (err) {
      console.error('Error checking cookie status:', err);
    }
  };

  const handleImportCookies = async () => {
    try {
      if (!cookiesInput.trim()) {
        setCookieStatus('Please paste cookies first');
        setTimeout(() => setCookieStatus(null), 3000);
        return;
      }

      setCookieStatus('Importing cookies...');

      let cookies;
      try {
        cookies = JSON.parse(cookiesInput);
      } catch (e) {
        setCookieStatus('Invalid JSON format. Please paste the cookies array correctly.');
        setTimeout(() => setCookieStatus(null), 5000);
        return;
      }

      const response = await fetch('http://localhost:3000/api/followers/import-cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies }),
      });

      const data = await response.json();

      if (data.success) {
        setCookieStatus(data.message);
        setShowCookieDialog(false);
        setCookiesInput('');
        setHasCookies(true);
        setTimeout(() => setCookieStatus(null), 5000);
      } else {
        setCookieStatus(data.error || 'Failed to import cookies');
        setTimeout(() => setCookieStatus(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setCookieStatus('Error importing cookies');
      setTimeout(() => setCookieStatus(null), 5000);
    }
  };

  const handleAutoScrape = async (type: 'following' | 'followers') => {
    try {
      setScraping(true);
      setScrapeStatus(`Scraping ${type}... This may take 2-5 minutes for large lists.`);

      const endpoint = type === 'following'
        ? 'http://localhost:3000/api/followers/scrape-following'
        : 'http://localhost:3000/api/followers/scrape-followers';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.success) {
        const totalCount = data.stats[type === 'following' ? 'totalFollowing' : 'totalFollowers'];
        const newCount = data.stats[type === 'following' ? 'newFollowing' : 'newFollowers'];
        setScrapeStatus(`Complete! Total: ${totalCount} users, New: ${newCount} users.`);
        setTimeout(() => setScrapeStatus(null), 10000);
      } else {
        setScrapeStatus(data.error || 'Failed to scrape');
        setTimeout(() => setScrapeStatus(null), 10000);
      }
    } catch (err) {
      console.error(err);
      setScrapeStatus('Error during automated scraping');
      setTimeout(() => setScrapeStatus(null), 10000);
    } finally {
      setScraping(false);
    }
  };

  const handleConfigChange = (field: keyof JobConfig, value: string | number | boolean) => {
    setConfigForm(prev => ({ ...prev, [field]: value }));
  };

  const handleUpdateConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/job/affiliate/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      });
      if (!response.ok) {
        throw new Error('Failed to update configuration');
      }
      const data = await response.json();
      setJobStatus(data.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleJobControl = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    try {
      setLoading(true);
      const response = await fetch(`/api/job/affiliate/${action}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Failed to ${action} job`);
      }
      const data = await response.json();
      setJobStatus(data.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetStats = async () => {
    if (!window.confirm('Are you sure you want to reset all statistics?')) {
      return;
    }
    try {
      setLoading(true);
      const response = await fetch('/api/job/affiliate/reset-stats', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to reset statistics');
      }
      const data = await response.json();
      setJobStatus(data.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusBadge = () => {
    if (!jobStatus) return null;
    if (jobStatus.isRunning && !jobStatus.isPaused) {
      return <span className="badge badge-success">Running</span>;
    } else if (jobStatus.isPaused) {
      return <span className="badge badge-warning">Paused</span>;
    } else {
      return <span className="badge badge-secondary">Stopped</span>;
    }
  };

  const renderJobsTab = () => (
    <>
      {jobStatus && (
        <>
          {/* Status Section */}
          <div className="card">
            <div className="card-header">
              <h2>Current Status</h2>
              {getStatusBadge()}
            </div>
            <div className="card-body">
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">State:</span>
                  <span className="status-value">
                    {jobStatus.isRunning ? (jobStatus.isPaused ? 'Paused' : 'Running') : 'Stopped'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Enabled:</span>
                  <span className="status-value">{jobStatus.config.enabled ? 'Yes' : 'No'}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Interval:</span>
                  <span className="status-value">{jobStatus.config.intervalMinutes} minutes</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Gender Filter:</span>
                  <span className="status-value">{jobStatus.config.gender.toUpperCase()}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Limit:</span>
                  <span className="status-value">
                    {jobStatus.config.limit === 0 ? 'ALL (paginated)' : `${jobStatus.config.limit} per cycle`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls Section */}
          <div className="card">
            <div className="card-header">
              <h2>Job Controls</h2>
            </div>
            <div className="card-body">
              <div className="controls-grid">
                {!jobStatus.isRunning && (
                  <button
                    onClick={() => handleJobControl('start')}
                    className="btn btn-success"
                    disabled={loading || !jobStatus.config.enabled}
                  >
                    Start Job
                  </button>
                )}
                {jobStatus.isRunning && !jobStatus.isPaused && (
                  <button
                    onClick={() => handleJobControl('pause')}
                    className="btn btn-warning"
                    disabled={loading}
                  >
                    Pause Job
                  </button>
                )}
                {jobStatus.isRunning && jobStatus.isPaused && (
                  <button
                    onClick={() => handleJobControl('resume')}
                    className="btn btn-success"
                    disabled={loading}
                  >
                    Resume Job
                  </button>
                )}
                {jobStatus.isRunning && (
                  <button
                    onClick={() => handleJobControl('stop')}
                    className="btn btn-danger"
                    disabled={loading}
                  >
                    Stop Job
                  </button>
                )}
              </div>
              {!jobStatus.config.enabled && (
                <div className="alert alert-warning">
                  <strong>Note:</strong> Job is disabled. Enable it in the configuration section below to start it.
                </div>
              )}
            </div>
          </div>

          {/* Configuration Section */}
          <div className="card">
            <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setConfigCollapsed(!configCollapsed)}>
              <h2>Configuration {configCollapsed ? '▼' : '▲'}</h2>
            </div>
            {!configCollapsed && (
            <div className="card-body">
              <div className="config-form">
                <div className="form-group">
                  <label htmlFor="enabled">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={configForm.enabled}
                      onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                    />
                    <span className="checkbox-label">Enable Job</span>
                  </label>
                  <small>Must be enabled for job to start</small>
                </div>

                <div className="form-group">
                  <label htmlFor="intervalMinutes">Polling Interval (minutes)</label>
                  <input
                    type="number"
                    id="intervalMinutes"
                    value={configForm.intervalMinutes}
                    onChange={(e) => handleConfigChange('intervalMinutes', parseInt(e.target.value))}
                    min="5"
                    max="1440"
                    step="5"
                  />
                  <small>How often to poll the Affiliate API (5-1440 minutes)</small>
                </div>

                <div className="form-group">
                  <label htmlFor="gender">Gender Filter</label>
                  <select
                    id="gender"
                    value={configForm.gender}
                    onChange={(e) => handleConfigChange('gender', e.target.value)}
                  >
                    <option value="m">Male</option>
                    <option value="f">Female</option>
                    <option value="t">Trans</option>
                    <option value="c">Couple</option>
                    <option value="m,f">Male + Female</option>
                    <option value="m,f,t">Male + Female + Trans</option>
                    <option value="m,f,t,c">All Genders</option>
                  </select>
                  <small>Which gender categories to track</small>
                </div>

                <div className="form-group">
                  <label htmlFor="limit">Broadcasters Per Cycle</label>
                  <input
                    type="number"
                    id="limit"
                    value={configForm.limit}
                    onChange={(e) => handleConfigChange('limit', parseInt(e.target.value))}
                    min="0"
                    max="10000"
                    step="100"
                  />
                  <small>
                    Set to 0 to fetch ALL available broadcasters (uses pagination).
                    Otherwise, limit to specific number (100-10000).
                  </small>
                </div>

                <button onClick={handleUpdateConfig} className="btn btn-primary" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Configuration'}
                </button>
              </div>
            </div>
            )}
          </div>

          {/* Statistics Section */}
          <div className="card">
            <div className="card-header">
              <h2>Statistics</h2>
              <button onClick={handleResetStats} className="btn btn-sm btn-secondary">
                Reset Stats
              </button>
            </div>
            <div className="card-body">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{jobStatus.stats.totalRuns}</div>
                  <div className="stat-label">Total Cycles</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{jobStatus.stats.totalEnriched}</div>
                  <div className="stat-label">Total Enriched</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{jobStatus.stats.totalFailed}</div>
                  <div className="stat-label">Total Failed</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{formatDate(jobStatus.stats.lastRun)}</div>
                  <div className="stat-label">Last Run</div>
                </div>
              </div>

              {jobStatus.stats.lastRun && (
                <div className="last-run-details">
                  <h3>Last Cycle Results:</h3>
                  <div className="status-grid">
                    <div className="status-item">
                      <span className="status-label">Enriched:</span>
                      <span className="status-value">{jobStatus.stats.lastRunEnriched}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Failed:</span>
                      <span className="status-value">{jobStatus.stats.lastRunFailed}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Success Rate:</span>
                      <span className="status-value">
                        {jobStatus.stats.lastRunEnriched + jobStatus.stats.lastRunFailed > 0
                          ? Math.round(
                              (jobStatus.stats.lastRunEnriched /
                                (jobStatus.stats.lastRunEnriched + jobStatus.stats.lastRunFailed)) *
                                100
                            )
                          : 0}
                        %
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );

  const renderSystemStatsTab = () => (
    <>
      {systemStats && (
        <>
          {/* Disk Usage Card */}
          <div className="card">
            <div className="card-header">
              <h2>Disk Usage</h2>
            </div>
            <div className="card-body">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{formatBytes(systemStats.diskUsage?.total || 0)}</div>
                  <div className="stat-label">Total Disk Usage</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{formatBytes(systemStats.diskUsage?.database || 0)}</div>
                  <div className="stat-label">Database Size</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{formatBytes(systemStats.diskUsage?.images || 0)}</div>
                  <div className="stat-label">Images Stored</div>
                </div>
              </div>
            </div>
          </div>

          {/* User Statistics Card */}
          <div className="card">
            <div className="card-header">
              <h2>User Statistics</h2>
            </div>
            <div className="card-body">
              <div className="stat-card-large">
                <div className="stat-value">{systemStats.userCounts?.total || 0}</div>
                <div className="stat-label">Total Users in Database</div>
              </div>
              <p className="section-note">System Stats API endpoint not yet implemented. Coming soon!</p>
            </div>
          </div>

          {/* Queue Statistics Card */}
          <div className="card">
            <div className="card-header">
              <h2>Queue Statistics</h2>
            </div>
            <div className="card-body">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{systemStats.queueStats?.priority1Pending || 0}</div>
                  <div className="stat-label">Priority 1 Pending</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{systemStats.queueStats?.priority2Active || 0}</div>
                  <div className="stat-label">Priority 2 Active</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{systemStats.queueStats?.failedLookups24h || 0}</div>
                  <div className="stat-label">Failed Lookups (24h)</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  const renderScraperTab = () => (
    <>
      {/* Cookie Status Card */}
      <div className="card">
        <div className="card-header">
          <h2>Chaturbate Session</h2>
          {hasCookies ? (
            <span className="badge badge-success">Authenticated</span>
          ) : (
            <span className="badge badge-warning">Not Authenticated</span>
          )}
        </div>
        <div className="card-body">
          <p className="section-note" style={{ marginTop: 0 }}>
            Import your Chaturbate session cookies to enable automated scraping of your following and followers lists.
            This is required for the auto-scrape feature to work.
          </p>
          <div className="controls-grid" style={{ marginTop: '1rem' }}>
            <button
              className={hasCookies ? 'btn btn-secondary' : 'btn btn-primary'}
              onClick={() => setShowCookieDialog(true)}
            >
              {hasCookies ? 'Update Cookies' : 'Import Cookies'}
            </button>
          </div>
          {cookieStatus && (
            <div className="alert alert-warning" style={{ marginTop: '1rem', marginBottom: 0 }}>
              {cookieStatus}
            </div>
          )}
        </div>
      </div>

      {/* Auto-Scrape Card */}
      <div className="card">
        <div className="card-header">
          <h2>Auto-Scrape</h2>
        </div>
        <div className="card-body">
          <p className="section-note" style={{ marginTop: 0 }}>
            Automatically scrape your following and followers lists from Chaturbate.
            This uses your imported session cookies to fetch all pages.
          </p>
          <div className="controls-grid" style={{ marginTop: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={() => handleAutoScrape('following')}
              disabled={scraping || !hasCookies}
            >
              {scraping ? 'Scraping...' : 'Scrape Following'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleAutoScrape('followers')}
              disabled={scraping || !hasCookies}
            >
              {scraping ? 'Scraping...' : 'Scrape Followers'}
            </button>
          </div>
          {!hasCookies && (
            <div className="alert alert-warning" style={{ marginTop: '1rem', marginBottom: 0 }}>
              Import cookies first to enable auto-scraping.
            </div>
          )}
          {scrapeStatus && (
            <div className="alert alert-warning" style={{ marginTop: '1rem', marginBottom: 0 }}>
              {scrapeStatus}
            </div>
          )}
        </div>
      </div>

      {/* Cookie Import Dialog */}
      {showCookieDialog && (
        <div className="cookie-dialog-overlay" onClick={() => setShowCookieDialog(false)}>
          <div className="cookie-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="cookie-dialog-header">
              <h2>Import Chaturbate Cookies</h2>
              <button className="close-btn" onClick={() => setShowCookieDialog(false)}>x</button>
            </div>
            <div className="cookie-dialog-content">
              <p className="cookie-instructions">
                <strong>Step 1:</strong> Log in to Chaturbate in your browser (handle 2FA if needed)
                <br />
                <strong>Step 2:</strong> Press F12 to open Developer Tools, go to Application tab, Storage, Cookies, https://chaturbate.com
                <br />
                <strong>Step 3:</strong> Right-click on any cookie and select "Show Requests With This Cookie"
                <br />
                <strong>Step 4:</strong> In Network tab, click any request, then Headers, Request Headers, cookie:
                <br />
                <strong>Step 5:</strong> Copy the ENTIRE cookie value (all the key=value pairs separated by semicolons)
                <br />
                <strong>Step 6:</strong> Paste this command in Console tab and press Enter:
              </p>
              <pre className="cookie-command">
{`const cookieStr = "PASTE_COOKIE_STRING_HERE";
copy(JSON.stringify(cookieStr.split('; ').map(c => {
  const [name, ...v] = c.split('=');
  return {
    name,
    value: v.join('='),
    domain: '.chaturbate.com',
    path: '/',
    secure: true,
    httpOnly: name === 'sessionid',
    sameSite: 'Lax'
  };
})))`}
              </pre>
              <p className="cookie-instructions">
                <strong>Step 7:</strong> The cookies are now in your clipboard. Paste them below:
              </p>
              <textarea
                className="cookie-textarea"
                placeholder="Paste cookies JSON array here..."
                value={cookiesInput}
                onChange={(e) => setCookiesInput(e.target.value)}
                rows={8}
              />
              <div className="cookie-dialog-actions">
                <button className="btn btn-secondary" onClick={() => setShowCookieDialog(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleImportCookies}>
                  Import Cookies
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderDataSourcesTab = () => (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Data Sources Status</h2>
        </div>
        <div className="card-body">
          <div className="data-sources-list">
            <div className="data-source-item">
              <div className="source-name">
                <span className="source-badge source-active">Active</span>
                Chaturbate Affiliate API
              </div>
              <div className="source-details">Real-time online models data</div>
            </div>
            <div className="data-source-item">
              <div className="source-name">
                <span className="source-badge source-ready">Ready</span>
                CBHours API
              </div>
              <div className="source-details">Historical tracking and rank data (not polling yet)</div>
            </div>
            <div className="data-source-item">
              <div className="source-name">
                <span className="source-badge source-active">Active</span>
                Chaturbate Events API
              </div>
              <div className="source-details">Hudson's room events only</div>
            </div>
            <div className="data-source-item">
              <div className="source-name">
                <span className="source-badge source-active">Active</span>
                Chaturbate Stats API
              </div>
              <div className="source-details">Hudson's broadcast statistics</div>
            </div>
            <div className="data-source-item">
              <div className="source-name">
                <span className="source-badge source-manual">On-Demand</span>
                StatBate API
              </div>
              <div className="source-details">Tips and member analysis</div>
            </div>
            <div className="data-source-item">
              <div className="source-name">
                <span className="source-badge source-planned">Planned</span>
                Profile Scraping
              </div>
              <div className="source-details">Bio, social links, wishlist (manual per-user)</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Source Priority Configuration</h2>
        </div>
        <div className="card-body">
          <p className="section-note">
            Data source priority is configured via the <code>v_person_current_state</code> database view.
            See <a href="https://github.com/your-repo/docs/DATA_SOURCE_STRATEGY.md" target="_blank" rel="noopener noreferrer">DATA_SOURCE_STRATEGY.md</a> for details.
          </p>
        </div>
      </div>
    </>
  );

  if (loading && !jobStatus && activeTab === 'jobs') {
    return <div className="admin-container"><p>Loading...</p></div>;
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Admin</h1>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={activeTab === 'jobs' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('jobs')}
          >
            Jobs Management
          </button>
          <button
            className={activeTab === 'system-stats' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('system-stats')}
          >
            System Stats
          </button>
          <button
            className={activeTab === 'data-sources' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('data-sources')}
          >
            Data Sources
          </button>
          <button
            className={activeTab === 'scraper' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('scraper')}
          >
            Scraper
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="admin-content">
        {activeTab === 'jobs' && renderJobsTab()}
        {activeTab === 'system-stats' && renderSystemStatsTab()}
        {activeTab === 'data-sources' && renderDataSourcesTab()}
        {activeTab === 'scraper' && renderScraperTab()}
      </div>
    </div>
  );
};

export default Admin;
