import React from 'react';
import { Link } from 'react-router-dom';
import {
  ColumnConfig,
  DomPerson,
  FriendPerson,
  SubPerson,
  getServiceLevelClass,
} from '../../../types/people';

// Unified columns for Friends, Subs, and Doms segments
// These share the same structure since they now use the unified Relationships model

export function getFriendsColumns(): ColumnConfig<FriendPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary no-underline font-medium transition-colors hover:text-indigo-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
          {person.banned_me && (
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
              Banned
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'image',
      header: 'Image',
      render: (person, { getImageUrl }) => {
        const imageUrl = getImageUrl(person.image_url);
        return imageUrl ? (
          <img
            src={imageUrl}
            alt={person.username}
            className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
          />
        ) : null;
      },
    },
    {
      id: 'friend_tier',
      header: 'Friend Tier',
      render: (person, { getFriendTierBadge }) => {
        const tierBadge = getFriendTierBadge(person.friend_tier);
        return tierBadge ? (
          <span className={tierBadge.class}>
            Tier {person.friend_tier} - {tierBadge.label}
          </span>
        ) : null;
      },
    },
    {
      id: 'active_sub',
      header: 'Active Sub',
      render: (person) =>
        person.active_sub ? (
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Yes
          </span>
        ) : (
          '\u2014'
        ),
    },
    {
      id: 'last_active',
      header: 'Last Active',
      render: (person, { getLastActiveTime, formatDate }) => {
        const lastActive = getLastActiveTime(person);
        return <span>{lastActive ? formatDate(lastActive, { relative: true }) : '\u2014'}</span>;
      },
    },
    {
      id: 'notes',
      header: 'Notes',
      render: (person) => (
        <span className="text-white/70 max-w-[200px] truncate block" title={person.notes || ''}>
          {person.notes || '\u2014'}
        </span>
      ),
    },
  ];
}

export function getSubsColumns(): ColumnConfig<SubPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary no-underline font-medium transition-colors hover:text-indigo-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
          {person.banned_me && (
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
              Banned
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'image',
      header: 'Image',
      render: (person, { getImageUrl }) => {
        const imageUrl = getImageUrl(person.image_url);
        return imageUrl ? (
          <img
            src={imageUrl}
            alt={person.username}
            className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
          />
        ) : null;
      },
    },
    {
      id: 'status',
      header: 'Status',
      render: (person) =>
        person.active_sub ? (
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Active
          </span>
        ) : (
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-500/20 text-gray-400 border border-gray-500/30">
            Past
          </span>
        ),
    },
    {
      id: 'first_service_date',
      header: 'First Service',
      render: (person, { formatDate }) => (
        <span>
          {person.first_service_date ? formatDate(person.first_service_date, { includeTime: false }) : '\u2014'}
        </span>
      ),
    },
    {
      id: 'last_service_date',
      header: 'Last Service',
      render: (person, { formatDate }) => (
        <span>
          {person.last_service_date ? formatDate(person.last_service_date, { includeTime: false }) : '\u2014'}
        </span>
      ),
    },
    {
      id: 'friend_tier',
      header: 'Friend Tier',
      render: (person, { getFriendTierBadge }) => {
        const tierBadge = getFriendTierBadge(person.friend_tier);
        return tierBadge ? (
          <span className={tierBadge.class}>
            Tier {person.friend_tier} - {tierBadge.label}
          </span>
        ) : (
          '\u2014'
        );
      },
    },
    {
      id: 'notes',
      header: 'Notes',
      render: (person) => (
        <span className="text-white/70 max-w-[200px] truncate block" title={person.notes || ''}>
          {person.notes || '\u2014'}
        </span>
      ),
    },
  ];
}

export function getDomsColumns(): ColumnConfig<DomPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary no-underline font-medium transition-colors hover:text-indigo-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
          {person.banned_me && (
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
              Banned
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'image',
      header: 'Image',
      render: (person, { getImageUrl }) => {
        const imageUrl = getImageUrl(person.image_url);
        return imageUrl ? (
          <img
            src={imageUrl}
            alt={person.username}
            className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
          />
        ) : null;
      },
    },
    {
      id: 'service_level',
      header: 'Service Level',
      render: (person) => (
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${getServiceLevelClass(person.service_level)}`}>
          {person.service_level}
        </span>
      ),
    },
    {
      id: 'service_types',
      header: 'Types',
      render: (person) => (
        <div className="flex flex-wrap gap-1">
          {person.service_types && person.service_types.length > 0 ? (
            person.service_types.map((type, idx) => (
              <span
                key={idx}
                className="inline-block px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30"
              >
                {type}
              </span>
            ))
          ) : (
            <span className="text-white/50">&mdash;</span>
          )}
        </div>
      ),
    },
    {
      id: 'dom_started_at',
      header: 'Started',
      render: (person, { formatDate }) => (
        <span>
          {person.dom_started_at ? formatDate(person.dom_started_at, { includeTime: false }) : '\u2014'}
        </span>
      ),
    },
    {
      id: 'dom_ended_at',
      header: 'Ended',
      render: (person, { formatDate }) => (
        <span>
          {person.dom_ended_at ? formatDate(person.dom_ended_at, { includeTime: false }) : '\u2014'}
        </span>
      ),
    },
    {
      id: 'notes',
      header: 'Notes',
      render: (person) => (
        <span className="text-white/70 max-w-[200px] truncate block" title={person.dom_notes || ''}>
          {person.dom_notes || '\u2014'}
        </span>
      ),
    },
  ];
}
