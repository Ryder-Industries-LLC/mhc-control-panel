import React from 'react';
import { SegmentConfig, TabType, SEGMENTS } from '../../types/people';
import { SegmentTabs } from './SegmentTabs';

export interface PeopleLayoutProps {
  // Segment configuration
  segments?: SegmentConfig[];
  activeSegment: TabType;
  onSegmentChange: (segment: TabType) => void;

  // Header
  title?: string;
  headerActions?: React.ReactNode;

  // Error state
  error?: string | null;

  // Loading state (for initial page load)
  loading?: boolean;

  // Main content
  children: React.ReactNode;

  className?: string;
}

export const PeopleLayout: React.FC<PeopleLayoutProps> = ({
  segments = SEGMENTS,
  activeSegment,
  onSegmentChange,
  title = 'People',
  headerActions,
  error,
  loading = false,
  children,
  className = '',
}) => {
  return (
    <div className={`max-w-[1800px] mx-auto ${className}`}>
      {/* Header with title and optional actions */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {headerActions && <div className="flex gap-2">{headerActions}</div>}
      </div>

      {/* Segment tabs */}
      <SegmentTabs
        segments={segments}
        activeSegment={activeSegment}
        onSegmentChange={onSegmentChange}
        className="mb-4"
      />

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div className="p-12 text-center text-white/50 bg-white/5 border border-white/10 rounded-xl">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mhc-primary mx-auto mb-4" />
          Loading...
        </div>
      ) : (
        children
      )}
    </div>
  );
};

export default PeopleLayout;
