import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CollapsibleSection from '../components/CollapsibleSection';
import { useTheme, ThemeName } from '../context/ThemeContext';
import { api } from '../api/client';

const themeLabels: Record<ThemeName, string> = {
  midnight: 'Midnight',
  charcoal: 'Charcoal',
  ocean: 'Ocean',
  forest: 'Forest',
  ember: 'Ember',
};
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

interface JobStatus {
  isRunning: boolean;
  isPaused: boolean;
  config: JobConfig;
  stats: JobStats;
}

interface SystemStats {
  database: {
    sizeBytes: number;
    totalPersons: number;
    byRole: Record<string, number>;
    bySource: Record<string, number>;
    imagesStored: number;
    imageSizeBytes: number;
    videosStored: number;
    videoSizeBytes: number;
    usersWithVideos: number;
  };
  queue: {
    priority1Pending: number;
    priority2Active: number;
    failedLast24h: number;
  };
  following: {
    followingCount: number;
    followerCount: number;
    subsCount: number;
    bannedCount: number;
    friendsCount: number;
    watchlistCount: number;
    activeDomsCount: number;
  };
  activity: {
    snapshotsLast24h: number;
    snapshotsLastHour: number;
  };
  realtime: {
    feedCacheSize: number;
    feedCacheUpdatedAt: string | null;
    cbhoursOnline: number;
    cbhoursTracked: number;
  };
  jobs: {
    affiliate: {
      isRunning: boolean;
      isPaused: boolean;
      lastRun: string | null;
      totalRuns: number;
      totalEnriched: number;
    };
    profileScrape: {
      isRunning: boolean;
      isPaused: boolean;
      lastRun: string | null;
      totalRuns: number;
      totalScraped: number;
    };
    cbhours: {
      isRunning: boolean;
      isPaused: boolean;
      lastRun: string | null;
      totalRuns: number;
      totalRecorded: number;
    };
    statbate: {
      isRunning: boolean;
      isPaused: boolean;
    };
  };
}

type AdminTab = 'jobs' | 'system-stats' | 'follower-trends' | 'data-sources' | 'scraper' | 'settings';
type JobSubTab = 'affiliate' | 'scraping';

interface FollowerMover {
  username: string;
  person_id: string;
  total_change: number;
  current_count: number;
}

interface FollowerRecentChange {
  id: string;
  username: string;
  person_id: string;
  follower_count: number;
  delta: number;
  recorded_at: string;
  source: string;
}

interface FollowerTrendsDashboard {
  topGainers: FollowerMover[];
  topLosers: FollowerMover[];
  recentChanges: FollowerRecentChange[];
  totalTracked: number;
  totalWithChanges: number;
}

