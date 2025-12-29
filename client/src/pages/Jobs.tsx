import React, { useState, useEffect, useCallback } from 'react';

// ===== Type Definitions =====

type JobTab = 'affiliate' | 'profile-scrape' | 'cbhours' | 'statbate';

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
interface StatbateJobStatus {
  isRunning: boolean;
  isPaused: boolean;
  intervalMinutes: number;
}

// ===== Component =====

const Jobs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<JobTab>('affiliate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Job statuses
  const [affiliateStatus, setAffiliateStatus] = useState<AffiliateJobStatus | null>(null);
  const [profileScrapeStatus, setProfileScrapeStatus] = useState<ProfileScrapeJobStatus | null>(null);
  const [cbhoursStatus, setCbhoursStatus] = useState<CBHoursJobStatus | null>(null);
  const [statbateStatus, setStatbateStatus] = useState<StatbateJobStatus | null>(null);

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
  });
  const [cbhoursConfig, setCbhoursConfig] = useState<CBHoursConfig>({
    intervalMinutes: 30,
    batchSize: 50,
    enabled: true,
    targetFollowing: true,
  });
  const [statbateIntervalMinutes, setStatbateIntervalMinutes] = useState(360);

  // Config panel collapsed states
  const [configCollapsed, setConfigCollapsed] = useState(true);

  // Fetch all job statuses
  const fetchAllStatuses = useCallback(async () => {
    try {
      const [affiliateRes, profileScrapeRes, cbhoursRes, statbateRes] = await Promise.all([
        fetch('/api/job/affiliate/status'),
        fetch('/api/job/profile-scrape/status'),
        fetch('/api/job/cbhours/status'),
        fetch('/api/job/status'),
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
        setStatbateStatus(data.statbateRefresh);
        if (data.statbateRefresh?.intervalMinutes) {
          setStatbateIntervalMinutes(data.statbateRefresh.intervalMinutes);
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
      const response = await fetch(`/api/job/${jobPath}/${action}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(`Failed to ${action} job`);
      const data = await response.json();
      if (data.status) setStatus(data.status);
      setError(null);
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
        <span className="px-3 py-1 rounded-full text-sm font-semibold uppercase bg-blue-500 text-white animate-pulse">
          Processing
        </span>
      );
    }
    if (isRunning && !isPaused) {
      return (
        <span className="px-3 py-1 rounded-full text-sm font-semibold uppercase bg-emerald-500 text-white">
          Running
        </span>
      );
    }
    if (isPaused) {
      return (
        <span className="px-3 py-1 rounded-full text-sm font-semibold uppercase bg-amber-500 text-white">
          Paused
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-sm font-semibold uppercase bg-gray-500 text-white">
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
    <div className="text-center p-4 bg-gradient-to-br from-mhc-primary to-mhc-primary-dark rounded-lg text-white">
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs opacity-90 uppercase tracking-wide">{label}</div>
    </div>
  );

  // Info row component
  const InfoRow: React.FC<{ label: string; value: string | number | React.ReactNode }> = ({
    label,
    value,
  }) => (
    <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
      <span className="font-semibold text-white/70">{label}:</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );

  // Control buttons component
  const ControlButtons: React.FC<{
    isRunning: boolean;
    isPaused: boolean;
    enabled: boolean;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onResetStats?: () => void;
  }> = ({ isRunning, isPaused, enabled, onStart, onPause, onResume, onStop, onResetStats }) => (
    <div className="flex gap-3 flex-wrap">
      {!isRunning && (
        <button
          onClick={onStart}
          className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading || !enabled}
        >
          Start Job
        </button>
      )}
      {isRunning && !isPaused && (
        <button
          onClick={onPause}
          className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          Pause Job
        </button>
      )}
      {isRunning && isPaused && (
        <button
          onClick={onResume}
          className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          Resume Job
        </button>
      )}
      {isRunning && (
        <button
          onClick={onStop}
          className="px-5 py-2.5 rounded-md text-base font-semibold cursor-pointer transition-all bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          Stop Job
        </button>
      )}
      {onResetStats && (
        <button
          onClick={onResetStats}
          className="px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer transition-all bg-gray-500 text-white hover:bg-gray-600 ml-auto"
        >
          Reset Stats
        </button>
      )}
    </div>
  );

  // ===== Tab Content Renderers =====

  const renderAffiliateTab = () => {
    if (!affiliateStatus) return <p className="text-white/60">Loading...</p>;

    return (
      <div className="space-y-5">
        {/* Status Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">Current Status</h2>
            <StatusBadge
              isRunning={affiliateStatus.isRunning}
              isPaused={affiliateStatus.isPaused}
              isProcessing={affiliateStatus.isProcessing}
            />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoRow label="Interval" value={`${affiliateStatus.config.intervalMinutes} min`} />
              <InfoRow label="Gender" value={affiliateStatus.config.gender.toUpperCase()} />
              <InfoRow
                label="Limit"
                value={affiliateStatus.config.limit === 0 ? 'ALL' : affiliateStatus.config.limit}
              />
              <InfoRow label="Enabled" value={affiliateStatus.config.enabled ? 'Yes' : 'No'} />
            </div>

            {affiliateStatus.isProcessing && affiliateStatus.stats.total > 0 && (
              <div className="mt-4">
                <ProgressBar
                  progress={affiliateStatus.stats.progress}
                  total={affiliateStatus.stats.total}
                  label={affiliateStatus.stats.currentUsername || 'Processing...'}
                />
              </div>
            )}
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Job Controls</h2>
          </div>
          <div className="p-5">
            <ControlButtons
              isRunning={affiliateStatus.isRunning}
              isPaused={affiliateStatus.isPaused}
              enabled={affiliateStatus.config.enabled}
              onStart={() =>
                handleJobControl('affiliate', 'start', setAffiliateStatus)
              }
              onPause={() =>
                handleJobControl('affiliate', 'pause', setAffiliateStatus)
              }
              onResume={() =>
                handleJobControl('affiliate', 'resume', setAffiliateStatus)
              }
              onStop={() =>
                handleJobControl('affiliate', 'stop', setAffiliateStatus)
              }
              onResetStats={() => {
                if (window.confirm('Reset all statistics?')) {
                  handleJobControl('affiliate', 'reset-stats', setAffiliateStatus);
                }
              }}
            />
            {!affiliateStatus.config.enabled && (
              <div className="mt-4 p-3 rounded-md bg-amber-500/15 border-l-4 border-amber-500 text-amber-300">
                Job is disabled. Enable it in configuration to start.
              </div>
            )}
          </div>
        </div>

        {/* Configuration Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div
            className="p-5 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5"
            onClick={() => setConfigCollapsed(!configCollapsed)}
          >
            <h2 className="text-xl font-semibold text-white">
              Configuration {configCollapsed ? '▼' : '▲'}
            </h2>
          </div>
          {!configCollapsed && (
            <div className="p-5 space-y-4 max-w-xl">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={affiliateConfig.enabled}
                  onChange={(e) =>
                    setAffiliateConfig({ ...affiliateConfig, enabled: e.target.checked })
                  }
                  className="mr-2 w-5 h-5 accent-mhc-primary"
                />
                <span className="font-semibold text-white/90">Enable Job</span>
              </label>

              <div>
                <label className="block mb-2 font-semibold text-white/90">
                  Polling Interval (minutes)
                </label>
                <input
                  type="number"
                  value={affiliateConfig.intervalMinutes}
                  onChange={(e) =>
                    setAffiliateConfig({
                      ...affiliateConfig,
                      intervalMinutes: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="1440"
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-white/90">Gender Filter</label>
                <select
                  value={affiliateConfig.gender}
                  onChange={(e) =>
                    setAffiliateConfig({ ...affiliateConfig, gender: e.target.value })
                  }
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                >
                  <option value="m">Male</option>
                  <option value="f">Female</option>
                  <option value="t">Trans</option>
                  <option value="c">Couple</option>
                  <option value="m,f">Male + Female</option>
                  <option value="m,f,t">Male + Female + Trans</option>
                  <option value="m,f,t,c">All Genders</option>
                </select>
              </div>

              <div>
                <label className="block mb-2 font-semibold text-white/90">
                  Broadcasters Per Cycle (0 = ALL)
                </label>
                <input
                  type="number"
                  value={affiliateConfig.limit}
                  onChange={(e) =>
                    setAffiliateConfig({ ...affiliateConfig, limit: parseInt(e.target.value) })
                  }
                  min="0"
                  max="10000"
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <button
                onClick={() =>
                  handleJobControl('affiliate', 'config', setAffiliateStatus, affiliateConfig)
                }
                className="px-5 py-2.5 rounded-md font-semibold bg-mhc-primary text-white hover:bg-mhc-primary/80 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Configuration'}
              </button>
            </div>
          )}
        </div>

        {/* Statistics Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Statistics</h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard value={affiliateStatus.stats.totalRuns} label="Total Cycles" />
              <StatCard value={affiliateStatus.stats.totalEnriched} label="Total Enriched" />
              <StatCard value={affiliateStatus.stats.totalFailed} label="Total Failed" />
              <StatCard value={formatDate(affiliateStatus.stats.lastRun)} label="Last Run" />
            </div>

            {affiliateStatus.stats.lastRun && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <h3 className="text-lg font-semibold mb-4 text-white">Last Cycle Results:</h3>
                <div className="grid grid-cols-3 gap-4">
                  <InfoRow label="Enriched" value={affiliateStatus.stats.lastRunEnriched} />
                  <InfoRow label="Failed" value={affiliateStatus.stats.lastRunFailed} />
                  <InfoRow
                    label="Success Rate"
                    value={`${
                      affiliateStatus.stats.lastRunEnriched + affiliateStatus.stats.lastRunFailed > 0
                        ? Math.round(
                            (affiliateStatus.stats.lastRunEnriched /
                              (affiliateStatus.stats.lastRunEnriched +
                                affiliateStatus.stats.lastRunFailed)) *
                              100
                          )
                        : 0
                    }%`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderProfileScrapeTab = () => {
    if (!profileScrapeStatus) return <p className="text-white/60">Loading...</p>;

    return (
      <div className="space-y-5">
        {/* Status Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">Current Status</h2>
            <StatusBadge
              isRunning={profileScrapeStatus.isRunning}
              isPaused={profileScrapeStatus.isPaused}
              isProcessing={profileScrapeStatus.isProcessing}
            />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoRow label="Interval" value={`${profileScrapeStatus.config.intervalMinutes} min`} />
              <InfoRow
                label="Max Per Run"
                value={profileScrapeStatus.config.maxProfilesPerRun}
              />
              <InfoRow label="Refresh Days" value={profileScrapeStatus.config.refreshDays} />
              <InfoRow
                label="Prioritize Following"
                value={profileScrapeStatus.config.prioritizeFollowing ? 'Yes' : 'No'}
              />
            </div>

            {profileScrapeStatus.isProcessing && profileScrapeStatus.stats.total > 0 && (
              <div className="mt-4">
                <ProgressBar
                  progress={profileScrapeStatus.stats.progress}
                  total={profileScrapeStatus.stats.total}
                  label={profileScrapeStatus.stats.currentUsername || 'Processing...'}
                />
              </div>
            )}
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Job Controls</h2>
          </div>
          <div className="p-5">
            <ControlButtons
              isRunning={profileScrapeStatus.isRunning}
              isPaused={profileScrapeStatus.isPaused}
              enabled={profileScrapeStatus.config.enabled}
              onStart={() =>
                handleJobControl('profile-scrape', 'start', setProfileScrapeStatus)
              }
              onPause={() =>
                handleJobControl('profile-scrape', 'pause', setProfileScrapeStatus)
              }
              onResume={() =>
                handleJobControl('profile-scrape', 'resume', setProfileScrapeStatus)
              }
              onStop={() =>
                handleJobControl('profile-scrape', 'stop', setProfileScrapeStatus)
              }
              onResetStats={() => {
                if (window.confirm('Reset all statistics?')) {
                  handleJobControl('profile-scrape', 'reset-stats', setProfileScrapeStatus);
                }
              }}
            />
          </div>
        </div>

        {/* Configuration Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div
            className="p-5 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5"
            onClick={() => setConfigCollapsed(!configCollapsed)}
          >
            <h2 className="text-xl font-semibold text-white">
              Configuration {configCollapsed ? '▼' : '▲'}
            </h2>
          </div>
          {!configCollapsed && (
            <div className="p-5 space-y-4 max-w-xl">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={profileScrapeConfig.enabled}
                  onChange={(e) =>
                    setProfileScrapeConfig({ ...profileScrapeConfig, enabled: e.target.checked })
                  }
                  className="mr-2 w-5 h-5 accent-mhc-primary"
                />
                <span className="font-semibold text-white/90">Enable Job</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={profileScrapeConfig.prioritizeFollowing}
                  onChange={(e) =>
                    setProfileScrapeConfig({
                      ...profileScrapeConfig,
                      prioritizeFollowing: e.target.checked,
                    })
                  }
                  className="mr-2 w-5 h-5 accent-mhc-primary"
                />
                <span className="font-semibold text-white/90">Prioritize Following</span>
              </label>

              <div>
                <label className="block mb-2 font-semibold text-white/90">
                  Interval (minutes)
                </label>
                <input
                  type="number"
                  value={profileScrapeConfig.intervalMinutes}
                  onChange={(e) =>
                    setProfileScrapeConfig({
                      ...profileScrapeConfig,
                      intervalMinutes: parseInt(e.target.value),
                    })
                  }
                  min="5"
                  max="1440"
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-white/90">
                  Max Profiles Per Run
                </label>
                <input
                  type="number"
                  value={profileScrapeConfig.maxProfilesPerRun}
                  onChange={(e) =>
                    setProfileScrapeConfig({
                      ...profileScrapeConfig,
                      maxProfilesPerRun: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="500"
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-white/90">
                  Refresh Days (re-scrape after)
                </label>
                <input
                  type="number"
                  value={profileScrapeConfig.refreshDays}
                  onChange={(e) =>
                    setProfileScrapeConfig({
                      ...profileScrapeConfig,
                      refreshDays: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="90"
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <button
                onClick={() =>
                  handleJobControl(
                    'profile-scrape',
                    'config',
                    setProfileScrapeStatus,
                    profileScrapeConfig
                  )
                }
                className="px-5 py-2.5 rounded-md font-semibold bg-mhc-primary text-white hover:bg-mhc-primary/80 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Configuration'}
              </button>
            </div>
          )}
        </div>

        {/* Statistics Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Statistics</h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard value={profileScrapeStatus.stats.totalRuns} label="Total Cycles" />
              <StatCard value={profileScrapeStatus.stats.totalScraped} label="Total Scraped" />
              <StatCard value={profileScrapeStatus.stats.totalFailed} label="Total Failed" />
              <StatCard value={profileScrapeStatus.stats.totalSkipped} label="Total Skipped" />
            </div>

            <div className="mt-4">
              <InfoRow label="Last Run" value={formatDate(profileScrapeStatus.stats.lastRun)} />
            </div>

            {profileScrapeStatus.stats.lastRun && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <h3 className="text-lg font-semibold mb-4 text-white">Last Cycle Results:</h3>
                <div className="grid grid-cols-3 gap-4">
                  <InfoRow label="Scraped" value={profileScrapeStatus.stats.lastRunScraped} />
                  <InfoRow label="Failed" value={profileScrapeStatus.stats.lastRunFailed} />
                  <InfoRow label="Skipped" value={profileScrapeStatus.stats.lastRunSkipped} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCBHoursTab = () => {
    if (!cbhoursStatus) return <p className="text-white/60">Loading...</p>;

    return (
      <div className="space-y-5">
        {/* Status Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">Current Status</h2>
            <StatusBadge
              isRunning={cbhoursStatus.isRunning}
              isPaused={cbhoursStatus.isPaused}
              isProcessing={cbhoursStatus.isProcessing}
            />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoRow label="Interval" value={`${cbhoursStatus.config.intervalMinutes} min`} />
              <InfoRow label="Batch Size" value={cbhoursStatus.config.batchSize} />
              <InfoRow
                label="Target Following"
                value={cbhoursStatus.config.targetFollowing ? 'Yes' : 'No'}
              />
              <InfoRow label="Enabled" value={cbhoursStatus.config.enabled ? 'Yes' : 'No'} />
            </div>

            {cbhoursStatus.isProcessing && cbhoursStatus.stats.totalBatches > 0 && (
              <div className="mt-4">
                <ProgressBar
                  progress={cbhoursStatus.stats.progress}
                  total={cbhoursStatus.stats.total}
                  label={`Batch ${cbhoursStatus.stats.currentBatch}/${cbhoursStatus.stats.totalBatches}`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Job Controls</h2>
          </div>
          <div className="p-5">
            <ControlButtons
              isRunning={cbhoursStatus.isRunning}
              isPaused={cbhoursStatus.isPaused}
              enabled={cbhoursStatus.config.enabled}
              onStart={() => handleJobControl('cbhours', 'start', setCbhoursStatus)}
              onPause={() => handleJobControl('cbhours', 'pause', setCbhoursStatus)}
              onResume={() => handleJobControl('cbhours', 'resume', setCbhoursStatus)}
              onStop={() => handleJobControl('cbhours', 'stop', setCbhoursStatus)}
              onResetStats={() => {
                if (window.confirm('Reset all statistics?')) {
                  handleJobControl('cbhours', 'reset-stats', setCbhoursStatus);
                }
              }}
            />
          </div>
        </div>

        {/* Configuration Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div
            className="p-5 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5"
            onClick={() => setConfigCollapsed(!configCollapsed)}
          >
            <h2 className="text-xl font-semibold text-white">
              Configuration {configCollapsed ? '▼' : '▲'}
            </h2>
          </div>
          {!configCollapsed && (
            <div className="p-5 space-y-4 max-w-xl">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={cbhoursConfig.enabled}
                  onChange={(e) =>
                    setCbhoursConfig({ ...cbhoursConfig, enabled: e.target.checked })
                  }
                  className="mr-2 w-5 h-5 accent-mhc-primary"
                />
                <span className="font-semibold text-white/90">Enable Job</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={cbhoursConfig.targetFollowing}
                  onChange={(e) =>
                    setCbhoursConfig({ ...cbhoursConfig, targetFollowing: e.target.checked })
                  }
                  className="mr-2 w-5 h-5 accent-mhc-primary"
                />
                <span className="font-semibold text-white/90">Target Following Only</span>
              </label>

              <div>
                <label className="block mb-2 font-semibold text-white/90">
                  Interval (minutes)
                </label>
                <input
                  type="number"
                  value={cbhoursConfig.intervalMinutes}
                  onChange={(e) =>
                    setCbhoursConfig({
                      ...cbhoursConfig,
                      intervalMinutes: parseInt(e.target.value),
                    })
                  }
                  min="5"
                  max="1440"
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-white/90">
                  Batch Size (max 50)
                </label>
                <input
                  type="number"
                  value={cbhoursConfig.batchSize}
                  onChange={(e) =>
                    setCbhoursConfig({
                      ...cbhoursConfig,
                      batchSize: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="50"
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <button
                onClick={() =>
                  handleJobControl('cbhours', 'config', setCbhoursStatus, cbhoursConfig)
                }
                className="px-5 py-2.5 rounded-md font-semibold bg-mhc-primary text-white hover:bg-mhc-primary/80 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Configuration'}
              </button>
            </div>
          )}
        </div>

        {/* Statistics Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Statistics</h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard value={cbhoursStatus.stats.totalRuns} label="Total Cycles" />
              <StatCard value={cbhoursStatus.stats.totalRecorded} label="Total Recorded" />
              <StatCard value={cbhoursStatus.stats.totalOnline} label="Total Online" />
              <StatCard value={cbhoursStatus.stats.totalFailed} label="Total Failed" />
            </div>

            <div className="mt-4">
              <InfoRow label="Last Run" value={formatDate(cbhoursStatus.stats.lastRun)} />
            </div>

            {cbhoursStatus.stats.lastRun && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <h3 className="text-lg font-semibold mb-4 text-white">Last Cycle Results:</h3>
                <div className="grid grid-cols-3 gap-4">
                  <InfoRow label="Recorded" value={cbhoursStatus.stats.lastRunRecorded} />
                  <InfoRow label="Online" value={cbhoursStatus.stats.lastRunOnline} />
                  <InfoRow label="Failed" value={cbhoursStatus.stats.lastRunFailed} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderStatbateTab = () => {
    if (!statbateStatus) return <p className="text-white/60">Loading...</p>;

    return (
      <div className="space-y-5">
        {/* Status Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">Current Status</h2>
            <StatusBadge isRunning={statbateStatus.isRunning} isPaused={statbateStatus.isPaused} />
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Interval" value={`${statbateStatus.intervalMinutes} min`} />
              <InfoRow
                label="State"
                value={
                  statbateStatus.isRunning
                    ? statbateStatus.isPaused
                      ? 'Paused'
                      : 'Running'
                    : 'Stopped'
                }
              />
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Job Controls</h2>
          </div>
          <div className="p-5">
            <div className="flex gap-3 flex-wrap">
              {!statbateStatus.isRunning && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const response = await fetch('/api/job/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ intervalMinutes: statbateIntervalMinutes }),
                      });
                      if (!response.ok) throw new Error('Failed to start job');
                      await fetchAllStatuses();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unknown error');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-md text-base font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                  disabled={loading}
                >
                  Start Job
                </button>
              )}
              {statbateStatus.isRunning && !statbateStatus.isPaused && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await fetch('/api/job/pause', { method: 'POST' });
                      await fetchAllStatuses();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unknown error');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-md text-base font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  disabled={loading}
                >
                  Pause Job
                </button>
              )}
              {statbateStatus.isRunning && statbateStatus.isPaused && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await fetch('/api/job/resume', { method: 'POST' });
                      await fetchAllStatuses();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unknown error');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-md text-base font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                  disabled={loading}
                >
                  Resume Job
                </button>
              )}
              {statbateStatus.isRunning && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await fetch('/api/job/stop', { method: 'POST' });
                      await fetchAllStatuses();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unknown error');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-md text-base font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                  disabled={loading}
                >
                  Stop Job
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Configuration Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div
            className="p-5 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5"
            onClick={() => setConfigCollapsed(!configCollapsed)}
          >
            <h2 className="text-xl font-semibold text-white">
              Configuration {configCollapsed ? '▼' : '▲'}
            </h2>
          </div>
          {!configCollapsed && (
            <div className="p-5 space-y-4 max-w-xl">
              <div>
                <label className="block mb-2 font-semibold text-white/90">
                  Refresh Interval (minutes)
                </label>
                <input
                  type="number"
                  value={statbateIntervalMinutes}
                  onChange={(e) => setStatbateIntervalMinutes(parseInt(e.target.value))}
                  min="60"
                  max="1440"
                  className="w-full p-2.5 border border-white/20 rounded-md bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
                <small className="block mt-1 text-white/60">
                  Statbate refresh runs every few hours to avoid API rate limits
                </small>
              </div>

              <p className="text-white/60 text-sm">
                Note: Interval changes take effect on next job start
              </p>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="bg-mhc-surface-light/60 border border-white/10 rounded-lg shadow-md">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">About This Job</h2>
          </div>
          <div className="p-5 text-white/80">
            <p>
              The Statbate Refresh job periodically fetches model and member information from the
              Statbate Premium API. It processes persons in batches with rate limiting to avoid
              overwhelming the API.
            </p>
            <ul className="list-disc list-inside mt-3 space-y-1">
              <li>Processes 5 persons per batch</li>
              <li>30 second delay between batches</li>
              <li>2 second delay between individual requests</li>
              <li>Fetches model info (rank, sessions, income) and member info (tips, activity)</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  // Get quick status indicator for tab
  const getTabIndicator = (isRunning?: boolean, isPaused?: boolean, isProcessing?: boolean) => {
    if (isProcessing) return '🔄';
    if (isRunning && !isPaused) return '🟢';
    if (isPaused) return '🟡';
    return '⚪';
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

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-white/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab('affiliate')}
          className={`px-4 py-3 font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'affiliate'
              ? 'text-mhc-primary border-b-2 border-mhc-primary'
              : 'text-white/60 hover:text-white/90'
          }`}
        >
          {getTabIndicator(affiliateStatus?.isRunning, affiliateStatus?.isPaused, affiliateStatus?.isProcessing)}{' '}
          Affiliate API
        </button>
        <button
          onClick={() => setActiveTab('profile-scrape')}
          className={`px-4 py-3 font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'profile-scrape'
              ? 'text-mhc-primary border-b-2 border-mhc-primary'
              : 'text-white/60 hover:text-white/90'
          }`}
        >
          {getTabIndicator(profileScrapeStatus?.isRunning, profileScrapeStatus?.isPaused, profileScrapeStatus?.isProcessing)}{' '}
          Profile Scraper
        </button>
        <button
          onClick={() => setActiveTab('cbhours')}
          className={`px-4 py-3 font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'cbhours'
              ? 'text-mhc-primary border-b-2 border-mhc-primary'
              : 'text-white/60 hover:text-white/90'
          }`}
        >
          {getTabIndicator(cbhoursStatus?.isRunning, cbhoursStatus?.isPaused, cbhoursStatus?.isProcessing)}{' '}
          CBHours
        </button>
        <button
          onClick={() => setActiveTab('statbate')}
          className={`px-4 py-3 font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'statbate'
              ? 'text-mhc-primary border-b-2 border-mhc-primary'
              : 'text-white/60 hover:text-white/90'
          }`}
        >
          {getTabIndicator(statbateStatus?.isRunning, statbateStatus?.isPaused)} Statbate
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'affiliate' && renderAffiliateTab()}
      {activeTab === 'profile-scrape' && renderProfileScrapeTab()}
      {activeTab === 'cbhours' && renderCBHoursTab()}
      {activeTab === 'statbate' && renderStatbateTab()}
    </div>
  );
};

export default Jobs;
