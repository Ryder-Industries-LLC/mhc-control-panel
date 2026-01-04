// People/Users page type definitions

// Base person interface - shared fields across all segments
export interface BasePerson {
  id: string;
  username: string;
  platform: string;
  role: string;
  rid: number | null;
  did: number | null;
  first_seen_at: string;
  last_seen_at: string;
  source: string;
  interaction_count: number;
  snapshot_count: number;
  image_count: number;
  image_url: string | null;
  current_show: string | null;
  session_observed_at: string | null;
  tags: string[] | null;
  age: number | null;
  following: boolean;
  follower: boolean;
  banned_me?: boolean;
  active_sub?: boolean;
  friend_tier?: number | null;
  watch_list?: boolean;
}

// Extended types for specific segments
export interface FollowingPerson extends BasePerson {
  following_since: string | null;
}

export interface FollowerPerson extends BasePerson {
  follower_since: string | null;
}

export interface UnfollowedPerson extends BasePerson {
  follower_since: string | null;
  unfollower_at: string | null;
  days_followed: number | null;
}

export interface SubPerson extends BasePerson {
  active_sub: boolean;
  first_service_date: string | null;
  last_service_date: string | null;
  notes: string | null;
  friend_tier: number | null;
  banned_me: boolean;
}

export interface FriendPerson extends BasePerson {
  friend_tier: number;
  notes: string | null;
  active_sub: boolean;
  first_service_date: string | null;
  last_service_date: string | null;
  banned_me: boolean;
}

export interface DomPerson extends BasePerson {
  service_level: string;
  service_types: string[];
  dom_started_at: string | null;
  dom_ended_at: string | null;
  dom_notes: string | null;
  friend_tier: number | null;
}

export interface BannedPerson extends BasePerson {
  banned_me: boolean;
  banned_at: string | null;
  notes: string | null;
  friend_tier: number | null;
  active_sub: boolean;
}

export interface TipperPerson extends BasePerson {
  total_tokens: number;
  tip_count: number;
  last_tip_date: string | null;
}

// Tab/segment type
export type TabType =
  | 'directory'
  | 'following'
  | 'followers'
  | 'unfollowed'
  | 'subs'
  | 'doms'
  | 'friends'
  | 'bans'
  | 'watchlist'
  | 'tipped-by-me'
  | 'tipped-me';

// Stat filter type for combinable filters
export type StatFilter =
  | 'live'
  | 'with_image'
  | 'models'
  | 'viewers'
  | 'following'
  | 'friends'
  | 'watchlist';

// Priority lookup from queue
export interface PriorityLookup {
  id: string;
  username: string;
  priority_level: 1 | 2;
  status: 'pending' | 'completed' | 'active';
  created_at: string;
  completed_at: string | null;
  last_checked_at: string | null;
  notes: string | null;
}

// Feed cache status
export interface FeedCacheStatus {
  exists: boolean;
  fresh: boolean;
  timestamp: string | null;
  ageMs: number | null;
  roomCount: number;
  totalCount: number;
}

// Segment configuration for layout
export interface SegmentConfig {
  id: TabType;
  label: string;
  color?: 'primary' | 'yellow' | 'emerald' | 'purple' | 'orange' | 'gray' | 'red' | 'amber' | 'blue';
}

// Count item for stats grid
export interface CountItem {
  id: string;
  label: string;
  value: number;
  color: 'default' | 'red' | 'purple' | 'blue' | 'emerald' | 'yellow' | 'orange' | 'primary';
  clickable?: boolean;
}

// Active filter for filter bar
export interface ActiveFilter {
  id: string;
  label: string;
  type: 'stat' | 'text' | 'tag' | 'role' | 'custom';
}

// Sort option
export interface SortOption {
  value: string;
  label: string;
}

// Column configuration for tables
export interface ColumnConfig<T> {
  id: string;
  header: string;
  width?: string;
  sortable?: boolean;
  sortField?: keyof T;
  align?: 'left' | 'center' | 'right';
  render: (person: T, helpers: RenderHelpers) => React.ReactNode;
}

// Render helpers passed to column render functions
export interface RenderHelpers {
  formatDate: (date: string, options?: { relative?: boolean; includeTime?: boolean }) => string;
  getImageUrl: (url: string | null) => string | null;
  isPersonLive: (person: BasePerson) => boolean;
  getLastActiveTime: (person: BasePerson) => string | null;
  getRoleBadgeClass: (role: string) => string;
  getFriendTierBadge: (tier: number | null) => { class: string; label: string } | null;
  navigate: (path: string) => void;
  onTagClick?: (tag: string) => void;
  onAction?: (action: string, person: BasePerson) => void;
}

// Relationship model types (from unified relationships table)
export type RoleType = 'Dom' | 'Sub' | 'Friend' | 'Custom';

