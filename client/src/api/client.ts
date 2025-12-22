import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://mhc-control-panel.onrender.com';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

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

export interface LookupResponse {
  person: Person;
  latestSnapshot: Snapshot | null;
  delta: Record<string, unknown> | null;
  interactions: Interaction[];
  latestInteraction: Interaction | null;
  extractedUsernames: string[];
  statbateApiUrl: string | null;
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

export const api = {
  // Lookup API
  lookup: async (params: {
    username?: string;
    pastedText?: string;
    role?: string;
    includeStatbate?: boolean;
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
};

export default apiClient;
