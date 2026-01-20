import React from 'react';
import { PersonAttribute } from '../types/attributes';
import { getAttributeColorClasses } from '../utils/attributeColors';

interface AttributeCheckboxProps {
  /** The attribute to display */
  attribute: PersonAttribute;
  /** Toggle handler - called when checkbox is clicked */
  onToggle: (value: boolean) => void;
  /** Whether the checkbox is disabled (e.g., for auto-derived attributes) */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * AttributeCheckbox - Checkbox toggle control for attributes
 *
 * Used in: Profile Attributes section only
 * For read-only badge display, use AttributeBadge instead
 */
export const AttributeCheckbox: React.FC<AttributeCheckboxProps> = ({
  attribute,
  onToggle,
  disabled = false,
  className = '',
}) => {
  const colors = getAttributeColorClasses(attribute.definition.color);
  const isDisabled = disabled || attribute.definition.isAutoDerived;

  const handleChange = () => {
    if (!isDisabled) {
      onToggle(!attribute.value);
    }
  };

  return (
    <label
      className={`
        flex items-center gap-2
        ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      title={
        isDisabled && attribute.definition.isAutoDerived
          ? `${attribute.definition.label} (auto-derived, read-only)`
          : attribute.definition.description || attribute.definition.label
      }
    >
      <input
        type="checkbox"
        checked={attribute.value}
        onChange={handleChange}
        disabled={isDisabled}
        className={`
          w-4 h-4 rounded border-2
          ${colors.border}
          bg-mhc-surface-light
          ${colors.text}
          ${colors.ring}
          ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
          focus:outline-none focus:ring-2 focus:ring-offset-0
        `.trim().replace(/\s+/g, ' ')}
      />
      <span className="text-white/90 text-sm font-medium">
        {attribute.definition.label}
      </span>
      {attribute.definition.isAutoDerived && (
        <span className="text-white/40 text-xs">(auto)</span>
      )}
    </label>
  );
};

export default AttributeCheckbox;
