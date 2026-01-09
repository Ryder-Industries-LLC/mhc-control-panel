import React, { useState } from 'react';

interface StatsHistoryRecord {
  id: number;
  recorded_at: string;
  stats: {
    user_segments: {
      total_people: number;
      total_live_now: number;
      total_with_media: number;
      total_bans: number;
      following: number;
      followers: number;
      active_subs: number;
      active_doms: number;
      friends: number;
      watchlist: number;
      bans: number;
      ratings: {
        five_star: number;
        four_star: number;
        three_star: number;
        two_star: number;
        one_star: number;
        unrated: number;
      };
    };
    database: {
      size_bytes: number;
      total_persons: number;
      viewers_count: number;
      models_count: number;
    };
    media: {
      total_images: number;
      total_image_size_bytes: number;
      images_by_type: Record<string, { count: number; size_bytes: number }>;
      total_videos: number;
      total_video_size_bytes: number;
      users_with_media: number;
      users_with_video: number;
    };
    snapshots_by_source: Record<string, number>;
    activity: {
      snapshots_1h: number;
      snapshots_24h: number;
    };
    queue: {
      priority1_pending: number;
      priority2_active: number;
      failed_24h: number;
    };
  };
  collection_duration_ms: number;
}

interface StatsHistoryTableProps {
  records: StatsHistoryRecord[];
  loading?: boolean;
}

type SortField = 'recorded_at' | 'total_people' | 'total_images' | 'db_size';
type SortDirection = 'asc' | 'desc';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const formatChange = (change: number, formatFn: (n: number) => string = formatNumber): string => {
  const prefix = change > 0 ? '+' : '';
  return `${prefix}${formatFn(change)}`;
};

