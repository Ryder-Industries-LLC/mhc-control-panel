import React from 'react';
import { Link } from 'react-router-dom';
import {
  ColumnConfig,
  RelationshipPerson,
  RoleType,
  getRelationshipStatusClass,
  getRoleChipClass,
} from '../../../types/people';

/**
 * Unified columns for Friends, Subs, and Doms segments
 * All three use the SAME column structure as per the plan:
 * Username | Image | Relationship Status | Roles | Since Date | Notes
 */
export function getRelationshipColumns(): ColumnConfig<RelationshipPerson>[] {
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
      width: '130px',
      render: (person) => {
        const status = person.relationship?.status;
        if (!status) {
          return <span className="text-white/30">&mdash;</span>;
        }
        return (
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${getRelationshipStatusClass(status)}`}>
            {status}
          </span>
        );
      },
    },
    {
      id: 'roles',
      header: 'Roles',
      width: '180px',
      render: (person) => {
        const roles = person.relationship?.roles || [];
        const customLabel = person.relationship?.custom_role_label;

        if (roles.length === 0) {
          return <span className="text-white/30">&mdash;</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {roles.map((role: RoleType, idx: number) => (
              <span
                key={idx}
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getRoleChipClass(role)}`}
              >
                {role === 'Custom' && customLabel ? customLabel : role}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'since_date',
      header: 'Since',
      width: '120px',
      render: (person, { formatDate }) => {
        const sinceDate = person.relationship?.since_date;
        return (
          <span>
            {sinceDate ? formatDate(sinceDate, { includeTime: false }) : '\u2014'}
          </span>
        );
      },
    },
    {
      id: 'notes',
      header: 'Notes',
      render: (person) => {
        const notes = person.relationship?.notes;
        return (
          <span className="text-white/70 max-w-[200px] truncate block" title={notes || ''}>
            {notes || '\u2014'}
          </span>
        );
      },
    },
  ];
}

// Legacy exports for backwards compatibility during transition
// These will be removed once all tabs are migrated to unified columns
export { getRelationshipColumns as getFriendsColumns };
export { getRelationshipColumns as getSubsColumns };
export { getRelationshipColumns as getDomsColumns };
