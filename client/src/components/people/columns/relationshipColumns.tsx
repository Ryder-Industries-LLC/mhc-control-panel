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
// All three share the same column structure for visual consistency:
// Username | Image | Status | Additional Info | Date | Notes

export function getFriendsColumns(): ColumnConfig<FriendPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '200px',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
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
      width: '140px',
      render: (person, { getImageUrl }) => {
        const imageUrl = getImageUrl(person.image_url);
        return imageUrl ? (
          <img
            src={imageUrl}
            alt={person.username}
            className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
          />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'friend_tier',
      header: 'Status',
      width: '150px',
      render: (person, { getFriendTierBadge }) => {
        const tierBadge = getFriendTierBadge(person.friend_tier);
        return tierBadge ? (
          <span className={tierBadge.class}>
            Tier {person.friend_tier} - {tierBadge.label}
          </span>
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'active_sub',
      header: 'Also Sub?',
      width: '100px',
      align: 'center',
      render: (person) =>
        person.active_sub ? (
          <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Yes
          </span>
        ) : (
          <span className="text-white/30">&mdash;</span>
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
      width: '200px',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
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
      width: '140px',
      render: (person, { getImageUrl }) => {
        const imageUrl = getImageUrl(person.image_url);
        return imageUrl ? (
          <img
            src={imageUrl}
            alt={person.username}
            className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
          />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      width: '100px',
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
      id: 'friend_tier',
      header: 'Friend Tier',
      width: '130px',
      render: (person, { getFriendTierBadge }) => {
        const tierBadge = getFriendTierBadge(person.friend_tier);
        return tierBadge ? (
          <span className={tierBadge.class}>
            Tier {person.friend_tier}
          </span>
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'last_service_date',
      header: 'Last Service',
      render: (person, { formatDate }) => (
        <span>
          {person.last_service_date ? formatDate(person.last_service_date, { relative: true }) : '\u2014'}
        </span>
      ),
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
      width: '200px',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary no-underline font-medium transition-colors hover:text-indigo-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
        </div>
      ),
    },
    {
      id: 'image',
      header: 'Image',
      width: '140px',
      render: (person, { getImageUrl }) => {
        const imageUrl = getImageUrl(person.image_url);
        return imageUrl ? (
          <img
            src={imageUrl}
            alt={person.username}
            className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10"
          />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'service_level',
      header: 'Status',
      width: '130px',
      render: (person) => (
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${getServiceLevelClass(person.service_level)}`}>
          {person.service_level}
        </span>
      ),
    },
    {
      id: 'service_types',
      header: 'Service Types',
      width: '180px',
      render: (person) => (
        <div className="flex flex-wrap gap-1">
          {person.service_types && person.service_types.length > 0 ? (
            person.service_types.slice(0, 3).map((type, idx) => (
              <span
                key={idx}
                className="inline-block px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30"
              >
                {type}
              </span>
            ))
          ) : (
            <span className="text-white/30">&mdash;</span>
          )}
          {person.service_types && person.service_types.length > 3 && (
            <span className="text-white/50 text-xs">+{person.service_types.length - 3}</span>
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