const StatsHistoryTable: React.FC<StatsHistoryTableProps> = ({
  records,
  loading = false,
}) => {
  const [sortField, setSortField] = useState<SortField>('recorded_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedRecords = [...records].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (sortField) {
      case 'recorded_at':
        aVal = new Date(a.recorded_at).getTime();
        bVal = new Date(b.recorded_at).getTime();
        break;
      case 'total_people':
        aVal = a.stats.user_segments.total_people;
        bVal = b.stats.user_segments.total_people;
        break;
      case 'total_images':
        aVal = a.stats.media.total_images;
        bVal = b.stats.media.total_images;
        break;
      case 'db_size':
        aVal = a.stats.database.size_bytes;
        bVal = b.stats.database.size_bytes;
        break;
      default:
        aVal = 0;
        bVal = 0;
    }

    if (sortDirection === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="text-white/30 ml-1">↕</span>;
    }
    return (
      <span className="text-mhc-primary ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-mhc-text-muted">
        Loading stats history...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-mhc-text-muted">
        No stats history records found for the selected time range.
      </div>
    );
  }

  // Calculate net changes between first and last record in the date range
  // Sort by date to get oldest and newest
  const sortedByDate = [...records].sort((a, b) =>
    new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const oldest = sortedByDate[0];
  const newest = sortedByDate[sortedByDate.length - 1];

  const netChanges = records.length >= 2 ? {
    people: newest.stats.user_segments.total_people - oldest.stats.user_segments.total_people,
    images: newest.stats.media.total_images - oldest.stats.media.total_images,
    imageSize: newest.stats.media.total_image_size_bytes - oldest.stats.media.total_image_size_bytes,
    dbSize: newest.stats.database.size_bytes - oldest.stats.database.size_bytes,
    following: newest.stats.user_segments.following - oldest.stats.user_segments.following,
    followers: newest.stats.user_segments.followers - oldest.stats.user_segments.followers,
    videos: newest.stats.media.total_videos - oldest.stats.media.total_videos,
    videoSize: newest.stats.media.total_video_size_bytes - oldest.stats.media.total_video_size_bytes,
  } : null;

  return (
    <div className="space-y-4">
      {/* Net Change Summary */}
      {netChanges && (
        <div className="bg-white/5 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-mhc-text font-medium">Net Change</h4>
            <span className="text-xs text-mhc-text-muted">
              ({formatDateTime(oldest.recorded_at)} to {formatDateTime(newest.recorded_at)})
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-sm">
            <div className="bg-white/5 rounded p-2">
              <div className="text-mhc-text-muted text-xs">People</div>
              <div className={`font-medium ${netChanges.people >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatChange(netChanges.people)}
              </div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-mhc-text-muted text-xs">Images</div>
              <div className={`font-medium ${netChanges.images >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatChange(netChanges.images)}
              </div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-mhc-text-muted text-xs">Image Size</div>
              <div className={`font-medium ${netChanges.imageSize >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatChange(netChanges.imageSize, formatBytes)}
              </div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-mhc-text-muted text-xs">DB Size</div>
              <div className={`font-medium ${netChanges.dbSize >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatChange(netChanges.dbSize, formatBytes)}
              </div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-mhc-text-muted text-xs">Following</div>
              <div className={`font-medium ${netChanges.following >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatChange(netChanges.following)}
              </div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-mhc-text-muted text-xs">Followers</div>
              <div className={`font-medium ${netChanges.followers >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatChange(netChanges.followers)}
              </div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-mhc-text-muted text-xs">Videos</div>
              <div className={`font-medium ${netChanges.videos >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatChange(netChanges.videos)}
              </div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-mhc-text-muted text-xs">Video Size</div>
              <div className={`font-medium ${netChanges.videoSize >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatChange(netChanges.videoSize, formatBytes)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-mhc-surface z-10">
          <tr className="border-b border-white/10">
            <th
              className="text-left py-3 px-4 font-medium text-mhc-text cursor-pointer hover:text-mhc-primary"
              onClick={() => handleSort('recorded_at')}
            >
              Recorded At <SortIcon field="recorded_at" />
            </th>
            <th
              className="text-right py-3 px-4 font-medium text-mhc-text cursor-pointer hover:text-mhc-primary"
              onClick={() => handleSort('total_people')}
            >
              People <SortIcon field="total_people" />
            </th>
            <th
              className="text-right py-3 px-4 font-medium text-mhc-text cursor-pointer hover:text-mhc-primary"
              onClick={() => handleSort('total_images')}
            >
              Images <SortIcon field="total_images" />
            </th>
            <th
              className="text-right py-3 px-4 font-medium text-mhc-text cursor-pointer hover:text-mhc-primary"
              onClick={() => handleSort('db_size')}
            >
              DB Size <SortIcon field="db_size" />
            </th>
            <th className="text-right py-3 px-4 font-medium text-mhc-text">
              Following
            </th>
            <th className="text-right py-3 px-4 font-medium text-mhc-text">
              Followers
            </th>
            <th className="text-center py-3 px-4 font-medium text-mhc-text">
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRecords.map((record) => (
            <React.Fragment key={record.id}>
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 text-mhc-text">
                  {formatDateTime(record.recorded_at)}
                </td>
                <td className="py-3 px-4 text-right text-mhc-text">
                  {formatNumber(record.stats.user_segments.total_people)}
                </td>
                <td className="py-3 px-4 text-right text-mhc-text">
                  {formatNumber(record.stats.media.total_images)}
                </td>
                <td className="py-3 px-4 text-right text-mhc-text">
                  {formatBytes(record.stats.database.size_bytes)}
                </td>
                <td className="py-3 px-4 text-right text-mhc-text">
                  {formatNumber(record.stats.user_segments.following)}
                </td>
                <td className="py-3 px-4 text-right text-mhc-text">
                  {formatNumber(record.stats.user_segments.followers)}
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => setExpandedRow(expandedRow === record.id ? null : record.id)}
                    className="text-mhc-primary hover:text-mhc-primary-light text-sm"
                  >
                    {expandedRow === record.id ? 'Hide' : 'Show'}
                  </button>
                </td>
              </tr>
              {expandedRow === record.id && (
                <tr className="bg-white/5">
                  <td colSpan={7} className="py-4 px-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* User Segments */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <h5 className="text-mhc-text font-medium mb-2">User Segments</h5>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Live Now:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.total_live_now)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">With Media:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.total_with_media)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Active Subs:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.active_subs)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Active Doms:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.active_doms)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Friends:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.friends)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Watchlist:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.watchlist)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Bans:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.bans)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Database & Media */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <h5 className="text-mhc-text font-medium mb-2">Database & Media</h5>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Viewers:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.database.viewers_count)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Models:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.database.models_count)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Image Size:</span>
                            <span className="text-mhc-text">{formatBytes(record.stats.media.total_image_size_bytes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Videos:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.media.total_videos)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Video Size:</span>
                            <span className="text-mhc-text">{formatBytes(record.stats.media.total_video_size_bytes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Users w/ Media:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.media.users_with_media)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Users w/ Video:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.media.users_with_video)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Activity & Queue */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <h5 className="text-mhc-text font-medium mb-2">Activity & Queue</h5>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Snapshots (1h):</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.activity.snapshots_1h)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Snapshots (24h):</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.activity.snapshots_24h)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Queue P1:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.queue.priority1_pending)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Queue P2:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.queue.priority2_active)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Failed (24h):</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.queue.failed_24h)}</span>
                          </div>
                        </div>
                        <h5 className="text-mhc-text font-medium mt-3 mb-2">Ratings</h5>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">5★:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.ratings.five_star)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">4★:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.ratings.four_star)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">3★:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.ratings.three_star)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-mhc-text-muted">Unrated:</span>
                            <span className="text-mhc-text">{formatNumber(record.stats.user_segments.ratings.unrated)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

export default StatsHistoryTable;
