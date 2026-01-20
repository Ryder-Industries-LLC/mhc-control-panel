import React, { useState, useEffect, useCallback } from 'react';
import { PersonAttribute, AttributeHistoryEntry } from '../types/attributes';
import { AttributeBadge } from './AttributeBadge';
import { AttributeCheckbox } from './AttributeCheckbox';
import { AttributeHistoryTooltip } from './AttributeHistoryTooltip';
import { ManageAttributesModal } from './ManageAttributesModal';

interface ProfileAttributesProps {
  /** Username to fetch/update attributes for */
  username: string;
  /** Person ID (optional, for reference) */
  personId?: string;
  /** Callback when an attribute is changed */
  onAttributeChange?: (key: string, value: boolean) => void;
  /** Whether to show the expandable history panel */
  showHistory?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ProfileAttributes - Profile-specific attributes section
 *
 * Uses the new component architecture:
 * - AttributeBadge for badge-type attributes (read-only pills)
 * - AttributeCheckbox for toggleable attributes
 * - AttributeHistoryTooltip for hover history
 * - ManageAttributesModal for admin management
 *
 * Layout:
 * - Badge attributes row (auto-derived, banned_me when true)
 * - Safety/blocking checkboxes row
 * - Curation/interest checkboxes row
 * - Expandable history panel
 * - Manage button
 */
export const ProfileAttributes: React.FC<ProfileAttributesProps> = ({
  username,
  personId,
  onAttributeChange,
  showHistory = true,
  className = '',
}) => {
  const [checkboxAttributes, setCheckboxAttributes] = useState<PersonAttribute[]>([]);
  const [badgeAttributes, setBadgeAttributes] = useState<PersonAttribute[]>([]);
  const [history, setHistory] = useState<AttributeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch attributes
  const fetchAttributes = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/attributes/person/${username}`);
      if (!response.ok) {
        throw new Error('Failed to fetch attributes');
      }
      const data = await response.json();
      setCheckboxAttributes(data.checkboxAttributes || []);
      setBadgeAttributes(data.badgeAttributes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [username]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    if (!username) return;
    setHistoryLoading(true);

    try {
      const response = await fetch(`/api/attributes/person/${username}/history?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Error fetching attribute history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  useEffect(() => {
    if (showHistoryPanel) {
      fetchHistory();
    }
  }, [showHistoryPanel, fetchHistory]);

  // Toggle attribute handler
  const handleToggle = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue;

    // Optimistic update
    setCheckboxAttributes((prev) =>
      prev.map((attr) => (attr.key === key ? { ...attr, value: newValue } : attr))
    );

    try {
      const response = await fetch(`/api/attributes/person/${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: newValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to update attribute');
      }

      onAttributeChange?.(key, newValue);

      // Refresh history if showing
      if (showHistoryPanel) {
        fetchHistory();
      }
    } catch (err) {
      // Revert on error
      setCheckboxAttributes((prev) =>
        prev.map((attr) => (attr.key === key ? { ...attr, value: currentValue } : attr))
      );
      console.error('Error updating attribute:', err);
    }
  };

  // Handle attributes changed in modal (refetch)
  const handleAttributesChanged = () => {
    fetchAttributes();
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-white/50 ${className}`}>
        <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white/70 rounded-full" />
        <span className="text-sm">Loading attributes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-400 text-sm ${className}`}>
        Error loading attributes: {error}
      </div>
    );
  }

  // Group checkbox attributes by category (safety vs curation)
  const safetyAttributes = checkboxAttributes.filter((attr) =>
    ['banned_me', 'banned_by_me', 'room_banned'].includes(attr.key)
  );
  const curationAttributes = checkboxAttributes.filter(
    (attr) => !['banned_me', 'banned_by_me', 'room_banned'].includes(attr.key)
  );

  // Filter badge attributes to only show those that are true
  const activeBadges = badgeAttributes.filter((attr) => attr.value);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Badge Attributes (read-only pills for auto-derived, etc.) */}
      {activeBadges.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeBadges.map((attr) => (
            <AttributeHistoryTooltip key={attr.key} username={username} attributeKey={attr.key}>
              <AttributeBadge attribute={attr} size="sm" />
            </AttributeHistoryTooltip>
          ))}
        </div>
      )}

      {/* Safety / Blocking Row */}
      {safetyAttributes.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          {safetyAttributes.map((attr) => (
            <AttributeHistoryTooltip key={attr.key} username={username} attributeKey={attr.key}>
              <AttributeCheckbox
                attribute={attr}
                onToggle={() => handleToggle(attr.key, attr.value)}
                disabled={attr.definition.isAutoDerived}
              />
            </AttributeHistoryTooltip>
          ))}
        </div>
      )}

      {/* Curation / Interest Row */}
      {curationAttributes.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          {curationAttributes.map((attr) => {
            // Auto-derived attributes show as read-only badges when true
            if (attr.definition.isAutoDerived) {
              if (!attr.value) return null;
              return (
                <AttributeHistoryTooltip key={attr.key} username={username} attributeKey={attr.key}>
                  <AttributeBadge attribute={attr} size="sm" />
                </AttributeHistoryTooltip>
              );
            }
            return (
              <AttributeHistoryTooltip key={attr.key} username={username} attributeKey={attr.key}>
                <AttributeCheckbox
                  attribute={attr}
                  onToggle={() => handleToggle(attr.key, attr.value)}
                />
              </AttributeHistoryTooltip>
            );
          })}
        </div>
      )}

      {/* History Toggle & Panel */}
      {showHistory && (
        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            className="text-xs text-white/50 hover:text-white/70 flex items-center gap-1"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showHistoryPanel ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Attribute History
          </button>

          <button
            onClick={() => setShowManageModal(true)}
            className="text-xs text-white/50 hover:text-white/70 flex items-center gap-1"
            title="Manage Attributes"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manage
          </button>
        </div>
      )}

      {showHistoryPanel && (
        <div className="mt-2 max-h-48 overflow-y-auto bg-mhc-surface-dark/50 rounded p-2 text-xs">
          {historyLoading ? (
            <div className="text-white/50 text-center py-2">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-white/50 text-center py-2">No history available</div>
          ) : (
            <div className="space-y-1">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-white/70 py-1 border-b border-white/10 last:border-0"
                >
                  <span>
                    <span className="font-medium">{entry.label || entry.attributeKey}</span>:{' '}
                    {entry.oldValue === null ? (
                      <span className="text-emerald-400">set to {entry.newValue ? 'on' : 'off'}</span>
                    ) : entry.newValue ? (
                      <span className="text-emerald-400">turned on</span>
                    ) : (
                      <span className="text-red-400">turned off</span>
                    )}
                  </span>
                  <span className="text-white/40">
                    {new Date(entry.changedAt).toLocaleDateString()}{' '}
                    {new Date(entry.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manage Attributes Modal */}
      <ManageAttributesModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        onAttributesChanged={handleAttributesChanged}
      />
    </div>
  );
};

export default ProfileAttributes;
