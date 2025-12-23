import React, { useState, useEffect } from 'react';
import './Jobs.css';

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

const Jobs: React.FC = () => {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(true);
  const [configForm, setConfigForm] = useState<JobConfig>({
    intervalMinutes: 30,
    gender: 'm',
    limit: 0,
    enabled: false,
  });

  // Auto-refresh every 10 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Update form when status changes
  useEffect(() => {
    if (status) {
      setConfigForm(status.config);
    }
  }, [status]);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/job/affiliate/status');
      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
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
      setStatus(data.status);
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
      setStatus(data.status);
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
      setStatus(data.status);
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

  const getStatusBadge = () => {
    if (!status) return null;
    if (status.isRunning && !status.isPaused) {
      return <span className="badge badge-success">Running</span>;
    } else if (status.isPaused) {
      return <span className="badge badge-warning">Paused</span>;
    } else {
      return <span className="badge badge-secondary">Stopped</span>;
    }
  };

  if (loading && !status) {
    return <div className="jobs-container"><p>Loading...</p></div>;
  }

  return (
    <div className="jobs-container">
      <h1>Affiliate Polling Job</h1>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {status && (
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
                    {status.isRunning ? (status.isPaused ? 'Paused' : 'Running') : 'Stopped'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Enabled:</span>
                  <span className="status-value">{status.config.enabled ? 'Yes' : 'No'}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Interval:</span>
                  <span className="status-value">{status.config.intervalMinutes} minutes</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Gender Filter:</span>
                  <span className="status-value">{status.config.gender.toUpperCase()}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Limit:</span>
                  <span className="status-value">
                    {status.config.limit === 0 ? 'ALL (paginated)' : `${status.config.limit} per cycle`}
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
                {!status.isRunning && (
                  <button
                    onClick={() => handleJobControl('start')}
                    className="btn btn-success"
                    disabled={loading || !status.config.enabled}
                  >
                    Start Job
                  </button>
                )}
                {status.isRunning && !status.isPaused && (
                  <button
                    onClick={() => handleJobControl('pause')}
                    className="btn btn-warning"
                    disabled={loading}
                  >
                    Pause Job
                  </button>
                )}
                {status.isRunning && status.isPaused && (
                  <button
                    onClick={() => handleJobControl('resume')}
                    className="btn btn-success"
                    disabled={loading}
                  >
                    Resume Job
                  </button>
                )}
                {status.isRunning && (
                  <button
                    onClick={() => handleJobControl('stop')}
                    className="btn btn-danger"
                    disabled={loading}
                  >
                    Stop Job
                  </button>
                )}
              </div>
              {!status.config.enabled && (
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
                  <div className="stat-value">{status.stats.totalRuns}</div>
                  <div className="stat-label">Total Cycles</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{status.stats.totalEnriched}</div>
                  <div className="stat-label">Total Enriched</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{status.stats.totalFailed}</div>
                  <div className="stat-label">Total Failed</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{formatDate(status.stats.lastRun)}</div>
                  <div className="stat-label">Last Run</div>
                </div>
              </div>

              {status.stats.lastRun && (
                <div className="last-run-details">
                  <h3>Last Cycle Results:</h3>
                  <div className="status-grid">
                    <div className="status-item">
                      <span className="status-label">Enriched:</span>
                      <span className="status-value">{status.stats.lastRunEnriched}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Failed:</span>
                      <span className="status-value">{status.stats.lastRunFailed}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Success Rate:</span>
                      <span className="status-value">
                        {status.stats.lastRunEnriched + status.stats.lastRunFailed > 0
                          ? Math.round(
                              (status.stats.lastRunEnriched /
                                (status.stats.lastRunEnriched + status.stats.lastRunFailed)) *
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
    </div>
  );
};

export default Jobs;
