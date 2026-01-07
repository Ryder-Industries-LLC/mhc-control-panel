import React, { useState, useEffect } from 'react';
import { CountItem } from '../../types/people';
import { CountsGrid } from './CountsGrid';

const STORAGE_KEY = 'mhc-filters-expanded';

export interface FiltersPanelProps {
  // Collapse behavior
  defaultExpanded?: boolean;

  // Counts section (stats cards)
  counts?: CountItem[];
  activeCountFilters?: Set<string>;
  onCountFilterToggle?: (filterId: string) => void;

  // Tag presets
  tagPresets?: string[];
  activeTagPreset?: string;
  onTagPresetSelect?: (tag: string) => void;

  // Search input
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  // Text filter input
  textFilterValue?: string;
  onTextFilterChange?: (value: string) => void;

  // Tag filter input
  tagFilterValue?: string;
  onTagFilterChange?: (value: string) => void;

  // Role filter buttons
  showRoleFilter?: boolean;
  roleFilter?: string;
  onRoleFilterChange?: (role: string) => void;
  roleCounts?: { all: number; model: number; viewer: number };

  // Custom filter content slot
  customFilters?: React.ReactNode;

  className?: string;
}

export const FiltersPanel: React.FC<FiltersPanelProps> = ({
  defaultExpanded = false,
  counts,
  activeCountFilters = new Set(),
  onCountFilterToggle,
  tagPresets,
  activeTagPreset,
  onTagPresetSelect,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search usernames...',
  textFilterValue = '',
  onTextFilterChange,
  tagFilterValue = '',
  onTagFilterChange,
  showRoleFilter = false,
  roleFilter = 'ALL',
  onRoleFilterChange,
  roleCounts,
  customFilters,
  className = '',
}) => {
  // Initialize from localStorage, fallback to defaultExpanded
  const [expanded, setExpanded] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    return defaultExpanded;
  });

  // Persist to localStorage when changed
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(expanded));
  }, [expanded]);

  const hasSearchInputs = onSearchChange || onTextFilterChange || onTagFilterChange;
  const hasAnyContent = counts || tagPresets || hasSearchInputs || showRoleFilter || customFilters;

  // Always render container for consistent layout spacing
  return (
    <div className={`bg-white/3 border border-white/10 rounded-lg overflow-hidden ${className}`}>
      {/* Header / Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-white font-medium">Filters</span>
        <span className="text-white/60 text-lg">{expanded ? '\u25BC' : '\u25B6'}</span>
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Show message if no filters available */}
          {!hasAnyContent && (
            <p className="text-white/40 text-sm italic">No filters available for this view.</p>
          )}

          {/* Counts Grid (stats cards) */}
          {counts && counts.length > 0 && onCountFilterToggle && (
            <CountsGrid
              counts={counts}
              activeFilters={activeCountFilters}
              onToggle={onCountFilterToggle}
            />
          )}

          {/* Tag Presets */}
          {tagPresets && tagPresets.length > 0 && onTagPresetSelect && (
            <div className="flex flex-wrap gap-2 p-3 bg-white/3 rounded-lg border border-white/5">
              {tagPresets.map(tag => (
                <button
                  key={tag}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all ${
                    activeTagPreset?.toLowerCase() === tag.toLowerCase()
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-transparent shadow-lg shadow-purple-500/40'
                      : 'bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/40 hover:-translate-y-0.5'
                  }`}
                  onClick={() => onTagPresetSelect(activeTagPreset?.toLowerCase() === tag.toLowerCase() ? '' : tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Search and Filter Inputs */}
          {hasSearchInputs && (
            <div className="flex gap-4 flex-wrap items-center">
              {/* Username search */}
              {onSearchChange && (
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-base placeholder:text-white/40 focus:outline-none focus:border-mhc-primary focus:bg-white/8"
                  />
                </div>
              )}

              {/* Text filter */}
              {onTextFilterChange && (
                <div className="flex-1 min-w-[150px]">
                  <input
                    type="text"
                    placeholder="Filter results..."
                    value={textFilterValue}
                    onChange={(e) => onTextFilterChange(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-base placeholder:text-white/40 focus:outline-none focus:border-mhc-primary focus:bg-white/8"
                  />
                </div>
              )}

              {/* Tag filter with clear button */}
              {onTagFilterChange && (
                <div className="relative flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Filter by tag..."
                    value={tagFilterValue}
                    onChange={(e) => onTagFilterChange(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-base placeholder:text-white/40 focus:outline-none focus:border-mhc-primary focus:bg-white/8"
                  />
                  {tagFilterValue && (
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-white/40 cursor-pointer text-base p-1 transition-colors hover:text-red-400"
                      onClick={() => onTagFilterChange('')}
                    >
                      &times;
                    </button>
                  )}
                </div>
              )}

              {/* Role filter buttons */}
              {showRoleFilter && onRoleFilterChange && roleCounts && (
                <div className="flex gap-2">
                  <button
                    className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                      roleFilter === 'ALL'
                        ? 'bg-gradient-primary text-white border-transparent'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                    onClick={() => onRoleFilterChange('ALL')}
                  >
                    All ({roleCounts.all.toLocaleString()})
                  </button>
                  <button
                    className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                      roleFilter === 'MODEL'
                        ? 'bg-gradient-primary text-white border-transparent'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                    onClick={() => onRoleFilterChange('MODEL')}
                  >
                    Models ({roleCounts.model.toLocaleString()})
                  </button>
                  <button
                    className={`px-4 py-2 rounded-md text-sm cursor-pointer transition-all ${
                      roleFilter === 'VIEWER'
                        ? 'bg-gradient-primary text-white border-transparent'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                    onClick={() => onRoleFilterChange('VIEWER')}
                  >
                    Viewers ({roleCounts.viewer.toLocaleString()})
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Custom filters slot */}
          {customFilters}
        </div>
      )}
    </div>
  );
};

export default FiltersPanel;
