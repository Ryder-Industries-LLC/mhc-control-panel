import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CollapsibleSection from '../components/CollapsibleSection';
import { useTheme, ThemeName } from '../context/ThemeContext';
import { api } from '../api/client';
import DateFilterBar, { DatePreset } from '../components/DateFilterBar';
import StatsHistoryTable from '../components/StatsHistoryTable';
import StorageGrowthChart from '../components/StorageGrowthChart';

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
  currentUsername: string | null;
  progress: number;
  total: number;
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
  isProcessing: boolean;
  config: ProfileScrapeConfig;
  stats: ProfileScrapeStats;
}

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

interface StatbateStats {
  lastRun: string | null;
  totalRuns: number;
  totalRefreshed: number;
  totalFailed: number;
  lastRunRefreshed: number;
  lastRunFailed: number;
  currentUsername: string | null;
  progress: number;
  total: number;
}

interface StatbateJobStatus {
  isRunning: boolean;
  isProcessing: boolean;
  config: StatbateConfig;
  stats: StatbateStats;
}

interface StatsCollectionConfig {
  intervalMinutes: number;
  enabled: boolean;
}

interface StatsCollectionStats {
  lastRun: string | null;
  totalRuns: number;
  totalSnapshots: number;
  lastCollectionDurationMs: number;
  lastError: string | null;
}

interface StatsCollectionJobStatus {
  isRunning: boolean;
  isProcessing: boolean;
  config: StatsCollectionConfig;
  stats: StatsCollectionStats;
}

interface JobStatus {
  isRunning: boolean;
  isProcessing: boolean;
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
      lastRun: string | null;
      totalRuns: number;
      totalEnriched: number;
    };
    profileScrape: {
      isRunning: boolean;
      lastRun: string | null;
      totalRuns: number;
      totalScraped: number;
    };
    cbhours: {
      isRunning: boolean;
      lastRun: string | null;
      totalRuns: number;
      totalRecorded: number;
    };
    statbate: {
      isRunning: boolean;
    };
  };
}

type AdminTab = 'jobs' | 'system-stats' | 'data-sources' | 'scraper' | 'bulk-upload' | 'settings';

