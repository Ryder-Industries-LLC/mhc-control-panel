import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://mhc-control-panel-web.onrender.com';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  withCredentials: true, // Send cookies with requests
});

// Store CSRF token in memory
let csrfToken: string | null = null;

// Add CSRF token to state-changing requests
apiClient.interceptors.request.use((config) => {
  if (csrfToken && ['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

// Update CSRF token from responses
apiClient.interceptors.response.use(
  (response) => {
    const newCsrfToken = response.headers['x-csrf-token'];
    if (newCsrfToken) {
      csrfToken = newCsrfToken;
    }
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      const authPaths = ['/login', '/signup', '/verify-2fa', '/forgot-password'];
      if (!authPaths.some(path => window.location.pathname.startsWith(path))) {
        // Could redirect to login here if needed
      }
    }
    return Promise.reject(error);
  }
);

// Helper to set CSRF token (called from AuthContext)
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

// Helper to get device fingerprint for 2FA trust
function getDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    window.screen.width + 'x' + window.screen.height,
    new Date().getTimezoneOffset()
  ];
  return btoa(components.join('|'));
}

export interface Person {
  id: string;
  username: string;
  platform: string;
  role: string;
  rid: number | null;
  did: number | null;
  first_seen_at: string;
  last_seen_at: string;
  is_excluded: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonWithSource extends Person {
  source: string;
  interaction_count: number;
  snapshot_count: number;
  image_count: number;
  image_url: string | null;
  image_captured_at: string | null;
  current_show: string | null;
  session_observed_at: string | null;
  tags: string[] | null;
  age: number | null;
  following: boolean;
  follower: boolean;
  following_since: string | null;
  follower_since: string | null;
  unfollowed_at: string | null;
  unfollower_at: string | null;
}

export interface Snapshot {
  id: string;
  person_id: string;
  source: string;
  captured_at: string;
  raw_payload: Record<string, unknown>;
  normalized_metrics: Record<string, unknown> | null;
  created_at: string;
}

export interface Interaction {
  id: string;
  person_id: string;
  stream_session_id: string | null;
  type: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  source: string;
  timestamp: string;
  created_at: string;
}

export interface Session {
  id: string;
  platform: string;
  broadcaster: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ComparisonResult {
  period1Snapshot: Snapshot | null;
  period2Snapshot: Snapshot | null;
  comparisonDelta: Record<string, unknown> | null;
}

export interface Tip {
  time: string;
  name?: string;
  did?: number;
  model?: string;
  rid?: number;
  tokens: number;
  usd: number;
}

export interface TipsResponse {
  data: Tip[];
  meta: {
    site: string;
    range: [string, string];
    pagination: {
      total: number;
      per_page: number;
      current_page: number;
      last_page: number;
      from: number;
      to: number;
    };
  };
}

export interface LookupResponse {
  person: Person;
  latestSnapshot: Snapshot | null;
  delta: Record<string, unknown> | null;
  interactions: Interaction[];
  latestInteraction: Interaction | null;
  extractedUsernames: string[];
  statbateApiUrl: string | null;
  comparison?: ComparisonResult | null;
  memberTips?: TipsResponse | null;
}

export interface HudsonResponse {
  person: Person;
  cbStats: Record<string, unknown> | null;
  cbSnapshot: Snapshot | null;
  cbDelta: Record<string, unknown> | null;
  currentSession: Session | null;
  currentSessionStats: {
    totalInteractions: number;
    totalTips: number;
    uniqueUsers: number;
    durationMinutes: number | null;
  } | null;
  recentSessions: Session[];
  recentInteractions: Interaction[];
}

// Auth types
export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  authMethod: string;
  totpEnabled: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  roles: string[];
  permissions: string[];
  csrfToken: string;
}

export interface Auth2FAResponse {
  requires2FA: true;
  sessionId: string;
}

export interface AuthSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

export interface TotpDevice {
  id: string;
  name: string;
  isVerified: boolean;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
}

export interface TrustedDevice {
  id: string;
  deviceName: string | null;
  trustedAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

export const api = {
  // =====================
  // Auth API
  // =====================
  auth: {
    login: async (credentials: {
      email?: string;
      username?: string;
      subscriberId?: string;
      password: string;
    }): Promise<AuthResponse | Auth2FAResponse> => {
      const response = await apiClient.post('/api/auth/login', credentials);
      return response.data;
    },

    google: async (credential: string): Promise<AuthResponse | Auth2FAResponse> => {
      const response = await apiClient.post('/api/auth/google', { credential });
      return response.data;
    },

    signup: async (data: {
      authMethod: string;
      email?: string;
      username?: string;
      subscriberId?: string;
      password: string;
      displayName?: string;
    }): Promise<AuthResponse> => {
      const response = await apiClient.post('/api/auth/signup', data);
      return response.data;
    },

    verify2FA: async (
      sessionId: string,
      code: string,
      trustDevice = false
    ): Promise<AuthResponse> => {
      const response = await apiClient.post('/api/auth/verify-2fa', {
        sessionId,
        code,
        trustDevice,
        deviceFingerprint: trustDevice ? getDeviceFingerprint() : undefined
      });
      return response.data;
    },

    logout: async (): Promise<void> => {
      await apiClient.post('/api/auth/logout');
    },

    logoutAll: async (): Promise<{ sessionsRevoked: number }> => {
      const response = await apiClient.post('/api/auth/logout-all');
      return response.data;
    },

    me: async (): Promise<AuthResponse> => {
      const response = await apiClient.get('/api/auth/me');
      return response.data;
    },

    getSessions: async (): Promise<{ sessions: AuthSession[] }> => {
      const response = await apiClient.get('/api/auth/sessions');
      return response.data;
    },

    revokeSession: async (sessionId: string): Promise<void> => {
      await apiClient.delete(`/api/auth/sessions/${sessionId}`);
    },

    // 2FA Management
    setup2FA: async (deviceName?: string): Promise<{
      qrCode: string;
      manualEntryKey: string;
      deviceId: string;
    }> => {
      const response = await apiClient.post('/api/auth/2fa/setup', { deviceName });
      return response.data;
    },

    verify2FASetup: async (deviceId: string, code: string): Promise<{
      success: boolean;
      recoveryCodes: string[];
    }> => {
      const response = await apiClient.post('/api/auth/2fa/verify', { deviceId, code });
      return response.data;
    },

    get2FADevices: async (): Promise<{ devices: TotpDevice[] }> => {
      const response = await apiClient.get('/api/auth/2fa/devices');
      return response.data;
    },

    delete2FADevice: async (deviceId: string): Promise<void> => {
      await apiClient.delete(`/api/auth/2fa/devices/${deviceId}`);
    },

    regenerateRecoveryCodes: async (): Promise<{ recoveryCodes: string[] }> => {
      const response = await apiClient.post('/api/auth/2fa/recovery-codes');
      return response.data;
    },

    getRecoveryCodeCount: async (): Promise<{ remaining: number }> => {
      const response = await apiClient.get('/api/auth/2fa/recovery-codes/count');
      return response.data;
    },

    getTrustedDevices: async (): Promise<{ devices: TrustedDevice[] }> => {
      const response = await apiClient.get('/api/auth/2fa/trusted-devices');
      return response.data;
    },

    revokeTrustedDevice: async (deviceId: string): Promise<void> => {
      await apiClient.delete(`/api/auth/2fa/trusted-devices/${deviceId}`);
    },

    getConfig: async (): Promise<{
      googleEnabled: boolean;
      googleClientId: string | null;
    }> => {
      const response = await apiClient.get('/api/auth/config');
      return response.data;
    }
  },

  // =====================
  // Lookup API
  // =====================
  lookup: async (params: {
    username?: string;
    pastedText?: string;
    role?: string;
    includeStatbate?: boolean;
    dateRange?: {
      start: string;
      end: string;
    };
    comparisonDateRange?: {
      start: string;
      end: string;
    };
  }): Promise<LookupResponse> => {
    const response = await apiClient.post('/api/lookup', params);
    return response.data;
  },

  // Hudson API
  getHudson: async (): Promise<HudsonResponse> => {
    const response = await apiClient.get('/api/hudson');
    return response.data;
  },

  // Person API
  getAllPersons: async (limit = 100, offset = 0): Promise<{ persons: PersonWithSource[]; total: number }> => {
    const response = await apiClient.get('/api/person/all', {
      params: { limit, offset },
    });
    return response.data;
  },

  getPerson: async (id: string): Promise<Person> => {
    const response = await apiClient.get(`/api/person/${id}`);
    return response.data;
  },

  getPersonSnapshots: async (id: string): Promise<Snapshot[]> => {
    const response = await apiClient.get(`/api/person/${id}/snapshots`);
    return response.data;
  },

  getPersonInteractions: async (id: string): Promise<Interaction[]> => {
    const response = await apiClient.get(`/api/person/${id}/interactions`);
    return response.data;
  },

  addNote: async (id: string, note: string): Promise<void> => {
    await apiClient.post(`/api/person/${id}/note`, { note });
  },

  deletePerson: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/person/${id}`);
  },

  // Job API
  getJobStatus: async (): Promise<{ isRunning: boolean; isPaused: boolean; intervalMinutes: number }> => {
    const response = await apiClient.get('/api/job/status');
    return response.data;
  },

  pauseJob: async (): Promise<void> => {
    await apiClient.post('/api/job/pause');
  },

  resumeJob: async (): Promise<void> => {
    await apiClient.post('/api/job/resume');
  },

  startJob: async (intervalMinutes = 360): Promise<void> => {
    await apiClient.post('/api/job/start', { intervalMinutes });
  },

  stopJob: async (): Promise<void> => {
    await apiClient.post('/api/job/stop');
  },

  // Session API
  startSession: async (): Promise<Session> => {
    const response = await apiClient.post('/api/session/start');
    return response.data.session;
  },

  endSession: async (): Promise<Session> => {
    const response = await apiClient.post('/api/session/end');
    return response.data.session;
  },

  getCurrentSession: async (): Promise<{
    session: Session | null;
    stats: {
      totalInteractions: number;
      totalTips: number;
      uniqueUsers: number;
      durationMinutes: number | null;
    } | null;
  }> => {
    const response = await apiClient.get('/api/session/current');
    return response.data;
  },

  getSessions: async (): Promise<Session[]> => {
    const response = await apiClient.get('/api/sessions');
    return response.data;
  },

  // Username search
  searchUsernames: async (query: string): Promise<string[]> => {
    if (!query || query.length < 1) {
      return [];
    }
    const response = await apiClient.get('/api/person/search', {
      params: { q: query },
    });
    return response.data.usernames;
  },

  // Affiliate API - Priority Lookups
  addPriorityLookup: async (username: string, priorityLevel: 1 | 2, notes?: string): Promise<any> => {
    const response = await apiClient.post('/api/affiliate/priority/add', {
      username,
      priorityLevel,
      notes,
    });
    return response.data;
  },

  removePriorityLookup: async (username: string): Promise<void> => {
    await apiClient.delete(`/api/affiliate/priority/${username}`);
  },

  getPriorityLookups: async (): Promise<any[]> => {
    const response = await apiClient.get('/api/affiliate/priority');
    return response.data.lookups;
  },

  getPriorityLookupStats: async (): Promise<any> => {
    const response = await apiClient.get('/api/affiliate/priority/stats');
    return response.data;
  },

  getPriorityLookupsByLevel: async (level: 1 | 2): Promise<any[]> => {
    const response = await apiClient.get(`/api/affiliate/priority/level/${level}`);
    return response.data.lookups;
  },

  getPriorityLookupsByStatus: async (status: 'pending' | 'completed' | 'active'): Promise<any[]> => {
    const response = await apiClient.get(`/api/affiliate/priority/status/${status}`);
    return response.data.lookups;
  },

  // Affiliate API - On-Demand Lookup
  affiliateLookup: async (username: string): Promise<any> => {
    const response = await apiClient.post(`/api/affiliate/lookup/${username}`);
    return response.data;
  },

  // Affiliate API - Feed Cache
  getFeedCacheStatus: async (): Promise<any> => {
    const response = await apiClient.get('/api/affiliate/cache/status');
    return response.data;
  },

  clearFeedCache: async (): Promise<void> => {
    await apiClient.post('/api/affiliate/cache/clear');
  },

  // Followers API
  getUnfollowed: async (): Promise<{ unfollowed: any[]; total: number }> => {
    const response = await apiClient.get('/api/followers/unfollowed');
    return response.data;
  },

  // Settings API
  getSettings: async (): Promise<Record<string, { value: any; description: string | null; updatedAt: string }>> => {
    const response = await apiClient.get('/api/settings');
    return response.data;
  },

  getSetting: async (key: string): Promise<{ key: string; value: any }> => {
    const response = await apiClient.get(`/api/settings/${key}`);
    return response.data;
  },

  updateSetting: async (key: string, value: any, description?: string): Promise<{ key: string; value: any; description: string | null; updatedAt: string }> => {
    const response = await apiClient.put(`/api/settings/${key}`, { value, description });
    return response.data;
  },

  getBroadcastConfig: async (): Promise<{
    mergeGapMinutes: number;
    summaryDelayMinutes: number;
    aiSummaryDelayMinutes: number | null;
    aiSummaryDelayIsCustom: boolean;
  }> => {
    const response = await apiClient.get('/api/settings/broadcast/config');
    return response.data;
  },

  // Media Favorites
  toggleMediaFavorite: async (mediaId: string): Promise<any> => {
    const response = await apiClient.post(`/api/media/${mediaId}/favorite`);
    return response.data;
  },

  setMediaFavorite: async (mediaId: string, isFavorite: boolean): Promise<any> => {
    const response = await apiClient.put(`/api/media/${mediaId}/favorite`, { is_favorite: isFavorite });
    return response.data;
  },

  getFavoriteMedia: async (page = 1, pageSize = 50, mediaType?: 'image' | 'video'): Promise<{
    records: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (mediaType) params.append('mediaType', mediaType);
    const response = await apiClient.get(`/api/media/favorites?${params}`);
    return response.data;
  },

  getFavoriteStats: async (): Promise<{
    totalFavorites: number;
    imageCount: number;
    videoCount: number;
  }> => {
    const response = await apiClient.get('/api/media/favorites/stats');
    return response.data;
  },
};

export default apiClient;
