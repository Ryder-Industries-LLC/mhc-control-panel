import React, { useState, useMemo } from 'react';

const INTERACTIONS_PER_PAGE = 10;

interface Interaction {
  id: string;
  type: string;
  content: string | null;
  timestamp: string;
}

interface InteractionsTabProps {
  interactions: Interaction[];
}

// Map of event types to display labels and colors
const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  TIP_EVENT: { label: 'Tips', color: 'bg-green-600' },
  PRIVATE_MESSAGE: { label: 'PMs', color: 'bg-purple-600' },
  CHAT_MESSAGE: { label: 'Chat', color: 'bg-blue-600' },
  FOLLOW: { label: 'Follow', color: 'bg-pink-600' },
  UNFOLLOW: { label: 'Unfollow', color: 'bg-gray-600' },
  FANCLUB_JOIN: { label: 'Fanclub', color: 'bg-amber-600' },
  MEDIA_PURCHASE: { label: 'Media', color: 'bg-cyan-600' },
  USER_ENTER: { label: 'Enter', color: 'bg-emerald-600' },
  USER_LEAVE: { label: 'Leave', color: 'bg-rose-600' },
};

export const InteractionsTab: React.FC<InteractionsTabProps> = ({ interactions }) => {
  const [page, setPage] = useState(0);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  // Get unique event types from interactions
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    interactions.forEach(i => types.add(i.type));
    return Array.from(types).sort();
  }, [interactions]);

  // Filter interactions by selected types
  const filteredInteractions = useMemo(() => {
    if (selectedTypes.size === 0) return interactions;
    return interactions.filter(i => selectedTypes.has(i.type));
  }, [interactions, selectedTypes]);

  // Reset page when filters change
  const handleTypeToggle = (type: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
    setPage(0);
  };

  const clearFilters = () => {
    setSelectedTypes(new Set());
    setPage(0);
  };

  const totalPages = Math.ceil(filteredInteractions.length / INTERACTIONS_PER_PAGE);
  const paginatedInteractions = filteredInteractions.slice(
    page * INTERACTIONS_PER_PAGE,
    (page + 1) * INTERACTIONS_PER_PAGE
  );

  if (!interactions || interactions.length === 0) {
    return <p className="text-mhc-text-muted">No interactions found.</p>;
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="m-0 text-mhc-text text-2xl font-semibold">Interactions</h3>
        <span className="text-mhc-text-muted text-sm">
          Showing {Math.min((page + 1) * INTERACTIONS_PER_PAGE, filteredInteractions.length)} of {filteredInteractions.length}
          {selectedTypes.size > 0 && ` (filtered from ${interactions.length})`}
        </span>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {availableTypes.map(type => {
          const config = EVENT_TYPE_CONFIG[type] || { label: type.replace(/_/g, ' '), color: 'bg-gray-600' };
          const isSelected = selectedTypes.has(type);
          const count = interactions.filter(i => i.type === type).length;

          return (
            <button
              key={type}
              onClick={() => handleTypeToggle(type)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                isSelected
                  ? `${config.color} text-white ring-2 ring-white/30`
                  : 'bg-mhc-surface-light text-mhc-text-muted hover:bg-mhc-surface hover:text-white'
              }`}
            >
              {config.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                isSelected ? 'bg-white/20' : 'bg-white/10'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
        {selectedTypes.size > 0 && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 rounded-full text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {paginatedInteractions.map((interaction) => (
          <div key={interaction.id} className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold text-mhc-primary text-sm uppercase">
                {interaction.type.replace(/_/g, ' ')}
              </span>
              <span className="text-mhc-text-muted text-sm">
                {new Date(interaction.timestamp).toLocaleString()}
              </span>
            </div>
            {interaction.content && (
              <div className="p-3 bg-mhc-surface rounded-md text-mhc-text leading-relaxed">
                {interaction.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            onClick={() => setPage(prev => Math.max(0, prev - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-mhc-surface-light text-white hover:bg-mhc-primary"
          >
            ← Previous
          </button>
          <span className="text-mhc-text-muted text-sm">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-mhc-surface-light text-white hover:bg-mhc-primary"
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
};

export default InteractionsTab;
