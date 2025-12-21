// Statbate Premium API response types based on statbate_openapi.json

export type Site = 'chaturbate' | 'stripchat' | 'bongacams' | 'camsoda' | 'mfc';
export type Gender = 0 | 1 | 2 | 3; // 0=unknown/male, 1=female, 2=trans, 3=couple

export interface MemberInfo {
  name: string;
  did: number;
  first_message_date: string | null;
  first_tip_date: string | null;
  last_tip_date: string | null;
  last_tip_amount: number;
  models_messaged_2weeks: number;
  models_messaged_2weeks_list: string[];
  models_tipped_2weeks: number;
  models_tipped_2weeks_list: string[];
  per_day_tokens: Array<{ date: string; tokens: number }>;
  all_time_tokens: number;
}

export interface MemberInfoResponse {
  data: MemberInfo;
  meta: {
    site: string;
    timezone: string;
  };
}

export interface MemberInfoBatchResponse {
  data: Array<MemberInfo & { error?: string | null }>;
  meta: {
    site: string;
    timezone: string;
    found: number;
    requested: number;
  };
}

export interface ModelInfo {
  name: string;
  rid: number;
  gender: Gender;
  rank: number;
  sessions: {
    count: number;
    total_duration: number;
    average_duration: number;
  };
  income: {
    tokens: number;
    usd: number;
  };
  tags: Array<{
    name: string;
    category: string;
  }>;
}

export interface ModelInfoResponse {
  data: ModelInfo;
  meta: {
    site: string;
    range: [string, string];
    timezone: string;
  };
}

export interface ModelActivity {
  name: string;
  rid: number;
  gender: Gender;
  summary: {
    total_sessions: number;
    public_sessions: number;
    total_duration: number;
    average_duration: number;
  };
  sessions: Array<{
    start_time: string;
    end_time: string;
    duration: number;
  }>;
}

export interface ModelActivityResponse {
  data: ModelActivity;
  meta: {
    site: string;
    range: [string, string];
    timezone: string;
  };
}

export interface Tip {
  time: string;
  name?: string; // For member tips
  did?: number; // For member tips
  model?: string; // For model tips
  rid?: number; // For model tips
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

export interface TopModel {
  position: number;
  name: string;
  rid: number;
  gender: Gender;
  total_tokens: number;
  total_usd: number;
  days: number;
  daily_tokens: number;
  daily_usd: number;
}

export interface TopModelsResponse {
  data: TopModel[];
  meta: {
    site: string;
    range: [string, string];
    timezone: string;
  };
}