export type RelationshipStatus =
  | 'Potential'
  | 'Occasional'
  | 'Active'
  | 'On Hold'
  | 'Inactive'
  | 'Decommissioned'
  | 'Banished';

export interface Relationship {
  id: string;
  profile_id: number;
  roles: RoleType[];
  custom_role_label: string | null;
  status: RelationshipStatus;
  traits: string[];
  since_date: string | null;
  until_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Person with relationship data joined
export interface PersonWithRelationship extends BasePerson {
  relationship?: Relationship | null;
}

// Page size options constant
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// Default tag presets for Directory
export const TAG_PRESETS = [
  'smoke', 'master', 'leather', 'bdsm', 'findom',
  'dirty', 'fetish', 'daddy', 'alpha', 'dom', 'slave', 'bulge'
];

// Default segments configuration
export const SEGMENTS: SegmentConfig[] = [
  { id: 'directory', label: 'Directory', color: 'primary' },
  { id: 'following', label: 'Following', color: 'emerald' },
  { id: 'followers', label: 'Followers', color: 'blue' },
  { id: 'unfollowed', label: 'Unfollowed', color: 'gray' },
  { id: 'subs', label: 'Subs', color: 'emerald' },
  { id: 'doms', label: 'Doms', color: 'purple' },
  { id: 'friends', label: 'Friends', color: 'yellow' },
  { id: 'bans', label: 'Bans', color: 'red' },
  { id: 'watchlist', label: 'Watchlist', color: 'orange' },
  { id: 'tipped-by-me', label: 'Tipped By Me', color: 'amber' },
  { id: 'tipped-me', label: 'Tipped Me', color: 'emerald' },
];

// Sort options for Directory
export const DIRECTORY_SORT_OPTIONS: SortOption[] = [
  { value: 'session_observed_at-desc', label: 'Last Active (Newest)' },
  { value: 'session_observed_at-asc', label: 'Last Active (Oldest)' },
  { value: 'username-asc', label: 'Username (A-Z)' },
  { value: 'username-desc', label: 'Username (Z-A)' },
  { value: 'interaction_count-desc', label: 'Most Interactions' },
  { value: 'image_count-desc', label: 'Most Images' },
  { value: 'first_seen_at-desc', label: 'First Seen (Newest)' },
  { value: 'first_seen_at-asc', label: 'First Seen (Oldest)' },
];

// Utility function: Check if person is live (observed within 30 minutes)
export const isPersonLive = (person: BasePerson): boolean => {
  if (!person.session_observed_at || !person.current_show) return false;
  const observedAt = new Date(person.session_observed_at);
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return observedAt > thirtyMinutesAgo;
};

// Utility function: Get last active time (prioritize session_observed_at)
export const getLastActiveTime = (person: BasePerson): string | null => {
  return person.session_observed_at || null;
};

// Utility function: Get image URL with proper path handling
export const getImageUrl = (url: string | null): string | null => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return url;
  return `/images/${url}`;
};

// Utility function: Get role badge class
export const getRoleBadgeClass = (role: string): string => {
  switch (role) {
    case 'MODEL':
      return 'inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-purple-500/20 text-purple-400 border border-purple-500/30';
    case 'VIEWER':
      return 'inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-blue-500/20 text-blue-400 border border-blue-500/30';
    default:
      return 'inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-gray-500/20 text-gray-400 border border-gray-500/30';
  }
};

// Utility function: Get friend tier badge
export const getFriendTierBadge = (tier: number | null): { class: string; label: string } | null => {
  if (!tier) return null;
  switch (tier) {
    case 1:
      return {
        class: 'inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
        label: 'Special'
      };
    case 2:
      return {
        class: 'inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
        label: 'Tipper'
      };
    case 3:
      return {
        class: 'inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-blue-500/20 text-blue-400 border border-blue-500/30',
        label: 'Regular'
      };
    case 4:
      return {
        class: 'inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-500/20 text-gray-400 border border-gray-500/30',
        label: 'Drive-by'
      };
    default:
      return null;
  }
};

// Utility function: Get relationship status badge class
export const getRelationshipStatusClass = (status: RelationshipStatus): string => {
  switch (status) {
    case 'Active':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'Occasional':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'Potential':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    case 'On Hold':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'Inactive':
      return 'bg-gray-600/20 text-gray-500 border-gray-600/30';
    case 'Decommissioned':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'Banished':
      return 'bg-red-600/20 text-red-500 border-red-600/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

// Utility function: Get service level badge class (for Doms)
export const getServiceLevelClass = (level: string): string => {
  switch (level) {
    case 'Actively Serving':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'Potential':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'Ended':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    case 'Paused':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    default:
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  }
};
