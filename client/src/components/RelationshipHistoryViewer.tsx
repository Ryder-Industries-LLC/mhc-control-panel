import React, { useState, useEffect } from 'react';

export type HistoryFieldName = 'status' | 'since_date' | 'until_date' | 'roles';
export type HistoryFieldType = 'Status' | 'Dates' | 'Roles';

export interface RelationshipHistoryEntry {
  id: string;
  relationship_id: string;
  field_name: HistoryFieldName;
  old_value: any;
  new_value: any;
  change_note: string | null;
  changed_at: string;
  changed_by: string;
  event_source: string;
}

interface RelationshipHistoryViewerProps {
  username: string;
  collapsed?: boolean;
}

// Time range options
const TIME_RANGES = [
  { label: 'All', value: 'all' },
  { label: 'Last 7d', value: '7d' },
  { label: 'Last 30d', value: '30d' },
] as const;

// Field type options
const FIELD_TYPES = [
  { label: 'All', value: undefined },
  { label: 'Status', value: 'Status' as HistoryFieldType },
  { label: 'Dates', value: 'Dates' as HistoryFieldType },
  { label: 'Roles', value: 'Roles' as HistoryFieldType },
] as const;

export const RelationshipHistoryViewer: React.FC<RelationshipHistoryViewerProps> = ({
  username,
  collapsed: initialCollapsed = true,
}) => {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [entries, setEntries] = useState<RelationshipHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedFieldType, setSelectedFieldType] = useState<HistoryFieldType | undefined>(undefined);
  const [selectedTimeRange, setSelectedTimeRange] = useState<typeof TIME_RANGES[number]['value']>('all');

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchHistory = async () => {
    if (!username) return;

    setLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (selectedFieldType) {
        params.set('fieldType', selectedFieldType);
      }
      if (selectedTimeRange === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.set('startDate', d.toISOString());
      } else if (selectedTimeRange === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        params.set('startDate', d.toISOString());
      }
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const response = await fetch(`/api/profile/${username}/relationship/history?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch history');
      }

      const result = await response.json();
      setEntries(result.entries || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  // Fetch when filters change or panel opens
  useEffect(() => {
    if (!collapsed) {
      fetchHistory();
    }
  }, [collapsed, selectedFieldType, selectedTimeRange, offset, username]);

  // Format roles change for display
  const formatRolesChange = (
    oldRoles: string[] | null,
    newRoles: string[] | null
  ): { added: string[]; removed: string[] } => {
    const old = oldRoles || [];
    const current = newRoles || [];

    const added = current.filter(r => !old.includes(r));
    const removed = old.filter(r => !current.includes(r));

    return { added, removed };
  };

  // Format value for display
  const formatValue = (fieldName: HistoryFieldName, value: any): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-white/30 italic">Not set</span>;
    }

    if (fieldName === 'roles') {
      const roles = Array.isArray(value) ? value : [];
      if (roles.length === 0) {
        return <span className="text-white/30 italic">None</span>;
      }
      return (
        <span className="flex gap-1 flex-wrap">
          {roles.map((role: string) => (
            <span key={role} className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/70">
              {role}
            </span>
          ))}
        </span>
      );
    }

    if (fieldName === 'since_date' || fieldName === 'until_date') {
      return <span className="text-white/70">{value}</span>;
    }

    return <span className="text-white/70">{String(value)}</span>;
  };

  // Render a single history entry
  const renderEntry = (entry: RelationshipHistoryEntry) => {
    const changedAt = new Date(entry.changed_at);
    const fieldLabel = entry.field_name === 'since_date'
      ? 'Since Date'
      : entry.field_name === 'until_date'
        ? 'Until Date'
        : entry.field_name.charAt(0).toUpperCase() + entry.field_name.slice(1);

    // Special handling for roles - show diff
    if (entry.field_name === 'roles') {
      const { added, removed } = formatRolesChange(entry.old_value, entry.new_value);
      const hasChanges = added.length > 0 || removed.length > 0;

      return (
        <div key={entry.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-white/50">{fieldLabel}</span>
            <span className="text-xs text-white/40">
              {changedAt.toLocaleDateString()} {changedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {hasChanges ? (
            <div className="space-y-1">
              {added.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-400">Added:</span>
                  <div className="flex gap-1">
                    {added.map(role => (
                      <span key={role} className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {removed.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">Removed:</span>
                  <div className="flex gap-1">
                    {removed.map(role => (
                      <span key={role} className="px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">Changed:</span>
              {formatValue('roles', entry.old_value)}
              <span className="text-white/30">→</span>
              {formatValue('roles', entry.new_value)}
            </div>
          )}
          {entry.change_note && (
            <div className="mt-2 text-xs text-white/40 italic">{entry.change_note}</div>
          )}
        </div>
      );
    }

    // Standard entry display
    return (
      <div key={entry.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs text-white/50">{fieldLabel}</span>
          <span className="text-xs text-white/40">
            {changedAt.toLocaleDateString()} {changedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {formatValue(entry.field_name, entry.old_value)}
          <span className="text-white/30">→</span>
          {formatValue(entry.field_name, entry.new_value)}
        </div>
        {entry.change_note && (
          <div className="mt-2 text-xs text-white/40 italic">{entry.change_note}</div>
        )}
      </div>
    );
  };

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {/* Header / Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-3 flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors"
      >
        <span className="text-sm font-medium text-white/80">Relationship History</span>
        <div className="flex items-center gap-2">
          {!collapsed && total > 0 && (
            <span className="text-xs text-white/50">{total} entries</span>
          )}
          <svg
            className={`w-4 h-4 text-white/50 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="p-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            {/* Field Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">Type:</span>
              <div className="flex gap-1">
                {FIELD_TYPES.map(ft => (
                  <button
                    key={ft.label}
                    onClick={() => {
                      setSelectedFieldType(ft.value);
                      setOffset(0);
                    }}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      selectedFieldType === ft.value
                        ? 'bg-mhc-primary/40 text-mhc-primary'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {ft.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Range Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">Time:</span>
              <div className="flex gap-1">
                {TIME_RANGES.map(tr => (
                  <button
                    key={tr.value}
                    onClick={() => {
                      setSelectedTimeRange(tr.value);
                      setOffset(0);
                    }}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      selectedTimeRange === tr.value
                        ? 'bg-mhc-primary/40 text-mhc-primary'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Loading / Error / Content */}
          {loading ? (
            <div className="text-center py-8 text-white/50">Loading history...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-400">{error}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-white/40">No history entries found</div>
          ) : (
            <div className="space-y-2">
              {entries.map(renderEntry)}
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
              <span className="text-xs text-white/50">
                Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-3 py-1 text-xs bg-white/5 text-white/60 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-3 py-1 text-xs bg-white/5 text-white/60 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RelationshipHistoryViewer;