const Admin: React.FC = () => {
  const { theme, setTheme, themes } = useTheme();
  const [activeTab, setActiveTab] = useState<AdminTab>('jobs');
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);

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

  // Statbate job state
  const [statbateStatus, setStatbateStatus] = useState<StatbateJobStatus | null>(null);
  const [statbateConfigForm, setStatbateConfigForm] = useState<StatbateConfig>({
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
  const [statbateConfigCollapsed] = useState(true);

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

  // Note display settings state
  const [noteLineLimit, setNoteLineLimit] = useState(6);
  const [noteLineLimitSaving, setNoteLineLimitSaving] = useState(false);
  const [noteLineLimitSuccess, setNoteLineLimitSuccess] = useState<string | null>(null);

  // Storage settings state
  interface StorageConfig {
    globalMode: 'local' | 'remote';
    local: {
      mode: 'auto' | 'ssd' | 'docker';
      ssdEnabled: boolean;
      dockerEnabled: boolean;
      ssdPath: string;
      dockerPath: string;
    };
    external: {
      enabled: boolean;
      s3Bucket: string;
      s3Region: string;
      s3Prefix: string;
      s3AccessKeyId: string;
      s3SecretAccessKey: string;
      cacheEnabled: boolean;
      cacheMaxSizeMb: number;
    };
  }
  interface DiskSpaceInfo {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
  }
  interface LastWriteInfo {
    destination: string | null;
    timestamp: string | null;
    path: string | null;
    error: string | null;
  }
  interface StorageStatus {
    currentWriteBackend: string | null;
    docker: { available: boolean; path: string; fileCount: number };
    ssd: {
      available: boolean;
      path: string;
      hostPath: string;
      fileCount: number;
      lastHealthCheck: string | null;
      lastError: string | null;
      unavailableSince: string | null;
      diskSpace: DiskSpaceInfo | null;
    };
    s3: { available: boolean; bucket: string; fileCount: number };
    queue: { length: number; oldestOperation: string | null };
    lastWrite: LastWriteInfo;
  }
  const [storageConfig, setStorageConfig] = useState<StorageConfig | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageSuccess, setStorageSuccess] = useState<string | null>(null);

  // Stats collection job state
  const [statsCollectionStatus, setStatsCollectionStatus] = useState<StatsCollectionJobStatus | null>(null);
  const [statsCollectionLoading, setStatsCollectionLoading] = useState(false);
  const [statsCollectionSaving, setStatsCollectionSaving] = useState(false);
  const [statsCollectionError, setStatsCollectionError] = useState<string | null>(null);
  const [statsCollectionSuccess, setStatsCollectionSuccess] = useState<string | null>(null);

  // Bulk upload state
  interface ParsedFile {
    file: File;
    username: string;
    personExists: boolean | null; // null = not yet validated
  }
  interface UploadResult {
    uploaded: Array<{ username: string; filename: string; personId: string }>;
    skipped: Array<{ filename: string; reason: string }>;
  }
  const [bulkSelectedFiles, setBulkSelectedFiles] = useState<File[]>([]);
  const [bulkParsedFiles, setBulkParsedFiles] = useState<ParsedFile[]>([]);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkUploadResults, setBulkUploadResults] = useState<UploadResult | null>(null);
  const [bulkIsValidating, setBulkIsValidating] = useState(false);
  const [bulkIsUploading, setBulkIsUploading] = useState(false);
  const [bulkDragActive, setBulkDragActive] = useState(false);

  // Auto-refresh all job statuses when on Jobs tab (merged view)
  useEffect(() => {
    if (activeTab === 'jobs') {
      fetchJobStatus();
      fetchProfileScrapeStatus();
      fetchStatbateStatus();
      checkCookieStatus();
      const interval = setInterval(() => {
        fetchJobStatus();
        fetchProfileScrapeStatus();
        fetchStatbateStatus();
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

  // Check cookie status when on Scraper tab
  useEffect(() => {
    if (activeTab === 'scraper') {
      checkCookieStatus();
    }
  }, [activeTab]);

  // Load broadcast settings, image settings, video settings, note settings, storage settings, and stats collection settings when Settings tab is active
  useEffect(() => {
    if (activeTab === 'settings') {
      fetchBroadcastSettings();
      fetchImageSettings();
      fetchVideoSettings();
      fetchNoteLineLimitSetting();
      fetchStorageSettings();
      fetchStatsCollectionStatus();
    }
  }, [activeTab]);

  const fetchNoteLineLimitSetting = async () => {
    try {
      const response = await fetch('/api/settings/note_line_limit');
      if (response.ok) {
        const data = await response.json();
        if (data.value) {
          setNoteLineLimit(parseInt(data.value, 10) || 6);
        }
      }
    } catch (err) {
      // Use default value on error
    }
  };

  const saveNoteLineLimit = async () => {
    setNoteLineLimitSaving(true);
    setNoteLineLimitSuccess(null);
    try {
      const response = await fetch('/api/settings/note_line_limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: noteLineLimit.toString() }),
      });
      if (response.ok) {
        setNoteLineLimitSuccess('Note line limit saved successfully');
        setTimeout(() => setNoteLineLimitSuccess(null), 3000);
      }
    } catch (err) {
      // Silent fail
    } finally {
      setNoteLineLimitSaving(false);
    }
  };

  const fetchStorageSettings = async () => {
    setStorageLoading(true);
    setStorageError(null);
    try {
      const response = await fetch('/api/storage/status');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStorageConfig(data.data.config);
          setStorageStatus(data.data.status);
        }
      } else {
        setStorageError('Failed to load storage settings');
      }
    } catch (err) {
      setStorageError('Failed to load storage settings');
      console.error('Error fetching storage settings:', err);
    } finally {
      setStorageLoading(false);
    }
  };

  const saveStorageSettings = async () => {
    if (!storageConfig) return;
    setStorageSaving(true);
    setStorageError(null);
    setStorageSuccess(null);
    try {
      const response = await fetch('/api/storage/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storageConfig),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStorageConfig(data.data.config);
          setStorageStatus(data.data.status);
          setStorageSuccess('Storage settings saved successfully');
          setTimeout(() => setStorageSuccess(null), 3000);
        }
      } else {
        setStorageError('Failed to save storage settings');
      }
    } catch (err) {
      setStorageError('Failed to save storage settings');
      console.error('Error saving storage settings:', err);
    } finally {
      setStorageSaving(false);
    }
  };

  const fetchStatsCollectionStatus = async () => {
    setStatsCollectionLoading(true);
    setStatsCollectionError(null);
    try {
      const response = await fetch('/api/job/stats-collection/status');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStatsCollectionStatus(data.data);
        } else {
          setStatsCollectionError('Failed to load stats collection status');
        }
      } else {
        setStatsCollectionError('Failed to load stats collection status');
      }
    } catch (err) {
      setStatsCollectionError('Failed to load stats collection status');
      console.error('Error fetching stats collection status:', err);
    } finally {
      setStatsCollectionLoading(false);
    }
  };

  const saveStatsCollectionConfig = async (config: Partial<StatsCollectionConfig>) => {
    setStatsCollectionSaving(true);
    setStatsCollectionError(null);
    setStatsCollectionSuccess(null);
    try {
      const response = await fetch('/api/job/stats-collection/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStatsCollectionStatus(data.data);
          setStatsCollectionSuccess('Stats collection settings saved successfully');
          setTimeout(() => setStatsCollectionSuccess(null), 3000);
        } else {
          setStatsCollectionError('Failed to save stats collection settings');
        }
      } else {
        setStatsCollectionError('Failed to save stats collection settings');
      }
    } catch (err) {
      setStatsCollectionError('Failed to save stats collection settings');
      console.error('Error saving stats collection settings:', err);
    } finally {
      setStatsCollectionSaving(false);
    }
  };

  const startStatsCollection = async () => {
    try {
      const response = await fetch('/api/job/stats-collection/start', { method: 'POST' });
      if (response.ok) {
        await fetchStatsCollectionStatus();
        setStatsCollectionSuccess('Stats collection started');
        setTimeout(() => setStatsCollectionSuccess(null), 3000);
      } else {
        setStatsCollectionError('Failed to start stats collection');
      }
    } catch (err) {
      setStatsCollectionError('Failed to start stats collection');
    }
  };

  const stopStatsCollection = async () => {
    try {
      const response = await fetch('/api/job/stats-collection/stop', { method: 'POST' });
      if (response.ok) {
        await fetchStatsCollectionStatus();
        setStatsCollectionSuccess('Stats collection stopped');
        setTimeout(() => setStatsCollectionSuccess(null), 3000);
      } else {
        setStatsCollectionError('Failed to stop stats collection');
      }
    } catch (err) {
      setStatsCollectionError('Failed to stop stats collection');
    }
  };

  const runStatsCollectionNow = async () => {
    try {
      const response = await fetch('/api/job/stats-collection/run-now', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        await fetchStatsCollectionStatus();
        setStatsCollectionSuccess(data.message || 'Stats collection completed');
        setTimeout(() => setStatsCollectionSuccess(null), 5000);
      } else {
        setStatsCollectionError(data.message || 'Failed to run stats collection');
      }
    } catch (err) {
      setStatsCollectionError('Failed to run stats collection');
    }
  };

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
    if (activeTab === 'jobs') {
      setProfileScrapeFormInitialized(false); // Reset so form syncs fresh
    }
  }, [activeTab]);

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

  const fetchStatbateStatus = async () => {
    try {
      const response = await fetch('/api/job/statbate/status');
      if (!response.ok) {
        throw new Error('Failed to fetch statbate status');
      }
      const data = await response.json();
      setStatbateStatus(data);
      if (data.config) {
        setStatbateConfigForm(data.config);
      }
    } catch (err) {
      console.error('Error fetching statbate status:', err);
    }
  };

  const handleStatbateJobControl = async (action: 'start' | 'stop') => {
    try {
      setLoading(true);
      const response = await fetch(`/api/job/statbate/${action}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Failed to ${action} statbate job`);
      }
      await fetchStatbateStatus();
    } catch (err) {
      console.error(`Error ${action}ing statbate job:`, err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleStatbateConfigUpdate = async () => {
    try {
      setLoading(true);
      setSuccessMessage(null);
      const response = await fetch('/api/job/statbate/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statbateConfigForm),
      });
      if (!response.ok) {
        throw new Error('Failed to update statbate config');
      }
      await fetchStatbateStatus();
      setSuccessMessage('Statbate API configuration saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error updating statbate config:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleStatbateResetStats = async () => {
    if (!window.confirm('Reset all Statbate API statistics?')) return;
    try {
      setLoading(true);
      const response = await fetch('/api/job/statbate/reset-stats', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to reset statbate stats');
      }
      await fetchStatbateStatus();
    } catch (err) {
      console.error('Error resetting statbate stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Note: getStatbateStatusBadge removed - using unified JobStatusButton component

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
      setScrapeStatus(`Syncing ${type}... This may take 2-5 minutes for large lists.`);

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
        setLastSyncDate(new Date().toISOString());
        setTimeout(() => setScrapeStatus(null), 10000);
      } else {
        setScrapeStatus(data.error || 'Failed to sync');
        setTimeout(() => setScrapeStatus(null), 10000);
      }
    } catch (err) {
      console.error(err);
      setScrapeStatus('Error during sync');
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
      setSuccessMessage(null);
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
      setSuccessMessage('Affiliate API configuration saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleJobControl = async (action: 'start' | 'stop') => {
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
      setSuccessMessage(null);
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
      setSuccessMessage('Profile Capture configuration saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileScrapeJobControl = async (action: 'start' | 'stop') => {
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

  // Simple status badge for expanded sections (no controls)
  // Status states: Stopped, Starting (just started), Processing, Waiting (between cycles)
  const getSimpleStatusBadge = (isRunning: boolean, isProcessing: boolean, hasRun?: boolean) => {
    const baseBadge = "px-3 py-1 rounded-full text-sm font-semibold uppercase";
    if (!isRunning) {
      return <span className={`${baseBadge} bg-gray-500 text-white`}>Stopped</span>;
    } else if (isProcessing) {
      return <span className={`${baseBadge} bg-blue-500 text-white animate-pulse`}>Processing</span>;
    } else if (hasRun) {
      // Running but not processing, and has completed at least one cycle = waiting between cycles
      return <span className={`${baseBadge} bg-amber-500 text-white`}>Waiting</span>;
    } else {
      // Running but not processing, hasn't completed a cycle yet = just started
      return <span className={`${baseBadge} bg-emerald-500 text-white`}>Starting</span>;
    }
  };

  // Unified Job Status Button component - combines status display with controls
  // Status states: Stopped, Starting (just started), Processing (actively working), Waiting (between cycles)
  const JobStatusButton = ({
    isRunning,
    isProcessing,
    enabled,
    onStart,
    onStop,
    disabled,
    extraDisabled = false,
    hasRun = false, // true if job has completed at least one cycle
  }: {
    isRunning: boolean;
    isProcessing: boolean;
    enabled: boolean;
    onStart: () => void;
    onStop: () => void;
    disabled: boolean;
    extraDisabled?: boolean;
    hasRun?: boolean;
  }) => {
    const baseBadge = "px-3 py-1.5 rounded-full text-sm font-semibold uppercase transition-all cursor-pointer";

    if (!isRunning) {
      // Stopped - clicking starts
      return (
        <button
          onClick={(e) => { e.stopPropagation(); onStart(); }}
          className={`${baseBadge} ${enabled && !extraDisabled ? 'bg-gray-500 text-white hover:bg-mhc-success' : 'bg-gray-500/50 text-gray-400 cursor-not-allowed'}`}
          disabled={disabled || !enabled || extraDisabled}
          title={enabled && !extraDisabled ? "Click to start" : "Job is disabled"}
        >
          Stopped
        </button>
      );
    } else if (isProcessing) {
      // Processing - clicking stops
      return (
        <button
          onClick={(e) => { e.stopPropagation(); onStop(); }}
          className={`${baseBadge} bg-blue-500 text-white hover:bg-blue-600 animate-pulse`}
          disabled={disabled}
          title="Click to stop"
        >
          Processing
        </button>
      );
    } else if (hasRun) {
      // Waiting between cycles - clicking stops
      return (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onStop}
            className={`${baseBadge} bg-amber-500 text-white hover:bg-amber-600`}
            disabled={disabled}
            title="Click to stop"
          >
            Waiting
          </button>
        </div>
      );
    } else {
      // Starting (just started, first cycle not complete) - clicking stops
      return (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onStop}
            className={`${baseBadge} bg-emerald-500 text-white hover:bg-emerald-600`}
            disabled={disabled}
            title="Click to stop"
          >
            Starting
          </button>
        </div>
      );
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
                {getSimpleStatusBadge(jobStatus.isRunning, jobStatus.isProcessing, jobStatus.stats.totalRuns > 0)}
              </div>
            }
            defaultCollapsed={true}
            className="mb-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                <span className="font-semibold text-white/70">State:</span>
                <span className="text-white font-medium">
                  {!jobStatus.isRunning ? 'Stopped' : jobStatus.isProcessing ? 'Processing' : jobStatus.stats.totalRuns > 0 ? 'Waiting' : 'Starting'}
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
          <strong className="font-bold mr-1">Note:</strong> No cookies imported. Profile capture requires authenticated Chaturbate cookies.
          Go to <button className="underline font-semibold" onClick={() => setActiveTab('settings')}>Settings</button> → Chaturbate Sync to import cookies.
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
                {getSimpleStatusBadge(profileScrapeStatus.isRunning, profileScrapeStatus.isProcessing, profileScrapeStatus.stats.totalRuns > 0)}
              </span>
            }
            defaultCollapsed={true}
            className="mb-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/10">
                <span className="font-semibold text-white/70">State:</span>
                <span className="text-white font-medium">
                  {!profileScrapeStatus.isRunning ? 'Stopped' : profileScrapeStatus.isProcessing ? 'Processing' : profileScrapeStatus.stats.totalRuns > 0 ? 'Waiting' : 'Starting'}
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
          </CollapsibleSection>

          {/* Manual Scrape Section */}
          <CollapsibleSection
            title="Manual Profile Capture"
            defaultCollapsed={true}
            className="mb-5"
          >
            <p className="text-white/60 text-base p-4 bg-white/5 rounded-lg mb-4">
              Manually trigger a profile capture for a specific username. This bypasses the scheduled job and runs immediately.
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
          Loading profile capture job status...
        </div>
      )}
    </>
  );

  // Render Statbate job content for sub-tab
  const renderStatbateJobContent = () => (
    <>
      {statbateStatus && (
        <>
          {/* Statistics Section */}
          <CollapsibleSection
            title={<span>Statistics <button onClick={handleStatbateResetStats} className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-gray-600 text-white hover:bg-gray-500">Reset Stats</button></span>}
            defaultCollapsed={false}
            className="mb-5"
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{statbateStatus.stats.totalRuns}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Total Cycles</div>
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{statbateStatus.stats.totalRefreshed.toLocaleString()}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Total Refreshed</div>
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{statbateStatus.stats.totalFailed.toLocaleString()}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Total Failed</div>
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{statbateStatus.stats.lastRun ? new Date(statbateStatus.stats.lastRun).toLocaleString() : 'Never'}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Last Run</div>
              </div>
            </div>
            {statbateStatus.stats.lastRun && (
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-white/60">Last Refreshed</div>
                  <div className="text-lg font-semibold text-white">{statbateStatus.stats.lastRunRefreshed}</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-white/60">Last Failed</div>
                  <div className="text-lg font-semibold text-white">{statbateStatus.stats.lastRunFailed}</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-white/60">Success Rate</div>
                  <div className="text-lg font-semibold text-white">
                    {statbateStatus.stats.lastRunRefreshed + statbateStatus.stats.lastRunFailed > 0
                      ? Math.round((statbateStatus.stats.lastRunRefreshed / (statbateStatus.stats.lastRunRefreshed + statbateStatus.stats.lastRunFailed)) * 100)
                      : 0}%
                  </div>
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Current Status Section */}
          <CollapsibleSection
            title="Current Status"
            defaultCollapsed={true}
            className="mb-5"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="text-sm text-white/60">Interval</div>
                <div className="text-lg font-semibold text-white">{statbateStatus.config.intervalMinutes} min</div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="text-sm text-white/60">Batch Size</div>
                <div className="text-lg font-semibold text-white">{statbateStatus.config.batchSize}</div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="text-sm text-white/60">Max Per Run</div>
                <div className="text-lg font-semibold text-white">{statbateStatus.config.maxPersonsPerRun}</div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="text-sm text-white/60">Enabled</div>
                <div className="text-lg font-semibold text-white">{statbateStatus.config.enabled ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Configuration Section */}
          <CollapsibleSection
            title="Configuration"
            defaultCollapsed={statbateConfigCollapsed}
            className="mb-5"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.enabled}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, enabled: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Enable Job</span>
              </label>

              <div>
                <label className="block text-sm text-white/60 mb-1">Interval (min)</label>
                <input
                  type="number"
                  value={statbateConfigForm.intervalMinutes}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, intervalMinutes: parseInt(e.target.value) || 360 })}
                  min="60"
                  max="1440"
                  className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">Max Per Run</label>
                <input
                  type="number"
                  value={statbateConfigForm.maxPersonsPerRun}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, maxPersonsPerRun: parseInt(e.target.value) || 1000 })}
                  min="10"
                  max="10000"
                  className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">Batch Size</label>
                <input
                  type="number"
                  value={statbateConfigForm.batchSize}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, batchSize: parseInt(e.target.value) || 5 })}
                  min="1"
                  max="20"
                  className="w-full p-2.5 border border-white/20 rounded-md text-base bg-white/5 text-white focus:outline-none focus:border-mhc-primary"
                />
              </div>
            </div>

            {/* Prioritization Section */}
            <h4 className="text-sm font-semibold text-white/70 uppercase mt-4 mb-3">Prioritization (in order)</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeWatchlist}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeWatchlist: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Watchlist</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeFollowing}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeFollowing: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Following</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeFollowers}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeFollowers: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Followers</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeBanned}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeBanned: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Banned</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeLive}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeLive: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Live</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeDoms}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeDoms: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Doms</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeFriends}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeFriends: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Friends</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeSubs}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeSubs: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Subs</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeTippedMe}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeTippedMe: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Tipped Me</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={statbateConfigForm.prioritizeTippedByMe}
                  onChange={(e) => setStatbateConfigForm({ ...statbateConfigForm, prioritizeTippedByMe: e.target.checked })}
                  className="mr-2 w-4 h-4 accent-mhc-primary"
                />
                <span className="text-sm text-white/90">Tipped By Me</span>
              </label>
            </div>

            <button
              onClick={handleStatbateConfigUpdate}
              disabled={loading}
              className="px-4 py-2 rounded-md font-semibold transition-all bg-mhc-primary text-white hover:bg-mhc-primary-dark disabled:opacity-50"
            >
              Save Configuration
            </button>
          </CollapsibleSection>
        </>
      )}

      {!statbateStatus && (
        <div className="text-center p-10 text-white/60">
          Loading Statbate API status...
        </div>
      )}
    </>
  );

  // Toggle job expansion
  const toggleJob = (jobId: string) => {
    setExpandedJobs(prev => ({ ...prev, [jobId]: !prev[jobId] }));
  };

  // Expandable Jobs tab with collapsible rows
  const renderJobsTab = () => (
    <div className="space-y-3">
      {/* Affiliate API Job Row */}
      <div className="bg-mhc-surface-light rounded-lg border border-white/10 overflow-hidden">
        <div
          className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('affiliate')}
        >
          <span className="text-white/40">{expandedJobs['affiliate'] ? '▼' : '▶'}</span>
          {jobStatus && (
            <JobStatusButton
              isRunning={jobStatus.isRunning}
              isProcessing={jobStatus.isProcessing}
              enabled={jobStatus.config.enabled}
              onStart={() => handleJobControl('start')}
              onStop={() => handleJobControl('stop')}
              disabled={loading}
              hasRun={jobStatus.stats.totalRuns > 0}
            />
          )}
          <span className="font-semibold text-white">Affiliate API</span>
          {jobStatus && (
            <span className="text-mhc-text-muted text-sm ml-auto">
              Total: {jobStatus.stats.totalEnriched.toLocaleString()} enriched
            </span>
          )}
        </div>
        {/* Progress row when processing */}
        {jobStatus?.isProcessing && jobStatus.stats.currentUsername && (
          <div className="px-4 pb-3 -mt-1">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-blue-300 text-sm">Loading Affiliate API details for: <span className="font-bold text-white">{jobStatus.stats.currentUsername}</span></span>
                <span className="text-blue-300 text-sm">{jobStatus.stats.progress} / {jobStatus.stats.total}</span>
              </div>
              <div className="w-full bg-blue-500/20 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${jobStatus.stats.total > 0 ? (jobStatus.stats.progress / jobStatus.stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {expandedJobs['affiliate'] && (
          <div className="border-t border-white/10 p-4">
            {renderAffiliateJobContent()}
          </div>
        )}
      </div>

      {/* Profile Capture Job Row */}
      <div className="bg-mhc-surface-light rounded-lg border border-white/10 overflow-hidden">
        <div
          className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('scraping')}
        >
          <span className="text-white/40">{expandedJobs['scraping'] ? '▼' : '▶'}</span>
          {profileScrapeStatus && (
            <JobStatusButton
              isRunning={profileScrapeStatus.isRunning}
              isProcessing={profileScrapeStatus.isProcessing}
              enabled={profileScrapeStatus.config.enabled}
              onStart={() => handleProfileScrapeJobControl('start')}
              onStop={() => handleProfileScrapeJobControl('stop')}
              disabled={loading}
              extraDisabled={!hasCookies}
              hasRun={profileScrapeStatus.stats.totalRuns > 0}
            />
          )}
          <span className="font-semibold text-white">Profile Capture</span>
          {profileScrapeStatus && (
            <span className="text-mhc-text-muted text-sm ml-auto">
              Total: {profileScrapeStatus.stats.totalScraped.toLocaleString()} captured
            </span>
          )}
        </div>
        {/* Progress row when processing */}
        {profileScrapeStatus?.isProcessing && profileScrapeStatus.stats.currentUsername && (
          <div className="px-4 pb-3 -mt-1">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-blue-300 text-sm">Capturing profile details for: <span className="font-bold text-white">{profileScrapeStatus.stats.currentUsername}</span></span>
                <span className="text-blue-300 text-sm">{profileScrapeStatus.stats.progress} / {profileScrapeStatus.stats.total}</span>
              </div>
              <div className="w-full bg-blue-500/20 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${profileScrapeStatus.stats.total > 0 ? (profileScrapeStatus.stats.progress / profileScrapeStatus.stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {expandedJobs['scraping'] && (
          <div className="border-t border-white/10 p-4">
            {renderScrapingJobContent()}
          </div>
        )}
      </div>

      {/* Statbate API Job Row */}
      <div className="bg-mhc-surface-light rounded-lg border border-white/10 overflow-hidden">
        <div
          className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => toggleJob('statbate')}
        >
          <span className="text-white/40">{expandedJobs['statbate'] ? '▼' : '▶'}</span>
          {statbateStatus && (
            <JobStatusButton
              isRunning={statbateStatus.isRunning}
              isProcessing={statbateStatus.isProcessing}
              enabled={statbateStatus.config.enabled}
              onStart={() => handleStatbateJobControl('start')}
              onStop={() => handleStatbateJobControl('stop')}
              disabled={loading}
              hasRun={statbateStatus.stats.totalRuns > 0}
            />
          )}
          <span className="font-semibold text-white">Statbate API</span>
          {statbateStatus && (
            <span className="text-mhc-text-muted text-sm ml-auto">
              Total: {statbateStatus.stats.totalRefreshed.toLocaleString()} refreshed
            </span>
          )}
        </div>
        {/* Progress row when processing */}
        {statbateStatus?.isProcessing && statbateStatus.stats.currentUsername && (
          <div className="px-4 pb-3 -mt-1">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-blue-300 text-sm">Loading Statbate API details for: <span className="font-bold text-white">{statbateStatus.stats.currentUsername}</span></span>
                <span className="text-blue-300 text-sm">{statbateStatus.stats.progress} / {statbateStatus.stats.total}</span>
              </div>
              <div className="w-full bg-blue-500/20 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${statbateStatus.stats.total > 0 ? (statbateStatus.stats.progress / statbateStatus.stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {expandedJobs['statbate'] && (
          <div className="border-t border-white/10 p-4">
            {renderStatbateJobContent()}
          </div>
        )}
      </div>
    </div>
  );

  // Stats History Section Component
  const StatsHistorySection: React.FC = () => {
    const [historyRecords, setHistoryRecords] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [dateFilter, setDateFilter] = useState<{ start: Date | null; end: Date | null; preset: DatePreset }>({
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date(),
      preset: '7d',
    });
    const [growthData, setGrowthData] = useState<{
      timeSeries: Array<{ timestamp: string; value: number }>;
      projection: {
        currentValue: number;
        averageGrowthPerDay: number;
        projectedValue: number;
        dataPoints: number;
      } | null;
    }>({ timeSeries: [], projection: null });
    const [growthLoading, setGrowthLoading] = useState(false);

    const fetchHistory = async (start: Date | null, end: Date | null) => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const params = new URLSearchParams();
        if (start) params.append('start', start.toISOString());
        if (end) params.append('end', end.toISOString());
        params.append('limit', '100');

        const response = await fetch(`/api/system/stats-history?${params}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setHistoryRecords(data.data.records);
          } else {
            setHistoryError('Failed to load stats history');
          }
        } else {
          setHistoryError('Failed to load stats history');
        }
      } catch (err) {
        setHistoryError('Failed to load stats history');
        console.error('Error fetching stats history:', err);
      } finally {
        setHistoryLoading(false);
      }
    };

    const fetchGrowthData = async (start: Date | null, end: Date | null) => {
      setGrowthLoading(true);
      try {
        // Fetch time series data
        const timeSeriesParams = new URLSearchParams();
        timeSeriesParams.append('statPath', 'media.total_image_size_bytes');
        if (start) timeSeriesParams.append('start', start.toISOString());
        if (end) timeSeriesParams.append('end', end.toISOString());
        timeSeriesParams.append('aggregation', 'hourly');

        const timeSeriesResponse = await fetch(`/api/system/stats-history/time-series?${timeSeriesParams}`);
        let timeSeries: Array<{ timestamp: string; value: number }> = [];
        if (timeSeriesResponse.ok) {
          const data = await timeSeriesResponse.json();
          if (data.success) {
            timeSeries = data.data;
          }
        }

        // Fetch growth projection
        const projectionParams = new URLSearchParams();
        projectionParams.append('statPath', 'media.total_image_size_bytes');
        projectionParams.append('periodDays', '30');
        projectionParams.append('projectToDays', '30');

        const projectionResponse = await fetch(`/api/system/stats-history/growth-projection?${projectionParams}`);
        let projection = null;
        if (projectionResponse.ok) {
          const data = await projectionResponse.json();
          if (data.success) {
            projection = data.data;
          }
        }

        setGrowthData({ timeSeries, projection });
      } catch (err) {
        console.error('Error fetching growth data:', err);
      } finally {
        setGrowthLoading(false);
      }
    };

    useEffect(() => {
      fetchHistory(dateFilter.start, dateFilter.end);
      fetchGrowthData(dateFilter.start, dateFilter.end);
    }, []);

    const handleFilterChange = (start: Date | null, end: Date | null, preset: DatePreset) => {
      setDateFilter({ start, end, preset });
      fetchHistory(start, end);
      fetchGrowthData(start, end);
    };

    return (
      <div className="space-y-6">
        {/* Date Filter */}
        <div className="flex items-center justify-between">
          <DateFilterBar
            onFilterChange={handleFilterChange}
            defaultPreset="7d"
          />
          <button
            onClick={() => fetchHistory(dateFilter.start, dateFilter.end)}
            className="px-3 py-1.5 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors text-sm"
          >
            Refresh
          </button>
        </div>

        {historyError && (
          <div className="p-3 px-4 rounded-md bg-red-500/15 border-l-4 border-red-500 text-red-300">
            {historyError}
          </div>
        )}

        {/* Growth Chart */}
        {!growthLoading && growthData.timeSeries.length > 0 && (
          <StorageGrowthChart
            data={growthData.timeSeries}
            title="Image Storage Growth"
            valueLabel="Size"
            averageGrowthPerDay={growthData.projection?.averageGrowthPerDay}
            projectedValue={growthData.projection?.projectedValue}
          />
        )}

        {growthLoading && (
          <div className="h-[300px] flex items-center justify-center text-mhc-text-muted bg-white/5 rounded-lg">
            Loading growth chart...
          </div>
        )}

        {/* History Table */}
        <div className="bg-white/5 rounded-lg p-4">
          <h4 className="text-mhc-text font-medium mb-4">Historical Snapshots</h4>
          <div className="max-h-[500px] overflow-y-auto">
            <StatsHistoryTable
              records={historyRecords}
              loading={historyLoading}
            />
          </div>
          {historyRecords.length > 0 && (
            <div className="mt-3 text-xs text-mhc-text-muted text-center">
              Showing {historyRecords.length} records
            </div>
          )}
        </div>
      </div>
    );
  };

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
                to="/people?tab=following"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.followingCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Following</div>
              </Link>
              <Link
                to="/people?tab=followers"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.followerCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Followers</div>
              </Link>
              <Link
                to="/people?tab=subs"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.subsCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Active Subs</div>
              </Link>
              <Link
                to="/people?tab=doms"
                className="text-center p-4 bg-gradient-to-br from-pink-600 to-pink-800 rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.activeDomsCount || 0}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Active Doms</div>
              </Link>
              <Link
                to="/people?tab=friends"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.friendsCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Friends</div>
              </Link>
              <Link
                to="/people?tab=watchlist"
                className="text-center p-4 bg-gradient-to-br from-yellow-600 to-yellow-800 rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.watchlistCount || 0}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Watchlist</div>
              </Link>
              <Link
                to="/people?tab=bans"
                className="text-center p-4 bg-gradient-to-br from-red-600 to-red-800 rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.following.bannedCount}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Banned</div>
              </Link>
            </div>
          </CollapsibleSection>

          {/* Database - Collapsible, collapsed by default */}
          <CollapsibleSection
            title="Database"
            defaultCollapsed={true}
            className="mb-5"
          >
            {/* Main stats in a single row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{formatBytes(systemStats.database.sizeBytes)}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Database Size</div>
              </div>
              <Link
                to="/people"
                className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity block no-underline"
              >
                <div className="text-2xl font-bold mb-1">{systemStats.database.totalPersons.toLocaleString()}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Total Persons</div>
              </Link>
              {/* Role breakdown cards */}
              {Object.entries(systemStats.database.byRole).map(([role, count]) => (
                <Link
                  key={role}
                  to={`/people?role=${role}`}
                  className="text-center p-4 bg-gradient-primary rounded-lg text-white hover:opacity-90 transition-opacity block no-underline"
                >
                  <div className="text-2xl font-bold mb-1">{count.toLocaleString()}</div>
                  <div className="text-xs opacity-90 uppercase tracking-wide">
                    {role === 'VIEWER' ? 'Viewers' : role === 'MODEL' ? 'Models' : role}
                  </div>
                </Link>
              ))}
            </div>
          </CollapsibleSection>

          {/* Media - Collapsible, collapsed by default */}
          <CollapsibleSection
            title="Media"
            defaultCollapsed={true}
            className="mb-5"
          >
            {/* Images and Videos stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{systemStats.database.imagesStored.toLocaleString()}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Images</div>
                {systemStats.database.imageSizeBytes > 0 && (
                  <div className="text-xs opacity-70">{formatBytes(systemStats.database.imageSizeBytes)}</div>
                )}
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{systemStats.database.videosStored.toLocaleString()}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Videos</div>
                {systemStats.database.videoSizeBytes > 0 && (
                  <div className="text-xs opacity-70">{formatBytes(systemStats.database.videoSizeBytes)}</div>
                )}
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-white">
                <div className="text-2xl font-bold mb-1">{systemStats.database.usersWithVideos || 0}</div>
                <div className="text-xs opacity-90 uppercase tracking-wide">Users with Videos</div>
              </div>
            </div>

            {/* Source breakdown */}
            {Object.keys(systemStats.database.bySource).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wide">Snapshots by Source</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {Object.entries(systemStats.database.bySource).map(([source, count]) => (
                    <div key={source} className="flex justify-between items-center p-2 bg-white/5 rounded-md border border-white/10 text-sm">
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

          {/* Stats History - Collapsible, collapsed by default */}
          <CollapsibleSection
            title="Stats History"
            defaultCollapsed={true}
            className="mb-5"
          >
            <StatsHistorySection />
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

  // Parse username from filename (e.g., "JasonTheGreat.png" or "JasonTheGreat-A.png" -> "JasonTheGreat")
  const parseUsernameFromFilename = (filename: string): string | null => {
    const match = filename.match(/^([^-.]+)(?:-[^.]+)?\.(?:jpe?g|png|gif|webp)$/i);
    return match ? match[1] : null;
  };

  // Handle file selection
  const handleBulkFileSelect = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f.name));

    if (imageFiles.length === 0) {
      return;
    }

    setBulkSelectedFiles(imageFiles);
    setBulkUploadResults(null);
    setBulkIsValidating(true);

    // Parse usernames from filenames
    const parsed: ParsedFile[] = imageFiles.map(file => ({
      file,
      username: parseUsernameFromFilename(file.name) || '',
      personExists: null,
    }));

    // Get unique usernames to validate
    const uniqueUsernames = Array.from(new Set(parsed.map(p => p.username).filter(u => u)));

    try {
      const response = await fetch('/api/profile/bulk/validate-usernames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: uniqueUsernames }),
      });
      const data = await response.json();
      const foundSet = new Set(data.found.map((u: string) => u.toLowerCase()));

      // Update parsed files with validation results
      const validated = parsed.map(p => ({
        ...p,
        personExists: p.username ? foundSet.has(p.username.toLowerCase()) : false,
      }));

      setBulkParsedFiles(validated);
    } catch (err) {
      console.error('Error validating usernames:', err);
      // Mark all as unknown on error
      setBulkParsedFiles(parsed.map(p => ({ ...p, personExists: false })));
    } finally {
      setBulkIsValidating(false);
    }
  };

  // Handle drag events
  const handleBulkDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setBulkDragActive(true);
    } else if (e.type === 'dragleave') {
      setBulkDragActive(false);
    }
  };

  const handleBulkDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBulkDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleBulkFileSelect(e.dataTransfer.files);
    }
  };

  // Handle upload
  const handleBulkUpload = async () => {
    const filesToUpload = bulkParsedFiles.filter(p => p.personExists);
    if (filesToUpload.length === 0) return;

    setBulkIsUploading(true);
    setBulkUploadProgress({ current: 0, total: filesToUpload.length });

    const formData = new FormData();
    filesToUpload.forEach(p => {
      formData.append('images', p.file);
    });

    try {
      const response = await fetch('/api/profile/bulk/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        // Server returned an error status
        const errorMsg = result.error || `Server error: ${response.status}`;
        console.error('Bulk upload error:', errorMsg);
        setBulkUploadResults({
          uploaded: [],
          skipped: filesToUpload.map(p => ({ filename: p.file.name, reason: errorMsg })),
        });
      } else {
        setBulkUploadResults(result);
      }
      setBulkUploadProgress(null);
    } catch (err) {
      console.error('Error uploading files:', err);
      const errorMsg = err instanceof Error ? err.message : 'Network error - upload failed';
      setBulkUploadResults({
        uploaded: [],
        skipped: filesToUpload.map(p => ({ filename: p.file.name, reason: errorMsg })),
      });
    } finally {
      setBulkIsUploading(false);
    }
  };

  // Reset bulk upload state
  const resetBulkUpload = () => {
    setBulkSelectedFiles([]);
    setBulkParsedFiles([]);
    setBulkUploadProgress(null);
    setBulkUploadResults(null);
    setBulkIsValidating(false);
    setBulkIsUploading(false);
  };

  // Group parsed files by username for preview
  const getGroupedParsedFiles = () => {
    const groups: Record<string, { username: string; files: ParsedFile[]; personExists: boolean | null }> = {};
    bulkParsedFiles.forEach(p => {
      const key = p.username.toLowerCase() || '__invalid__';
      if (!groups[key]) {
        groups[key] = { username: p.username, files: [], personExists: p.personExists };
      }
      groups[key].files.push(p);
    });
    return Object.values(groups).sort((a, b) => {
      // Sort: valid users first, then invalid filenames
      if (a.personExists && !b.personExists) return -1;
      if (!a.personExists && b.personExists) return 1;
      return a.username.localeCompare(b.username);
    });
  };

  const renderBulkUploadTab = () => {
    const groupedFiles = getGroupedParsedFiles();
    const validCount = bulkParsedFiles.filter(p => p.personExists).length;
    const invalidCount = bulkParsedFiles.filter(p => !p.personExists).length;

    return (
      <div className="bg-mhc-surface-light rounded-lg p-6">
        <h2 className="text-xl font-semibold text-mhc-text mb-6">Bulk Image Upload</h2>
        <p className="text-mhc-text-muted mb-4">
          Upload multiple images at once. Filenames should be in the format: <code className="bg-white/10 px-2 py-0.5 rounded font-mono">username.ext</code> or <code className="bg-white/10 px-2 py-0.5 rounded font-mono">username-suffix.ext</code>
        </p>

        {/* Results Display */}
        {bulkUploadResults && (
          <div className="mb-6">
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg mb-4">
              <h3 className="text-lg font-semibold text-green-400 mb-2">Upload Complete</h3>
              <p className="text-green-300">
                Successfully uploaded {bulkUploadResults.uploaded.length} images
                {bulkUploadResults.skipped.length > 0 && `, skipped ${bulkUploadResults.skipped.length} files`}
              </p>
            </div>
            {bulkUploadResults.skipped.length > 0 && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-4">
                <h4 className="text-md font-semibold text-yellow-400 mb-2">Skipped Files</h4>
                <ul className="text-yellow-300 text-sm space-y-1">
                  {bulkUploadResults.skipped.map((s, i) => (
                    <li key={i}><span className="font-mono">{s.filename}</span>: {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={resetBulkUpload}
              className="px-4 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors"
            >
              Upload More
            </button>
          </div>
        )}

        {/* Upload Progress */}
        {bulkIsUploading && bulkUploadProgress && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-400 mb-2">Uploading...</h3>
            <div className="w-full bg-gray-700 rounded-full h-4 mb-2">
              <div
                className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                style={{ width: `${(bulkUploadProgress.current / bulkUploadProgress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-blue-300 text-sm">
              {bulkUploadProgress.current} / {bulkUploadProgress.total} files
            </p>
          </div>
        )}

        {/* File Selection / Drop Zone */}
        {!bulkUploadResults && !bulkIsUploading && bulkParsedFiles.length === 0 && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              bulkDragActive
                ? 'border-mhc-primary bg-mhc-primary/10'
                : 'border-white/30 hover:border-white/50'
            }`}
            onDragEnter={handleBulkDrag}
            onDragLeave={handleBulkDrag}
            onDragOver={handleBulkDrag}
            onDrop={handleBulkDrop}
          >
            <div className="text-4xl mb-4">📁</div>
            <p className="text-mhc-text mb-4">
              Drag and drop image files here, or click to select
            </p>
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp"
              onChange={(e) => e.target.files && handleBulkFileSelect(e.target.files)}
              className="hidden"
              id="bulk-file-input"
            />
            <label
              htmlFor="bulk-file-input"
              className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors cursor-pointer inline-block"
            >
              Select Files
            </label>
          </div>
        )}

        {/* Validating */}
        {bulkIsValidating && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-blue-300">Validating usernames...</p>
          </div>
        )}

        {/* Preview */}
        {!bulkUploadResults && !bulkIsUploading && !bulkIsValidating && bulkParsedFiles.length > 0 && (
          <div>
            <div className="mb-4 p-4 bg-white/5 rounded-lg">
              <p className="text-mhc-text">
                <span className="font-semibold">{bulkParsedFiles.length}</span> files selected for{' '}
                <span className="font-semibold">{groupedFiles.length}</span> users
              </p>
              <p className="text-sm text-mhc-text-muted">
                <span className="text-green-400">{validCount} will upload</span>
                {invalidCount > 0 && <span className="text-yellow-400 ml-2">({invalidCount} skipped - user not found)</span>}
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto mb-4 border border-white/10 rounded-lg">
              <table className="w-full">
                <thead className="bg-mhc-surface sticky top-0 z-10 shadow-md">
                  <tr>
                    <th className="text-left p-3 text-mhc-text-muted font-medium border-b border-white/10">Username</th>
                    <th className="text-left p-3 text-mhc-text-muted font-medium border-b border-white/10">Files</th>
                    <th className="text-left p-3 text-mhc-text-muted font-medium border-b border-white/10">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedFiles.map((group, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="p-3 text-mhc-text font-mono">
                        {group.username || (
                          <span className="text-red-400">
                            Invalid filename
                            {group.files[0]?.file?.name && (
                              <span className="text-red-300 ml-1 text-xs">({group.files[0].file.name})</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-mhc-text-muted">
                        {group.files.length} {group.files.length === 1 ? 'file' : 'files'}
                      </td>
                      <td className="p-3">
                        {group.personExists ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/50">
                            Found
                          </span>
                        ) : group.username ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">
                            User '{group.username}' not found
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/50">
                            Invalid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleBulkUpload}
                disabled={validCount === 0}
                className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload {validCount} {validCount === 1 ? 'Image' : 'Images'}
              </button>
              <button
                onClick={resetBulkUpload}
                className="px-6 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

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
              activeTab === 'bulk-upload'
                ? 'bg-mhc-primary/15 text-mhc-primary border-mhc-primary border-b-mhc-primary font-semibold'
                : 'bg-mhc-surface/60 text-white/90 hover:bg-mhc-primary/10 hover:text-mhc-primary-light hover:border-mhc-primary/40'
            }`}
            onClick={() => setActiveTab('bulk-upload')}
          >
            Bulk Upload
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

      {successMessage && (
        <div className="p-3 px-4 rounded-md mb-5 bg-emerald-500/15 border-l-4 border-emerald-500 text-emerald-300">
          {successMessage}
        </div>
      )}

      <div className="mt-4">
        {activeTab === 'jobs' && renderJobsTab()}
        {activeTab === 'system-stats' && renderSystemStatsTab()}
        {activeTab === 'bulk-upload' && renderBulkUploadTab()}
        {activeTab === 'settings' && (
          <div className="bg-mhc-surface-light rounded-lg p-6">
            <h2 className="text-xl font-semibold text-mhc-text mb-6">Settings</h2>

            {/* Broadcast Section */}
            <div className="mb-4">
              <CollapsibleSection title="Broadcast" defaultCollapsed={true} className="bg-mhc-surface">
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
              </CollapsibleSection>
            </div>

            {/* AI Section */}
            <div className="mb-4">
              <CollapsibleSection title="AI" defaultCollapsed={true} className="bg-mhc-surface">
                {broadcastSettings && (
                  <div className="space-y-6">
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
                    <div className="pt-4 border-t border-white/10">
                      <button
                        onClick={saveBroadcastSettings}
                        disabled={settingsSaving}
                        className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {settingsSaving ? 'Saving...' : 'Save AI Settings'}
                      </button>
                    </div>
                  </div>
                )}
              </CollapsibleSection>
            </div>

            {/* Media Section */}
            <div className="mb-4">
              <CollapsibleSection title="Media" defaultCollapsed={true} className="bg-mhc-surface">
                {/* Note Line Limit */}
                <div className="mb-6">
                  <label className="block text-mhc-text mb-2 font-medium">
                    Note Line Limit
                  </label>
                  <p className="text-mhc-text-muted text-sm mb-2">
                    Number of lines to show before "Read More" link appears on profile notes.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={noteLineLimit}
                      onChange={(e) => setNoteLineLimit(parseInt(e.target.value) || 6)}
                      className="w-24 px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none"
                    />
                    <span className="text-mhc-text-muted">lines</span>
                    <button
                      onClick={saveNoteLineLimit}
                      disabled={noteLineLimitSaving}
                      className="px-4 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {noteLineLimitSaving ? 'Saving...' : 'Save'}
                    </button>
                    {noteLineLimitSuccess && (
                      <span className="text-green-400 text-sm">{noteLineLimitSuccess}</span>
                    )}
                  </div>
                </div>

                {/* Image Upload Settings */}
                <div className="mb-6 pt-4 border-t border-white/10">
                  <h4 className="text-mhc-text font-medium mb-4">Image Upload Limits</h4>
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
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <label className="w-48 text-mhc-text">Manual Upload:</label>
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
                      <div className="flex items-center gap-4">
                        <label className="w-48 text-mhc-text">External URL Import:</label>
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
                      <div className="flex items-center gap-4">
                        <label className="w-48 text-mhc-text">Screenshot Capture:</label>
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
                      <button
                        onClick={saveImageSettings}
                        disabled={imageSettingsSaving}
                        className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {imageSettingsSaving ? 'Saving...' : 'Save Image Settings'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-mhc-text-muted">No image settings available</div>
                  )}
                </div>

                {/* Video Upload Settings */}
                <div className="pt-4 border-t border-white/10">
                  <h4 className="text-mhc-text font-medium mb-4">Video Upload Limits</h4>
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
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <label className="w-48 text-mhc-text">Max Video Size:</label>
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
                      <button
                        onClick={saveVideoSettings}
                        disabled={videoSettingsSaving}
                        className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {videoSettingsSaving ? 'Saving...' : 'Save Video Settings'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-mhc-text-muted">No video settings available</div>
                  )}
                </div>
              </CollapsibleSection>
            </div>

            {/* Storage Section */}
            <div className="mb-4">
              <CollapsibleSection title="Storage" defaultCollapsed={true} className="bg-mhc-surface">
                {storageError && (
                  <div className="p-3 px-4 rounded-md mb-4 bg-red-500/15 border-l-4 border-red-500 text-red-300">
                    {storageError}
                  </div>
                )}
                {storageSuccess && (
                  <div className="p-3 px-4 rounded-md mb-4 bg-green-500/15 border-l-4 border-green-500 text-green-300">
                    {storageSuccess}
                  </div>
                )}
                {storageLoading ? (
                  <div className="text-mhc-text-muted">Loading storage settings...</div>
                ) : storageConfig && storageStatus ? (
                  <div className="space-y-6">
                    {/* Status Display */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className={`p-4 rounded-lg border ${
                        storageStatus.currentWriteBackend === 'docker'
                          ? 'border-emerald-500/50 bg-emerald-500/15'
                          : storageStatus.docker.available
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-white/10 bg-white/5'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${
                            storageStatus.currentWriteBackend === 'docker'
                              ? 'bg-emerald-500'
                              : storageStatus.docker.available
                                ? 'bg-amber-500'
                                : 'bg-gray-500'
                          }`}></span>
                          <span className="font-medium text-mhc-text">Docker Volume</span>
                          {storageStatus.currentWriteBackend === 'docker' ? (
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-medium">Primary</span>
                          ) : storageStatus.docker.available && (
                            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-medium">Backup</span>
                          )}
                        </div>
                        <div className="text-sm text-mhc-text-muted">
                          <div>{storageStatus.docker.fileCount.toLocaleString()} files</div>
                          <div className="text-xs truncate">{storageStatus.docker.path}</div>
                        </div>
                      </div>
                      <div className={`p-4 rounded-lg border ${
                        storageStatus.currentWriteBackend === 'ssd'
                          ? 'border-emerald-500/50 bg-emerald-500/15'
                          : storageStatus.ssd.available
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-red-500/30 bg-red-500/5'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${
                            storageStatus.currentWriteBackend === 'ssd'
                              ? 'bg-emerald-500'
                              : storageStatus.ssd.available
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}></span>
                          <span className="font-medium text-mhc-text">SSD Mount</span>
                          {storageStatus.currentWriteBackend === 'ssd' ? (
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-medium">Primary</span>
                          ) : storageStatus.ssd.available ? (
                            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-medium">Backup</span>
                          ) : (
                            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-medium">Unavailable</span>
                          )}
                        </div>
                        <div className="text-sm text-mhc-text-muted space-y-1">
                          <div className="flex justify-between items-center">
                            <span>{storageStatus.ssd.fileCount.toLocaleString()} files</span>
                            {storageStatus.ssd.diskSpace && (
                              <span className="text-xs">{formatBytes(storageStatus.ssd.diskSpace.used)}</span>
                            )}
                          </div>
                          <div className="text-xs space-y-0.5 mt-3">
                            <div className="truncate" title={storageStatus.ssd.hostPath}>
                              <span className="text-mhc-text-muted/60">Host:</span> {storageStatus.ssd.hostPath}
                            </div>
                            <div className="truncate" title={storageStatus.ssd.path}>
                              <span className="text-mhc-text-muted/60">Container:</span> {storageStatus.ssd.path}
                            </div>
                          </div>
                          {/* Disk Space */}
                          {storageStatus.ssd.diskSpace && (
                            <div className="mt-3 pt-3 border-t border-white/10">
                              <div className="flex justify-between text-xs mb-1">
                                <span>Capacity:</span>
                                <span>{formatBytes(storageStatus.ssd.diskSpace.used)} / {formatBytes(storageStatus.ssd.diskSpace.total)}</span>
                              </div>
                              <div className="w-full bg-white/10 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    storageStatus.ssd.diskSpace.usedPercent > 90
                                      ? 'bg-red-500'
                                      : storageStatus.ssd.diskSpace.usedPercent > 75
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.max(storageStatus.ssd.diskSpace.usedPercent > 0 ? 2 : 0, storageStatus.ssd.diskSpace.usedPercent)}%` }}
                                ></div>
                              </div>
                              <div className="text-xs mt-1 text-right">
                                {formatBytes(storageStatus.ssd.diskSpace.free)} free ({(100 - storageStatus.ssd.diskSpace.usedPercent).toFixed(1)}%)
                              </div>
                            </div>
                          )}
                          {/* Error State */}
                          {!storageStatus.ssd.available && storageStatus.ssd.lastError && (
                            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
                              <div className="font-medium">Error:</div>
                              <div className="truncate">{storageStatus.ssd.lastError}</div>
                              {storageStatus.ssd.unavailableSince && (
                                <div className="mt-1 text-red-400">
                                  Unavailable since: {formatDate(storageStatus.ssd.unavailableSince)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`p-4 rounded-lg border ${
                        storageStatus.currentWriteBackend === 's3'
                          ? 'border-emerald-500/50 bg-emerald-500/15'
                          : storageStatus.s3.available
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-white/10 bg-white/5'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${
                            storageStatus.currentWriteBackend === 's3'
                              ? 'bg-emerald-500'
                              : storageStatus.s3.available
                                ? 'bg-amber-500'
                                : 'bg-gray-500'
                          }`}></span>
                          <span className="font-medium text-mhc-text">AWS S3</span>
                          {storageStatus.currentWriteBackend === 's3' ? (
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-medium">Primary</span>
                          ) : storageStatus.s3.available && (
                            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-medium">Backup</span>
                          )}
                        </div>
                        <div className="text-sm text-mhc-text-muted">
                          <div>{storageStatus.s3.fileCount.toLocaleString()} files</div>
                          <div className="text-xs truncate">{storageStatus.s3.bucket || 'Not configured'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Current Write Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Last Write Info */}
                      <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                        <h4 className="text-mhc-text font-medium mb-2 text-sm">Last Write Operation</h4>
                        {storageStatus.lastWrite.timestamp ? (
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-mhc-text-muted">Destination:</span>
                              <span className={storageStatus.lastWrite.destination ? 'text-emerald-400' : 'text-red-400'}>
                                {storageStatus.lastWrite.destination ? storageStatus.lastWrite.destination.toUpperCase() : 'Failed'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-mhc-text-muted">Time:</span>
                              <span className="text-mhc-text">{formatDate(storageStatus.lastWrite.timestamp)}</span>
                            </div>
                            {storageStatus.lastWrite.path && (
                              <div>
                                <span className="text-mhc-text-muted">Path:</span>
                                <div className="text-mhc-text text-xs mt-1 p-2 bg-black/20 rounded font-mono break-all">{storageStatus.lastWrite.path}</div>
                              </div>
                            )}
                            {storageStatus.lastWrite.error && (
                              <div className="text-red-400 text-xs mt-2">
                                Error: {storageStatus.lastWrite.error}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-mhc-text-muted text-sm">No writes recorded</div>
                        )}
                      </div>

                      {/* Queue Status */}
                      <div className={`p-4 border rounded-lg ${
                        storageStatus.queue && storageStatus.queue.length > 0
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : 'bg-white/5 border-white/10'
                      }`}>
                        <h4 className={`font-medium mb-2 text-sm ${
                          storageStatus.queue && storageStatus.queue.length > 0 ? 'text-amber-400' : 'text-mhc-text'
                        }`}>Write Queue</h4>
                        {storageStatus.queue && storageStatus.queue.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-amber-300/80 text-sm">Pending operations</span>
                              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-medium">
                                {storageStatus.queue.length} queued
                              </span>
                            </div>
                            <p className="text-xs text-amber-300/70">
                              Operations queued because SSD was unavailable.
                            </p>
                            {storageStatus.queue.oldestOperation && (
                              <p className="text-xs text-amber-400/70">
                                Oldest: {formatDate(storageStatus.queue.oldestOperation)}
                              </p>
                            )}
                            <button
                              onClick={async () => {
                                try {
                                  const response = await fetch('/api/storage/queue/process', { method: 'POST' });
                                  const data = await response.json();
                                  if (data.success) {
                                    setStorageSuccess(`Queue processed: ${data.data.processed} completed, ${data.data.remaining} remaining`);
                                    fetchStorageSettings();
                                    setTimeout(() => setStorageSuccess(null), 5000);
                                  } else {
                                    setStorageError(data.error || 'Failed to process queue');
                                  }
                                } catch (err) {
                                  setStorageError('Failed to process queue');
                                }
                              }}
                              className="px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors text-sm"
                            >
                              Process Now
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-mhc-text-muted">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span>No pending operations</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Global Mode */}
                    <div>
                      <label className="block text-mhc-text mb-2 font-medium">Global Mode</label>
                      <p className="text-mhc-text-muted text-sm mb-2">
                        Choose where new files are stored by default.
                      </p>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-mhc-text cursor-pointer">
                          <input
                            type="radio"
                            name="globalMode"
                            checked={storageConfig.globalMode === 'local'}
                            onChange={() => setStorageConfig({...storageConfig, globalMode: 'local'})}
                            className="text-mhc-primary"
                          />
                          Local (Docker/SSD)
                        </label>
                        <label className="flex items-center gap-2 text-mhc-text cursor-pointer">
                          <input
                            type="radio"
                            name="globalMode"
                            checked={storageConfig.globalMode === 'remote'}
                            onChange={() => setStorageConfig({...storageConfig, globalMode: 'remote'})}
                            className="text-mhc-primary"
                          />
                          Remote (S3)
                        </label>
                      </div>
                    </div>

                    {/* External S3 Settings */}
                    <div className="border border-white/10 rounded-lg p-4">
                      <h4 className="text-mhc-text font-medium mb-4">External Storage (S3)</h4>
                      <div className="space-y-4">
                        <label className="flex items-center gap-2 text-mhc-text text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={storageConfig.external.enabled}
                            onChange={(e) => setStorageConfig({
                              ...storageConfig,
                              external: {...storageConfig.external, enabled: e.target.checked}
                            })}
                            className="rounded text-mhc-primary"
                          />
                          Enable S3 Storage
                        </label>
                        {storageConfig.external.enabled && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-mhc-text-muted text-xs mb-1">Bucket Name</label>
                                <input
                                  type="text"
                                  value={storageConfig.external.s3Bucket}
                                  onChange={(e) => setStorageConfig({
                                    ...storageConfig,
                                    external: {...storageConfig.external, s3Bucket: e.target.value}
                                  })}
                                  placeholder="mhc-media-prod"
                                  className="w-full px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-mhc-text-muted text-xs mb-1">Region</label>
                                <input
                                  type="text"
                                  value={storageConfig.external.s3Region}
                                  onChange={(e) => setStorageConfig({
                                    ...storageConfig,
                                    external: {...storageConfig.external, s3Region: e.target.value}
                                  })}
                                  placeholder="us-east-2"
                                  className="w-full px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none text-sm"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-mhc-text-muted text-xs mb-1">Access Key ID</label>
                                <input
                                  type="text"
                                  value={storageConfig.external.s3AccessKeyId}
                                  onChange={(e) => setStorageConfig({
                                    ...storageConfig,
                                    external: {...storageConfig.external, s3AccessKeyId: e.target.value}
                                  })}
                                  placeholder="AKIA..."
                                  className="w-full px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none text-sm font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-mhc-text-muted text-xs mb-1">Secret Access Key</label>
                                <input
                                  type="password"
                                  value={storageConfig.external.s3SecretAccessKey}
                                  onChange={(e) => setStorageConfig({
                                    ...storageConfig,
                                    external: {...storageConfig.external, s3SecretAccessKey: e.target.value}
                                  })}
                                  placeholder="••••••••••••••••"
                                  className="w-full px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none text-sm font-mono"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-mhc-text-muted text-xs mb-1">Key Prefix</label>
                                <input
                                  type="text"
                                  value={storageConfig.external.s3Prefix}
                                  onChange={(e) => setStorageConfig({
                                    ...storageConfig,
                                    external: {...storageConfig.external, s3Prefix: e.target.value}
                                  })}
                                  placeholder="mhc/media/"
                                  className="w-full px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none text-sm"
                                />
                                <p className="text-xs text-mhc-text-muted mt-1">Path prefix in the S3 bucket (e.g., mhc/media/)</p>
                              </div>
                              <div>
                                <label className="block text-mhc-text-muted text-xs mb-1">Cache Max Size (MB)</label>
                                <input
                                  type="number"
                                  value={storageConfig.external.cacheMaxSizeMb}
                                  onChange={(e) => setStorageConfig({
                                    ...storageConfig,
                                    external: {...storageConfig.external, cacheMaxSizeMb: parseInt(e.target.value) || 5000}
                                  })}
                                  className="w-full px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                      <button
                        onClick={saveStorageSettings}
                        disabled={storageSaving}
                        className="px-6 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {storageSaving ? 'Saving...' : 'Save Storage Settings'}
                      </button>
                    </div>

                    {/* Media Transfer Section */}
                    <div className="border border-white/10 rounded-lg p-4 mt-6">
                      <h4 className="text-mhc-text font-medium mb-4">Media Transfer</h4>
                      <p className="text-mhc-text-muted text-sm mb-4">
                        Transfer media files between storage providers. Files are safely copied, verified with SHA256, then deleted from source.
                      </p>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/job/media-transfer/run-now', { method: 'POST' });
                              const data = await response.json();
                              if (data.success) {
                                setStorageSuccess(data.message || 'Transfer started');
                                setTimeout(() => setStorageSuccess(null), 5000);
                              } else {
                                setStorageError(data.message || 'Transfer failed');
                              }
                            } catch (err) {
                              setStorageError('Failed to start transfer');
                            }
                          }}
                          className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors text-sm"
                        >
                          Run Transfer Now
                        </button>
                        <span className="text-mhc-text-muted text-sm">
                          Transfers files from Docker to the configured destination (SSD or S3)
                        </span>
                      </div>
                      <p className="text-xs text-mhc-text-muted mt-3">
                        Note: For SSD storage on Docker Desktop for Mac, the SSD path must be added as a bind mount in docker-compose.yml.
                        Due to Docker Desktop limitations, external volumes (/Volumes/*) cannot be mounted directly.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-mhc-text-muted">No storage settings available</div>
                )}
              </CollapsibleSection>
            </div>

            {/* Theme Section */}
            <div className="mb-4">
              <CollapsibleSection title="Theme" defaultCollapsed={true} className="bg-mhc-surface">
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
              </CollapsibleSection>
            </div>

            {/* Chaturbate Sync Section (moved from separate tab) */}
            <div className="mb-4">
              <CollapsibleSection title="Chaturbate Sync" defaultCollapsed={true} className="bg-mhc-surface">
                {/* Chaturbate Session */}
                <div className="mb-4 p-4 bg-white/5 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-white font-medium">Session Authentication</h4>
                    {hasCookies ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Authenticated</span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/50">Not Authenticated</span>
                    )}
                  </div>
                  <p className="text-white/60 text-sm mb-3">
                    Import your Chaturbate session cookies to enable syncing of your following and followers lists.
                  </p>
                  <button
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                      hasCookies
                        ? 'bg-gray-500 text-white hover:bg-gray-600'
                        : 'bg-mhc-primary text-white hover:bg-indigo-600'
                    }`}
                    onClick={() => setShowCookieDialog(true)}
                  >
                    {hasCookies ? 'Update Cookies' : 'Import Cookies'}
                  </button>
                  {cookieStatus && (
                    <div className="p-3 px-4 rounded-md mt-3 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300 text-sm">
                      {cookieStatus}
                    </div>
                  )}
                </div>

                {/* Sync Connections */}
                <div className="p-4 bg-white/5 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-white font-medium">Sync Connections</h4>
                    {lastSyncDate && (
                      <span className="text-white/50 text-xs">
                        Last synced: {new Date(lastSyncDate).toLocaleDateString()} {new Date(lastSyncDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-sm mb-3">
                    Sync your following and followers lists from Chaturbate.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="px-4 py-2 rounded-md text-sm font-semibold transition-all bg-mhc-primary text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAutoScrape('following')}
                      disabled={scraping || !hasCookies}
                    >
                      {scraping ? 'Syncing...' : 'Sync Following'}
                    </button>
                    <button
                      className="px-4 py-2 rounded-md text-sm font-semibold transition-all bg-mhc-primary text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAutoScrape('followers')}
                      disabled={scraping || !hasCookies}
                    >
                      {scraping ? 'Syncing...' : 'Sync Followers'}
                    </button>
                  </div>
                  {!hasCookies && (
                    <div className="p-3 px-4 rounded-md mt-3 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300 text-sm">
                      Import cookies first to enable syncing.
                    </div>
                  )}
                  {scrapeStatus && (
                    <div className="p-3 px-4 rounded-md mt-3 bg-amber-500/15 border-l-4 border-amber-500 text-amber-300 text-sm">
                      {scrapeStatus}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>

            {/* Stats Collection Section */}
            <div className="mb-4">
              <CollapsibleSection title="Stats Collection" defaultCollapsed={true} className="bg-mhc-surface">
                {statsCollectionError && (
                  <div className="p-3 px-4 rounded-md mb-4 bg-red-500/15 border-l-4 border-red-500 text-red-300">
                    {statsCollectionError}
                  </div>
                )}
                {statsCollectionSuccess && (
                  <div className="p-3 px-4 rounded-md mb-4 bg-green-500/15 border-l-4 border-green-500 text-green-300">
                    {statsCollectionSuccess}
                  </div>
                )}
                {statsCollectionLoading ? (
                  <div className="text-mhc-text-muted">Loading stats collection settings...</div>
                ) : statsCollectionStatus ? (
                  <div className="space-y-6">
                    {/* Status Display */}
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${
                          statsCollectionStatus.isProcessing
                            ? 'bg-blue-500 animate-pulse'
                            : statsCollectionStatus.isRunning
                              ? 'bg-emerald-500'
                              : 'bg-gray-500'
                        }`}></span>
                        <div>
                          <div className="font-medium text-mhc-text">
                            {statsCollectionStatus.isProcessing
                              ? 'Collecting Stats...'
                              : statsCollectionStatus.isRunning
                                ? 'Running'
                                : 'Stopped'}
                          </div>
                          {statsCollectionStatus.stats.lastRun && (
                            <div className="text-xs text-mhc-text-muted">
                              Last run: {new Date(statsCollectionStatus.stats.lastRun).toLocaleString()}
                              {statsCollectionStatus.stats.lastCollectionDurationMs > 0 && (
                                <span className="ml-2">({statsCollectionStatus.stats.lastCollectionDurationMs}ms)</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={runStatsCollectionNow}
                          disabled={statsCollectionStatus.isProcessing}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Run Now
                        </button>
                        {statsCollectionStatus.isRunning ? (
                          <button
                            onClick={stopStatsCollection}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                          >
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={startStatsCollection}
                            disabled={!statsCollectionStatus.config.enabled}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Start
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Stats Summary */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-white/5 rounded-lg text-center">
                        <div className="text-2xl font-bold text-mhc-text">{statsCollectionStatus.stats.totalSnapshots}</div>
                        <div className="text-xs text-mhc-text-muted">Total Snapshots</div>
                      </div>
                      <div className="p-3 bg-white/5 rounded-lg text-center">
                        <div className="text-2xl font-bold text-mhc-text">{statsCollectionStatus.stats.totalRuns}</div>
                        <div className="text-xs text-mhc-text-muted">Total Runs</div>
                      </div>
                      <div className="p-3 bg-white/5 rounded-lg text-center">
                        <div className="text-2xl font-bold text-mhc-text">{statsCollectionStatus.config.intervalMinutes}</div>
                        <div className="text-xs text-mhc-text-muted">Minutes Interval</div>
                      </div>
                    </div>

                    {statsCollectionStatus.stats.lastError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <div className="text-sm text-red-400">Last Error: {statsCollectionStatus.stats.lastError}</div>
                      </div>
                    )}

                    {/* Configuration */}
                    <div className="pt-4 border-t border-white/10">
                      <h4 className="text-mhc-text font-medium mb-4">Configuration</h4>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-mhc-text">Enable Stats Collection</label>
                            <p className="text-xs text-mhc-text-muted">Automatically collect system stats on a schedule</p>
                          </div>
                          <button
                            onClick={() => saveStatsCollectionConfig({ enabled: !statsCollectionStatus.config.enabled })}
                            disabled={statsCollectionSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              statsCollectionStatus.config.enabled ? 'bg-emerald-600' : 'bg-gray-600'
                            } disabled:opacity-50`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                statsCollectionStatus.config.enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        <div>
                          <label className="block text-mhc-text mb-2">Collection Interval (minutes)</label>
                          <p className="text-xs text-mhc-text-muted mb-2">How often to collect and store system stats</p>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min="5"
                              max="1440"
                              value={statsCollectionStatus.config.intervalMinutes}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 60;
                                setStatsCollectionStatus({
                                  ...statsCollectionStatus,
                                  config: { ...statsCollectionStatus.config, intervalMinutes: value }
                                });
                              }}
                              className="w-24 px-3 py-2 bg-mhc-surface border border-white/20 rounded-md text-mhc-text focus:border-mhc-primary focus:outline-none"
                            />
                            <button
                              onClick={() => saveStatsCollectionConfig({ intervalMinutes: statsCollectionStatus.config.intervalMinutes })}
                              disabled={statsCollectionSaving}
                              className="px-4 py-2 bg-mhc-primary text-white rounded-md hover:bg-mhc-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                              {statsCollectionSaving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                          <p className="text-xs text-mhc-text-muted mt-2">
                            Recommended: 60 minutes. Lower values create more data but use more storage.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                      <p className="text-xs text-mhc-text-muted">
                        Stats collection captures user segments, database size, media counts, and activity metrics for historical trend analysis.
                        View collected data in the <Link to="/admin?tab=system-stats" className="text-mhc-primary hover:underline">System Stats</Link> tab.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-mhc-text-muted">No stats collection data available</div>
                )}
              </CollapsibleSection>
            </div>

            {/* Data Sources Section (moved from separate tab) */}
            <div className="mb-4">
              <CollapsibleSection title="Data Sources" defaultCollapsed={true} className="bg-mhc-surface">
                <div className="flex flex-col gap-3">
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Chaturbate Affiliate API</div>
                      <div className="text-xs text-white/60">Real-time online models data</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Active</span>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">CBHours API</div>
                      <div className="text-xs text-white/60">Historical tracking and rank data</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/50">Ready</span>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Chaturbate Events API</div>
                      <div className="text-xs text-white/60">Room events (tips, follows, etc.)</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Active</span>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Chaturbate Stats API</div>
                      <div className="text-xs text-white/60">Broadcast statistics</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Active</span>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">StatBate API</div>
                      <div className="text-xs text-white/60">Tips and member analysis</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">On-Demand</span>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Profile Scraping</div>
                      <div className="text-xs text-white/60">Bio, photos, social links</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-green-500/20 text-green-400 border border-green-500/50">Active</span>
                  </div>
                </div>
                <p className="text-white/50 text-xs mt-4">
                  Data source priority is configured via the <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono">v_person_current_state</code> database view.
                </p>
              </CollapsibleSection>
            </div>
          </div>
        )}
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
    </div>
  );
};

export default Admin;
