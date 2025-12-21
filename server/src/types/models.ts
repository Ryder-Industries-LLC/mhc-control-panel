// Domain model types

export type PersonRole = 'MODEL' | 'VIEWER' | 'BOTH' | 'UNKNOWN';
export type Platform = 'chaturbate';

export interface Person {
  id: string;
  username: string;
  platform: Platform;
  role: PersonRole;
  rid: number | null;
  did: number | null;
  first_seen_at: Date;
  last_seen_at: Date;
  is_excluded: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PersonAlias {
  id: string;
  person_id: string;
  alias: string;
  platform: Platform;
  valid_from: Date;
  valid_to: Date | null;
  created_at: Date;
}

export type SnapshotSource = 'statbate_member' | 'statbate_model' | 'cb_stats' | 'manual';

export interface Snapshot {
  id: string;
  person_id: string;
  source: SnapshotSource;
  captured_at: Date;
  raw_payload: Record<string, unknown>;
  normalized_metrics: Record<string, unknown> | null;
  created_at: Date;
}

export type InteractionType =
  | 'CHAT_MESSAGE'
  | 'PRIVATE_MESSAGE'
  | 'TIP_EVENT'
  | 'PROFILE_PASTE'
  | 'CHAT_IMPORT'
  | 'MANUAL_NOTE'
  | 'FOLLOW'
  | 'UNFOLLOW'
  | 'USER_ENTER'
  | 'USER_LEAVE'
  | 'FANCLUB_JOIN'
  | 'MEDIA_PURCHASE';

export type InteractionSource = 'cb_events' | 'statbate_plus' | 'manual';

export interface Interaction {
  id: string;
  person_id: string;
  stream_session_id: string | null;
  type: InteractionType;
  content: string;
  timestamp: Date;
  source: InteractionSource;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export type SessionStatus = 'LIVE' | 'ENDED';

export interface StreamSession {
  id: string;
  platform: Platform;
  broadcaster: string;
  started_at: Date;
  ended_at: Date | null;
  status: SessionStatus;
  created_at: Date;
  updated_at: Date;
}

export type AttributeConfidence = 'low' | 'medium' | 'high';
export type AttributeEvidenceType = 'snapshot' | 'interaction' | 'manual';

export interface Attribute {
  id: string;
  person_id: string;
  key: string;
  value: string;
  confidence: AttributeConfidence;
  evidence_type: AttributeEvidenceType | null;
  evidence_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
}

export interface WatchlistMember {
  id: string;
  watchlist_id: string;
  person_id: string;
  added_at: Date;
}
