import React from 'react';
import { PersonAttribute } from '../types/attributes';
import { getAttributeColorClasses } from '../utils/attributeColors';

interface AttributeBadgeProps {
  /** The attribute to display */
  attribute: PersonAttribute;
  /** Optional toggle handler - if provided, badge becomes clickable */
  onToggle?: (value: boolean) => void;
  /** Size variant */
  size?: 'xs' | 'sm' | 'md';
  /** Whether to show the icon (if defined) */
  showIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

/**
 * AttributeBadge - Standalone badge pill for displaying attribute status
 *
 * Used in: Directory cards, UserCard, Profile headers, anywhere badges appear
 * Read-only by default (no onToggle), can be made interactive with onToggle prop
 */
export const AttributeBadge: React.FC<AttributeBadgeProps> = ({
  attribute,
  onToggle,
  size = 'sm',
  showIcon = true,
  className = '',
}) => {
  const colors = getAttributeColorClasses(attribute.definition.color);
  const isInteractive = !!onToggle;

  const handleClick = () => {
    if (onToggle) {
      onToggle(!attribute.value);
    }
  };

  // Don't render if value is false (badges only show when true)
  if (!attribute.value) {
    return null;
  }

  const baseClasses = `
    inline-flex items-center gap-1 rounded font-semibold
    ${sizeClasses[size]}
    ${colors.bgLight} ${colors.text} border ${colors.border}
    ${isInteractive ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
  `.trim().replace(/\s+/g, ' ');

  const content = (
    <>
      {showIcon && attribute.definition.icon && (
        <span>{attribute.definition.icon}</span>
      )}
      <span>{attribute.definition.label}</span>
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClasses} ${className}`}
        title={attribute.definition.description || attribute.definition.label}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={`${baseClasses} ${className}`}
      title={attribute.definition.description || attribute.definition.label}
    >
      {content}
    </span>
  );
};

export default AttributeBadge;
