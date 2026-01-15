import React from 'react';
import {
  BasePerson,
  FollowingPerson,
  FollowerPerson,
  UnfollowedPerson,
  BannedPerson,
  TipperPerson,
  ColumnConfig,
} from '../../../types/people';
import {
  getUsernameColumn,
  getImageColumn,
  getRatingColumn,
  getAgeColumn,
  getTagsColumn,
  getImagesCountColumn,
  getLastActiveColumn,
} from './baseColumns';

/**
 * All tab columns follow the standard structure:
 * Username | Image | Rating | Age | Tags | Images | Last Active | [Segment Specific]
 *
 * Segment-specific columns are appended after Last Active
 */

// Following tab columns
export function getFollowingColumns(
  onRatingChange?: (username: string, rating: number) => void
): ColumnConfig<FollowingPerson>[] {
  const followingSinceColumn: ColumnConfig<FollowingPerson> = {
    id: 'following_since',
    header: 'Following Since',
    width: '120px',
    sortable: true,
    sortField: 'following_since',
    render: (person, { formatDate }) => (
      <span>{person.following_since ? formatDate(person.following_since, { includeTime: false }) : '\u2014'}</span>
    ),
  };

  return [
    getUsernameColumn<FollowingPerson>(),
    getImageColumn<FollowingPerson>(),
    getRatingColumn<FollowingPerson>(onRatingChange),
    getAgeColumn<FollowingPerson>(),
    getTagsColumn<FollowingPerson>(),
    getImagesCountColumn<FollowingPerson>(),
    getLastActiveColumn<FollowingPerson>(),
    followingSinceColumn,
  ];
}

// Followers tab columns
export function getFollowersColumns(
  onRatingChange?: (username: string, rating: number) => void
): ColumnConfig<FollowerPerson>[] {
  const followerSinceColumn: ColumnConfig<FollowerPerson> = {
    id: 'follower_since',
    header: 'Follower Since',
    width: '120px',
    sortable: true,
    sortField: 'follower_since',
    render: (person, { formatDate }) => (
      <span>{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '\u2014'}</span>
    ),
  };

  return [
    getUsernameColumn<FollowerPerson>(),
    getImageColumn<FollowerPerson>(),
    getRatingColumn<FollowerPerson>(onRatingChange),
    getAgeColumn<FollowerPerson>(),
    getTagsColumn<FollowerPerson>(),
    getImagesCountColumn<FollowerPerson>(),
    getLastActiveColumn<FollowerPerson>(),
    followerSinceColumn,
  ];
}

// Unfollowed tab columns
export function getUnfollowedColumns(
  onRatingChange?: (username: string, rating: number) => void
): ColumnConfig<UnfollowedPerson>[] {
  const unfollowedAtColumn: ColumnConfig<UnfollowedPerson> = {
    id: 'unfollower_at',
    header: 'Unfollowed At',
    width: '120px',
    sortable: true,
    sortField: 'unfollower_at',
    render: (person, { formatDate }) => (
      <span>{person.unfollower_at ? formatDate(person.unfollower_at, { relative: true }) : '\u2014'}</span>
    ),
  };

  const wasFollowingSinceColumn: ColumnConfig<UnfollowedPerson> = {
    id: 'follower_since',
    header: 'Was Following Since',
    width: '130px',
    sortable: true,
    sortField: 'follower_since',
    render: (person, { formatDate }) => (
      <span>{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '\u2014'}</span>
    ),
  };

  return [
    getUsernameColumn<UnfollowedPerson>(),
    getImageColumn<UnfollowedPerson>(),
    getRatingColumn<UnfollowedPerson>(onRatingChange),
    getAgeColumn<UnfollowedPerson>(),
    getTagsColumn<UnfollowedPerson>(),
    getImagesCountColumn<UnfollowedPerson>(),
    getLastActiveColumn<UnfollowedPerson>(),
    unfollowedAtColumn,
    wasFollowingSinceColumn,
  ];
}

// Bans tab columns
export function getBansColumns(
  onRatingChange?: (username: string, rating: number) => void
): ColumnConfig<BannedPerson>[] {
  const bannedAtColumn: ColumnConfig<BannedPerson> = {
    id: 'banned_at',
    header: 'Banned At',
    width: '120px',
    sortable: true,
    sortField: 'banned_at',
    render: (person, { formatDate }) => (
      <span>{person.banned_at ? formatDate(person.banned_at, { relative: true }) : '\u2014'}</span>
    ),
  };

  return [
    getUsernameColumn<BannedPerson>(),
    getImageColumn<BannedPerson>(),
    getRatingColumn<BannedPerson>(onRatingChange),
    getAgeColumn<BannedPerson>(),
    getTagsColumn<BannedPerson>(),
    getImagesCountColumn<BannedPerson>(),
    getLastActiveColumn<BannedPerson>(),
    bannedAtColumn,
  ];
}

