import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BasePerson, ColumnConfig } from '../../../types/people';
import { StarRating } from '../../StarRating';

/**
 * Base column definitions shared across all tabs
 * Standard order: Username | Image | Age | Tags | Images | Last Active | [Segment Specific] | Actions
 */

// Image cell component with delayed hover preview
interface HoverImageCellProps {
  imageUrl: string;
  username: string;
  isLive: boolean;
}

export const HoverImageCell: React.FC<HoverImageCellProps> = ({ imageUrl, username, isLive }) => {
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPreview(true);
    }, 400); // 400ms delay before showing preview
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setShowPreview(false);
  }, []);

  return (
    <div
      className="relative w-[120px] h-[90px]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <img
        src={imageUrl}
        alt={username}
        className={`w-full h-full object-cover rounded-md border-2 transition-all ${
          showPreview
            ? 'border-mhc-primary scale-105 shadow-lg shadow-mhc-primary/40'
            : 'border-white/10'
        }`}
      />
      {isLive && (
        <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold animate-pulse">
          LIVE
        </span>
      )}
      {/* Hover preview with delay */}
      {showPreview && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="bg-black/95 border-2 border-white/30 rounded-lg p-2 shadow-2xl">
            <img src={imageUrl} alt={username} className="w-[400px] h-[300px] object-cover rounded" />
            {isLive && (
              <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded text-sm font-semibold animate-pulse">
                LIVE
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Username column - standard across all tabs
export function getUsernameColumn<T extends BasePerson>(): ColumnConfig<T> {
  return {
    id: 'username',
    header: 'Username',
    width: '180px',
    sortable: true,
    sortField: 'username' as keyof T,
    render: (person, { getRoleBadgeClass, isPersonLive }) => (
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
        {isPersonLive(person) && (
          <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold animate-pulse">
            LIVE
          </span>
        )}
        {person.banned_me && (
          <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
            Banned
          </span>
        )}
      </div>
    ),
  };
}

// Image column with hover preview (uses HoverImageCell component with 400ms delay)
export function getImageColumn<T extends BasePerson>(): ColumnConfig<T> {
  return {
    id: 'image',
    header: 'Image',
    width: '140px',
    render: (person, { getImageUrl, isPersonLive }) => {
      const imageUrl = getImageUrl(person.image_url);
      const isLive = isPersonLive(person);

      return imageUrl ? (
        <HoverImageCell imageUrl={imageUrl} username={person.username} isLive={isLive} />
      ) : (
        <span className="text-white/30">&mdash;</span>
      );
    },
  };
}

// Age column
export function getAgeColumn<T extends BasePerson>(): ColumnConfig<T> {
  return {
    id: 'age',
    header: 'Age',
    width: '60px',
    sortable: true,
    sortField: 'age' as keyof T,
    render: (person) => <span>{person.age || '\u2014'}</span>,
  };
}

// Tags column
export function getTagsColumn<T extends BasePerson>(): ColumnConfig<T> {
  return {
    id: 'tags',
    header: 'Tags',
    width: '180px',
    render: (person, { onTagClick }) => {
      if (!person.tags || person.tags.length === 0) {
        return <span className="text-white/30">&mdash;</span>;
      }

      return (
        <div className="flex flex-wrap gap-1 items-center">
          {person.tags.slice(0, 4).map((tag, idx) => (
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
          {person.tags.length > 4 && (
            <span className="text-xs text-white/40 font-medium">+{person.tags.length - 4}</span>
          )}
        </div>
      );
    },
  };
}

// Images count column
export function getImagesCountColumn<T extends BasePerson>(): ColumnConfig<T> {
  return {
    id: 'image_count',
    header: 'Images',
    width: '80px',
    align: 'center',
    sortable: true,
    sortField: 'image_count' as keyof T,
    render: (person) => (
      <span className="font-mono text-white/60">{(person.image_count || 0).toLocaleString()}</span>
    ),
  };
}

// Last Active column
export function getLastActiveColumn<T extends BasePerson>(): ColumnConfig<T> {
  return {
    id: 'last_active',
    header: 'Last Active',
    width: '120px',
    sortable: true,
    sortField: 'session_observed_at' as keyof T,
    render: (person, { getLastActiveTime, formatDate }) => {
      const lastActive = getLastActiveTime(person);
      return <span>{lastActive ? formatDate(lastActive, { relative: true }) : '\u2014'}</span>;
    },
  };
}

// Rating column
export function getRatingColumn<T extends BasePerson>(
  onRatingChange?: (username: string, rating: number) => void
): ColumnConfig<T> {
  return {
    id: 'rating',
    header: 'Rating',
    width: '130px',
    sortable: true,
    sortField: 'rating' as keyof T,
    render: (person) => (
      <div onClick={(e) => e.stopPropagation()}>
        <StarRating
          rating={person.rating || 0}
          onChange={onRatingChange ? (r) => onRatingChange(person.username, r) : undefined}
          size="sm"
        />
      </div>
    ),
  };
}

// External links column (CB and UN Cams)
export function getLinksColumn<T extends BasePerson>(): ColumnConfig<T> {
  return {
    id: 'links',
    header: 'Links',
    width: '80px',
    align: 'center',
    render: (person) => (
      <div className="flex gap-1.5 justify-center">
        <a
          href={`https://chaturbate.com/${person.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 rounded transition-colors font-semibold"
          onClick={(e) => e.stopPropagation()}
        >
          CB
        </a>
        <a
          href={`https://uncams.com/${person.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40 rounded transition-colors font-semibold"
          onClick={(e) => e.stopPropagation()}
        >
          UN
        </a>
      </div>
    ),
  };
}

// Get standard base columns in order
export function getBaseColumns<T extends BasePerson>(): ColumnConfig<T>[] {
  return [
    getUsernameColumn<T>(),
    getImageColumn<T>(),
    getAgeColumn<T>(),
    getTagsColumn<T>(),
    getImagesCountColumn<T>(),
    getLastActiveColumn<T>(),
    getLinksColumn<T>(),
  ];
}
