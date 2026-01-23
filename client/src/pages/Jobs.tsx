import React, { useState, useEffect, useCallback } from 'react';

// ===== Type Definitions =====

// Affiliate Polling Job Types
interface AffiliateConfig {
  intervalMinutes: number;
  gender: string;
  limit: number;
  enabled: boolean;
}

interface AffiliateStats {
  lastRun: string | null;
  totalRuns: number;
  totalEnriched: number;
  totalFailed: number;
  lastRunEnriched: number;
  lastRunFailed: number;
  currentUsername: string | null;
  progress: number;
  total: number;
}

interface AffiliateJobStatus {
  isRunning: boolean;
  isPaused: boolean;
  isProcessing: boolean;
  config: AffiliateConfig;
  stats: AffiliateStats;
}

// Profile Scrape Job Types
interface ProfileScrapeConfig {
  intervalMinutes: number;
  maxProfilesPerRun: number;
  delayBetweenProfiles: number;
  refreshDays: number;
  enabled: boolean;
  prioritizeFollowing: boolean;
  prioritizeWatchlist: boolean;
}

interface ProfileScrapeStats {
  lastRun: string | null;
  totalRuns: number;
  totalScraped: number;
  totalFailed: number;
  totalSkipped: number;
  lastRunScraped: number;
  lastRunFailed: number;
  lastRunSkipped: number;
  currentUsername: string | null;
  progress: number;
  total: number;
}

interface ProfileScrapeJobStatus {
  isRunning: boolean;
  isPaused: boolean;
  isProcessing: boolean;
  config: ProfileScrapeConfig;
  stats: ProfileScrapeStats;
}

// CBHours Job Types
interface CBHoursConfig {
  intervalMinutes: number;
  batchSize: number;
  enabled: boolean;
  targetFollowing: boolean;
}

interface CBHoursStats {
  lastRun: string | null;
  totalRuns: number;
  totalRecorded: number;
  totalFailed: number;
  totalOnline: number;
  lastRunRecorded: number;
  lastRunFailed: number;
  lastRunOnline: number;
  currentBatch: number;
  totalBatches: number;
  progress: number;
  total: number;
}

interface CBHoursJobStatus {
  isRunning: boolean;
  isPaused: boolean;
  isProcessing: boolean;
  config: CBHoursConfig;
  stats: CBHoursStats;
}

// Statbate Job Types
interface StatbateConfig {
  intervalMinutes: number;
  batchSize: number;
  delayBetweenBatches: number;
  delayBetweenRequests: number;
  maxPersonsPerRun: number;
  enabled: boolean;
  prioritizeFollowing: boolean;
  prioritizeFollowers: boolean;
  prioritizeBanned: boolean;
  prioritizeWatchlist: boolean;
  prioritizeLive: boolean;
  prioritizeDoms: boolean;
  prioritizeFriends: boolean;
  prioritizeSubs: boolean;
  prioritizeTippedMe: boolean;
  prioritizeTippedByMe: boolean;
}

// DM Import Job Types
interface DMImportConfig {
  enabled: boolean;
  maxThreadsPerRun: number;
  delayBetweenThreads: number;
  autoImport: boolean;
}

interface DMImportStats {
  lastRun: string | null;
  totalRuns: number;
  totalThreadsScraped: number;
  totalMessagesScraped: number;
  totalMessagesImported: number;
  lastRunThreads: number;
  lastRunMessages: number;
  currentThread: string | null;
  progress: number;
  total: number;
}

interface DMImportJobStatus {
  isRunning: boolean;
  isProcessing: boolean;
  config: DMImportConfig;
  stats: DMImportStats;
}

// Live Screenshot Job Types
interface LiveScreenshotConfig {
  intervalMinutes: number;
  enabled: boolean;
}

interface LiveScreenshotStats {
  lastRun: string | null;
  totalRuns: number;
  totalCaptures: number;
  lastCycleCaptures: number;
  lastCycleFollowingOnline: number;
  errors: number;
  currentUsername: string | null;
  progress: number;
  total: number;
}

interface LiveScreenshotJobStatus {
  isRunning: boolean;
  isProcessing: boolean;
  config: LiveScreenshotConfig;
  stats: LiveScreenshotStats;
}

interface StatbateStats {
  lastRun: string | null;
  totalRuns: number;
  currentRunRefreshed: number;
  currentRunFailed: number;
  currentUsername: string | null;
  progress: number;
  total: number;
}

interface StatbateJobStatus {
  isRunning: boolean;
  isPaused: boolean;
  isProcessing: boolean;
  intervalMinutes: number;
  config: StatbateConfig;
  stats: StatbateStats;
}

// ===== Component =====

