import React, { useState, useEffect } from 'react';

// Types
export type RoleType = 'Dom' | 'Sub' | 'Friend' | 'Custom';
export type RelationshipStatus =
  | 'Potential'
  | 'Occasional'
  | 'Active'
  | 'On Hold'
  | 'Inactive'
  | 'Decommissioned'
  | 'Banished';

export interface Relationship {
  id?: string;
  roles: RoleType[];
  custom_role_label: string | null;
  status: RelationshipStatus;
  traits: string[];
  since_date: string | null;
  until_date: string | null;
  notes: string | null;
}

export interface RelationshipTraitSeed {
  id: number;
  name: string;
  category: 'dom' | 'sub' | 'friend' | 'general';
  display_order: number;
}

// Constants
const ROLES: RoleType[] = ['Dom', 'Sub', 'Friend', 'Custom'];
const STATUSES: RelationshipStatus[] = [
  'Potential',
  'Occasional',
  'Active',
  'On Hold',
  'Inactive',
  'Decommissioned',
  'Banished',
];

// Status color classes (using CSS variables would be ideal, hardcoded for now)
const STATUS_COLORS: Record<RelationshipStatus, { bg: string; text: string; border: string }> = {
  Active: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/50' },
  Occasional: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
  Potential: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/50' },
  'On Hold': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50' },
  Inactive: { bg: 'bg-gray-600/20', text: 'text-gray-500', border: 'border-gray-600/50' },
  Decommissioned: { bg: 'bg-red-600/20', text: 'text-red-500', border: 'border-red-600/50' },
  Banished: { bg: 'bg-red-500/30', text: 'text-red-400', border: 'border-red-500/60' },
};

// Role color classes
const ROLE_COLORS: Record<RoleType, { bg: string; text: string; border: string }> = {
  Dom: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' },
  Sub: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/50' },
  Friend: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
  Custom: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/50' },
};

