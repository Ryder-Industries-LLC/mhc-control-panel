import React, { useState, useEffect } from 'react';
// Jobs.css removed - fully migrated to Tailwind CSS

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
      return <span className="px-3 py-1 rounded-full text-sm font-semibold uppercase bg-emerald-500 text-white">Running</span>;
    } else if (status.isPaused) {
      return <span className="px-3 py-1 rounded-full text-sm font-semibold uppercase bg-amber-500 text-white">Paused</span>;
    } else {
      return <span className="px-3 py-1 rounded-full text-sm font-semibold uppercase bg-gray-500 text-white">Stopped</span>;
    }
  };

  if (loading && !status) {
    return <div className="max-w-5xl mx-auto p-5"><p className="text-white">Loading...</p></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-5">
      <h1 className="text-2xl font-bold mb-8 bg-gradient-to-r from-mhc-primary to-mhc-primary-dark bg-clip-text text-transparent">
        Affiliate Polling Job
      </h1>

      {error && (
        <div className="p-3 px-4 rounded-md mb-5 bg-red-500/15 border-l-4 border-red-500 text-red-300">
          <strong className="font-bold mr-1">Error:</strong> {error}
        </div>
      )}

      {status && (
        <>
          {/* Status Section */}
          <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-xl font-semibold text-white">Current Status</h2>
              {getStatusBadge()}
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">State:</span>
                  <span className="text-white font-medium">
                    {status.isRunning ? (status.isPaused ? 'Paused' : 'Running') : 'Stopped'}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">Enabled:</span>
                  <span className="text-white font-medium">{status.config.enabled ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">Interval:</span>
                  <span className="text-white font-medium">{status.config.intervalMinutes} minutes</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">Gender Filter:</span>
                  <span className="text-white font-medium">{status.config.gender.toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">Limit:</span>
                  <span className="text-white font-medium">
                    {status.config.limit === 0 ? 'ALL (paginated)' : `${status.config.limit} per cycle`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls Section */}
          <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-xl font-semibold text-white">Job Controls</h2>
            </div>
            <div className="p-5">
              <div className="flex gap-3 flex-wrap">
                {!status.isRunning && (
                  <button
                    onClick={() => handleJobControl('start')}
                    className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading || !status.config.enabled}
                  >
                    Start Job
                  </button>
                )}
                {status.isRunning && !status.isPaused && (
                  <button
                    onClick={() => handleJobControl('pause')}
                    className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    Pause Job
                  </button>
                )}
                {status.isRunning && status.isPaused && (
                  <button
                    onClick={() => handleJobControl('resume')}
                    className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    Resume Job
                  </button>
                )}
                {status.isRunning && (
                  <button
                    onClick={() => handleJobControl('stop')}
                    className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    Stop Job
                  </button>
                )}
              </div>
              {!status.config.enabled && (
                <div className="mt-4 p-3 px-4 rounded-md bg-amber-500/15 border-l-4 border-amber-500 text-amber-300">
                  <strong className="font-bold mr-1">Note:</strong> Job is disabled. Enable it in the configuration section below to start it.
                </div>
              )}
            </div>
          </div>

          {/* Configuration Section */}
          <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md mb-5">
            <div
              className="p-5 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setConfigCollapsed(!configCollapsed)}
            >
              <h2 className="m-0 text-xl font-semibold text-white">Configuration {configCollapsed ? '▼' : '▲'}</h2>
            </div>
            {!configCollapsed && (
            <div className="p-5">
              <div className="max-w-xl">
                <div className="mb-5">
                  <label htmlFor="enabled" className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={configForm.enabled}
                      onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                      className="mr-2 w-5 h-5 cursor-pointer accent-mhc-primary"
                    />
                    <span className="font-semibold text-white/90">Enable Job</span>
                  </label>
                  <small className="block mt-1 text-white/60 text-sm">Must be enabled for job to start</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="intervalMinutes" className="block mb-2 font-semibold text-white/90">
                    Polling Interval (minutes)
                  </label>
                  <input
                    type="number"
                    id="intervalMinutes"
                    value={configForm.intervalMinutes}
                    onChange={(e) => handleConfigChange('intervalMinutes', parseInt(e.target.value))}
                    min="5"
                    max="1440"
                    step="5"
                    className="w-full p-2.5 border border-white/20 rounded-md text-base transition-colors bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <small className="block mt-1 text-white/60 text-sm">How often to poll the Affiliate API (5-1440 minutes)</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="gender" className="block mb-2 font-semibold text-white/90">Gender Filter</label>
                  <select
                    id="gender"
                    value={configForm.gender}
                    onChange={(e) => handleConfigChange('gender', e.target.value)}
                    className="w-full p-2.5 border border-white/20 rounded-md text-base transition-colors bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  >
                    <option value="m">Male</option>
                    <option value="f">Female</option>
                    <option value="t">Trans</option>
                    <option value="c">Couple</option>
                    <option value="m,f">Male + Female</option>
                    <option value="m,f,t">Male + Female + Trans</option>
                    <option value="m,f,t,c">All Genders</option>
                  </select>
                  <small className="block mt-1 text-white/60 text-sm">Which gender categories to track</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="limit" className="block mb-2 font-semibold text-white/90">Broadcasters Per Cycle</label>
                  <input
                    type="number"
                    id="limit"
                    value={configForm.limit}
                    onChange={(e) => handleConfigChange('limit', parseInt(e.target.value))}
                    min="0"
                    max="10000"
                    step="100"
                    className="w-full p-2.5 border border-white/20 rounded-md text-base transition-colors bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <small className="block mt-1 text-white/60 text-sm">
                    Set to 0 to fetch ALL available broadcasters (uses pagination).
                    Otherwise, limit to specific number (100-10000).
                  </small>
                </div>

                <button
                  onClick={handleUpdateConfig}
                  className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-mhc-primary text-white hover:bg-mhc-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Configuration'}
                </button>
              </div>
            </div>
            )}
          </div>

          {/* Statistics Section */}
          <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-xl font-semibold text-white">Statistics</h2>
              <button
                onClick={handleResetStats}
                className="px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer transition-all bg-gray-500 text-white hover:bg-gray-600"
              >
                Reset Stats
              </button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                <div className="text-center p-5 bg-gradient-to-br from-mhc-primary to-mhc-primary-dark rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{status.stats.totalRuns}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Total Cycles</div>
                </div>
                <div className="text-center p-5 bg-gradient-to-br from-mhc-primary to-mhc-primary-dark rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{status.stats.totalEnriched}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Total Enriched</div>
                </div>
                <div className="text-center p-5 bg-gradient-to-br from-mhc-primary to-mhc-primary-dark rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{status.stats.totalFailed}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Total Failed</div>
                </div>
                <div className="text-center p-5 bg-gradient-to-br from-mhc-primary to-mhc-primary-dark rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2 text-lg">{formatDate(status.stats.lastRun)}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Last Run</div>
                </div>
              </div>

              {status.stats.lastRun && (
                <div className="mt-5 pt-5 border-t border-white/10">
                  <h3 className="text-lg font-semibold mb-4 text-white">Last Cycle Results:</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                      <span className="font-semibold text-white/70">Enriched:</span>
                      <span className="text-white font-medium">{status.stats.lastRunEnriched}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                      <span className="font-semibold text-white/70">Failed:</span>
                      <span className="text-white font-medium">{status.stats.lastRunFailed}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                      <span className="font-semibold text-white/70">Success Rate:</span>
                      <span className="text-white font-medium">
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
