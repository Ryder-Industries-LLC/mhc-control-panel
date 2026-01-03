import React, { useState, useEffect } from 'react';

export interface ProfileNames {
  irl_name: string | null;
  identity_name: string | null;
  address_as: string[];
}

export interface AddressTermSeed {
  id: number;
  name: string;
  display_order: number;
}

interface NamesEditorProps {
  names: ProfileNames | null;
  addressTermSeeds?: AddressTermSeed[];
  onSave: (names: ProfileNames) => Promise<void>;
  disabled?: boolean;
}

export const NamesEditor: React.FC<NamesEditorProps> = ({
  names,
  addressTermSeeds = [],
  onSave,
  disabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [irlName, setIrlName] = useState(names?.irl_name || '');
  const [identityName, setIdentityName] = useState(names?.identity_name || '');
  const [addressAs, setAddressAs] = useState<string[]>(names?.address_as || []);
  const [customTerm, setCustomTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update local state when names change
  useEffect(() => {
    setIrlName(names?.irl_name || '');
    setIdentityName(names?.identity_name || '');
    setAddressAs(names?.address_as || []);
  }, [names]);

  const handleTermToggle = (term: string) => {
    setAddressAs(prev =>
      prev.includes(term)
        ? prev.filter(t => t !== term)
        : [...prev, term]
    );
  };

  const handleAddCustomTerm = () => {
    if (customTerm.trim() && !addressAs.includes(customTerm.trim())) {
      setAddressAs(prev => [...prev, customTerm.trim()]);
      setCustomTerm('');
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    try {
      await onSave({
        irl_name: irlName.trim() || null,
        identity_name: identityName.trim() || null,
        address_as: addressAs,
      });
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const hasNames = !!(names?.irl_name || names?.identity_name || (names?.address_as && names.address_as.length > 0));

  // Compact display when not editing
  if (!isEditing) {
    return (
      <div className="p-3 rounded-lg border border-white/10 bg-white/5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {hasNames ? (
              <div className="space-y-1">
                {names?.identity_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">Identity:</span>
                    <span className="text-sm text-white/90">{names.identity_name}</span>
                  </div>
                )}
                {names?.irl_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">IRL:</span>
                    <span className="text-sm text-white/70">{names.irl_name}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                      Private
                    </span>
                  </div>
                )}
                {names?.address_as && names.address_as.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">Address as:</span>
                    <div className="flex gap-1">
                      {names.address_as.map(term => (
                        <span key={term} className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/70">
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-white/40 text-sm">No names set</span>
            )}
          </div>
          <button
            onClick={() => setIsEditing(true)}
            disabled={disabled}
            className="px-3 py-1 text-xs text-white/60 hover:text-white/90 transition-colors disabled:opacity-50"
          >
            {hasNames ? 'Edit' : 'Set'}
          </button>
        </div>
      </div>
    );
  }

  // Expanded editing mode
  return (
    <div className="p-4 rounded-lg border border-white/20 bg-white/5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-white/80">Edit Names</span>
        <button
          onClick={() => setIsEditing(false)}
          disabled={saving}
          className="px-3 py-1 text-xs text-white/60 hover:text-white/90 transition-colors"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* IRL Name (Private) */}
        <div>
          <label className="flex items-center gap-2 text-sm text-white/70 mb-1">
            IRL Name
            <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
              Private
            </span>
          </label>
          <input
            type="text"
            value={irlName}
            onChange={e => setIrlName(e.target.value)}
            placeholder="Real name (never displayed publicly)..."
            disabled={saving || disabled}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-mhc-primary disabled:opacity-50"
          />
        </div>

        {/* Identity Name (Safe to display) */}
        <div>
          <label className="flex items-center gap-2 text-sm text-white/70 mb-1">
            Identity Name
            <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Safe to use
            </span>
          </label>
          <input
            type="text"
            value={identityName}
            onChange={e => setIdentityName(e.target.value)}
            placeholder="Display name / nickname..."
            disabled={saving || disabled}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-mhc-primary disabled:opacity-50"
          />
        </div>

        {/* Address As (Multi-select) */}
        <div>
          <label className="block text-sm text-white/70 mb-2">Address As</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {/* Seed terms */}
            {addressTermSeeds.map(term => (
              <button
                key={term.name}
                onClick={() => handleTermToggle(term.name)}
                disabled={saving || disabled}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  addressAs.includes(term.name)
                    ? 'bg-mhc-primary/40 text-mhc-primary border border-mhc-primary/50'
                    : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/30'
                } disabled:opacity-50`}
              >
                {term.name}
              </button>
            ))}
            {/* Custom terms (not in seeds) */}
            {addressAs
              .filter(t => !addressTermSeeds.some(seed => seed.name === t))
              .map(term => (
                <button
                  key={term}
                  onClick={() => handleTermToggle(term)}
                  disabled={saving || disabled}
                  className="px-2 py-1 rounded text-xs bg-mhc-primary/40 text-mhc-primary border border-mhc-primary/50 disabled:opacity-50"
                >
                  {term} x
                </button>
              ))}
          </div>
          {/* Add custom term */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customTerm}
              onChange={e => setCustomTerm(e.target.value)}
              placeholder="Add custom term..."
              disabled={saving || disabled}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-white/30 focus:outline-none focus:border-mhc-primary disabled:opacity-50"
              onKeyDown={e => e.key === 'Enter' && handleAddCustomTerm()}
            />
            <button
              onClick={handleAddCustomTerm}
              disabled={saving || disabled || !customTerm.trim()}
              className="px-2 py-1 text-xs text-white/60 hover:text-white/90 border border-white/10 rounded disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || disabled}
          className="w-full py-2 bg-mhc-primary hover:bg-mhc-primary/80 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Names'}
        </button>
      </div>
    </div>
  );
};

export default NamesEditor;
