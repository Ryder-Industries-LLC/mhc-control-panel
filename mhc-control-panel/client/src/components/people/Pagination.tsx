import React from 'react';
import { PAGE_SIZE_OPTIONS } from '../../types/people';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className = '',
}) => {
  if (totalPages <= 0) return null;

  // Generate page numbers with ellipsis
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);

      if (currentPage > 3) pages.push('...');

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) pages.push(i);

      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className={`flex items-center justify-center gap-2 p-4 my-4 flex-wrap ${className}`}>
      <button
        className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white/70 text-sm cursor-pointer transition-all hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        &lsaquo; Prev
      </button>

      {pages.map((page, idx) => (
        typeof page === 'number' ? (
          <button
            key={idx}
            className={`min-w-[40px] px-3 py-2 border rounded-md text-sm cursor-pointer transition-all text-center ${
              currentPage === page
                ? 'bg-gradient-primary text-white border-transparent'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ) : (
          <span key={idx} className="text-white/40 px-1">...</span>
        )
      ))}

      <button
        className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white/70 text-sm cursor-pointer transition-all hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next &rsaquo;
      </button>

      <select
        className="ml-4 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white cursor-pointer text-sm focus:outline-none focus:border-mhc-primary"
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
      >
        {pageSizeOptions.map(size => (
          <option key={size} value={size} className="bg-mhc-surface text-white">
            {size} per page
          </option>
        ))}
      </select>

      <span className="ml-4 text-white/50 text-sm">
        {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems}
      </span>
    </div>
  );
};

export default Pagination;
