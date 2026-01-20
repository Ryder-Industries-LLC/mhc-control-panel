import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { FavoriteIcon } from '../components/FavoriteIcon';

interface FavoriteMedia {
  id: string;
  person_id: string;
  file_path: string;
  source: string;
  captured_at: string | null;
  uploaded_at: string;
  media_type: 'image' | 'video';
  is_favorite: boolean;
  person_username: string;
  title?: string;
  duration_seconds?: number;
  file_size?: number;
}

interface FavoriteStats {
  totalFavorites: number;
  imageCount: number;
  videoCount: number;
}

type MediaFilter = 'all' | 'image' | 'video';

const Favorites: React.FC = () => {
  const [favorites, setFavorites] = useState<FavoriteMedia[]>([]);
  const [stats, setStats] = useState<FavoriteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const pageSize = 48;

  useEffect(() => {
    loadFavorites();
    loadStats();
  }, [page, mediaFilter]);

  const loadFavorites = async () => {
    try {
      setLoading(true);
      setError(null);
      const mediaType = mediaFilter === 'all' ? undefined : mediaFilter;
      const result = await api.getFavoriteMedia(page, pageSize, mediaType);
      setFavorites(result.records);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err) {
      setError('Failed to load favorites');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const result = await api.getFavoriteStats();
      setStats(result);
    } catch (err) {
      console.error('Failed to load stats', err);
    }
  };

  const handleToggleFavorite = async (mediaId: string) => {
    try {
      await api.toggleMediaFavorite(mediaId);
      // Remove from list since it's no longer a favorite
      setFavorites(prev => prev.filter(f => f.id !== mediaId));
      setTotal(prev => prev - 1);
      // Refresh stats
      loadStats();
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  };

  const getImageUrl = (filePath: string) => `/images/${filePath}`;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown date';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-7xl mx-auto p-5">
      {/* Header */}
      <div className="text-center mb-8 py-6 border-b-2 border-mhc-primary">
        <h1 className="text-mhc-primary text-4xl font-bold mb-2">Favorites</h1>
        <p className="text-mhc-text-dim text-lg">Your favorite media across all profiles</p>

        {/* Stats */}
        {stats && (
          <div className="flex justify-center gap-6 mt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{stats.totalFavorites}</div>
              <div className="text-xs text-mhc-text-muted">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{stats.imageCount}</div>
              <div className="text-xs text-mhc-text-muted">Images</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400">{stats.videoCount}</div>
              <div className="text-xs text-mhc-text-muted">Videos</div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => { setMediaFilter('all'); setPage(1); }}
            className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${
              mediaFilter === 'all'
                ? 'bg-mhc-primary text-white border-mhc-primary'
                : 'bg-mhc-surface-light text-mhc-text-muted border-gray-600 hover:bg-gray-600 hover:border-mhc-primary'
            }`}
          >
            All ({stats?.totalFavorites || 0})
          </button>
          <button
            onClick={() => { setMediaFilter('image'); setPage(1); }}
            className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${
              mediaFilter === 'image'
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'bg-mhc-surface-light text-mhc-text-muted border-gray-600 hover:bg-gray-600 hover:border-emerald-500'
            }`}
          >
            Images ({stats?.imageCount || 0})
          </button>
          <button
            onClick={() => { setMediaFilter('video'); setPage(1); }}
            className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${
              mediaFilter === 'video'
                ? 'bg-cyan-500 text-white border-cyan-500'
                : 'bg-mhc-surface-light text-mhc-text-muted border-gray-600 hover:bg-gray-600 hover:border-cyan-500'
            }`}
          >
            Videos ({stats?.videoCount || 0})
          </button>
        </div>

        <div className="text-sm text-mhc-text-muted">
          Showing {favorites.length} of {total}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-mhc-primary border-t-transparent mb-4"></div>
          <p className="text-mhc-text-muted">Loading favorites...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-6 py-4 rounded-lg text-center">
          <p>{error}</p>
          <button
            onClick={loadFavorites}
            className="mt-3 px-4 py-2 bg-red-500/30 hover:bg-red-500/50 text-red-100 rounded transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && favorites.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <svg className="w-16 h-16 text-mhc-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          <h2 className="text-xl font-bold text-white mb-2">No Favorites Yet</h2>
          <p className="text-mhc-text-muted text-center max-w-md">
            Start adding favorites by clicking the heart icon on images and videos in profile pages.
          </p>
        </div>
      )}

      {/* Media Grid */}
      {!loading && !error && favorites.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {favorites.map((media) => (
              <div
                key={media.id}
                className="group relative rounded-lg overflow-hidden border-2 border-white/10 hover:border-mhc-primary transition-all hover:-translate-y-1 hover:shadow-lg bg-mhc-surface"
              >
                {/* Media */}
                <div className="aspect-[4/3]">
                  {media.media_type === 'video' ? (
                    <video
                      src={getImageUrl(media.file_path)}
                      className="w-full h-full object-cover"
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={getImageUrl(media.file_path)}
                      alt={media.title || `${media.person_username}'s media`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>

                {/* Overlay with info */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-2 text-white text-xs">
                    <div className="font-semibold truncate">
                      {formatDate(media.captured_at || media.uploaded_at)}
                    </div>
                  </div>
                </div>

                {/* Username link */}
                <Link
                  to={`/profile/${media.person_username}`}
                  className="absolute bottom-0 left-0 right-0 p-2 bg-mhc-surface-light text-mhc-primary text-sm font-semibold truncate hover:underline"
                >
                  {media.person_username}
                </Link>

                {/* Media type badge */}
                <div className={`absolute top-1 left-1 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  media.media_type === 'video' ? 'bg-cyan-500/80' : 'bg-emerald-500/80'
                }`}>
                  {media.media_type === 'video' ? 'Video' : 'Image'}
                </div>

                {/* Duration for videos */}
                {media.media_type === 'video' && media.duration_seconds && (
                  <div className="absolute top-1 right-8 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {formatDuration(media.duration_seconds)}
                  </div>
                )}

                {/* Unfavorite button - always visible */}
                <div className="absolute top-1 right-1">
                  <FavoriteIcon
                    isFavorite={true}
                    onToggle={() => handleToggleFavorite(media.id)}
                    size="sm"
                    className="bg-black/40 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-mhc-surface-light text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-mhc-surface transition-colors"
              >
                Previous
              </button>
              <span className="text-mhc-text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-mhc-surface-light text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-mhc-surface transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Favorites;
