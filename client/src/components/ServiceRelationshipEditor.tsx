import React, { useState, useEffect } from 'react';

// Service configuration
export const SUB_LEVELS = ['Current', 'Potential', 'Decommissioned', 'Banished', 'Paused'] as const;
export const DOM_LEVELS = ['Potential', 'Actively Serving', 'Ended', 'Paused'] as const;

export const SUB_TYPES = ['pup', 'boi', 'brat', 'slave', 'servant', 'pet'] as const;
export const DOM_TYPES = ['Intellectual', 'Aggressive', 'TokenDaddy', 'Daddy', 'Master', 'Sir'] as const;

export type SubLevel = typeof SUB_LEVELS[number];
export type DomLevel = typeof DOM_LEVELS[number];
export type SubType = typeof SUB_TYPES[number];
export type DomType = typeof DOM_TYPES[number];

export interface ServiceRelationship {
  id?: string;
  service_role: 'sub' | 'dom';
  service_level: string;
  service_types: string[];
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
}

export interface ServiceRelationshipEditorProps {
  relationships: ServiceRelationship[];
  onSave: (role: 'sub' | 'dom', data: {
    serviceLevel: string;
    serviceTypes: string[];
    startedAt?: string | null;
    endedAt?: string | null;
    notes?: string | null;
  }) => Promise<void>;
  onRemove: (role: 'sub' | 'dom') => Promise<void>;
  disabled?: boolean;
  defaultRole?: 'sub' | 'dom'; // If provided, only show that role's editor
}

