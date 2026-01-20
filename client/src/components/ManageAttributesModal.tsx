import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import {
  AttributeDefinition,
  CreateAttributeDefinition,
} from '../types/attributes';
import {
  getAttributeColorClasses,
  availableColors,
} from '../utils/attributeColors';

interface ManageAttributesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAttributesChanged?: () => void;
}

type EditMode = 'list' | 'create' | 'edit';

/**
 * ManageAttributesModal - Admin modal for managing attribute definitions
 *
 * Features:
 * - List all attribute definitions (system marked as non-editable)
 * - Create new custom attributes
 * - Edit custom attributes
 * - Delete custom attributes (with confirmation)
 * - Cannot modify/delete system attributes
 */
export const ManageAttributesModal: React.FC<ManageAttributesModalProps> = ({
  isOpen,
  onClose,
  onAttributesChanged,
}) => {
  const [definitions, setDefinitions] = useState<AttributeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditMode>('list');
  const [editingAttribute, setEditingAttribute] = useState<AttributeDefinition | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateAttributeDefinition>({
    key: '',
    label: '',
    description: '',
    color: 'gray',
    icon: '',
    showAsBadge: false,
  });

  const fetchDefinitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/attributes/definitions');
      if (!response.ok) throw new Error('Failed to fetch definitions');
      const data = await response.json();
      setDefinitions(data.definitions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDefinitions();
      setMode('list');
      setEditingAttribute(null);
      setDeleteConfirm(null);
    }
  }, [isOpen, fetchDefinitions]);

  const resetForm = () => {
    setFormData({
      key: '',
      label: '',
      description: '',
      color: 'gray',
      icon: '',
      showAsBadge: false,
    });
  };

  const handleCreate = async () => {
    if (!formData.key || !formData.label) {
      setError('Key and Label are required');
      return;
    }

    // Validate key format (lowercase, underscores)
    const keyPattern = /^[a-z][a-z0-9_]*$/;
    if (!keyPattern.test(formData.key)) {
      setError('Key must start with a letter and contain only lowercase letters, numbers, and underscores');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/attributes/definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create attribute');
      }
      await fetchDefinitions();
      onAttributesChanged?.();
      setMode('list');
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingAttribute) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/attributes/definitions/${editingAttribute.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: formData.label,
          description: formData.description,
          color: formData.color,
          icon: formData.icon,
          showAsBadge: formData.showAsBadge,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update attribute');
      }
      await fetchDefinitions();
      onAttributesChanged?.();
      setMode('list');
      setEditingAttribute(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/attributes/definitions/${key}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete attribute');
      }
      await fetchDefinitions();
      onAttributesChanged?.();
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (attr: AttributeDefinition) => {
    setEditingAttribute(attr);
    setFormData({
      key: attr.key,
      label: attr.label,
      description: attr.description || '',
      color: attr.color,
      icon: attr.icon || '',
      showAsBadge: attr.showAsBadge,
    });
    setMode('edit');
  };

  const startCreate = () => {
    resetForm();
    setMode('create');
  };

  const renderForm = () => (
    <div className="space-y-4">
      {mode === 'create' && (
        <div>
          <label className="block text-sm text-white/70 mb-1">
            Key <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.key}
            onChange={(e) => setFormData((prev) => ({ ...prev, key: e.target.value.toLowerCase() }))}
            placeholder="e.g., favorite_model"
            className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-white/40 mt-1">
            Lowercase letters, numbers, and underscores only
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm text-white/70 mb-1">
          Label <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="e.g., Favorite Model"
          className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm text-white/70 mb-1">Description</label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Optional description shown in tooltips"
          className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm text-white/70 mb-1">Icon (emoji)</label>
        <input
          type="text"
          value={formData.icon}
          onChange={(e) => setFormData((prev) => ({ ...prev, icon: e.target.value }))}
          placeholder="Optional emoji icon"
          maxLength={4}
          className="w-24 px-3 py-2 bg-mhc-surface-light border border-white/20 rounded text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm text-white/70 mb-2">Color</label>
        <div className="flex flex-wrap gap-2">
          {availableColors.map((color) => {
            const colorClasses = getAttributeColorClasses(color);
            return (
              <button
                key={color}
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, color }))}
                className={`
                  w-8 h-8 rounded-full ${colorClasses.bg}
                  ${formData.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-mhc-surface' : ''}
                  hover:opacity-80 transition-all
                `}
                title={color}
              />
            );
          })}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.showAsBadge}
            onChange={(e) => setFormData((prev) => ({ ...prev, showAsBadge: e.target.checked }))}
            className="w-4 h-4 rounded border-white/20 bg-mhc-surface-light text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-white/90">Show as badge (pill) instead of checkbox</span>
        </label>
        <p className="text-xs text-white/40 mt-1 ml-6">
          Badges appear in headers and cards; checkboxes only in Profile Attributes section
        </p>
      </div>

      {/* Preview */}
      <div className="pt-4 border-t border-white/10">
        <label className="block text-sm text-white/70 mb-2">Preview</label>
        <div className="flex items-center gap-4">
          {formData.showAsBadge ? (
            <span
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold
                ${getAttributeColorClasses(formData.color).bgLight}
                ${getAttributeColorClasses(formData.color).text}
                border ${getAttributeColorClasses(formData.color).border}
              `}
            >
              {formData.icon && <span>{formData.icon}</span>}
              {formData.label || 'Label'}
            </span>
          ) : (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked
                readOnly
                className={`
                  w-4 h-4 rounded border-2
                  ${getAttributeColorClasses(formData.color).border}
                  bg-mhc-surface-light
                  ${getAttributeColorClasses(formData.color).text}
                `}
              />
              <span className="text-white/90 text-sm font-medium">
                {formData.label || 'Label'}
              </span>
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded p-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => {
            setMode('list');
            setEditingAttribute(null);
            resetForm();
            setError(null);
          }}
          className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={mode === 'create' ? handleCreate : handleUpdate}
          disabled={saving || !formData.label || (mode === 'create' && !formData.key)}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
        </button>
      </div>
    </div>
  );

  const renderList = () => (
    <div className="space-y-4">
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white/70 rounded-full mx-auto" />
        </div>
      ) : definitions.length === 0 ? (
        <div className="text-center py-8 text-white/50">No attributes defined</div>
      ) : (
        <div className="space-y-2">
          {definitions.map((attr) => {
            const colors = getAttributeColorClasses(attr.color);
            const isDeleting = deleteConfirm === attr.key;

            return (
              <div
                key={attr.key}
                className={`
                  flex items-center justify-between p-3 rounded border
                  ${attr.isSystem ? 'bg-mhc-surface-dark/30 border-white/5' : 'bg-mhc-surface-light border-white/10'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${colors.bg}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{attr.label}</span>
                      {attr.isSystem && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                          SYSTEM
                        </span>
                      )}
                      {attr.isAutoDerived && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                          AUTO
                        </span>
                      )}
                      {attr.showAsBadge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          BADGE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40">{attr.key}</div>
                  </div>
                </div>

                {!attr.isSystem && (
                  <div className="flex items-center gap-2">
                    {isDeleting ? (
                      <>
                        <span className="text-red-400 text-sm mr-2">Delete?</span>
                        <button
                          onClick={() => handleDelete(attr.key)}
                          disabled={saving}
                          className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50"
                        >
                          {saving ? '...' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white rounded"
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(attr)}
                          className="p-1.5 text-white/50 hover:text-white transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(attr.key)}
                          className="p-1.5 text-white/50 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded p-2">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={startCreate}
          className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Attribute
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      title={
        mode === 'list'
          ? 'Manage Attributes'
          : mode === 'create'
          ? 'Create Attribute'
          : `Edit: ${editingAttribute?.label}`
      }
      onClose={onClose}
      size="lg"
    >
      {mode === 'list' ? renderList() : renderForm()}
    </Modal>
  );
};

export default ManageAttributesModal;
