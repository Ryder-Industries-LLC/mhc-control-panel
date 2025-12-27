import React, { useState, useEffect } from 'react';
// Admin.css removed - fully migrated to Tailwind CSS

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
    const baseBadge = "px-3 py-1 rounded-full text-sm font-semibold uppercase";
    if (jobStatus.isRunning && !jobStatus.isPaused) {
      return <span className={`${baseBadge} bg-mhc-success text-white`}>Running</span>;
    } else if (jobStatus.isPaused) {
      return <span className={`${baseBadge} bg-mhc-warning text-white`}>Paused</span>;
    } else {
      return <span className={`${baseBadge} bg-gray-500 text-white`}>Stopped</span>;
    }
  };

  const renderJobsTab = () => (
    <>
      {jobStatus && (
        <>
          {/* Status Section */}
          <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-2xl text-white">Current Status</h2>
              {getStatusBadge()}
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">State:</span>
                  <span className="text-white font-medium">
                    {jobStatus.isRunning ? (jobStatus.isPaused ? 'Paused' : 'Running') : 'Stopped'}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">Enabled:</span>
                  <span className="text-white font-medium">{jobStatus.config.enabled ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">Interval:</span>
                  <span className="text-white font-medium">{jobStatus.config.intervalMinutes} minutes</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">Gender Filter:</span>
                  <span className="text-white font-medium">{jobStatus.config.gender.toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                  <span className="font-semibold text-white/70">Limit:</span>
                  <span className="text-white font-medium">
                    {jobStatus.config.limit === 0 ? 'ALL (paginated)' : `${jobStatus.config.limit} per cycle`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls Section */}
          <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-2xl text-white">Job Controls</h2>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap gap-3">
                {!jobStatus.isRunning && (
                  <button
                    onClick={() => handleJobControl('start')}
                    className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-success text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading || !jobStatus.config.enabled}
                  >
                    Start Job
                  </button>
                )}
                {jobStatus.isRunning && !jobStatus.isPaused && (
                  <button
                    onClick={() => handleJobControl('pause')}
                    className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-warning text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    Pause Job
                  </button>
                )}
                {jobStatus.isRunning && jobStatus.isPaused && (
                  <button
                    onClick={() => handleJobControl('resume')}
                    className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-success text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    Resume Job
                  </button>
                )}
                {jobStatus.isRunning && (
                  <button
                    onClick={() => handleJobControl('stop')}
                    className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-danger text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    Stop Job
                  </button>
                )}
              </div>
              {!jobStatus.config.enabled && (
                <div className="p-3 px-4 rounded-md mt-5 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300">
                  <strong className="font-bold mr-1">Note:</strong> Job is disabled. Enable it in the configuration section below to start it.
                </div>
              )}
            </div>
          </div>

          {/* Configuration Section */}
          <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
            <div
              className="p-5 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setConfigCollapsed(!configCollapsed)}
            >
              <h2 className="m-0 text-2xl text-white">Configuration {configCollapsed ? '▼' : '▲'}</h2>
            </div>
            {!configCollapsed && (
            <div className="p-5">
              <div className="max-w-xl">
                <div className="mb-5">
                  <label htmlFor="enabled" className="flex items-center mb-2 font-semibold text-white/90 cursor-pointer">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={configForm.enabled}
                      onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                      className="mr-2 w-4 h-4 cursor-pointer accent-mhc-primary"
                    />
                    <span className="font-semibold text-white/90">Enable Job</span>
                  </label>
                  <small className="block mt-1 text-white/60 text-sm">Must be enabled for job to start</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="intervalMinutes" className="block mb-2 font-semibold text-white/90">Polling Interval (minutes)</label>
                  <input
                    type="number"
                    id="intervalMinutes"
                    value={configForm.intervalMinutes}
                    onChange={(e) => handleConfigChange('intervalMinutes', parseInt(e.target.value))}
                    min="5"
                    max="1440"
                    step="5"
                    className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <small className="block mt-1 text-white/60 text-sm">How often to poll the Affiliate API (5-1440 minutes)</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="gender" className="block mb-2 font-semibold text-white/90">Gender Filter</label>
                  <select
                    id="gender"
                    value={configForm.gender}
                    onChange={(e) => handleConfigChange('gender', e.target.value)}
                    className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
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
                    className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <small className="block mt-1 text-white/60 text-sm">
                    Set to 0 to fetch ALL available broadcasters (uses pagination).
                    Otherwise, limit to specific number (100-10000).
                  </small>
                </div>

                <button
                  onClick={handleUpdateConfig}
                  className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-primary text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Configuration'}
                </button>
              </div>
            </div>
            )}
          </div>

          {/* Statistics Section */}
          <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-2xl text-white">Statistics</h2>
              <button
                onClick={handleResetStats}
                className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-gray-500 text-white hover:bg-gray-600"
              >
                Reset Stats
              </button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-5">
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{jobStatus.stats.totalRuns}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Total Cycles</div>
                </div>
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{jobStatus.stats.totalEnriched}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Total Enriched</div>
                </div>
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{jobStatus.stats.totalFailed}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Total Failed</div>
                </div>
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{formatDate(jobStatus.stats.lastRun)}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Last Run</div>
                </div>
              </div>

              {jobStatus.stats.lastRun && (
                <div className="mt-5 pt-5 border-t border-white/10">
                  <h3 className="text-lg mb-4 text-white">Last Cycle Results:</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                      <span className="font-semibold text-white/70">Enriched:</span>
                      <span className="text-white font-medium">{jobStatus.stats.lastRunEnriched}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                      <span className="font-semibold text-white/70">Failed:</span>
                      <span className="text-white font-medium">{jobStatus.stats.lastRunFailed}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                      <span className="font-semibold text-white/70">Success Rate:</span>
                      <span className="text-white font-medium">
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
          <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-2xl text-white">Disk Usage</h2>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{formatBytes(systemStats.diskUsage?.total || 0)}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Total Disk Usage</div>
                </div>
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{formatBytes(systemStats.diskUsage?.database || 0)}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Database Size</div>
                </div>
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{formatBytes(systemStats.diskUsage?.images || 0)}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Images Stored</div>
                </div>
              </div>
            </div>
          </div>

          {/* User Statistics Card */}
          <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-2xl text-white">User Statistics</h2>
            </div>
            <div className="p-5">
              <div className="text-center p-8 bg-mhc-primary/10 border border-mhc-primary/30 rounded-lg mb-4">
                <div className="text-5xl font-bold text-mhc-primary mb-2">{systemStats.userCounts?.total || 0}</div>
                <div className="text-lg text-white/80">Total Users in Database</div>
              </div>
              <p className="text-white/60 text-base mt-4 p-4 bg-white/5 rounded-lg">
                System Stats API endpoint not yet implemented. Coming soon!
              </p>
            </div>
          </div>

          {/* Queue Statistics Card */}
          <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="m-0 text-2xl text-white">Queue Statistics</h2>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{systemStats.queueStats?.priority1Pending || 0}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Priority 1 Pending</div>
                </div>
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{systemStats.queueStats?.priority2Active || 0}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Priority 2 Active</div>
                </div>
                <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                  <div className="text-3xl font-bold mb-2">{systemStats.queueStats?.failedLookups24h || 0}</div>
                  <div className="text-sm opacity-90 uppercase tracking-wide">Failed Lookups (24h)</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  const renderScraperTab = () => {
    const baseBadge = "px-3 py-1 rounded-full text-sm font-semibold uppercase";

    return (
      <>
        {/* Cookie Status Card */}
        <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h2 className="m-0 text-2xl text-white">Chaturbate Session</h2>
            {hasCookies ? (
              <span className={`${baseBadge} bg-mhc-success text-white`}>Authenticated</span>
            ) : (
              <span className={`${baseBadge} bg-mhc-warning text-white`}>Not Authenticated</span>
            )}
          </div>
          <div className="p-5">
            <p className="text-white/60 text-base p-4 bg-white/5 rounded-lg mb-4">
              Import your Chaturbate session cookies to enable automated scraping of your following and followers lists.
              This is required for the auto-scrape feature to work.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <button
                className={`px-5 py-2.5 rounded-md text-base font-semibold transition-all ${
                  hasCookies
                    ? 'bg-gray-500 text-white hover:bg-gray-600'
                    : 'bg-mhc-primary text-white hover:bg-indigo-600'
                }`}
                onClick={() => setShowCookieDialog(true)}
              >
                {hasCookies ? 'Update Cookies' : 'Import Cookies'}
              </button>
            </div>
            {cookieStatus && (
              <div className="p-3 px-4 rounded-md mt-4 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300">
                {cookieStatus}
              </div>
            )}
          </div>
        </div>

        {/* Auto-Scrape Card */}
        <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h2 className="m-0 text-2xl text-white">Auto-Scrape</h2>
          </div>
          <div className="p-5">
            <p className="text-white/60 text-base p-4 bg-white/5 rounded-lg mb-4">
              Automatically scrape your following and followers lists from Chaturbate.
              This uses your imported session cookies to fetch all pages.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <button
                className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-primary text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleAutoScrape('following')}
                disabled={scraping || !hasCookies}
              >
                {scraping ? 'Scraping...' : 'Scrape Following'}
              </button>
              <button
                className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-primary text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleAutoScrape('followers')}
                disabled={scraping || !hasCookies}
              >
                {scraping ? 'Scraping...' : 'Scrape Followers'}
              </button>
            </div>
            {!hasCookies && (
              <div className="p-3 px-4 rounded-md mt-4 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300">
                Import cookies first to enable auto-scraping.
              </div>
            )}
            {scrapeStatus && (
              <div className="p-3 px-4 rounded-md mt-4 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300">
                {scrapeStatus}
              </div>
            )}
          </div>
        </div>

        {/* Cookie Import Dialog */}
        {showCookieDialog && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={() => setShowCookieDialog(false)}
          >
            <div
              className="bg-mhc-surface border border-white/10 rounded-xl max-w-2xl w-11/12 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-6 border-b border-white/10">
                <h2 className="m-0 text-xl text-white">Import Chaturbate Cookies</h2>
                <button
                  className="bg-transparent border-none text-white/60 text-2xl cursor-pointer px-2 py-1 leading-none hover:text-white"
                  onClick={() => setShowCookieDialog(false)}
                >
                  ×
                </button>
              </div>
              <div className="p-6">
                <p className="text-white/80 text-sm leading-loose mb-4">
                  <strong className="text-white">Step 1:</strong> Log in to Chaturbate in your browser (handle 2FA if needed)
                  <br />
                  <strong className="text-white">Step 2:</strong> Press F12 to open Developer Tools, go to Application tab, Storage, Cookies, https://chaturbate.com
                  <br />
                  <strong className="text-white">Step 3:</strong> Right-click on any cookie and select "Show Requests With This Cookie"
                  <br />
                  <strong className="text-white">Step 4:</strong> In Network tab, click any request, then Headers, Request Headers, cookie:
                  <br />
                  <strong className="text-white">Step 5:</strong> Copy the ENTIRE cookie value (all the key=value pairs separated by semicolons)
                  <br />
                  <strong className="text-white">Step 6:</strong> Paste this command in Console tab and press Enter:
                </p>
                <pre className="bg-black/30 border border-white/10 rounded-lg p-4 font-mono text-xs text-green-400 overflow-x-auto my-4 whitespace-pre-wrap break-all">
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
                <p className="text-white/80 text-sm mb-2">
                  <strong className="text-white">Step 7:</strong> The cookies are now in your clipboard. Paste them below:
                </p>
                <textarea
                  className="w-full bg-white/5 border border-white/20 rounded-lg p-4 text-white font-mono text-sm resize-y mt-2 focus:outline-none focus:border-mhc-primary"
                  placeholder="Paste cookies JSON array here..."
                  value={cookiesInput}
                  onChange={(e) => setCookiesInput(e.target.value)}
                  rows={8}
                />
                <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-white/10">
                  <button
                    className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-gray-500 text-white hover:bg-gray-600"
                    onClick={() => setShowCookieDialog(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-primary text-white hover:bg-indigo-600"
                    onClick={handleImportCookies}
                  >
                    Import Cookies
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderDataSourcesTab = () => (
    <>
      <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
        <div className="p-5 border-b border-white/10 flex justify-between items-center">
          <h2 className="m-0 text-2xl text-white">Data Sources Status</h2>
        </div>
        <div className="p-5">
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <div className="text-lg font-semibold text-white mb-2 flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Active</span>
                Chaturbate Affiliate API
              </div>
              <div className="text-sm text-white/60">Real-time online models data</div>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <div className="text-lg font-semibold text-white mb-2 flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/50">Ready</span>
                CBHours API
              </div>
              <div className="text-sm text-white/60">Historical tracking and rank data (not polling yet)</div>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <div className="text-lg font-semibold text-white mb-2 flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Active</span>
                Chaturbate Events API
              </div>
              <div className="text-sm text-white/60">Hudson's room events only</div>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <div className="text-lg font-semibold text-white mb-2 flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Active</span>
                Chaturbate Stats API
              </div>
              <div className="text-sm text-white/60">Hudson's broadcast statistics</div>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <div className="text-lg font-semibold text-white mb-2 flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">On-Demand</span>
                StatBate API
              </div>
              <div className="text-sm text-white/60">Tips and member analysis</div>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <div className="text-lg font-semibold text-white mb-2 flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-gray-500/20 text-gray-400 border border-gray-500/50">Planned</span>
                Profile Scraping
              </div>
              <div className="text-sm text-white/60">Bio, social links, wishlist (manual per-user)</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
        <div className="p-5 border-b border-white/10 flex justify-between items-center">
          <h2 className="m-0 text-2xl text-white">Source Priority Configuration</h2>
        </div>
        <div className="p-5">
          <p className="text-white/60 text-base p-4 bg-white/5 rounded-lg">
            Data source priority is configured via the <code className="bg-white/10 px-2 py-0.5 rounded font-mono">v_person_current_state</code> database view.
            See <a href="https://github.com/your-repo/docs/DATA_SOURCE_STRATEGY.md" target="_blank" rel="noopener noreferrer" className="text-mhc-primary hover:text-mhc-primary-light underline">DATA_SOURCE_STRATEGY.md</a> for details.
          </p>
        </div>
      </div>
    </>
  );

  if (loading && !jobStatus && activeTab === 'jobs') {
    return (
      <div className="max-w-6xl mx-auto px-5 py-6">
        <p className="text-mhc-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
          Admin
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 border-b-2 border-white/10 mb-8">
          <button
            className={`px-6 py-3 text-base font-medium rounded-t-lg border border-white/20 border-b-2 -mb-0.5 mr-2 transition-all ${
              activeTab === 'jobs'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary border-b-mhc-primary font-semibold'
                : 'bg-mhc-surface/60 text-white/90 hover:bg-mhc-primary/10 hover:text-mhc-primary-light hover:border-mhc-primary/40'
            }`}
            onClick={() => setActiveTab('jobs')}
          >
            Jobs Management
          </button>
          <button
            className={`px-6 py-3 text-base font-medium rounded-t-lg border border-white/20 border-b-2 -mb-0.5 mr-2 transition-all ${
              activeTab === 'system-stats'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary border-b-mhc-primary font-semibold'
                : 'bg-mhc-surface/60 text-white/90 hover:bg-mhc-primary/10 hover:text-mhc-primary-light hover:border-mhc-primary/40'
            }`}
            onClick={() => setActiveTab('system-stats')}
          >
            System Stats
          </button>
          <button
            className={`px-6 py-3 text-base font-medium rounded-t-lg border border-white/20 border-b-2 -mb-0.5 mr-2 transition-all ${
              activeTab === 'data-sources'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary border-b-mhc-primary font-semibold'
                : 'bg-mhc-surface/60 text-white/90 hover:bg-mhc-primary/10 hover:text-mhc-primary-light hover:border-mhc-primary/40'
            }`}
            onClick={() => setActiveTab('data-sources')}
          >
            Data Sources
          </button>
          <button
            className={`px-6 py-3 text-base font-medium rounded-t-lg border border-white/20 border-b-2 -mb-0.5 mr-2 transition-all ${
              activeTab === 'scraper'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary border-b-mhc-primary font-semibold'
                : 'bg-mhc-surface/60 text-white/90 hover:bg-mhc-primary/10 hover:text-mhc-primary-light hover:border-mhc-primary/40'
            }`}
            onClick={() => setActiveTab('scraper')}
          >
            Scraper
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 px-4 rounded-md mb-5 bg-red-500/15 border-l-4 border-red-500 text-red-300">
          <strong className="font-bold mr-1">Error:</strong> {error}
        </div>
      )}

      <div className="mt-4">
        {activeTab === 'jobs' && renderJobsTab()}
        {activeTab === 'system-stats' && renderSystemStatsTab()}
        {activeTab === 'data-sources' && renderDataSourcesTab()}
        {activeTab === 'scraper' && renderScraperTab()}
      </div>
    </div>
  );
};

export default Admin;
