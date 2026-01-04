import React from 'react';
import { ActiveFilter } from '../../types/people';

export interface ActiveFiltersBarProps {
  filters: ActiveFilter[];
  resultCount: number;
  onRemoveFilter: (filterId: string) => void;
  onClearAll: () => void;
  className?: string;
}

export const ActiveFiltersBar: React.FC<ActiveFiltersBarProps> = ({
  filters,
  resultCount,
  onRemoveFilter,
  onClearAll,
  className = '',
}) => {
  // Don't render if no filters are active
  if (filters.length === 0) return null;

  return (
    <div className={`flex items-center gap-4 px-4 py-3 bg-mhc-primary/15 border border-mhc-primary/30 rounded-lg text-indigo-300 text-sm flex-wrap ${className}`}>
      <span>Filtering by:</span>

      {filters.map((filter) => (
        <span
          key={filter.id}
          className="inline-flex items-center gap-1.5 bg-white/20 text-white px-2 py-1 rounded text-xs font-semibold"
        >
          <span className="capitalize">{filter.label}</span>
          <button
            onClick={() => onRemoveFilter(filter.id)}
            className="text-white/60 hover:text-white transition-colors ml-0.5"
            title={`Remove ${filter.label} filter`}
          >
            &times;
          </button>
        </span>
      ))}

      <span className="text-white/70">
        ({resultCount.toLocaleString()} result{resultCount !== 1 ? 's' : ''})
      </span>

      <button
        onClick={onClearAll}
        className="ml-auto bg-transparent border border-white/20 text-white/70 px-3 py-1 rounded text-xs cursor-pointer transition-all hover:bg-white/10 hover:text-white"
      >
        Clear All &times;
      </button>
    </div>
  );
};

export default ActiveFiltersBar;