interface RelationshipEditorProps {
  relationship: Relationship | null;
  traitSeeds?: RelationshipTraitSeed[];
  onSave: (data: {
    roles: RoleType[];
    custom_role_label: string | null;
    status: RelationshipStatus;
    traits: string[];
    since_date: string | null;
    until_date: string | null;
    notes: string | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  disabled?: boolean;
}

export const RelationshipEditor: React.FC<RelationshipEditorProps> = ({
  relationship,
  traitSeeds = [],
  onSave,
  onDelete,
  disabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<RoleType[]>(relationship?.roles || []);
  const [customRoleLabel, setCustomRoleLabel] = useState(relationship?.custom_role_label || '');
  const [status, setStatus] = useState<RelationshipStatus>(relationship?.status || 'Potential');
  const [selectedTraits, setSelectedTraits] = useState<string[]>(relationship?.traits || []);
  const [customTrait, setCustomTrait] = useState('');
  const [sinceDate, setSinceDate] = useState(relationship?.since_date || '');
  const [untilDate, setUntilDate] = useState(relationship?.until_date || '');
  const [notes, setNotes] = useState(relationship?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update local state when relationship changes
  useEffect(() => {
    setSelectedRoles(relationship?.roles || []);
    setCustomRoleLabel(relationship?.custom_role_label || '');
    setStatus(relationship?.status || 'Potential');
    setSelectedTraits(relationship?.traits || []);
    setSinceDate(relationship?.since_date || '');
    setUntilDate(relationship?.until_date || '');
    setNotes(relationship?.notes || '');
  }, [relationship]);

  // Get traits relevant to selected roles
  const getRelevantTraits = (): RelationshipTraitSeed[] => {
    const categories = new Set<string>();
    if (selectedRoles.includes('Dom')) categories.add('dom');
    if (selectedRoles.includes('Sub')) categories.add('sub');
    if (selectedRoles.includes('Friend')) categories.add('friend');
    categories.add('general');

    return traitSeeds.filter(t => categories.has(t.category));
  };

  const handleRoleToggle = (role: RoleType) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleTraitToggle = (trait: string) => {
    setSelectedTraits(prev =>
      prev.includes(trait)
        ? prev.filter(t => t !== trait)
        : [...prev, trait]
    );
  };

  const handleAddCustomTrait = () => {
    if (customTrait.trim() && !selectedTraits.includes(customTrait.trim())) {
      setSelectedTraits(prev => [...prev, customTrait.trim()]);
      setCustomTrait('');
    }
  };

  const handleSave = async () => {
    if (selectedRoles.length === 0) {
      setError('Please select at least one role');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await onSave({
        roles: selectedRoles,
        custom_role_label: selectedRoles.includes('Custom') ? customRoleLabel || null : null,
        status,
        traits: selectedTraits,
        since_date: sinceDate || null,
        until_date: untilDate || null,
        notes: notes || null,
      });
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm('Are you sure you want to remove this relationship?')) {
      return;
    }

    setSaving(true);
    try {
      await onDelete();
      setSelectedRoles([]);
      setCustomRoleLabel('');
      setStatus('Potential');
      setSelectedTraits([]);
      setSinceDate('');
      setUntilDate('');
      setNotes('');
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to remove');
    } finally {
      setSaving(false);
    }
  };

  const hasRelationship = relationship && relationship.roles.length > 0;
  const isBanished = status === 'Banished';

  // Compact display when not editing
  if (!isEditing) {
    return (
      <div className={`p-3 rounded-lg border ${
        isBanished
          ? 'border-red-500/50 bg-red-500/10'
          : hasRelationship
            ? 'border-white/20 bg-white/5'
            : 'border-white/10 bg-white/5'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            {hasRelationship ? (
              <>
                {/* Status badge (first, takes precedence) */}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text} ${STATUS_COLORS[status].border} border`}>
                  {status}
                </span>
                {/* Role badges */}
                {relationship.roles.map(role => (
                  <span
                    key={role}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role].bg} ${ROLE_COLORS[role].text} ${ROLE_COLORS[role].border} border`}
                  >
                    {role === 'Custom' && relationship.custom_role_label
                      ? relationship.custom_role_label
                      : role}
                  </span>
                ))}
                {/* Traits (compact) */}
                {selectedTraits.length > 0 && (
                  <div className="flex gap-1">
                    {selectedTraits.slice(0, 3).map(trait => (
                      <span key={trait} className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/70">
                        {trait}
                      </span>
                    ))}
                    {selectedTraits.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/50">
                        +{selectedTraits.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span className="text-white/40 text-sm">No relationship set</span>
            )}
          </div>
          <button
            onClick={() => setIsEditing(true)}
            disabled={disabled}
            className="px-3 py-1 text-xs text-white/60 hover:text-white/90 transition-colors disabled:opacity-50"
          >
            {hasRelationship ? 'Edit' : 'Set'}
          </button>
        </div>
      </div>
    );
  }

  // Expanded editing mode
  const relevantTraits = getRelevantTraits();

  return (
    <div className={`p-4 rounded-lg border ${
      isBanished ? 'border-red-500/30 bg-red-500/5' : 'border-white/20 bg-white/5'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-white/80">
          {hasRelationship ? 'Edit Relationship' : 'New Relationship'}
        </span>
        <div className="flex gap-2">
          {hasRelationship && onDelete && (
            <button
              onClick={handleDelete}
              disabled={saving || disabled}
              className="px-3 py-1 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <button
            onClick={() => setIsEditing(false)}
            disabled={saving}
            className="px-3 py-1 text-xs text-white/60 hover:text-white/90 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Roles Multi-select */}
        <div>
          <label className="block text-sm text-white/70 mb-2">Roles *</label>
          <div className="flex flex-wrap gap-2">
            {ROLES.map(role => (
              <button
                key={role}
                onClick={() => handleRoleToggle(role)}
                disabled={saving || disabled}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  selectedRoles.includes(role)
                    ? `${ROLE_COLORS[role].bg} ${ROLE_COLORS[role].text} ${ROLE_COLORS[role].border} border`
                    : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/30'
                } disabled:opacity-50`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Role Label (shown when Custom is selected) */}
        {selectedRoles.includes('Custom') && (
          <div>
            <label className="block text-sm text-white/70 mb-1">Custom Role Label</label>
            <input
              type="text"
              value={customRoleLabel}
              onChange={e => setCustomRoleLabel(e.target.value)}
              placeholder="Enter custom role name..."
              disabled={saving || disabled}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-mhc-primary disabled:opacity-50"
            />
          </div>
        )}

        {/* Status Select */}
        <div>
          <label className="block text-sm text-white/70 mb-1">Status *</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as RelationshipStatus)}
            disabled={saving || disabled}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-mhc-primary disabled:opacity-50"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Traits Multi-select */}
        <div>
          <label className="block text-sm text-white/70 mb-2">Traits</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {/* Show relevant seed traits first */}
            {relevantTraits.map(trait => (
              <button
                key={trait.name}
                onClick={() => handleTraitToggle(trait.name)}
                disabled={saving || disabled}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  selectedTraits.includes(trait.name)
                    ? 'bg-mhc-primary/40 text-mhc-primary border border-mhc-primary/50'
                    : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/30'
                } disabled:opacity-50`}
              >
                {trait.name}
              </button>
            ))}
            {/* Show custom (non-seed) traits */}
            {selectedTraits
              .filter(t => !relevantTraits.some(seed => seed.name === t))
              .map(trait => (
                <button
                  key={trait}
                  onClick={() => handleTraitToggle(trait)}
                  disabled={saving || disabled}
                  className="px-2 py-1 rounded text-xs bg-mhc-primary/40 text-mhc-primary border border-mhc-primary/50 disabled:opacity-50"
                >
                  {trait} x
                </button>
              ))}
          </div>
          {/* Add custom trait */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customTrait}
              onChange={e => setCustomTrait(e.target.value)}
              placeholder="Add custom trait..."
              disabled={saving || disabled}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-white/30 focus:outline-none focus:border-mhc-primary disabled:opacity-50"
              onKeyDown={e => e.key === 'Enter' && handleAddCustomTrait()}
            />
            <button
              onClick={handleAddCustomTrait}
              disabled={saving || disabled || !customTrait.trim()}
              className="px-2 py-1 text-xs text-white/60 hover:text-white/90 border border-white/10 rounded disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Since</label>
            <input
              type="date"
              value={sinceDate}
              onChange={e => setSinceDate(e.target.value)}
              disabled={saving || disabled}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-mhc-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Until</label>
            <input
              type="date"
              value={untilDate}
              onChange={e => setUntilDate(e.target.value)}
              disabled={saving || disabled}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-mhc-primary disabled:opacity-50"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm text-white/70 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes about this relationship..."
            rows={2}
            disabled={saving || disabled}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 resize-y focus:outline-none focus:border-mhc-primary disabled:opacity-50"
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || disabled || selectedRoles.length === 0}
          className="w-full py-2 bg-mhc-primary hover:bg-mhc-primary/80 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Relationship'}
        </button>
      </div>
    </div>
  );
};

export default RelationshipEditor;
