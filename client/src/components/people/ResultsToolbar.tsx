import React from 'react';
import { SortOption, PAGE_SIZE_OPTIONS } from '../../types/people';

export interface ResultsToolbarProps {
  // View mode (optional - hide toggle if not provided)
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  showViewToggle?: boolean;

  // Sorting (optional - hide sort if not provided)
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (value: string) => void;

  // Pagination summary
  totalItems: number;
  currentPage?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];

  // Optional custom content
  leadingContent?: React.ReactNode;
  trailingContent?: React.ReactNode;

  className?: string;
}

export const ResultsToolbar: React.FC<ResultsToolbarProps> = ({
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = true,
  sortOptions,
  sortValue,
  onSortChange,
  totalItems,
  currentPage = 1,
  pageSize = 25,
  totalPages = 1,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  leadingContent,
  trailingContent,
  className = '',
}) => {
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const showSort = sortOptions && sortOptions.length > 0 && sortValue !== undefined && onSortChange;
  const showPagination = totalPages > 1 && onPageChange;
  const showPageSize = onPageSizeChange;

  return (
    <div className={`flex items-center justify-between flex-wrap gap-4 ${className}`}>
      <div className="flex items-center gap-4">
        {leadingContent}

        {/* View Mode Toggle */}
        {showViewToggle && onViewModeChange && (
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button
              className={`px-3 py-2 text-sm transition-all flex items-center gap-1.5 ${
                viewMode === 'list'
                  ? 'bg-gradient-primary text-white'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              onClick={() => onViewModeChange('list')}
              title="List view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              List
            </button>
            <button
              className={`px-3 py-2 text-sm transition-all flex items-center gap-1.5 ${
                viewMode === 'grid'
                  ? 'bg-gradient-primary text-white'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              onClick={() => onViewModeChange('grid')}
              title="Grid view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Grid
            </button>
          </div>
        )}

        {/* Sort Dropdown */}
        {showSort && (
          <div className="flex items-center gap-2">
            <span className="text-white/50 text-sm">Sort:</span>
            <select
              value={sortValue}
              onChange={(e) => onSortChange(e.target.value)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-white text-sm cursor-pointer focus:outline-none focus:border-mhc-primary"
            >
              {sortOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-mhc-surface">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right side: Pagination controls and results count */}
      <div className="flex items-center gap-2 flex-wrap">
        {trailingContent}

        {/* Quick pagination */}
        {showPagination && (
          <>
            <button
              className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white/70 text-sm hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              &lsaquo;
            </button>
            <span className="text-white/50 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white/70 text-sm hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              &rsaquo;
            </button>
          </>
        )}

        {/* Page size selector */}
        {showPageSize && (
          <select
            className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-sm cursor-pointer focus:outline-none focus:border-mhc-primary"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size} className="bg-mhc-surface">
                {size}
              </option>
            ))}
          </select>
        )}

        {/* Results count */}
        <span className="text-white/50 text-sm">
          {totalItems > 0 ? `${startIndex + 1}-${endIndex} of ${totalItems}` : '0 results'}
        </span>
      </div>
    </div>
  );
};

export default ResultsToolbar;