const Jobs: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Expanded states for each job
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({
    affiliate: false,
    'profile-scrape': false,
    cbhours: false,
    statbate: false,
    'live-screenshot': false,
    'dm-import': false,
  });

  // Job statuses
  const [affiliateStatus, setAffiliateStatus] = useState<AffiliateJobStatus | null>(null);
  const [profileScrapeStatus, setProfileScrapeStatus] = useState<ProfileScrapeJobStatus | null>(null);
  const [cbhoursStatus, setCbhoursStatus] = useState<CBHoursJobStatus | null>(null);
  const [statbateStatus, setStatbateStatus] = useState<StatbateJobStatus | null>(null);
  const [liveScreenshotStatus, setLiveScreenshotStatus] = useState<LiveScreenshotJobStatus | null>(null);
  const [dmImportStatus, setDMImportStatus] = useState<DMImportJobStatus | null>(null);

  // Config form states
  const [affiliateConfig, setAffiliateConfig] = useState<AffiliateConfig>({
    intervalMinutes: 5,
    gender: 'm',
    limit: 250,
    enabled: true,
  });
  const [profileScrapeConfig, setProfileScrapeConfig] = useState<ProfileScrapeConfig>({
    intervalMinutes: 15,
    maxProfilesPerRun: 50,
    delayBetweenProfiles: 5000,
    refreshDays: 7,
    enabled: true,
    prioritizeFollowing: true,
    prioritizeWatchlist: true,
  });
  const [cbhoursConfig, setCbhoursConfig] = useState<CBHoursConfig>({
    intervalMinutes: 30,
    batchSize: 50,
    enabled: true,
    targetFollowing: true,
  });
  const [statbateConfig, setStatbateConfig] = useState<StatbateConfig>({
    intervalMinutes: 360,
    batchSize: 5,
    delayBetweenBatches: 30000,
    delayBetweenRequests: 2000,
    maxPersonsPerRun: 1000,
    enabled: true,
    prioritizeFollowing: true,
    prioritizeFollowers: false,
    prioritizeBanned: false,
    prioritizeWatchlist: true,
    prioritizeLive: false,
    prioritizeDoms: true,
    prioritizeFriends: true,
    prioritizeSubs: true,
    prioritizeTippedMe: true,
    prioritizeTippedByMe: false,
  });
  const [liveScreenshotConfig, setLiveScreenshotConfig] = useState<LiveScreenshotConfig>({
    intervalMinutes: 30,
    enabled: true,
  });
  const [dmImportConfig, setDMImportConfig] = useState<DMImportConfig>({
    enabled: true,
    maxThreadsPerRun: 100,
    delayBetweenThreads: 2000,
    autoImport: true,
  });
  const [scrapeUsername, setScrapeUsername] = useState('');

  // Toggle job expansion
  const toggleJob = (jobId: string) => {
    setExpandedJobs(prev => ({ ...prev, [jobId]: !prev[jobId] }));
  };

  // Fetch all job statuses
  const fetchAllStatuses = useCallback(async () => {
    try {
      const [affiliateRes, profileScrapeRes, cbhoursRes, statbateRes, liveScreenshotRes, dmImportRes] = await Promise.all([
        fetch('/api/job/affiliate/status'),
        fetch('/api/job/profile-scrape/status'),
        fetch('/api/job/cbhours/status'),
        fetch('/api/job/statbate/status'),
        fetch('/api/job/live-screenshot/status'),
        fetch('/api/job/dm-import/status'),
      ]);

      if (affiliateRes.ok) {
        const data = await affiliateRes.json();
        setAffiliateStatus(data);
        setAffiliateConfig(data.config);
      }

      if (profileScrapeRes.ok) {
        const data = await profileScrapeRes.json();
        setProfileScrapeStatus(data);
        setProfileScrapeConfig(data.config);
      }

      if (cbhoursRes.ok) {
        const data = await cbhoursRes.json();
        setCbhoursStatus(data);
        setCbhoursConfig(data.config);
      }

      if (statbateRes.ok) {
        const data = await statbateRes.json();
        setStatbateStatus(data);
        if (data.config) {
          setStatbateConfig(data.config);
        }
      }

      if (liveScreenshotRes.ok) {
        const data = await liveScreenshotRes.json();
        setLiveScreenshotStatus(data);
        if (data.config) {
          setLiveScreenshotConfig(data.config);
        }
      }

      if (dmImportRes.ok) {
        const data = await dmImportRes.json();
        setDMImportStatus(data);
        if (data.config) {
          setDMImportConfig(data.config);
        }
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job statuses');
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchAllStatuses();
    const interval = setInterval(fetchAllStatuses, 10000);
    return () => clearInterval(interval);
  }, [fetchAllStatuses]);

  // Generic job control handler
  const handleJobControl = async (
    jobPath: string,
    action: string,
    setStatus: (data: any) => void,
    body?: object
  ) => {
    try {
      setLoading(true);
      setSuccessMessage(null);
      const response = await fetch(`/api/job/${jobPath}/${action}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(`Failed to ${action} job`);
      const data = await response.json();
      if (data.status) setStatus(data.status);
      setError(null);

      // Show success message for config saves
      if (action === 'config') {
        const jobName = jobPath === 'affiliate' ? 'Affiliate API' :
                       jobPath === 'profile-scrape' ? 'Profile Capture' :
                       jobPath === 'cbhours' ? 'CBHours' :
                       jobPath === 'statbate' ? 'Statbate Refresh' :
                       jobPath === 'live-screenshot' ? 'Live Screenshot' :
                       jobPath === 'dm-import' ? 'DM Import' : jobPath;
        setSuccessMessage(`${jobName} configuration saved successfully`);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Format date helper
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  // Status badge component
  const StatusBadge: React.FC<{ isRunning: boolean; isPaused: boolean; isProcessing?: boolean }> = ({
    isRunning,
    isPaused,
    isProcessing,
  }) => {
    if (isProcessing) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-blue-500 text-white animate-pulse">
          Processing
        </span>
      );
    }
    if (isRunning && !isPaused) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-emerald-500 text-white">
          Running
        </span>
      );
    }
    if (isPaused) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-amber-500 text-white">
          Paused
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-gray-500 text-white">
        Stopped
      </span>
    );
  };

  // Progress bar component
  const ProgressBar: React.FC<{ progress: number; total: number; label?: string }> = ({
    progress,
    total,
    label,
  }) => {
    const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-white/70">
          <span>{label || 'Progress'}</span>
          <span>
            {progress}/{total} ({percentage}%)
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="bg-mhc-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  // Stat card component
  const StatCard: React.FC<{ value: string | number; label: string }> = ({ value, label }) => (
    <div className="text-center p-3 bg-gradient-to-br from-mhc-primary to-mhc-primary-dark rounded-lg text-white">
      <div className="text-xl font-bold mb-1">{value}</div>
      <div className="text-xs opacity-90 uppercase tracking-wide">{label}</div>
    </div>
  );

  // Info row component
  const InfoRow: React.FC<{ label: string; value: string | number | React.ReactNode }> = ({
    label,
    value,
  }) => (
    <div className="flex justify-between items-center p-2 bg-white/5 rounded-md border border-white/10 text-sm">
      <span className="font-medium text-white/70">{label}:</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );

  // ===== Affiliate Job Section =====
  const renderAffiliateJob = () => {
    const isExpanded = expandedJobs['affiliate'];
    const status = affiliateStatus;

    return (
      <div className="bg-mhc-surface border border-white/10 rounded-lg overflow-hidden">
        {/* Collapsible Header */}
        <div
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('affiliate')}
        >
          <div className="flex items-center gap-3">
            <span className="text-white/40">{isExpanded ? '▼' : '▶'}</span>
            <StatusBadge
              isRunning={status?.isRunning || false}
              isPaused={status?.isPaused || false}
              isProcessing={status?.isProcessing}
            />
            <span className="font-semibold text-white">Affiliate API</span>
            {status?.isProcessing && status.stats.total > 0 && (
              <span className="text-xs text-white/50">
                ({status.stats.progress}/{status.stats.total})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!status?.isRunning && (
              <button
                onClick={() => handleJobControl('affiliate', 'start', setAffiliateStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading || !status?.config.enabled}
              >
                Start
              </button>
            )}
            {status?.isRunning && !status?.isPaused && (
              <button
                onClick={() => handleJobControl('affiliate', 'pause', setAffiliateStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                disabled={loading}
              >
                Pause
              </button>
            )}
            {status?.isRunning && status?.isPaused && (
              <button
                onClick={() => handleJobControl('affiliate', 'resume', setAffiliateStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading}
              >
                Resume
              </button>
            )}
            {status?.isRunning && (
              <button
                onClick={() => handleJobControl('affiliate', 'stop', setAffiliateStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                disabled={loading}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && status && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {/* Progress if processing */}
            {status.isProcessing && status.stats.total > 0 && (
              <ProgressBar
                progress={status.stats.progress}
                total={status.stats.total}
                label={status.stats.currentUsername || 'Processing...'}
              />
            )}

            {/* Statistics */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Statistics</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard value={status.stats.totalRuns} label="Total Cycles" />
                <StatCard value={status.stats.totalEnriched} label="Total Enriched" />
                <StatCard value={status.stats.totalFailed} label="Total Failed" />
                <StatCard value={formatDate(status.stats.lastRun)} label="Last Run" />
              </div>
              {status.stats.lastRun && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoRow label="Last Enriched" value={status.stats.lastRunEnriched} />
                  <InfoRow label="Last Failed" value={status.stats.lastRunFailed} />
                  <InfoRow
                    label="Success Rate"
                    value={`${
                      status.stats.lastRunEnriched + status.stats.lastRunFailed > 0
                        ? Math.round(
                            (status.stats.lastRunEnriched /
                              (status.stats.lastRunEnriched + status.stats.lastRunFailed)) *
                              100
                          )
                        : 0
                    }%`}
                  />
                </div>
              )}
            </div>

            {/* Current Status */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Current Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <InfoRow label="Interval" value={`${status.config.intervalMinutes} min`} />
                <InfoRow label="Gender" value={status.config.gender.toUpperCase()} />
                <InfoRow label="Limit" value={status.config.limit === 0 ? 'ALL' : status.config.limit} />
                <InfoRow label="Enabled" value={status.config.enabled ? 'Yes' : 'No'} />
              </div>
            </div>

            {/* Configuration */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex items-center cursor-pointer col-span-full">
                  <input
                    type="checkbox"
                    checked={affiliateConfig.enabled}
                    onChange={(e) => setAffiliateConfig({ ...affiliateConfig, enabled: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Enable Job</span>
                </label>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Interval (min)</label>
                  <input
                    type="number"
                    value={affiliateConfig.intervalMinutes}
                    onChange={(e) => setAffiliateConfig({ ...affiliateConfig, intervalMinutes: parseInt(e.target.value) })}
                    min="1"
                    max="1440"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Gender</label>
                  <select
                    value={affiliateConfig.gender}
                    onChange={(e) => setAffiliateConfig({ ...affiliateConfig, gender: e.target.value })}
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  >
                    <option value="m">Male</option>
                    <option value="f">Female</option>
                    <option value="t">Trans</option>
                    <option value="c">Couple</option>
                    <option value="m,f">Male + Female</option>
                    <option value="m,f,t,c">All</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Limit (0=ALL)</label>
                  <input
                    type="number"
                    value={affiliateConfig.limit}
                    onChange={(e) => setAffiliateConfig({ ...affiliateConfig, limit: parseInt(e.target.value) })}
                    min="0"
                    max="10000"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleJobControl('affiliate', 'config', setAffiliateStatus, affiliateConfig)}
                  className="px-4 py-2 rounded font-medium bg-mhc-primary text-white hover:bg-mhc-primary/80 text-sm disabled:opacity-50"
                  disabled={loading}
                >
                  Save Config
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all statistics?')) {
                      handleJobControl('affiliate', 'reset-stats', setAffiliateStatus);
                    }
                  }}
                  className="px-3 py-2 rounded font-medium bg-gray-600 text-white hover:bg-gray-500 text-sm"
                >
                  Reset Stats
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ===== Profile Scrape Job Section =====
  const renderProfileScrapeJob = () => {
    const isExpanded = expandedJobs['profile-scrape'];
    const status = profileScrapeStatus;

    return (
      <div className="bg-mhc-surface border border-white/10 rounded-lg overflow-hidden">
        {/* Collapsible Header */}
        <div
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('profile-scrape')}
        >
          <div className="flex items-center gap-3">
            <span className="text-white/40">{isExpanded ? '▼' : '▶'}</span>
            <StatusBadge
              isRunning={status?.isRunning || false}
              isPaused={status?.isPaused || false}
              isProcessing={status?.isProcessing}
            />
            <span className="font-semibold text-white">Profile Capture</span>
            {status?.isProcessing && status.stats.total > 0 && (
              <span className="text-xs text-white/50">
                ({status.stats.progress}/{status.stats.total})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!status?.isRunning && (
              <button
                onClick={() => handleJobControl('profile-scrape', 'start', setProfileScrapeStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading || !status?.config.enabled}
              >
                Start
              </button>
            )}
            {status?.isRunning && !status?.isPaused && (
              <button
                onClick={() => handleJobControl('profile-scrape', 'pause', setProfileScrapeStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                disabled={loading}
              >
                Pause
              </button>
            )}
            {status?.isRunning && status?.isPaused && (
              <button
                onClick={() => handleJobControl('profile-scrape', 'resume', setProfileScrapeStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading}
              >
                Resume
              </button>
            )}
            {status?.isRunning && (
              <button
                onClick={() => handleJobControl('profile-scrape', 'stop', setProfileScrapeStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                disabled={loading}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && status && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {/* Progress if processing */}
            {status.isProcessing && status.stats.total > 0 && (
              <ProgressBar
                progress={status.stats.progress}
                total={status.stats.total}
                label={status.stats.currentUsername || 'Processing...'}
              />
            )}

            {/* Statistics */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Statistics</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard value={status.stats.totalRuns} label="Total Cycles" />
                <StatCard value={status.stats.totalScraped} label="Total Scraped" />
                <StatCard value={status.stats.totalFailed} label="Total Failed" />
                <StatCard value={status.stats.totalSkipped} label="Total Skipped" />
              </div>
              <div className="mt-3">
                <InfoRow label="Last Run" value={formatDate(status.stats.lastRun)} />
              </div>
              {status.stats.lastRun && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoRow label="Last Scraped" value={status.stats.lastRunScraped} />
                  <InfoRow label="Last Failed" value={status.stats.lastRunFailed} />
                  <InfoRow label="Last Skipped" value={status.stats.lastRunSkipped} />
                </div>
              )}
            </div>

            {/* Current Status */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Current Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <InfoRow label="Interval" value={`${status.config.intervalMinutes} min`} />
                <InfoRow label="Max Per Run" value={status.config.maxProfilesPerRun} />
                <InfoRow label="Refresh Days" value={status.config.refreshDays} />
                <InfoRow label="Prioritize Following" value={status.config.prioritizeFollowing ? 'Yes' : 'No'} />
              </div>
            </div>

            {/* Configuration */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profileScrapeConfig.enabled}
                    onChange={(e) => setProfileScrapeConfig({ ...profileScrapeConfig, enabled: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Enable</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profileScrapeConfig.prioritizeFollowing}
                    onChange={(e) => setProfileScrapeConfig({ ...profileScrapeConfig, prioritizeFollowing: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Prioritize Following</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profileScrapeConfig.prioritizeWatchlist}
                    onChange={(e) => setProfileScrapeConfig({ ...profileScrapeConfig, prioritizeWatchlist: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Prioritize Watchlist</span>
                </label>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Interval (min)</label>
                  <input
                    type="number"
                    value={profileScrapeConfig.intervalMinutes}
                    onChange={(e) => setProfileScrapeConfig({ ...profileScrapeConfig, intervalMinutes: parseInt(e.target.value) })}
                    min="5"
                    max="1440"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Max Per Run</label>
                  <input
                    type="number"
                    value={profileScrapeConfig.maxProfilesPerRun}
                    onChange={(e) => setProfileScrapeConfig({ ...profileScrapeConfig, maxProfilesPerRun: parseInt(e.target.value) })}
                    min="1"
                    max="500"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Refresh Days</label>
                  <input
                    type="number"
                    value={profileScrapeConfig.refreshDays}
                    onChange={(e) => setProfileScrapeConfig({ ...profileScrapeConfig, refreshDays: parseInt(e.target.value) })}
                    min="1"
                    max="90"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleJobControl('profile-scrape', 'config', setProfileScrapeStatus, profileScrapeConfig)}
                  className="px-4 py-2 rounded font-medium bg-mhc-primary text-white hover:bg-mhc-primary/80 text-sm disabled:opacity-50"
                  disabled={loading}
                >
                  Save Config
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all statistics?')) {
                      handleJobControl('profile-scrape', 'reset-stats', setProfileScrapeStatus);
                    }
                  }}
                  className="px-3 py-2 rounded font-medium bg-gray-600 text-white hover:bg-gray-500 text-sm"
                >
                  Reset Stats
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ===== CBHours Job Section =====
  const renderCBHoursJob = () => {
    const isExpanded = expandedJobs['cbhours'];
    const status = cbhoursStatus;

    return (
      <div className="bg-mhc-surface border border-white/10 rounded-lg overflow-hidden">
        {/* Collapsible Header */}
        <div
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('cbhours')}
        >
          <div className="flex items-center gap-3">
            <span className="text-white/40">{isExpanded ? '▼' : '▶'}</span>
            <StatusBadge
              isRunning={status?.isRunning || false}
              isPaused={status?.isPaused || false}
              isProcessing={status?.isProcessing}
            />
            <span className="font-semibold text-white">CBHours</span>
            {status?.isProcessing && status.stats.totalBatches > 0 && (
              <span className="text-xs text-white/50">
                (Batch {status.stats.currentBatch}/{status.stats.totalBatches})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!status?.isRunning && (
              <button
                onClick={() => handleJobControl('cbhours', 'start', setCbhoursStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading || !status?.config.enabled}
              >
                Start
              </button>
            )}
            {status?.isRunning && !status?.isPaused && (
              <button
                onClick={() => handleJobControl('cbhours', 'pause', setCbhoursStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                disabled={loading}
              >
                Pause
              </button>
            )}
            {status?.isRunning && status?.isPaused && (
              <button
                onClick={() => handleJobControl('cbhours', 'resume', setCbhoursStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading}
              >
                Resume
              </button>
            )}
            {status?.isRunning && (
              <button
                onClick={() => handleJobControl('cbhours', 'stop', setCbhoursStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                disabled={loading}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && status && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {/* Progress if processing */}
            {status.isProcessing && status.stats.totalBatches > 0 && (
              <ProgressBar
                progress={status.stats.progress}
                total={status.stats.total}
                label={`Batch ${status.stats.currentBatch}/${status.stats.totalBatches}`}
              />
            )}

            {/* Statistics */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Statistics</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard value={status.stats.totalRuns} label="Total Cycles" />
                <StatCard value={status.stats.totalRecorded} label="Total Recorded" />
                <StatCard value={status.stats.totalOnline} label="Total Online" />
                <StatCard value={status.stats.totalFailed} label="Total Failed" />
              </div>
              <div className="mt-3">
                <InfoRow label="Last Run" value={formatDate(status.stats.lastRun)} />
              </div>
              {status.stats.lastRun && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoRow label="Last Recorded" value={status.stats.lastRunRecorded} />
                  <InfoRow label="Last Online" value={status.stats.lastRunOnline} />
                  <InfoRow label="Last Failed" value={status.stats.lastRunFailed} />
                </div>
              )}
            </div>

            {/* Current Status */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Current Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <InfoRow label="Interval" value={`${status.config.intervalMinutes} min`} />
                <InfoRow label="Batch Size" value={status.config.batchSize} />
                <InfoRow label="Target Following" value={status.config.targetFollowing ? 'Yes' : 'No'} />
                <InfoRow label="Enabled" value={status.config.enabled ? 'Yes' : 'No'} />
              </div>
            </div>

            {/* Configuration */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cbhoursConfig.enabled}
                    onChange={(e) => setCbhoursConfig({ ...cbhoursConfig, enabled: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Enable</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cbhoursConfig.targetFollowing}
                    onChange={(e) => setCbhoursConfig({ ...cbhoursConfig, targetFollowing: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Target Following</span>
                </label>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Interval (min)</label>
                  <input
                    type="number"
                    value={cbhoursConfig.intervalMinutes}
                    onChange={(e) => setCbhoursConfig({ ...cbhoursConfig, intervalMinutes: parseInt(e.target.value) })}
                    min="5"
                    max="1440"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Batch Size</label>
                  <input
                    type="number"
                    value={cbhoursConfig.batchSize}
                    onChange={(e) => setCbhoursConfig({ ...cbhoursConfig, batchSize: parseInt(e.target.value) })}
                    min="1"
                    max="50"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleJobControl('cbhours', 'config', setCbhoursStatus, cbhoursConfig)}
                  className="px-4 py-2 rounded font-medium bg-mhc-primary text-white hover:bg-mhc-primary/80 text-sm disabled:opacity-50"
                  disabled={loading}
                >
                  Save Config
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all statistics?')) {
                      handleJobControl('cbhours', 'reset-stats', setCbhoursStatus);
                    }
                  }}
                  className="px-3 py-2 rounded font-medium bg-gray-600 text-white hover:bg-gray-500 text-sm"
                >
                  Reset Stats
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ===== Statbate Job Section =====
  const renderStatbateJob = () => {
    const isExpanded = expandedJobs['statbate'];
    const status = statbateStatus;

    return (
      <div className="bg-mhc-surface border border-white/10 rounded-lg overflow-hidden">
        {/* Collapsible Header */}
        <div
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('statbate')}
        >
          <div className="flex items-center gap-3">
            <span className="text-white/40">{isExpanded ? '▼' : '▶'}</span>
            <StatusBadge
              isRunning={status?.isRunning || false}
              isPaused={status?.isPaused || false}
              isProcessing={status?.isProcessing}
            />
            <span className="font-semibold text-white">Statbate Refresh</span>
            {status?.isProcessing && status.stats.total > 0 && (
              <span className="text-xs text-white/50">
                ({status.stats.progress}/{status.stats.total})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!status?.isRunning && (
              <button
                onClick={() => handleJobControl('statbate', 'start', setStatbateStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading || !status?.config?.enabled}
              >
                Start
              </button>
            )}
            {status?.isRunning && !status?.isPaused && (
              <button
                onClick={() => handleJobControl('statbate', 'pause', setStatbateStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                disabled={loading}
              >
                Pause
              </button>
            )}
            {status?.isRunning && status?.isPaused && (
              <button
                onClick={() => handleJobControl('statbate', 'resume', setStatbateStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading}
              >
                Resume
              </button>
            )}
            {status?.isRunning && (
              <button
                onClick={() => handleJobControl('statbate', 'stop', setStatbateStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                disabled={loading}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && status && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {/* Progress if processing */}
            {status.isProcessing && status.stats.total > 0 && (
              <ProgressBar
                progress={status.stats.progress}
                total={status.stats.total}
                label={status.stats.currentUsername || 'Processing...'}
              />
            )}

            {/* Statistics */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Statistics</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard value={status.stats.totalRuns} label="Total Cycles" />
                <StatCard value={status.stats.currentRunRefreshed} label="Refreshed" />
                <StatCard value={status.stats.currentRunFailed} label="Failed" />
                <StatCard value={formatDate(status.stats.lastRun)} label="Last Run" />
              </div>
              {(status.stats.currentRunRefreshed + status.stats.currentRunFailed > 0) && (
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <InfoRow
                    label="Success Rate"
                    value={`${Math.round(
                      (status.stats.currentRunRefreshed /
                        (status.stats.currentRunRefreshed + status.stats.currentRunFailed)) *
                        100
                    )}%`}
                  />
                </div>
              )}
            </div>

            {/* Current Status */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Current Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <InfoRow label="Interval" value={`${status.config.intervalMinutes} min`} />
                <InfoRow label="Batch Size" value={status.config.batchSize} />
                <InfoRow label="Max Per Run" value={status.config.maxPersonsPerRun} />
                <InfoRow label="Enabled" value={status.config.enabled ? 'Yes' : 'No'} />
              </div>
            </div>

            {/* Configuration */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.enabled}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, enabled: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Enable Job</span>
                </label>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Interval (min)</label>
                  <input
                    type="number"
                    value={statbateConfig.intervalMinutes}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, intervalMinutes: parseInt(e.target.value) })}
                    min="60"
                    max="1440"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Max Per Run</label>
                  <input
                    type="number"
                    value={statbateConfig.maxPersonsPerRun}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, maxPersonsPerRun: parseInt(e.target.value) })}
                    min="10"
                    max="10000"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Batch Size</label>
                  <input
                    type="number"
                    value={statbateConfig.batchSize}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, batchSize: parseInt(e.target.value) })}
                    min="1"
                    max="20"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>
              </div>

              {/* Prioritization Section */}
              <h4 className="text-sm font-semibold text-white/70 uppercase mt-4 mb-3">Prioritization (in order)</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeWatchlist}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeWatchlist: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Watchlist</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeFollowing}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeFollowing: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Following</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeFollowers}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeFollowers: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Followers</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeBanned}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeBanned: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Banned</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeLive}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeLive: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Live</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeDoms}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeDoms: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Doms</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeFriends}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeFriends: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Friends</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeSubs}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeSubs: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Subs</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeTippedMe}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeTippedMe: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Tipped Me</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statbateConfig.prioritizeTippedByMe}
                    onChange={(e) => setStatbateConfig({ ...statbateConfig, prioritizeTippedByMe: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Tipped By Me</span>
                </label>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleJobControl('statbate', 'config', setStatbateStatus, statbateConfig)}
                  className="px-4 py-2 rounded font-medium bg-mhc-primary text-white hover:bg-mhc-primary/80 text-sm disabled:opacity-50"
                  disabled={loading}
                >
                  Save Config
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all statistics?')) {
                      handleJobControl('statbate', 'reset-stats', setStatbateStatus);
                    }
                  }}
                  className="px-3 py-2 rounded font-medium bg-gray-600 text-white hover:bg-gray-500 text-sm"
                >
                  Reset Stats
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ===== Live Screenshot Job Section =====
  const renderLiveScreenshotJob = () => {
    const isExpanded = expandedJobs['live-screenshot'];
    const status = liveScreenshotStatus;

    return (
      <div className="bg-mhc-surface border border-white/10 rounded-lg overflow-hidden">
        {/* Collapsible Header */}
        <div
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('live-screenshot')}
        >
          <div className="flex items-center gap-3">
            <span className="text-white/40">{isExpanded ? '▼' : '▶'}</span>
            <StatusBadge
              isRunning={status?.isRunning || false}
              isPaused={false}
              isProcessing={status?.isProcessing}
            />
            <span className="font-semibold text-white">Live Screenshot</span>
            {status?.isProcessing && status.stats.total > 0 && (
              <span className="text-xs text-white/50">
                ({status.stats.progress}/{status.stats.total})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleJobControl('live-screenshot', 'run-now', setLiveScreenshotStatus)}
              className="px-3 py-1 rounded text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
              disabled={loading || status?.isProcessing}
              title="Capture screenshots now"
            >
              Run Now
            </button>
            {!status?.isRunning && (
              <button
                onClick={() => handleJobControl('live-screenshot', 'start', setLiveScreenshotStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading || !status?.config?.enabled}
              >
                Start
              </button>
            )}
            {status?.isRunning && (
              <button
                onClick={() => handleJobControl('live-screenshot', 'stop', setLiveScreenshotStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                disabled={loading}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && status && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {/* Progress if processing */}
            {status.isProcessing && status.stats.total > 0 && (
              <ProgressBar
                progress={status.stats.progress}
                total={status.stats.total}
                label={status.stats.currentUsername || 'Capturing screenshots...'}
              />
            )}

            {/* Statistics */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Statistics</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard value={status.stats.totalRuns} label="Total Cycles" />
                <StatCard value={status.stats.totalCaptures} label="Total Captures" />
                <StatCard value={status.stats.lastCycleCaptures} label="Last Cycle" />
                <StatCard value={status.stats.errors} label="Errors" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <InfoRow label="Last Run" value={formatDate(status.stats.lastRun)} />
                <InfoRow label="Following Online (Last)" value={status.stats.lastCycleFollowingOnline} />
              </div>
            </div>

            {/* Current Status */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Current Status</h3>
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="Interval" value={`${status.config.intervalMinutes} min`} />
                <InfoRow label="Enabled" value={status.config.enabled ? 'Yes' : 'No'} />
              </div>
            </div>

            {/* Configuration */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liveScreenshotConfig.enabled}
                    onChange={(e) => setLiveScreenshotConfig({ ...liveScreenshotConfig, enabled: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Enable Job</span>
                </label>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Interval (min)</label>
                  <input
                    type="number"
                    value={liveScreenshotConfig.intervalMinutes}
                    onChange={(e) => setLiveScreenshotConfig({ ...liveScreenshotConfig, intervalMinutes: parseInt(e.target.value) })}
                    min="5"
                    max="1440"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>
              </div>
              <p className="text-xs text-white/50 mt-2">
                Captures screenshots from Following users who are currently live (from Affiliate API feed).
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleJobControl('live-screenshot', 'config', setLiveScreenshotStatus, liveScreenshotConfig)}
                  className="px-4 py-2 rounded font-medium bg-mhc-primary text-white hover:bg-mhc-primary/80 text-sm disabled:opacity-50"
                  disabled={loading}
                >
                  Save Config
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all statistics?')) {
                      handleJobControl('live-screenshot', 'reset-stats', setLiveScreenshotStatus);
                    }
                  }}
                  className="px-3 py-2 rounded font-medium bg-gray-600 text-white hover:bg-gray-500 text-sm"
                >
                  Reset Stats
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ===== DM Import Job Section =====
  const renderDMImportJob = () => {
    const isExpanded = expandedJobs['dm-import'];
    const status = dmImportStatus;

    const handleScrapeOne = async () => {
      if (!scrapeUsername.trim()) return;
      try {
        setLoading(true);
        const response = await fetch(`/api/job/dm-import/scrape-one/${scrapeUsername.trim()}`, {
          method: 'POST',
        });
        const data = await response.json();
        if (data.success) {
          setSuccessMessage(`Scraped ${data.messagesFound} messages from ${scrapeUsername}, saved ${data.messagesSaved}`);
          setTimeout(() => setSuccessMessage(null), 5000);
        } else {
          setError(data.error || 'Failed to scrape thread');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to scrape thread');
      } finally {
        setLoading(false);
      }
    };

    const handleScrapeN = async (count: number) => {
      try {
        setLoading(true);
        const response = await fetch('/api/job/dm-import/scrape-n', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count }),
        });
        const data = await response.json();
        if (data.success) {
          setSuccessMessage(`Scraped ${data.threadsScraped} threads, ${data.totalMessages} messages`);
          setTimeout(() => setSuccessMessage(null), 5000);
        } else {
          setError(data.error || 'Failed to scrape threads');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to scrape threads');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="bg-mhc-surface border border-white/10 rounded-lg overflow-hidden">
        {/* Collapsible Header */}
        <div
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('dm-import')}
        >
          <div className="flex items-center gap-3">
            <span className="text-white/40">{isExpanded ? '▼' : '▶'}</span>
            <StatusBadge
              isRunning={status?.isRunning || false}
              isPaused={false}
              isProcessing={status?.isProcessing}
            />
            <span className="font-semibold text-white">DM Import</span>
            {status?.isProcessing && status.stats.total > 0 && (
              <span className="text-xs text-white/50">
                ({status.stats.progress}/{status.stats.total})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!status?.isRunning && (
              <button
                onClick={() => handleJobControl('dm-import', 'start', setDMImportStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={loading || !status?.config?.enabled}
              >
                Start Full Run
              </button>
            )}
            {status?.isRunning && (
              <button
                onClick={() => handleJobControl('dm-import', 'stop', setDMImportStatus)}
                className="px-3 py-1 rounded text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                disabled={loading}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && status && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {/* Progress if processing */}
            {status.isProcessing && status.stats.total > 0 && (
              <ProgressBar
                progress={status.stats.progress}
                total={status.stats.total}
                label={status.stats.currentThread || 'Scraping DMs...'}
              />
            )}

            {/* Test Controls */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Test Controls</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-white/60 mb-1">Scrape Single Thread</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={scrapeUsername}
                      onChange={(e) => setScrapeUsername(e.target.value)}
                      placeholder="Username"
                      className="flex-1 p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                    />
                    <button
                      onClick={handleScrapeOne}
                      disabled={loading || !scrapeUsername.trim()}
                      className="px-3 py-2 rounded text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      Scrape 1
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => handleScrapeN(10)}
                  disabled={loading}
                  className="px-3 py-2 rounded text-sm font-medium bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50"
                >
                  Scrape 10
                </button>
              </div>
              <p className="text-xs text-white/50 mt-2">
                Use test controls to scrape 1 or 10 threads for validation before running full import.
              </p>
            </div>

            {/* Statistics */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Statistics</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard value={status.stats.totalRuns} label="Total Runs" />
                <StatCard value={status.stats.totalThreadsScraped} label="Threads Scraped" />
                <StatCard value={status.stats.totalMessagesScraped} label="Messages Scraped" />
                <StatCard value={status.stats.totalMessagesImported} label="Imported" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <InfoRow label="Last Run" value={formatDate(status.stats.lastRun)} />
                <InfoRow label="Last Run Threads" value={status.stats.lastRunThreads} />
              </div>
            </div>

            {/* Current Status */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Current Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <InfoRow label="Max Threads" value={status.config.maxThreadsPerRun} />
                <InfoRow label="Delay (ms)" value={status.config.delayBetweenThreads} />
                <InfoRow label="Auto Import" value={status.config.autoImport ? 'Yes' : 'No'} />
                <InfoRow label="Enabled" value={status.config.enabled ? 'Yes' : 'No'} />
              </div>
            </div>

            {/* Configuration */}
            <div>
              <h3 className="text-sm font-semibold text-white/70 uppercase mb-3">Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dmImportConfig.enabled}
                    onChange={(e) => setDMImportConfig({ ...dmImportConfig, enabled: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Enable Job</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dmImportConfig.autoImport}
                    onChange={(e) => setDMImportConfig({ ...dmImportConfig, autoImport: e.target.checked })}
                    className="mr-2 w-4 h-4 accent-mhc-primary"
                  />
                  <span className="text-sm text-white/90">Auto Import to Interactions</span>
                </label>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Max Threads Per Run</label>
                  <input
                    type="number"
                    value={dmImportConfig.maxThreadsPerRun}
                    onChange={(e) => setDMImportConfig({ ...dmImportConfig, maxThreadsPerRun: parseInt(e.target.value) })}
                    min="1"
                    max="500"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Delay Between Threads (ms)</label>
                  <input
                    type="number"
                    value={dmImportConfig.delayBetweenThreads}
                    onChange={(e) => setDMImportConfig({ ...dmImportConfig, delayBetweenThreads: parseInt(e.target.value) })}
                    min="500"
                    max="10000"
                    className="w-full p-2 border border-white/20 rounded bg-white/5 text-white text-sm focus:outline-none focus:border-mhc-primary"
                  />
                </div>
              </div>
              <p className="text-xs text-white/50 mt-2">
                Scrapes DM threads from Chaturbate messages page. Requires cookies to be imported.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleJobControl('dm-import', 'config', setDMImportStatus, dmImportConfig)}
                  className="px-4 py-2 rounded font-medium bg-mhc-primary text-white hover:bg-mhc-primary/80 text-sm disabled:opacity-50"
                  disabled={loading}
                >
                  Save Config
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all statistics?')) {
                      handleJobControl('dm-import', 'reset-stats', setDMImportStatus);
                    }
                  }}
                  className="px-3 py-2 rounded font-medium bg-gray-600 text-white hover:bg-gray-500 text-sm"
                >
                  Reset Stats
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-5">
      <h1 className="text-2xl font-bold mb-6 bg-gradient-to-r from-mhc-primary to-mhc-primary-dark bg-clip-text text-transparent">
        Jobs Dashboard
      </h1>

      {error && (
        <div className="p-3 px-4 rounded-md mb-5 bg-red-500/15 border-l-4 border-red-500 text-red-300">
          <strong className="font-bold mr-1">Error:</strong> {error}
        </div>
      )}

      {successMessage && (
        <div className="p-3 px-4 rounded-md mb-5 bg-emerald-500/15 border-l-4 border-emerald-500 text-emerald-300">
          {successMessage}
        </div>
      )}

      {/* Job List - Collapsible Sections */}
      <div className="space-y-3">
        {renderAffiliateJob()}
        {renderProfileScrapeJob()}
        {renderCBHoursJob()}
        {renderStatbateJob()}
        {renderLiveScreenshotJob()}
        {renderDMImportJob()}
      </div>
    </div>
  );
};

export default Jobs;
