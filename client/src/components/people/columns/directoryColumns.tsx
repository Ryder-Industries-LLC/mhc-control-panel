import React from 'react';
import { Link } from 'react-router-dom';
import { BasePerson, ColumnConfig, PriorityLookup } from '../../../types/people';

// Directory columns with full feature set
export function getDirectoryColumns(
  getPriorityLookup?: (username: string) => PriorityLookup | null,
  onAddToPriority?: (username: string) => void,
  onLookup?: (username: string) => void,
  onDelete?: (id: string, username: string) => void,
  lookupLoading?: string | null,
): ColumnConfig<BasePerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '180px',
      sortable: true,
      sortField: 'username',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <Link
            to={`/profile/${person.username}`}
            className="text-white no-underline font-semibold text-base transition-colors hover:text-mhc-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
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
      render: (person, { getImageUrl, isPersonLive }) => {
        const imageUrl = getImageUrl(person.image_url);
        const isLive = isPersonLive(person);

        return imageUrl ? (
          <div className="relative w-[120px] h-[90px] group">
            <img
              src={imageUrl}
              alt={person.username}
              className="w-full h-full object-cover rounded-md border-2 border-white/10 transition-all group-hover:border-mhc-primary group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-mhc-primary/40"
            />
            {isLive && (
              <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold animate-pulse">
                LIVE
              </span>
            )}
            {/* Hover preview */}
            <div className="hidden group-hover:block fixed z-[9999] pointer-events-none" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              <div className="bg-black/95 border-2 border-white/30 rounded-lg p-2 shadow-2xl">
                <img src={imageUrl} alt={person.username} className="w-[400px] h-[300px] object-cover rounded" />
                {isLive && (
                  <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded text-sm font-semibold animate-pulse">
                    LIVE
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'age',
      header: 'Age',
      width: '80px',
      sortable: true,
      sortField: 'age',
      render: (person) => <span>{person.age || '\u2014'}</span>,
    },
    {
      id: 'tags',
      header: 'Tags',
      width: '200px',
      render: (person, { onTagClick }) => {
        if (!person.tags || person.tags.length === 0) {
          return <span className="text-white/30">&mdash;</span>;
        }

        return (
          <div className="flex flex-wrap gap-1 items-center">
            {person.tags.slice(0, 5).map((tag, idx) => (
              <span
                key={idx}
                className="tag-filter inline-block px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 rounded-xl text-xs text-purple-400 cursor-pointer transition-all whitespace-nowrap hover:bg-purple-500/25 hover:border-purple-500/50 hover:scale-105"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
              >
                {tag}
              </span>
            ))}
            {person.tags.length > 5 && (
              <span className="text-xs text-white/40 font-medium">+{person.tags.length - 5}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'image_count',
      header: 'Images',
      width: '100px',
      align: 'center',
      sortable: true,
      sortField: 'image_count',
      render: (person) => (
        <span className="font-mono text-white/60">{person.image_count || 0}</span>
      ),
    },
    {
      id: 'last_active',
      header: 'Last Active',
      sortable: true,
      sortField: 'session_observed_at',
      render: (person, { getLastActiveTime, formatDate }) => {
        const lastActive = getLastActiveTime(person);
        return <span>{lastActive ? formatDate(lastActive, { relative: true }) : '\u2014'}</span>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      width: '150px',
      align: 'center',
      render: (person) => {
        const priority = getPriorityLookup?.(person.username);
        const isLoading = lookupLoading === person.username;

        return (
          <div className="flex gap-2 justify-center" onClick={(e) => e.stopPropagation()} data-interactive>
            {!priority && onAddToPriority && (
              <button
                className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-yellow-500/20 hover:border-yellow-500/30 hover:scale-110"
                onClick={() => onAddToPriority(person.username)}
                title="Add to priority queue"
              >
                &#9733;
              </button>
            )}
            {onLookup && (
              <button
                className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-blue-500/20 hover:border-blue-500/30 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onLookup(person.username)}
                disabled={isLoading}
                title="On-demand lookup"
              >
                {isLoading ? '\u27F3' : '\uD83D\uDD0D'}
              </button>
            )}
            {onDelete && (
              <button
                className="p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer transition-all text-base hover:bg-red-500/20 hover:border-red-500/30 hover:scale-110"
                onClick={() => onDelete(person.id, person.username)}
                title="Delete user"
              >
                &#128465;
              </button>
            )}
          </div>
        );
      },
    },
  ];
}