interface RoleEditorProps {
  role: 'sub' | 'dom';
  relationship: ServiceRelationship | null;
  levels: readonly string[];
  types: readonly string[];
  onSave: (data: {
    serviceLevel: string;
    serviceTypes: string[];
    startedAt?: string | null;
    endedAt?: string | null;
    notes?: string | null;
  }) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

const RoleEditor: React.FC<RoleEditorProps> = ({
  role,
  relationship,
  levels,
  types,
  onSave,
  onRemove,
  disabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [level, setLevel] = useState(relationship?.service_level || '');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(relationship?.service_types || []);
  const [customType, setCustomType] = useState('');
  const [startedAt, setStartedAt] = useState(relationship?.started_at?.split('T')[0] || '');
  const [endedAt, setEndedAt] = useState(relationship?.ended_at?.split('T')[0] || '');
  const [notes, setNotes] = useState(relationship?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update local state when relationship changes
  useEffect(() => {
    setLevel(relationship?.service_level || '');
    setSelectedTypes(relationship?.service_types || []);
    setStartedAt(relationship?.started_at?.split('T')[0] || '');
    setEndedAt(relationship?.ended_at?.split('T')[0] || '');
    setNotes(relationship?.notes || '');
  }, [relationship]);

  const handleTypeToggle = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleAddCustomType = () => {
    if (customType.trim() && !selectedTypes.includes(customType.trim())) {
      setSelectedTypes(prev => [...prev, customType.trim()]);
      setCustomType('');
    }
  };

  const handleSave = async () => {
    if (!level) {
      setError('Please select a level');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await onSave({
        serviceLevel: level,
        serviceTypes: selectedTypes,
        startedAt: startedAt || null,
        endedAt: endedAt || null,
        notes: notes || null,
      });
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Are you sure you want to remove the ${role.toUpperCase()} relationship?`)) {
      return;
    }

    setSaving(true);
    try {
      await onRemove();
      setLevel('');
      setSelectedTypes([]);
      setStartedAt('');
      setEndedAt('');
      setNotes('');
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to remove');
    } finally {
      setSaving(false);
    }
  };

  const roleColor = role === 'sub' ? 'emerald' : 'purple';
  const hasRelationship = !!relationship?.service_level;

  // Compact display when not editing
  if (!isEditing) {
    return (
      <div className={`p-3 rounded-lg border ${hasRelationship ? `border-${roleColor}-500/30 bg-${roleColor}-500/10` : 'border-white/10 bg-white/5'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-semibold uppercase ${hasRelationship ? `text-${roleColor}-400` : 'text-white/50'}`}>
              {role}
            </span>
            {hasRelationship ? (
              <>
                <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${roleColor}-500/30 text-${roleColor}-300`}>
                  {relationship.service_level}
                </span>
                {selectedTypes.length > 0 && (
                  <div className="flex gap-1">
                    {selectedTypes.map(type => (
                      <span key={type} className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/70">
                        {type}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span className="text-white/40 text-sm">Not set</span>
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
  return (
    <div className={`p-4 rounded-lg border border-${roleColor}-500/30 bg-${roleColor}-500/5`}>
      <div className="flex items-center justify-between mb-4">
        <span className={`text-sm font-semibold uppercase text-${roleColor}-400`}>
          {role} Relationship
        </span>
        <div className="flex gap-2">
          {hasRelationship && (
            <button
              onClick={handleRemove}
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
        {/* Level Select */}
        <div>
          <label className="block text-sm text-white/70 mb-1">
            {role === 'sub' ? 'Sub Level' : 'Dom Level'} *
          </label>
          <select
            value={level}
            onChange={e => setLevel(e.target.value)}
            disabled={saving || disabled}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-mhc-primary disabled:opacity-50"
          >
            <option value="">Select level...</option>
            {levels.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Types Multi-select */}
        <div>
          <label className="block text-sm text-white/70 mb-1">
            {role === 'sub' ? 'Sub Types' : 'Dom Types'}
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {types.map(type => (
              <button
                key={type}
                onClick={() => handleTypeToggle(type)}
                disabled={saving || disabled}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  selectedTypes.includes(type)
                    ? `bg-${roleColor}-500/40 text-${roleColor}-200 border border-${roleColor}-500/50`
                    : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/30'
                } disabled:opacity-50`}
              >
                {type}
              </button>
            ))}
            {/* Show custom types */}
            {selectedTypes.filter(t => !types.includes(t as any)).map(type => (
              <button
                key={type}
                onClick={() => handleTypeToggle(type)}
                disabled={saving || disabled}
                className={`px-2 py-1 rounded text-xs bg-${roleColor}-500/40 text-${roleColor}-200 border border-${roleColor}-500/50 disabled:opacity-50`}
              >
                {type} x
              </button>
            ))}
          </div>
          {/* Add custom type */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customType}
              onChange={e => setCustomType(e.target.value)}
              placeholder="Add custom type..."
              disabled={saving || disabled}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-white/30 focus:outline-none focus:border-mhc-primary disabled:opacity-50"
              onKeyDown={e => e.key === 'Enter' && handleAddCustomType()}
            />
            <button
              onClick={handleAddCustomType}
              disabled={saving || disabled || !customType.trim()}
              className="px-2 py-1 text-xs text-white/60 hover:text-white/90 border border-white/10 rounded disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Started</label>
            <input
              type="date"
              value={startedAt}
              onChange={e => setStartedAt(e.target.value)}
              disabled={saving || disabled}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-mhc-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Ended</label>
            <input
              type="date"
              value={endedAt}
              onChange={e => setEndedAt(e.target.value)}
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
          disabled={saving || disabled || !level}
          className={`w-full py-2 bg-${roleColor}-500 hover:bg-${roleColor}-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export const ServiceRelationshipEditor: React.FC<ServiceRelationshipEditorProps> = ({
  relationships,
  onSave,
  onRemove,
  disabled = false,
  defaultRole,
}) => {
  const subRelationship = relationships.find(r => r.service_role === 'sub') || null;
  const domRelationship = relationships.find(r => r.service_role === 'dom') || null;

  // If defaultRole is specified, only show that role's editor
  if (defaultRole === 'sub') {
    return (
      <RoleEditor
        role="sub"
        relationship={subRelationship}
        levels={SUB_LEVELS}
        types={SUB_TYPES}
        onSave={data => onSave('sub', data)}
        onRemove={() => onRemove('sub')}
        disabled={disabled}
      />
    );
  }

  if (defaultRole === 'dom') {
    return (
      <RoleEditor
        role="dom"
        relationship={domRelationship}
        levels={DOM_LEVELS}
        types={DOM_TYPES}
        onSave={data => onSave('dom', data)}
        onRemove={() => onRemove('dom')}
        disabled={disabled}
      />
    );
  }

  // Default: show both editors
  return (
    <div className="space-y-3">
      <RoleEditor
        role="sub"
        relationship={subRelationship}
        levels={SUB_LEVELS}
        types={SUB_TYPES}
        onSave={data => onSave('sub', data)}
        onRemove={() => onRemove('sub')}
        disabled={disabled}
      />
      <RoleEditor
        role="dom"
        relationship={domRelationship}
        levels={DOM_LEVELS}
        types={DOM_TYPES}
        onSave={data => onSave('dom', data)}
        onRemove={() => onRemove('dom')}
        disabled={disabled}
      />
    </div>
  );
};

export default ServiceRelationshipEditor;
