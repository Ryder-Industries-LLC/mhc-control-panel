import React from 'react';
import { SegmentConfig, TabType } from '../../types/people';

export interface SegmentTabsProps {
  segments: SegmentConfig[];
  activeSegment: TabType;
  onSegmentChange: (segment: TabType) => void;
  className?: string;
}

// Color mappings for segment tabs
const TAB_COLORS: Record<string, { active: string; inactive: string }> = {
  primary: {
    active: 'bg-gradient-primary text-white border-transparent',
    inactive: 'text-mhc-primary hover:bg-mhc-primary/10',
  },
  yellow: {
    active: 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50',
    inactive: 'text-yellow-400 hover:bg-yellow-500/10',
  },
  emerald: {
    active: 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50',
    inactive: 'text-emerald-400 hover:bg-emerald-500/10',
  },
  purple: {
    active: 'bg-purple-500/30 text-purple-300 border-purple-500/50',
    inactive: 'text-purple-400 hover:bg-purple-500/10',
  },
  orange: {
    active: 'bg-orange-500/30 text-orange-300 border-orange-500/50',
    inactive: 'text-orange-400 hover:bg-orange-500/10',
  },
  gray: {
    active: 'bg-gray-500/30 text-gray-300 border-gray-500/50',
    inactive: 'text-gray-400 hover:bg-gray-500/10',
  },
  red: {
    active: 'bg-red-500/30 text-red-300 border-red-500/50',
    inactive: 'text-red-400 hover:bg-red-500/10',
  },
  amber: {
    active: 'bg-amber-500/30 text-amber-300 border-amber-500/50',
    inactive: 'text-amber-400 hover:bg-amber-500/10',
  },
  blue: {
    active: 'bg-blue-500/30 text-blue-300 border-blue-500/50',
    inactive: 'text-blue-400 hover:bg-blue-500/10',
  },
};

export const SegmentTabs: React.FC<SegmentTabsProps> = ({
  segments,
  activeSegment,
  onSegmentChange,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {segments.map((segment) => {
        const isActive = activeSegment === segment.id;
        const colorScheme = TAB_COLORS[segment.color || 'primary'] || TAB_COLORS.primary;

        return (
          <button
            key={segment.id}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium cursor-pointer
              transition-all border
              ${isActive ? colorScheme.active : `bg-white/5 border-white/10 ${colorScheme.inactive}`}
            `}
            onClick={() => onSegmentChange(segment.id)}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentTabs;
