import React, { useState } from 'react';

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

export const InteractionsTab: React.FC<InteractionsTabProps> = ({ interactions }) => {
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(interactions.length / INTERACTIONS_PER_PAGE);
  const paginatedInteractions = interactions.slice(
    page * INTERACTIONS_PER_PAGE,
    (page + 1) * INTERACTIONS_PER_PAGE
  );

  if (!interactions || interactions.length === 0) {
    return <p className="text-mhc-text-muted">No interactions found.</p>;
  }

  return (
    <>
      <div className="flex justify-between items-center mb-5">
        <h3 className="m-0 text-mhc-text text-2xl font-semibold">Interactions</h3>
        <span className="text-mhc-text-muted text-sm">
          Showing {Math.min((page + 1) * INTERACTIONS_PER_PAGE, interactions.length)} of {interactions.length}
        </span>
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
