import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BasePerson,
  ColumnConfig,
  RenderHelpers,
  isPersonLive,
  getLastActiveTime,
  getImageUrl,
  getRoleBadgeClass,
  getFriendTierBadge,
} from '../../types/people';
import { formatDate } from '../../utils/formatting';

export interface PeopleTableProps<T extends BasePerson> {
  data: T[];
  columns: ColumnConfig<T>[];
  loading?: boolean;
  emptyMessage?: string;
  emptySubMessage?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  onRowClick?: (person: T) => void;
  onTagClick?: (tag: string) => void;
  onAction?: (action: string, person: T) => void;
  rowClassName?: (person: T) => string;
  className?: string;
}

export function PeopleTable<T extends BasePerson>({
  data,
  columns,
  loading = false,
  emptyMessage = 'No users found.',
  emptySubMessage,
  sortField,
  sortDirection,
  onSort,
  onRowClick,
  onTagClick,
  onAction,
  rowClassName,
  className = '',
}: PeopleTableProps<T>) {
  const navigate = useNavigate();

  // Create render helpers for column render functions
  const helpers: RenderHelpers = {
    formatDate: (date, options) => formatDate(date, options),
    formatNumber: (num: number) => num.toLocaleString(),
    getImageUrl,
    isPersonLive,
    getLastActiveTime,
    getRoleBadgeClass,
    getFriendTierBadge,
    navigate,
    onTagClick,
    onAction: onAction ? (action, person) => onAction(action, person as T) : undefined,
  };

  const handleRowClick = (person: T, e: React.MouseEvent<HTMLTableRowElement>) => {
    // Don't trigger if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('.tag-filter') ||
      target.closest('[data-interactive]')
    ) {
      return;
    }
    if (onRowClick) {
      onRowClick(person);
    } else {
      navigate(`/profile/${person.username}`);
    }
  };

  const handleHeaderClick = (column: ColumnConfig<T>) => {
    if (column.sortable && column.sortField && onSort) {
      onSort(String(column.sortField));
    }
  };

  const getSortIndicator = (column: ColumnConfig<T>) => {
    if (!column.sortable || !column.sortField) return null;
    if (String(column.sortField) !== sortField) return null;
    return sortDirection === 'asc' ? ' \u2191' : ' \u2193';
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-white/50 bg-white/5 border border-white/10 rounded-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-auto max-h-[calc(100vh-400px)] min-h-[400px] ${className}`}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-20">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                onClick={() => handleHeaderClick(column)}
                style={{ width: column.width }}
                className={`
                  px-4 py-4 text-left font-semibold text-white/90 text-sm uppercase tracking-wide
                  bg-mhc-surface border-b-2 border-mhc-primary/30
                  ${column.sortable ? 'cursor-pointer select-none hover:bg-white/8' : ''}
                  ${column.align === 'center' ? 'text-center' : ''}
                  ${column.align === 'right' ? 'text-right' : ''}
                `}
              >
                {column.header}
                {getSortIndicator(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((person) => (
            <tr
              key={person.id}
              className={`
                border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer
                ${rowClassName ? rowClassName(person) : ''}
              `}
              onClick={(e) => handleRowClick(person, e)}
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={`
                    px-4 py-4 text-white/80
                    ${column.align === 'center' ? 'text-center' : ''}
                    ${column.align === 'right' ? 'text-right' : ''}
                  `}
                >
                  {column.render(person, helpers)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {data.length === 0 && (
        <div className="p-12 text-center text-white/50">
          <p>{emptyMessage}</p>
          {emptySubMessage && <p className="mt-2 text-sm">{emptySubMessage}</p>}
        </div>
      )}
    </div>
  );
}

export default PeopleTable;
