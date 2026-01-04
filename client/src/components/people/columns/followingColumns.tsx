import React from 'react';
import { Link } from 'react-router-dom';
import { FollowingPerson, FollowerPerson, UnfollowedPerson, BannedPerson, TipperPerson, ColumnConfig } from '../../../types/people';

// Following tab columns
export function getFollowingColumns(): ColumnConfig<FollowingPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '200px',
      sortable: true,
      sortField: 'username',
      render: (person, { getRoleBadgeClass, isPersonLive }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
          {isPersonLive(person) && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
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
          <img src={imageUrl} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'following_since',
      header: 'Following Since',
      sortable: true,
      sortField: 'following_since',
      render: (person, { formatDate }) => (
        <span>{person.following_since ? formatDate(person.following_since, { includeTime: false }) : '\u2014'}</span>
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
  ];
}

// Followers tab columns
export function getFollowersColumns(): ColumnConfig<FollowerPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '200px',
      sortable: true,
      sortField: 'username',
      render: (person, { getRoleBadgeClass, isPersonLive }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
          {isPersonLive(person) && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
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
          <img src={imageUrl} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'follower_since',
      header: 'Follower Since',
      sortable: true,
      sortField: 'follower_since',
      render: (person, { formatDate }) => (
        <span>{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '\u2014'}</span>
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
  ];
}

// Unfollowed tab columns
export function getUnfollowedColumns(): ColumnConfig<UnfollowedPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '200px',
      sortable: true,
      sortField: 'username',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary font-medium hover:underline"
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
          <img src={imageUrl} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'unfollower_at',
      header: 'Unfollowed At',
      sortable: true,
      sortField: 'unfollower_at',
      render: (person, { formatDate }) => (
        <span>{person.unfollower_at ? formatDate(person.unfollower_at, { relative: true }) : '\u2014'}</span>
      ),
    },
    {
      id: 'follower_since',
      header: 'Was Following Since',
      sortable: true,
      sortField: 'follower_since',
      render: (person, { formatDate }) => (
        <span>{person.follower_since ? formatDate(person.follower_since, { includeTime: false }) : '\u2014'}</span>
      ),
    },
  ];
}

// Bans tab columns
export function getBansColumns(): ColumnConfig<BannedPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '200px',
      sortable: true,
      sortField: 'username',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
          <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded border border-red-500/30">
            BANNED
          </span>
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
          <img src={imageUrl} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
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
  ];
}

// Watchlist tab columns
export function getWatchlistColumns(): ColumnConfig<any>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '200px',
      sortable: true,
      sortField: 'username',
      render: (person, { getRoleBadgeClass, isPersonLive }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {person.username}
          </Link>
          {isPersonLive(person) && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
          )}
          <span className="bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded border border-orange-500/30">
            WATCH
          </span>
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
          <img src={imageUrl} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
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
  ];
}

// Tipped By Me tab columns
export function getTippedByMeColumns(): ColumnConfig<TipperPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '200px',
      sortable: true,
      sortField: 'username',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary font-medium hover:underline"
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
          <img src={imageUrl} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'total_tokens',
      header: 'Total Tokens',
      width: '120px',
      align: 'center',
      sortable: true,
      sortField: 'total_tokens',
      render: (person, { formatNumber }) => (
        <span className="font-mono text-amber-400">{formatNumber(person.total_tokens || 0)}</span>
      ),
    },
    {
      id: 'tip_count',
      header: 'Tip Count',
      width: '100px',
      align: 'center',
      sortable: true,
      sortField: 'tip_count',
      render: (person) => <span>{person.tip_count || 0}</span>,
    },
    {
      id: 'last_tip_date',
      header: 'Last Tip',
      sortable: true,
      sortField: 'last_tip_date',
      render: (person, { formatDate }) => (
        <span>{person.last_tip_date ? formatDate(person.last_tip_date, { relative: true }) : '\u2014'}</span>
      ),
    },
  ];
}

// Tipped Me tab columns
export function getTippedMeColumns(): ColumnConfig<TipperPerson>[] {
  return [
    {
      id: 'username',
      header: 'Username',
      width: '200px',
      sortable: true,
      sortField: 'username',
      render: (person, { getRoleBadgeClass }) => (
        <div className="flex items-center gap-2">
          <span className={`${getRoleBadgeClass(person.role)} !px-2 !py-0.5 !text-[0.6rem] opacity-80`}>
            {person.role}
          </span>
          <Link
            to={`/profile/${person.username}`}
            className="text-mhc-primary font-medium hover:underline"
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
          <img src={imageUrl} alt={person.username} className="w-[120px] h-[90px] object-cover rounded-md border-2 border-white/10" />
        ) : (
          <span className="text-white/30">&mdash;</span>
        );
      },
    },
    {
      id: 'total_tokens',
      header: 'Total Tokens',
      width: '120px',
      align: 'center',
      sortable: true,
      sortField: 'total_tokens',
      render: (person, { formatNumber }) => (
        <span className="font-mono text-emerald-400">{formatNumber(person.total_tokens || 0)}</span>
      ),
    },
    {
      id: 'tip_count',
      header: 'Tip Count',
      width: '100px',
      align: 'center',
      sortable: true,
      sortField: 'tip_count',
      render: (person) => <span>{person.tip_count || 0}</span>,
    },
    {
      id: 'last_tip_date',
      header: 'Last Tip',
      sortable: true,
      sortField: 'last_tip_date',
      render: (person, { formatDate }) => (
        <span>{person.last_tip_date ? formatDate(person.last_tip_date, { relative: true }) : '\u2014'}</span>
      ),
    },
  ];
}