// Watchlist tab columns
export function getWatchlistColumns(
  onRatingChange?: (username: string, rating: number) => void
): ColumnConfig<BasePerson>[] {
  // Watchlist badge is shown in username column via banned_me/watch_list logic
  // Add a watch indicator column
  const watchBadgeColumn: ColumnConfig<BasePerson> = {
    id: 'watch_badge',
    header: 'Status',
    width: '80px',
    render: () => (
      <span className="bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded border border-orange-500/30">
        WATCH
      </span>
    ),
  };

  return [
    getUsernameColumn<BasePerson>(),
    getImageColumn<BasePerson>(),
    getRatingColumn<BasePerson>(onRatingChange),
    getAgeColumn<BasePerson>(),
    getTagsColumn<BasePerson>(),
    getImagesCountColumn<BasePerson>(),
    getLastActiveColumn<BasePerson>(),
    watchBadgeColumn,
  ];
}

// Tipped By Me tab columns
export function getTippedByMeColumns(
  onRatingChange?: (username: string, rating: number) => void
): ColumnConfig<TipperPerson>[] {
  const totalTokensColumn: ColumnConfig<TipperPerson> = {
    id: 'total_tokens',
    header: 'Total Tokens',
    width: '110px',
    align: 'center',
    sortable: true,
    sortField: 'total_tokens',
    render: (person) => (
      <span className="font-mono text-amber-400">{(person.total_tokens || 0).toLocaleString()}</span>
    ),
  };

  const tipCountColumn: ColumnConfig<TipperPerson> = {
    id: 'tip_count',
    header: 'Tips',
    width: '70px',
    align: 'center',
    sortable: true,
    sortField: 'tip_count',
    render: (person) => <span>{(person.tip_count || 0).toLocaleString()}</span>,
  };

  const lastTipColumn: ColumnConfig<TipperPerson> = {
    id: 'last_tip_date',
    header: 'Last Tip',
    width: '110px',
    sortable: true,
    sortField: 'last_tip_date',
    render: (person, { formatDate }) => (
      <span>{person.last_tip_date ? formatDate(person.last_tip_date, { relative: true }) : '\u2014'}</span>
    ),
  };

  return [
    getUsernameColumn<TipperPerson>(),
    getImageColumn<TipperPerson>(),
    getRatingColumn<TipperPerson>(onRatingChange),
    getAgeColumn<TipperPerson>(),
    getTagsColumn<TipperPerson>(),
    getImagesCountColumn<TipperPerson>(),
    getLastActiveColumn<TipperPerson>(),
    totalTokensColumn,
    tipCountColumn,
    lastTipColumn,
  ];
}

// Tipped Me tab columns
export function getTippedMeColumns(
  onRatingChange?: (username: string, rating: number) => void
): ColumnConfig<TipperPerson>[] {
  const totalTokensColumn: ColumnConfig<TipperPerson> = {
    id: 'total_tokens',
    header: 'Total Tokens',
    width: '110px',
    align: 'center',
    sortable: true,
    sortField: 'total_tokens',
    render: (person) => (
      <span className="font-mono text-emerald-400">{(person.total_tokens || 0).toLocaleString()}</span>
    ),
  };

  const tipCountColumn: ColumnConfig<TipperPerson> = {
    id: 'tip_count',
    header: 'Tips',
    width: '70px',
    align: 'center',
    sortable: true,
    sortField: 'tip_count',
    render: (person) => <span>{(person.tip_count || 0).toLocaleString()}</span>,
  };

  const lastTipColumn: ColumnConfig<TipperPerson> = {
    id: 'last_tip_date',
    header: 'Last Tip',
    width: '110px',
    sortable: true,
    sortField: 'last_tip_date',
    render: (person, { formatDate }) => (
      <span>{person.last_tip_date ? formatDate(person.last_tip_date, { relative: true }) : '\u2014'}</span>
    ),
  };

  return [
    getUsernameColumn<TipperPerson>(),
    getImageColumn<TipperPerson>(),
    getRatingColumn<TipperPerson>(onRatingChange),
    getAgeColumn<TipperPerson>(),
    getTagsColumn<TipperPerson>(),
    getImagesCountColumn<TipperPerson>(),
    getLastActiveColumn<TipperPerson>(),
    totalTokensColumn,
    tipCountColumn,
    lastTipColumn,
  ];
}