const Admin: React.FC = () => {
  const { theme, setTheme, themes } = useTheme();
  const [activeTab, setActiveTab] = useState<AdminTab>('jobs');
  const [jobSubTab, setJobSubTab] = useState<JobSubTab>('affiliate');
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [followerTrends, setFollowerTrends] = useState<FollowerTrendsDashboard | null>(null);
  const [trendsDays, setTrendsDays] = useState<number>(7);
  const [recentChangesPage, setRecentChangesPage] = useState(0);
  const RECENT_CHANGES_PER_PAGE = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Profile scrape job state
  const [profileScrapeStatus, setProfileScrapeStatus] = useState<ProfileScrapeJobStatus | null>(null);
  const [profileScrapeConfigForm, setProfileScrapeConfigForm] = useState<ProfileScrapeConfig>({
    intervalMinutes: 60,
    maxProfilesPerRun: 50,
    delayBetweenProfiles: 5000,
    refreshDays: 7,
    enabled: false,
    prioritizeFollowing: true,
  });
  const [profileScrapeConfigCollapsed, setProfileScrapeConfigCollapsed] = useState(true);
  const [manualScrapeUsername, setManualScrapeUsername] = useState('');
  const [manualScraping, setManualScraping] = useState(false);
  const [manualScrapeResult, setManualScrapeResult] = useState<string | null>(null);

  // Broadcast settings state
  const [broadcastSettings, setBroadcastSettings] = useState<{
    mergeGapMinutes: number;
    aiSummaryDelayMinutes: number | null;
    aiSummaryDelayIsCustom: boolean;
  } | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Image upload settings state
  const [imageSettings, setImageSettings] = useState<{
    manualMB: number;
    externalMB: number;
    screenshotMB: number;
  } | null>(null);
  const [imageSettingsLoading, setImageSettingsLoading] = useState(false);
  const [imageSettingsSaving, setImageSettingsSaving] = useState(false);
  const [imageSettingsError, setImageSettingsError] = useState<string | null>(null);
  const [imageSettingsSuccess, setImageSettingsSuccess] = useState<string | null>(null);

  // Video upload settings state
  const [videoSettings, setVideoSettings] = useState<{
    maxSizeMB: number;
  } | null>(null);
  const [videoSettingsLoading, setVideoSettingsLoading] = useState(false);
  const [videoSettingsSaving, setVideoSettingsSaving] = useState(false);
  const [videoSettingsError, setVideoSettingsError] = useState<string | null>(null);
  const [videoSettingsSuccess, setVideoSettingsSuccess] = useState<string | null>(null);

  // Auto-refresh both job statuses when on Jobs tab (merged view)
  useEffect(() => {
    if (activeTab === 'jobs') {
      fetchJobStatus();
      fetchProfileScrapeStatus();
      checkCookieStatus();
      const interval = setInterval(() => {
        fetchJobStatus();
        fetchProfileScrapeStatus();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Load system stats when on System Stats tab
  useEffect(() => {
    if (activeTab === 'system-stats') {
      fetchSystemStats();
    }
  }, [activeTab]);

  // Load follower trends when on Follower Trends tab
  useEffect(() => {
    if (activeTab === 'follower-trends') {
      fetchFollowerTrends();
    }
  }, [activeTab, trendsDays]);

  // Check cookie status when on Scraper tab
  useEffect(() => {
    if (activeTab === 'scraper') {
      checkCookieStatus();
    }
  }, [activeTab]);

  // Load broadcast settings, image settings, and video settings when Settings tab is active
  useEffect(() => {
    if (activeTab === 'settings') {
      fetchBroadcastSettings();
      fetchImageSettings();
      fetchVideoSettings();
    }
  }, [activeTab]);

  const fetchBroadcastSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const config = await api.getBroadcastConfig();
      setBroadcastSettings({
        mergeGapMinutes: config.mergeGapMinutes,
        aiSummaryDelayMinutes: config.aiSummaryDelayMinutes,
        aiSummaryDelayIsCustom: config.aiSummaryDelayIsCustom,
      });
    } catch (err) {
      setSettingsError('Failed to load broadcast settings');
      console.error('Error fetching broadcast settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveBroadcastSettings = async () => {
    if (!broadcastSettings) return;

    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    try {
      await api.updateSetting(
        'broadcast_merge_gap_minutes',
        broadcastSettings.mergeGapMinutes,
        'Minutes between broadcast segments to merge into one session'
      );

      if (broadcastSettings.aiSummaryDelayIsCustom && broadcastSettings.aiSummaryDelayMinutes !== null) {
        await api.updateSetting(
          'ai_summary_delay_minutes',
          broadcastSettings.aiSummaryDelayMinutes,
          'Minutes to wait after broadcast ends before generating AI summary'
        );
      } else {
        // Set to null to use merge gap
        await api.updateSetting(
          'ai_summary_delay_minutes',
          null,
          'Minutes to wait after broadcast ends before generating AI summary'
        );
      }

      setSettingsSuccess('Settings saved successfully');
      setTimeout(() => setSettingsSuccess(null), 3000);
    } catch (err) {
      setSettingsError('Failed to save settings');
      console.error('Error saving broadcast settings:', err);
    } finally {
      setSettingsSaving(false);
    }
  };

  const fetchImageSettings = async () => {
    setImageSettingsLoading(true);
    setImageSettingsError(null);
    try {
      const response = await fetch('/api/settings/image-upload/config');
      if (!response.ok) throw new Error('Failed to fetch image settings');
      const config = await response.json();
      setImageSettings({
        manualMB: config.limitsMB.manual,
        externalMB: config.limitsMB.external,
        screenshotMB: config.limitsMB.screenshot,
      });
    } catch (err) {
      setImageSettingsError('Failed to load image upload settings');
      console.error('Error fetching image settings:', err);
    } finally {
      setImageSettingsLoading(false);
    }
  };

  const saveImageSettings = async () => {
    if (!imageSettings) return;

    setImageSettingsSaving(true);
    setImageSettingsError(null);
    setImageSettingsSuccess(null);

    try {
      // Convert MB to bytes
      const manualBytes = imageSettings.manualMB * 1024 * 1024;
      const externalBytes = imageSettings.externalMB * 1024 * 1024;
      const screenshotBytes = imageSettings.screenshotMB * 1024 * 1024;

      await Promise.all([
        api.updateSetting('image_upload_limit_manual', manualBytes, 'Maximum file size in bytes for manual image uploads'),
        api.updateSetting('image_upload_limit_external', externalBytes, 'Maximum file size in bytes for external URL image imports'),
        api.updateSetting('image_upload_limit_screenshot', screenshotBytes, 'Maximum file size in bytes for screenshot captures'),
      ]);

      setImageSettingsSuccess('Image settings saved successfully');
      setTimeout(() => setImageSettingsSuccess(null), 3000);
    } catch (err) {
      setImageSettingsError('Failed to save image settings');
      console.error('Error saving image settings:', err);
    } finally {
      setImageSettingsSaving(false);
    }
  };

  const fetchVideoSettings = async () => {
    setVideoSettingsLoading(true);
    setVideoSettingsError(null);
    try {
      const response = await fetch('/api/settings/video-upload/config');
      if (!response.ok) throw new Error('Failed to fetch video settings');
      const config = await response.json();
      setVideoSettings({
        maxSizeMB: config.maxSizeMB,
      });
    } catch (err) {
      setVideoSettingsError('Failed to load video upload settings');
      console.error('Error fetching video settings:', err);
    } finally {
      setVideoSettingsLoading(false);
    }
  };

  const saveVideoSettings = async () => {
    if (!videoSettings) return;

    setVideoSettingsSaving(true);
    setVideoSettingsError(null);
    setVideoSettingsSuccess(null);

    try {
      const response = await fetch('/api/settings/video-upload/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxSizeMB: videoSettings.maxSizeMB }),
      });

      if (!response.ok) throw new Error('Failed to save video settings');

      setVideoSettingsSuccess('Video settings saved successfully');
      setTimeout(() => setVideoSettingsSuccess(null), 3000);
    } catch (err) {
      setVideoSettingsError('Failed to save video settings');
      console.error('Error saving video settings:', err);
    } finally {
      setVideoSettingsSaving(false);
    }
  };

  // Profile scrape form initialization (legacy - kept for form state)
  useEffect(() => {
    if (activeTab === 'jobs' && jobSubTab === 'scraping') {
      setProfileScrapeFormInitialized(false); // Reset so form syncs fresh
    }
  }, [activeTab, jobSubTab]);

  // Update form when job status changes
  useEffect(() => {
    if (jobStatus) {
      setConfigForm(jobStatus.config);
    }
  }, [jobStatus]);

  // Update profile scrape config form when status changes (only if not currently loading/updating)
  const [profileScrapeFormInitialized, setProfileScrapeFormInitialized] = useState(false);
  useEffect(() => {
    if (profileScrapeStatus && !loading) {
      // Only auto-sync on initial load, not during updates
      if (!profileScrapeFormInitialized) {
        setProfileScrapeConfigForm(profileScrapeStatus.config);
        setProfileScrapeFormInitialized(true);
      }
    }
  }, [profileScrapeStatus, loading, profileScrapeFormInitialized]);

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
      const response = await fetch('/api/system/stats');
      if (!response.ok) {
        throw new Error('Failed to fetch system stats');
      }
      const data = await response.json();
      setSystemStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowerTrends = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/system/follower-trends/dashboard?days=${trendsDays}&limit=10`);
      if (!response.ok) {
        throw new Error('Failed to fetch follower trends');
      }
      const data = await response.json();
      setFollowerTrends(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const checkCookieStatus = async () => {
    try {
      const response = await fetch('/api/followers/cookies-status');
      const data = await response.json();
      setHasCookies(data.hasCookies);
    } catch (err) {
      console.error('Error checking cookie status:', err);
    }
  };

  const fetchProfileScrapeStatus = async () => {
    try {
      const response = await fetch('/api/job/profile-scrape/status');
      if (!response.ok) {
        throw new Error('Failed to fetch profile scrape status');
      }
      const data = await response.json();
      setProfileScrapeStatus(data);
    } catch (err) {
      console.error('Error fetching profile scrape status:', err);
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

      const response = await fetch('/api/followers/import-cookies', {
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
        ? '/api/followers/scrape-following'
        : '/api/followers/scrape-followers';

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

  // Profile Scrape Job handlers
  const handleProfileScrapeConfigChange = (field: keyof ProfileScrapeConfig, value: string | number | boolean) => {
    // For number fields, if the value is NaN (empty input), keep the previous value
    if (typeof value === 'number' && isNaN(value)) {
      return;
    }
    setProfileScrapeConfigForm(prev => ({ ...prev, [field]: value }));
  };

  const handleUpdateProfileScrapeConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/job/profile-scrape/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileScrapeConfigForm),
      });
      if (!response.ok) {
        throw new Error('Failed to update profile scrape configuration');
      }
      const data = await response.json();
      setProfileScrapeStatus(data.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileScrapeJobControl = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    try {
      setLoading(true);
      const response = await fetch(`/api/job/profile-scrape/${action}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Failed to ${action} profile scrape job`);
      }
      const data = await response.json();
      setProfileScrapeStatus(data.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileScrapeResetStats = async () => {
    if (!window.confirm('Are you sure you want to reset profile scrape statistics?')) {
      return;
    }
    try {
      setLoading(true);
      const response = await fetch('/api/job/profile-scrape/reset-stats', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to reset profile scrape statistics');
      }
      const data = await response.json();
      setProfileScrapeStatus(data.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleManualProfileScrape = async () => {
    if (!manualScrapeUsername.trim()) {
      setManualScrapeResult('Please enter a username');
      setTimeout(() => setManualScrapeResult(null), 3000);
      return;
    }

    try {
      setManualScraping(true);
      setManualScrapeResult(`Scraping ${manualScrapeUsername}...`);

      const response = await fetch(`/api/job/profile-scrape/one/${manualScrapeUsername.trim()}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setManualScrapeResult(`Successfully scraped ${manualScrapeUsername}`);
        setManualScrapeUsername('');
      } else {
        setManualScrapeResult(data.message || 'Failed to scrape profile');
      }
      setTimeout(() => setManualScrapeResult(null), 5000);
    } catch (err) {
      setManualScrapeResult('Error scraping profile');
      setTimeout(() => setManualScrapeResult(null), 5000);
    } finally {
      setManualScraping(false);
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

  const getProfileScrapeStatusBadge = () => {
    if (!profileScrapeStatus) return null;
    const baseBadge = "px-3 py-1 rounded-full text-sm font-semibold uppercase";
    if (profileScrapeStatus.isProcessing) {
      return <span className={`${baseBadge} bg-blue-500 text-white`}>Processing</span>;
    } else if (profileScrapeStatus.isRunning && !profileScrapeStatus.isPaused) {
      return <span className={`${baseBadge} bg-mhc-success text-white`}>Running</span>;
    } else if (profileScrapeStatus.isPaused) {
      return <span className={`${baseBadge} bg-mhc-warning text-white`}>Paused</span>;
    } else {
      return <span className={`${baseBadge} bg-gray-500 text-white`}>Stopped</span>;
    }
  };

  // Render Affiliate API job content for sub-tab
  const renderAffiliateJobContent = () => (
    <>
      {jobStatus && (
        <>
          {/* Statistics Section */}
          <CollapsibleSection
            title={
              <div className="flex items-center justify-between w-full">
                <span>Statistics</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetStats();
                  }}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-gray-500 text-white hover:bg-gray-600"
                >
                  Reset Stats
                </button>
              </div>
            }
            defaultCollapsed={false}
            className="mb-5"
          >
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
          </CollapsibleSection>

          {/* Current Status Section */}
          <CollapsibleSection
            title={
              <div className="flex items-center gap-3">
                <span>Current Status</span>
                {getStatusBadge()}
              </div>
            }
            defaultCollapsed={true}
            className="mb-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          </CollapsibleSection>

          {/* Configuration Section */}
          <CollapsibleSection
            title="Configuration"
            defaultCollapsed={true}
            className="mb-5"
          >
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
          </CollapsibleSection>
        </>
      )}
    </>
  );

  // Render Profile Scraping job content for sub-tab
  const renderScrapingJobContent = () => (
    <>
      {/* Cookie Status */}
      {!hasCookies && (
        <div className="p-3 px-4 rounded-md mb-5 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300">
          <strong className="font-bold mr-1">Note:</strong> No cookies imported. Profile scraping requires authenticated Chaturbate cookies.
          Go to the <button className="underline font-semibold" onClick={() => setActiveTab('scraper')}>Scraper tab</button> to import cookies.
        </div>
      )}

      {profileScrapeStatus && (
        <>
          {/* Statistics Section */}
          <CollapsibleSection
            title="Statistics"
            defaultCollapsed={false}
            className="mb-5"
          >
            <div className="flex justify-end mb-4">
              <button
                onClick={handleProfileScrapeResetStats}
                className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-gray-500 text-white hover:bg-gray-600"
              >
                Reset Stats
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-5">
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{profileScrapeStatus.stats.totalRuns}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Total Cycles</div>
              </div>
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{profileScrapeStatus.stats.totalScraped}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Total Scraped</div>
              </div>
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{profileScrapeStatus.stats.totalFailed}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Total Failed</div>
              </div>
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{profileScrapeStatus.stats.totalSkipped}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Total Skipped</div>
              </div>
            </div>

            <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10 mb-5">
              <span className="font-semibold text-white/70">Last Run:</span>
              <span className="text-white font-medium">{formatDate(profileScrapeStatus.stats.lastRun)}</span>
            </div>

            {profileScrapeStatus.stats.lastRun && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <h3 className="text-lg mb-4 text-white">Last Cycle Results:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                    <span className="font-semibold text-white/70">Scraped:</span>
                    <span className="text-white font-medium">{profileScrapeStatus.stats.lastRunScraped}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                    <span className="font-semibold text-white/70">Failed:</span>
                    <span className="text-white font-medium">{profileScrapeStatus.stats.lastRunFailed}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                    <span className="font-semibold text-white/70">Skipped:</span>
                    <span className="text-white font-medium">{profileScrapeStatus.stats.lastRunSkipped}</span>
                  </div>
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Job Status Section */}
          <CollapsibleSection
            title={
              <span className="flex items-center gap-3">
                Job Status
                {getProfileScrapeStatusBadge()}
              </span>
            }
            defaultCollapsed={true}
            className="mb-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                <span className="font-semibold text-white/70">State:</span>
                <span className="text-white font-medium">
                  {profileScrapeStatus.isProcessing
                    ? 'Processing'
                    : profileScrapeStatus.isRunning
                      ? (profileScrapeStatus.isPaused ? 'Paused' : 'Running')
                      : 'Stopped'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                <span className="font-semibold text-white/70">Enabled:</span>
                <span className="text-white font-medium">{profileScrapeStatus.config.enabled ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                <span className="font-semibold text-white/70">Interval:</span>
                <span className="text-white font-medium">{profileScrapeStatus.config.intervalMinutes} min</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                <span className="font-semibold text-white/70">Max Profiles/Run:</span>
                <span className="text-white font-medium">{profileScrapeStatus.config.maxProfilesPerRun}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                <span className="font-semibold text-white/70">Delay Between:</span>
                <span className="text-white font-medium">{profileScrapeStatus.config.delayBetweenProfiles / 1000}s</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                <span className="font-semibold text-white/70">Refresh After:</span>
                <span className="text-white font-medium">{profileScrapeStatus.config.refreshDays} days</span>
              </div>
            </div>

            {/* Progress during processing */}
            {profileScrapeStatus.isProcessing && profileScrapeStatus.stats.currentUsername && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-blue-300 font-medium">Currently scraping: {profileScrapeStatus.stats.currentUsername}</span>
                  <span className="text-blue-300">{profileScrapeStatus.stats.progress} / {profileScrapeStatus.stats.total}</span>
                </div>
                <div className="w-full bg-blue-500/20 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${profileScrapeStatus.stats.total > 0 ? (profileScrapeStatus.stats.progress / profileScrapeStatus.stats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Manual Scrape Section */}
          <CollapsibleSection
            title="Manual Profile Scrape"
            defaultCollapsed={true}
            className="mb-5"
          >
            <p className="text-white/60 text-base p-4 bg-white/5 rounded-lg mb-4">
              Manually trigger a profile scrape for a specific username. This bypasses the scheduled job and runs immediately.
            </p>
            <div className="flex gap-3 items-center max-w-xl">
              <input
                type="text"
                value={manualScrapeUsername}
                onChange={(e) => setManualScrapeUsername(e.target.value)}
                placeholder="Enter username..."
                className="flex-1 p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                onKeyDown={(e) => e.key === 'Enter' && handleManualProfileScrape()}
              />
              <button
                onClick={handleManualProfileScrape}
                className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-primary text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                disabled={manualScraping || !hasCookies}
              >
                {manualScraping ? 'Scraping...' : 'Scrape Profile'}
              </button>
            </div>
            {manualScrapeResult && (
              <div className="p-3 px-4 rounded-md mt-4 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300">
                {manualScrapeResult}
              </div>
            )}
          </CollapsibleSection>

          {/* Configuration Section */}
          <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
            <div
              className="p-5 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setProfileScrapeConfigCollapsed(!profileScrapeConfigCollapsed)}
            >
              <h2 className="m-0 text-2xl text-white">Configuration {profileScrapeConfigCollapsed ? '▼' : '▲'}</h2>
            </div>
            {!profileScrapeConfigCollapsed && (
            <div className="p-5">
              <div className="max-w-xl">
                <div className="mb-5">
                  <label htmlFor="ps-enabled" className="flex items-center mb-2 font-semibold text-white/90 cursor-pointer">
                    <input
                      type="checkbox"
                      id="ps-enabled"
                      checked={profileScrapeConfigForm.enabled}
                      onChange={(e) => handleProfileScrapeConfigChange('enabled', e.target.checked)}
                      className="mr-2 w-4 h-4 cursor-pointer accent-mhc-primary"
                    />
                    <span className="font-semibold text-white/90">Enable Job</span>
                  </label>
                  <small className="block mt-1 text-white/60 text-sm">Must be enabled for scheduled job to start</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="ps-prioritize" className="flex items-center mb-2 font-semibold text-white/90 cursor-pointer">
                    <input
                      type="checkbox"
                      id="ps-prioritize"
                      checked={profileScrapeConfigForm.prioritizeFollowing}
                      onChange={(e) => handleProfileScrapeConfigChange('prioritizeFollowing', e.target.checked)}
                      className="mr-2 w-4 h-4 cursor-pointer accent-mhc-primary"
                    />
                    <span className="font-semibold text-white/90">Prioritize Following</span>
                  </label>
                  <small className="block mt-1 text-white/60 text-sm">Scrape profiles you follow first before other models</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="ps-interval" className="block mb-2 font-semibold text-white/90">Run Interval (minutes)</label>
                  <input
                    type="number"
                    id="ps-interval"
                    value={profileScrapeConfigForm.intervalMinutes}
                    onChange={(e) => handleProfileScrapeConfigChange('intervalMinutes', parseInt(e.target.value))}
                    min="15"
                    max="1440"
                    step="15"
                    className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <small className="block mt-1 text-white/60 text-sm">How often to run scrape cycles (15-1440 minutes)</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="ps-max" className="block mb-2 font-semibold text-white/90">Max Profiles Per Run</label>
                  <input
                    type="number"
                    id="ps-max"
                    value={profileScrapeConfigForm.maxProfilesPerRun}
                    onChange={(e) => handleProfileScrapeConfigChange('maxProfilesPerRun', parseInt(e.target.value))}
                    min="5"
                    max="200"
                    step="5"
                    className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <small className="block mt-1 text-white/60 text-sm">Limit profiles per cycle to avoid long-running jobs (5-200)</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="ps-delay" className="block mb-2 font-semibold text-white/90">Delay Between Profiles (ms)</label>
                  <input
                    type="number"
                    id="ps-delay"
                    value={profileScrapeConfigForm.delayBetweenProfiles}
                    onChange={(e) => handleProfileScrapeConfigChange('delayBetweenProfiles', parseInt(e.target.value))}
                    min="2000"
                    max="30000"
                    step="1000"
                    className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <small className="block mt-1 text-white/60 text-sm">Wait time between profiles to avoid rate limiting (2000-30000ms)</small>
                </div>

                <div className="mb-5">
                  <label htmlFor="ps-refresh" className="block mb-2 font-semibold text-white/90">Refresh Older Than (days)</label>
                  <input
                    type="number"
                    id="ps-refresh"
                    value={profileScrapeConfigForm.refreshDays}
                    onChange={(e) => handleProfileScrapeConfigChange('refreshDays', parseInt(e.target.value))}
                    min="1"
                    max="30"
                    step="1"
                    className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                  />
                  <small className="block mt-1 text-white/60 text-sm">Re-scrape profiles older than this many days (1-30)</small>
                </div>

                <button
                  onClick={handleUpdateProfileScrapeConfig}
                  className="px-5 py-2.5 rounded-md text-base font-semibold transition-all bg-mhc-primary text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Configuration'}
                </button>
              </div>
            </div>
            )}
          </div>
        </>
      )}

      {!profileScrapeStatus && (
        <div className="text-center p-10 text-white/60">
          Loading profile scrape job status...
        </div>
      )}
    </>
  );

  // Unified Jobs tab with control rows at top and sub-tabs for details
  const renderJobsTab = () => (
    <>
      {/* Job Control Rows at Top */}
      <div className="space-y-3 mb-6">
        {/* Affiliate API Control Row */}
        <div className="flex items-center gap-4 p-4 bg-mhc-surface-light rounded-lg border border-white/10">
          <div className="cursor-pointer" onClick={() => setJobSubTab('affiliate')}>
            {getStatusBadge()}
          </div>
          <span className="font-semibold text-white min-w-[140px]">Affiliate API</span>
          {jobStatus && (
            <>
              {jobStatus.isPaused ? (
                <button
                  onClick={() => handleJobControl('resume')}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-mhc-success text-white hover:bg-emerald-600"
                  disabled={loading}
                >
                  Resume
                </button>
              ) : jobStatus.isRunning ? (
                <>
                  <button
                    onClick={() => handleJobControl('pause')}
                    className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-mhc-warning text-white hover:bg-amber-600"
                    disabled={loading}
                  >
                    Pause
                  </button>
                  <button
                    onClick={() => handleJobControl('stop')}
                    className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-mhc-danger text-white hover:bg-red-600"
                    disabled={loading}
                  >
                    Stop
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleJobControl('start')}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-mhc-success text-white hover:bg-emerald-600"
                  disabled={loading || !jobStatus.config.enabled}
                >
                  Start
                </button>
              )}
              <span className="ml-auto text-mhc-text-muted text-sm">
                Total: {jobStatus.stats.totalEnriched.toLocaleString()} enriched
              </span>
            </>
          )}
        </div>

        {/* Profile Scraping Control Row */}
        <div className="flex items-center gap-4 p-4 bg-mhc-surface-light rounded-lg border border-white/10">
          <div className="cursor-pointer" onClick={() => setJobSubTab('scraping')}>
            {getProfileScrapeStatusBadge()}
          </div>
          <span className="font-semibold text-white min-w-[140px]">Profile Scraping</span>
          {profileScrapeStatus && (
            <>
              {profileScrapeStatus.isPaused ? (
                <button
                  onClick={() => handleProfileScrapeJobControl('resume')}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-mhc-success text-white hover:bg-emerald-600"
                  disabled={loading}
                >
                  Resume
                </button>
              ) : profileScrapeStatus.isRunning ? (
                <>
                  <button
                    onClick={() => handleProfileScrapeJobControl('pause')}
                    className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-mhc-warning text-white hover:bg-amber-600"
                    disabled={loading}
                  >
                    Pause
                  </button>
                  <button
                    onClick={() => handleProfileScrapeJobControl('stop')}
                    className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-mhc-danger text-white hover:bg-red-600"
                    disabled={loading}
                  >
                    Stop
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleProfileScrapeJobControl('start')}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold transition-all bg-mhc-success text-white hover:bg-emerald-600"
                  disabled={loading || !profileScrapeStatus.config.enabled || !hasCookies}
                >
                  Start
                </button>
              )}
              <span className="ml-auto text-mhc-text-muted text-sm">
                Total: {profileScrapeStatus.stats.totalScraped.toLocaleString()} scraped
              </span>
            </>
          )}
        </div>
      </div>

      {/* Sub-tabs for job details */}
      <div className="flex gap-2 border-b border-white/10 mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            jobSubTab === 'affiliate'
              ? 'text-mhc-primary border-b-2 border-mhc-primary'
              : 'text-mhc-text-muted hover:text-white'
          }`}
          onClick={() => setJobSubTab('affiliate')}
        >
          Affiliate API
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            jobSubTab === 'scraping'
              ? 'text-mhc-primary border-b-2 border-mhc-primary'
              : 'text-mhc-text-muted hover:text-white'
          }`}
          onClick={() => setJobSubTab('scraping')}
        >
          Profile Scraping
        </button>
      </div>

      {/* Sub-tab content */}
      {jobSubTab === 'affiliate' && renderAffiliateJobContent()}
      {jobSubTab === 'scraping' && renderScrapingJobContent()}
    </>
  );

  const renderSystemStatsTab = () => (
    <>
      {systemStats && (
        <>
          {/* User Segments - Collapsible, expanded by default */}
          <CollapsibleSection
            title="User Segments"
            defaultCollapsed={false}
            className="mb-5"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              <Link
                to="/?tab=following"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.followingCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Following</div>
              </Link>
              <Link
                to="/?tab=followers"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.followerCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Followers</div>
              </Link>
              <Link
                to="/?tab=subs"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.subsCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Active Subs</div>
              </Link>
              <Link
                to="/?tab=doms"
                className="text-center p-4 bg-gradient-to-br from-pink-600 to-pink-800 rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.activeDomsCount || 0}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Active Doms</div>
              </Link>
              <Link
                to="/?tab=friends"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.friendsCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Friends</div>
              </Link>
              <Link
                to="/?tab=watchlist"
                className="text-center p-4 bg-gradient-to-br from-yellow-600 to-yellow-800 rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.watchlistCount || 0}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Watchlist</div>
              </Link>
              <Link
                to="/?tab=bans"
                className="text-center p-4 bg-gradient-to-br from-red-600 to-red-800 rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.bannedCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Banned</div>
              </Link>
            </div>
          </CollapsibleSection>

          {/* Database & Storage - Collapsible, collapsed by default */}
          <CollapsibleSection
            title="Database & Storage"
            defaultCollapsed={true}
            className="mb-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-5">
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{formatBytes(systemStats.database.sizeBytes)}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Database Size</div>
              </div>
              <Link
                to="/"
                className="text-center p-5 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity block no-underline"
              >
                <div className="text-3xl font-bold mb-2">{systemStats.database.totalPersons.toLocaleString()}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Total Persons</div>
              </Link>
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{systemStats.database.imagesStored.toLocaleString()}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Images Stored</div>
                {systemStats.database.imageSizeBytes > 0 && (
                  <div className="text-xs opacity-70 mt-1">{formatBytes(systemStats.database.imageSizeBytes)}</div>
                )}
              </div>
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{systemStats.database.videosStored.toLocaleString()}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Videos Stored</div>
                {systemStats.database.videoSizeBytes > 0 && (
                  <div className="text-xs opacity-70 mt-1">{formatBytes(systemStats.database.videoSizeBytes)}</div>
                )}
                {systemStats.database.usersWithVideos > 0 && (
                  <div className="text-xs opacity-70">{systemStats.database.usersWithVideos} users</div>
                )}
              </div>
            </div>

            {/* Role breakdown */}
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wide">By Role</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(systemStats.database.byRole).map(([role, count]) => (
                  <Link
                    key={role}
                    to={`/?role=${role}`}
                    className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10 hover:border-mhc-primary/50 transition-colors no-underline"
                  >
                    <span className="font-semibold text-white/70">{role}:</span>
                    <span className="text-white font-medium">{count.toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Source breakdown */}
            {Object.keys(systemStats.database.bySource).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wide">Snapshots by Source</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(systemStats.database.bySource).map(([source, count]) => (
                    <div key={source} className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                      <span className="font-semibold text-white/70">{source}:</span>
                      <span className="text-white font-medium">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Activity & Real-time - Collapsible, collapsed by default */}
          <CollapsibleSection
            title="Activity & Real-time"
            defaultCollapsed={true}
            className="mb-5"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{systemStats.activity.snapshotsLastHour}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Snapshots (1h)</div>
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{systemStats.activity.snapshotsLast24h.toLocaleString()}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Snapshots (24h)</div>
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{systemStats.realtime.feedCacheSize}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Feed Cache</div>
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{systemStats.realtime.cbhoursOnline}/{systemStats.realtime.cbhoursTracked}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">CBHours Online</div>
              </div>
            </div>

            {systemStats.realtime.feedCacheUpdatedAt && (
              <div className="mt-4 text-sm text-white/60 text-center">
                Feed cache last updated: {formatDate(systemStats.realtime.feedCacheUpdatedAt)}
              </div>
            )}
          </CollapsibleSection>

          {/* Priority Lookup Queue - Collapsible, collapsed by default */}
          <CollapsibleSection
            title="Priority Lookup Queue"
            defaultCollapsed={true}
            className="mb-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{systemStats.queue.priority1Pending}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Priority 1 Pending</div>
              </div>
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{systemStats.queue.priority2Active}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Priority 2 Active</div>
              </div>
              <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                <div className="text-3xl font-bold mb-2">{systemStats.queue.failedLast24h}</div>
                <div className="text-sm opacity-90 uppercase tracking-wide">Failed (24h)</div>
              </div>
            </div>
          </CollapsibleSection>
        </>
      )}

      {!systemStats && loading && (
        <div className="text-center p-10 text-white/60">
          Loading system statistics...
        </div>
      )}
    </>
  );

  const renderFollowerTrendsTab = () => (
    <>
      {/* Header with Stats Cards */}
      <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
        <div className="p-5 border-b border-white/10">
          <h2 className="m-0 text-2xl text-white">Follower Trends</h2>
        </div>
        <div className="p-5">
          {followerTrends && (
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{followerTrends.totalTracked}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Models Tracked</div>
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{followerTrends.totalWithChanges}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">With Changes</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Time Period Selector */}
      <div className="sticky top-0 z-10 bg-mhc-dark/95 backdrop-blur-sm py-3 mb-5 -mx-5 px-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-sm font-medium">Time Period:</span>
          <div className="flex gap-2 flex-wrap">
            {[7, 14, 30, 60, 180, 365].map(days => (
              <button
                key={days}
                onClick={() => setTrendsDays(days)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                  trendsDays === days
                    ? 'bg-mhc-primary text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {days === 365 ? '1y' : `${days}d`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {followerTrends && (
        <>
          {/* Top Gainers */}
          <CollapsibleSection
            title={`Top Gainers (${trendsDays === 365 ? '1 year' : `${trendsDays} days`})`}
            defaultCollapsed={true}
            className="mb-5"
          >
            {followerTrends.topGainers.length === 0 ? (
              <p className="text-white/60 text-center py-4">No data yet. Follower counts are tracked during polling jobs.</p>
            ) : (
              <div className="space-y-3">
                {followerTrends.topGainers.map((mover, index) => (
                  <div
                    key={mover.person_id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:border-emerald-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white/40 font-mono text-sm w-6">#{index + 1}</span>
                      <a
                        href={`/profile/${mover.username}`}
                        className="text-mhc-primary hover:text-mhc-primary-light font-medium"
                      >
                        {mover.username}
                      </a>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-white/60 text-sm">
                        {mover.current_count?.toLocaleString() || 'N/A'} followers
                      </span>
                      <span className="text-emerald-400 font-bold text-lg">
                        +{mover.total_change.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Top Losers */}
          <CollapsibleSection
            title={`Top Losers (${trendsDays === 365 ? '1 year' : `${trendsDays} days`})`}
            defaultCollapsed={true}
            className="mb-5"
          >
            {followerTrends.topLosers.length === 0 ? (
              <p className="text-white/60 text-center py-4">No data yet. Follower counts are tracked during polling jobs.</p>
            ) : (
              <div className="space-y-3">
                {followerTrends.topLosers.map((mover, index) => (
                  <div
                    key={mover.person_id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:border-red-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white/40 font-mono text-sm w-6">#{index + 1}</span>
                      <a
                        href={`/profile/${mover.username}`}
                        className="text-mhc-primary hover:text-mhc-primary-light font-medium"
                      >
                        {mover.username}
                      </a>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-white/60 text-sm">
                        {mover.current_count?.toLocaleString() || 'N/A'} followers
                      </span>
                      <span className="text-red-400 font-bold text-lg">
                        {mover.total_change.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Recent Changes */}
          <CollapsibleSection
            title={
              <div className="flex items-center gap-2">
                <span>Recent Significant Changes</span>
                {followerTrends.recentChanges.length > 0 && (
                  <span className="text-xs text-white/50 font-normal">({followerTrends.recentChanges.length})</span>
                )}
              </div>
            }
            defaultCollapsed={true}
            className="mb-5"
          >
            {followerTrends.recentChanges.length === 0 ? (
              <p className="text-white/60 text-center py-4">No significant changes recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-white/60 text-sm">Changes of 50+ followers</span>
                  <span className="text-white/50 text-xs">
                    Showing {Math.min((recentChangesPage + 1) * RECENT_CHANGES_PER_PAGE, followerTrends.recentChanges.length)} of {followerTrends.recentChanges.length}
                  </span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-white/10">
                      <th className="pb-3 text-white/70 font-semibold">Username</th>
                      <th className="pb-3 text-white/70 font-semibold text-right">Count</th>
                      <th className="pb-3 text-white/70 font-semibold text-right">Change</th>
                      <th className="pb-3 text-white/70 font-semibold text-right">Source</th>
                      <th className="pb-3 text-white/70 font-semibold text-right">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followerTrends.recentChanges
                      .slice(recentChangesPage * RECENT_CHANGES_PER_PAGE, (recentChangesPage + 1) * RECENT_CHANGES_PER_PAGE)
                      .map(change => (
                        <tr key={change.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-3">
                            <a
                              href={`/profile/${change.username}`}
                              className="text-mhc-primary hover:text-mhc-primary-light"
                            >
                              {change.username}
                            </a>
                          </td>
                          <td className="py-3 text-right text-white/80">
                            {change.follower_count.toLocaleString()}
                          </td>
                          <td className={`py-3 text-right font-bold ${change.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {change.delta > 0 ? '+' : ''}{change.delta.toLocaleString()}
                          </td>
                          <td className="py-3 text-right">
                            <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/70">
                              {change.source}
                            </span>
                          </td>
                          <td className="py-3 text-right text-white/60 text-sm">
                            {new Date(change.recorded_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {/* Pagination Controls */}
                {followerTrends.recentChanges.length > RECENT_CHANGES_PER_PAGE && (
                  <div className="flex justify-center items-center gap-4 mt-4">
                    <button
                      onClick={() => setRecentChangesPage(prev => Math.max(0, prev - 1))}
                      disabled={recentChangesPage === 0}
                      className="px-3 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white/10 text-white hover:bg-mhc-primary"
                    >
                      ← Previous
                    </button>
                    <span className="text-white/60 text-xs">
                      Page {recentChangesPage + 1} of {Math.ceil(followerTrends.recentChanges.length / RECENT_CHANGES_PER_PAGE)}
                    </span>
                    <button
                      onClick={() => setRecentChangesPage(prev => Math.min(Math.ceil(followerTrends.recentChanges.length / RECENT_CHANGES_PER_PAGE) - 1, prev + 1))}
                      disabled={recentChangesPage >= Math.ceil(followerTrends.recentChanges.length / RECENT_CHANGES_PER_PAGE) - 1}
                      className="px-3 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white/10 text-white hover:bg-mhc-primary"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>
        </>
      )}

      {!followerTrends && loading && (
        <div className="text-center p-10 text-white/60">
          Loading follower trends...
        </div>
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
                <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Active</span>
                Profile Scraping
              </div>
              <div className="text-sm text-white/60">Bio, photos, social links (background job + manual)</div>
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
            Jobs
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
              activeTab === 'follower-trends'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary border-b-mhc-primary font-semibold'
                : 'bg-mhc-surface/60 text-white/90 hover:bg-mhc-primary/10 hover:text-mhc-primary-light hover:border-mhc-primary/40'
            }`}
            onClick={() => setActiveTab('follower-trends')}
          >
            Follower Trends
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
          <button
            className={`px-6 py-3 text-base font-medium rounded-t-lg border border-white/20 border-b-2 -mb-0.5 mr-2 transition-all ${
              activeTab === 'settings'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary border-b-mhc-primary font-semibold'
                : 'bg-mhc-surface/60 text-white/90 hover:bg-mhc-primary/10 hover:text-mhc-primary-light hover:border-mhc-primary/40'
            }`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
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
        {activeTab === 'follower-trends' && renderFollowerTrendsTab()}
        {activeTab === 'data-sources' && renderDataSourcesTab()}
        {activeTab === 'scraper' && renderScraperTab()}
        {activeTab === 'settings' && (
          <div className="bg-mhc-surface-light rounded-lg p-6">
            <h2 className="text-xl font-semibold text-mhc-text mb-6">Settings</h2>

            {/* Broadcast Settings */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-mhc-text mb-4">Broadcast Settings</h3>

              {settingsError && (
                <div className="p-3 px-4 rounded-md mb-4 bg-red-500/15 border-l-4 border-red-500 text-red-300">
                  {settingsError}
                </div>
              )}

              {settingsSuccess && (
                <div className="p-3 px-4 rounded-md mb-4 bg-green-500/15 border-l-4 border-green-500 text-green-300">
                  {settingsSuccess}
                </div>
              )}

              {settingsLoading ? (
                <div className="text-mhc-text-muted">Loading settings...</div>
              ) : broadcastSettings ? (
                <div className="space-y-6">
                  {/* Merge Gap Setting */}
                  <div>
                    <label className="block text-mhc-text mb-2 font-medium">
                      Session Merge Gap (minutes)
                    </label>
                    <p className="text-mhc-text-muted text-sm mb-2">
                      When broadcasts are within this many minutes of each other, they will be merged into a single session.
                    </p>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={broadcastSettings.mergeGapMinutes}
                      onChange={(e) => setBroadcastSettings({
                        ...broadcastSettings,
                        mergeGapMinutes: parseInt(e.target.value) || 30
                      })}
                      className="w-32 px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none"
                    />
                  </div>

                  {/* AI Summary Delay Setting */}
                  <div>
                    <label className="block text-mhc-text mb-2 font-medium">
                      AI Summary Delay
                    </label>
                    <p className="text-mhc-text-muted text-sm mb-2">
                      How long to wait after a broadcast ends before generating an AI summary.
                    </p>
                    <div className="flex items-center gap-4 mb-2">
                      <label className="flex items-center gap-2 text-mhc-text">
                        <input
                          type="radio"
                          name="aiSummaryDelay"
                          checked={!broadcastSettings.aiSummaryDelayIsCustom}
                          onChange={() => setBroadcastSettings({
                            ...broadcastSettings,
                            aiSummaryDelayIsCustom: false,
                            aiSummaryDelayMinutes: null
                          })}
                          className="text-mhc-primary"
                        />
                        Use merge gap ({broadcastSettings.mergeGapMinutes} minutes)
                      </label>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-mhc-text">
                        <input
                          type="radio"
                          name="aiSummaryDelay"
                          checked={broadcastSettings.aiSummaryDelayIsCustom}
                          onChange={() => setBroadcastSettings({
                            ...broadcastSettings,
                            aiSummaryDelayIsCustom: true,
                            aiSummaryDelayMinutes: broadcastSettings.mergeGapMinutes
                          })}
                          className="text-mhc-primary"
                        />
                        Custom delay:
                      </label>
                      {broadcastSettings.aiSummaryDelayIsCustom && (
                        <input
                          type="number"
                          min="5"
                          max="1440"
                          value={broadcastSettings.aiSummaryDelayMinutes ?? 30}
                          onChange={(e) => setBroadcastSettings({
                            ...broadcastSettings,
                            aiSummaryDelayMinutes: parseInt(e.target.value) || 30
                          })}
                          className="w-24 px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none"
                        />
                      )}
                      {broadcastSettings.aiSummaryDelayIsCustom && (
                        <span className="text-mhc-text-muted">minutes</span>
                      )}
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-4 border-t border-white/10">
                    <button
                      onClick={saveBroadcastSettings}
                      disabled={settingsSaving}
                      className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {settingsSaving ? 'Saving...' : 'Save Broadcast Settings'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-mhc-text-muted">No settings available</div>
              )}
            </div>

            {/* Image Upload Settings */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-mhc-text mb-4">Image Upload Limits</h3>

              {imageSettingsError && (
                <div className="p-3 px-4 rounded-md mb-4 bg-red-500/15 border-l-4 border-red-500 text-red-300">
                  {imageSettingsError}
                </div>
              )}

              {imageSettingsSuccess && (
                <div className="p-3 px-4 rounded-md mb-4 bg-green-500/15 border-l-4 border-green-500 text-green-300">
                  {imageSettingsSuccess}
                </div>
              )}

              {imageSettingsLoading ? (
                <div className="text-mhc-text-muted">Loading image settings...</div>
              ) : imageSettings ? (
                <div className="space-y-6">
                  <p className="text-mhc-text-muted text-sm">
                    Configure maximum file size limits for different types of image uploads.
                    Files exceeding these limits will be rejected with a user-friendly error message.
                  </p>

                  {/* Manual Upload Limit */}
                  <div>
                    <label className="block text-mhc-text mb-2 font-medium">
                      Manual Upload Limit
                    </label>
                    <p className="text-mhc-text-muted text-sm mb-2">
                      Maximum size for manually uploaded image files.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={imageSettings.manualMB}
                        onChange={(e) => setImageSettings({
                          ...imageSettings,
                          manualMB: parseInt(e.target.value) || 20
                        })}
                        className="w-24 px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none"
                      />
                      <span className="text-mhc-text-muted">MB</span>
                    </div>
                  </div>

                  {/* External URL Limit */}
                  <div>
                    <label className="block text-mhc-text mb-2 font-medium">
                      External URL Import Limit
                    </label>
                    <p className="text-mhc-text-muted text-sm mb-2">
                      Maximum size for images imported from external URLs.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={imageSettings.externalMB}
                        onChange={(e) => setImageSettings({
                          ...imageSettings,
                          externalMB: parseInt(e.target.value) || 20
                        })}
                        className="w-24 px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none"
                      />
                      <span className="text-mhc-text-muted">MB</span>
                    </div>
                  </div>

                  {/* Screenshot Limit */}
                  <div>
                    <label className="block text-mhc-text mb-2 font-medium">
                      Screenshot Capture Limit
                    </label>
                    <p className="text-mhc-text-muted text-sm mb-2">
                      Maximum size for screenshot captures.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={imageSettings.screenshotMB}
                        onChange={(e) => setImageSettings({
                          ...imageSettings,
                          screenshotMB: parseInt(e.target.value) || 20
                        })}
                        className="w-24 px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none"
                      />
                      <span className="text-mhc-text-muted">MB</span>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-4 border-t border-white/10">
                    <button
                      onClick={saveImageSettings}
                      disabled={imageSettingsSaving}
                      className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {imageSettingsSaving ? 'Saving...' : 'Save Image Settings'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-mhc-text-muted">No image settings available</div>
              )}
            </div>

            {/* Video Upload Settings */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-mhc-text mb-4">Video Upload Limits</h3>

              {videoSettingsError && (
                <div className="p-3 px-4 rounded-md mb-4 bg-red-500/15 border-l-4 border-red-500 text-red-300">
                  {videoSettingsError}
                </div>
              )}

              {videoSettingsSuccess && (
                <div className="p-3 px-4 rounded-md mb-4 bg-green-500/15 border-l-4 border-green-500 text-green-300">
                  {videoSettingsSuccess}
                </div>
              )}

              {videoSettingsLoading ? (
                <div className="text-mhc-text-muted">Loading video settings...</div>
              ) : videoSettings ? (
                <div className="space-y-6">
                  <p className="text-mhc-text-muted text-sm">
                    Configure maximum file size for video downloads from profile photosets.
                  </p>

                  <div className="flex items-center gap-4">
                    <label className="w-48 text-mhc-text font-medium">Max Video Size:</label>
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={videoSettings.maxSizeMB}
                      onChange={(e) => setVideoSettings({
                        ...videoSettings,
                        maxSizeMB: parseInt(e.target.value) || 500
                      })}
                      className="w-24 px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none"
                    />
                    <span className="text-mhc-text-muted">MB</span>
                  </div>

                  {/* Save Button */}
                  <div className="pt-4 border-t border-white/10">
                    <button
                      onClick={saveVideoSettings}
                      disabled={videoSettingsSaving}
                      className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {videoSettingsSaving ? 'Saving...' : 'Save Video Settings'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-mhc-text-muted">No video settings available</div>
              )}
            </div>

            {/* Theme Selection */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-mhc-text mb-4">Theme</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {themes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`p-4 rounded-lg border-2 transition-all text-center ${
                      theme === t
                        ? 'border-mhc-primary bg-mhc-primary/20 text-mhc-primary font-semibold'
                        : 'border-white/20 hover:border-mhc-primary/50 text-mhc-text-muted hover:text-mhc-text'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full mx-auto mb-2 ${
                      t === 'midnight' ? 'bg-gradient-to-br from-slate-800 to-slate-900' :
                      t === 'charcoal' ? 'bg-gradient-to-br from-gray-700 to-gray-800' :
                      t === 'ocean' ? 'bg-gradient-to-br from-blue-800 to-cyan-900' :
                      t === 'forest' ? 'bg-gradient-to-br from-emerald-800 to-green-900' :
                      t === 'ember' ? 'bg-gradient-to-br from-orange-700 to-red-900' :
                      'bg-gray-600'
                    }`} />
                    <span className="text-sm">{themeLabels[t]}</span>
                    {theme === t && (
                      <div className="mt-1 text-xs text-mhc-primary">Active</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
