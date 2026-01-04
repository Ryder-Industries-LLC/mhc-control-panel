import React from 'react';
import { Link } from 'react-router-dom';
import {
  BasePerson,
  PriorityLookup,
  isPersonLive,
  getLastActiveTime,
  getImageUrl,
  getRoleBadgeClass,
  getFriendTierBadge,
} from '../../types/people';
import { formatDate } from '../../utils/formatting';

export interface UserCardProps {
  person: BasePerson;
  priorityLookup?: PriorityLookup | null;
  showLiveIndicator?: boolean;
  showPriorityIndicator?: boolean;
  showFollowingIndicators?: boolean;
  showTags?: boolean;
  maxTags?: number;
  extraBadges?: React.ReactNode;
  onClick?: () => void;
  onTagClick?: (tag: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({
  person,
  priorityLookup,
  showLiveIndicator = true,
  showPriorityIndicator = true,
  showFollowingIndicators = true,
  showTags = true,
  maxTags = 5,
  extraBadges,
  onClick,
  onTagClick,
}) => {
  const imageUrl = getImageUrl(person.image_url);
  const isLive = isPersonLive(person);
  const lastActive = getLastActiveTime(person);
  const tierBadge = getFriendTierBadge(person.friend_tier ?? null);

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on a link or tag
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('.tag-chip')) {
      return;
    }
    onClick?.();
  };

  return (
    <div
      className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden transition-all hover:border-mhc-primary/50 hover:shadow-lg hover:shadow-mhc-primary/20 hover:-translate-y-1 ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Image container with 4:3 aspect ratio */}
      <div className="relative aspect-[4/3] bg-mhc-surface overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={person.username}
            loading="lazy"
            className="w-full h-full object-cover transition-transform hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
        )}

        {/* Live indicator - top right */}
        {showLiveIndicator && isLive && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded font-semibold animate-pulse shadow-lg">
            LIVE
          </span>
        )}

        {/* Priority indicator - top left */}
        {showPriorityIndicator && priorityLookup && (
          <span className="absolute top-2 left-2 bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-bold shadow-lg">
            P{priorityLookup.priority_level}
          </span>
        )}

        {/* Following/Follower indicators - bottom left */}
        {showFollowingIndicators && (person.following || person.follower) && (
          <div className="absolute bottom-2 left-2 flex gap-1">
            {person.following && (
              <span className="bg-emerald-500/90 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold shadow">
                Following
              </span>
            )}
            {person.follower && (
              <span className="bg-orange-500/90 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold shadow">
                Follower
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="p-3 space-y-2">
        {/* Top row: Role badge + Username */}
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !text-[0.6rem] !px-1.5 !py-0.5`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-white font-medium truncate hover:text-mhc-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
        </div>

        {/* Status badges row */}
        <div className="flex flex-wrap gap-1">
          {person.active_sub && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              SUB
            </span>
          )}
          {person.watch_list && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
              WATCH
            </span>
          )}
          {person.banned_me && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
              Banned
            </span>
          )}
          {tierBadge && (
            <span className={`${tierBadge.class} !text-[10px] !px-1.5 !py-0.5`}>
              T{person.friend_tier}
            </span>
          )}
          {extraBadges}
        </div>

        {/* Last active + Image count */}
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>
            {lastActive ? formatDate(lastActive, { relative: true }) : 'Never seen'}
          </span>
          {person.image_count !== undefined && person.image_count > 0 && (
            <Link
              to={`/profile/${person.username}?tab=images`}
              className="text-mhc-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {person.image_count} img{person.image_count !== 1 ? 's' : ''}
            </Link>
          )}
        </div>

        {/* Tags */}
        {showTags && person.tags && person.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {person.tags.slice(0, maxTags).map((tag, idx) => (
              <span
                key={idx}
                className="tag-chip inline-block px-1.5 py-0.5 bg-purple-500/15 border border-purple-500/30 rounded-lg text-[10px] text-purple-400 cursor-pointer transition-all hover:bg-purple-500/25 hover:border-purple-500/50"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
              >
                {tag}
              </span>
            ))}
            {person.tags.length > maxTags && (
              <span className="text-[10px] text-white/40">+{person.tags.length - maxTags}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserCard;
