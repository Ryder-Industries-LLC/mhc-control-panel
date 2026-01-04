import React from 'react';
import { CountItem } from '../../types/people';

export interface CountsGridProps {
  counts: CountItem[];
  activeFilters: Set<string>;
  onToggle: (id: string) => void;
  className?: string;
}

// Color mappings for count cards
// All inactive states use subtle white/10 border for consistency
const COLOR_CLASSES: Record<CountItem['color'], {
  inactive: string;
  active: string;
  text: string;
}> = {
  default: {
    inactive: 'border-white/10 bg-white/5 hover:border-white/20',
    active: 'border-white/40 bg-white/15 shadow-lg shadow-white/10',
    text: 'text-white',
  },
  red: {
    inactive: 'border-white/10 bg-white/5 hover:border-red-500/30',
    active: 'border-red-500 bg-red-500/20 shadow-lg shadow-red-500/30',
    text: 'text-red-400',
  },
  purple: {
    inactive: 'border-white/10 bg-white/5 hover:border-purple-500/30',
    active: 'border-purple-500 bg-purple-500/15 shadow-lg shadow-purple-500/30',
    text: 'text-purple-400',
  },
  blue: {
    inactive: 'border-white/10 bg-white/5 hover:border-blue-500/30',
    active: 'border-blue-500 bg-blue-500/15 shadow-lg shadow-blue-500/30',
    text: 'text-blue-400',
  },
  emerald: {
    inactive: 'border-white/10 bg-white/5 hover:border-emerald-500/30',
    active: 'border-emerald-500 bg-emerald-500/15 shadow-lg shadow-emerald-500/30',
    text: 'text-emerald-400',
  },
  yellow: {
    inactive: 'border-white/10 bg-white/5 hover:border-yellow-500/30',
    active: 'border-yellow-500 bg-yellow-500/15 shadow-lg shadow-yellow-500/30',
    text: 'text-yellow-400',
  },
  orange: {
    inactive: 'border-white/10 bg-white/5 hover:border-orange-500/30',
    active: 'border-orange-500 bg-orange-500/15 shadow-lg shadow-orange-500/30',
    text: 'text-orange-400',
  },
  primary: {
    inactive: 'border-white/10 bg-white/5 hover:border-mhc-primary/30',
    active: 'border-mhc-primary bg-mhc-primary/15 shadow-lg shadow-mhc-primary/30',
    text: 'text-mhc-primary',
  },
};

export const CountsGrid: React.FC<CountsGridProps> = ({
  counts,
  activeFilters,
  onToggle,
  className = '',
}) => {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${className}`}>
      {counts.map((count) => {
        const isActive = activeFilters.has(count.id);
        const colors = COLOR_CLASSES[count.color] || COLOR_CLASSES.default;
        const isClickable = count.clickable !== false;

        return (
          <div
            key={count.id}
            className={`
              border rounded-lg p-2.5 text-center transition-all
              ${isActive ? colors.active : colors.inactive}
              ${isClickable ? 'cursor-pointer hover:-translate-y-0.5' : ''}
            `}
            onClick={() => isClickable && onToggle(count.id)}
          >
            <div className={`text-xl font-bold mb-0.5 ${colors.text}`}>
              {count.value.toLocaleString()}
            </div>
            <div className={`text-xs ${isActive ? 'text-white/90' : 'text-white/60'}`}>
              {count.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CountsGrid;
