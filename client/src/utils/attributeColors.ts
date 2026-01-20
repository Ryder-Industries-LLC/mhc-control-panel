/**
 * Attribute Color Utilities
 * Tailwind color mapping for dynamic attributes
 */

export interface AttributeColorClasses {
  border: string;
  bg: string;
  text: string;
  ring: string;
  bgLight: string;  // For badge backgrounds
}

export const attributeColorMap: Record<string, AttributeColorClasses> = {
  red: {
    border: 'border-red-500/50',
    bg: 'bg-red-500',
    text: 'text-red-500',
    ring: 'focus:ring-red-500',
    bgLight: 'bg-red-500/20',
  },
  orange: {
    border: 'border-orange-500/50',
    bg: 'bg-orange-500',
    text: 'text-orange-500',
    ring: 'focus:ring-orange-500',
    bgLight: 'bg-orange-500/20',
  },
  yellow: {
    border: 'border-yellow-500/50',
    bg: 'bg-yellow-500',
    text: 'text-yellow-500',
    ring: 'focus:ring-yellow-500',
    bgLight: 'bg-yellow-500/20',
  },
  emerald: {
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500',
    text: 'text-emerald-500',
    ring: 'focus:ring-emerald-500',
    bgLight: 'bg-emerald-500/20',
  },
  green: {
    border: 'border-green-500/50',
    bg: 'bg-green-500',
    text: 'text-green-500',
    ring: 'focus:ring-green-500',
    bgLight: 'bg-green-500/20',
  },
  purple: {
    border: 'border-purple-500/50',
    bg: 'bg-purple-500',
    text: 'text-purple-500',
    ring: 'focus:ring-purple-500',
    bgLight: 'bg-purple-500/20',
  },
  gray: {
    border: 'border-gray-400/50',
    bg: 'bg-gray-400',
    text: 'text-gray-400',
    ring: 'focus:ring-gray-400',
    bgLight: 'bg-gray-400/20',
  },
  amber: {
    border: 'border-amber-500/50',
    bg: 'bg-amber-500',
    text: 'text-amber-500',
    ring: 'focus:ring-amber-500',
    bgLight: 'bg-amber-500/20',
  },
  blue: {
    border: 'border-blue-500/50',
    bg: 'bg-blue-500',
    text: 'text-blue-500',
    ring: 'focus:ring-blue-500',
    bgLight: 'bg-blue-500/20',
  },
  indigo: {
    border: 'border-indigo-500/50',
    bg: 'bg-indigo-500',
    text: 'text-indigo-500',
    ring: 'focus:ring-indigo-500',
    bgLight: 'bg-indigo-500/20',
  },
  pink: {
    border: 'border-pink-500/50',
    bg: 'bg-pink-500',
    text: 'text-pink-500',
    ring: 'focus:ring-pink-500',
    bgLight: 'bg-pink-500/20',
  },
  cyan: {
    border: 'border-cyan-500/50',
    bg: 'bg-cyan-500',
    text: 'text-cyan-500',
    ring: 'focus:ring-cyan-500',
    bgLight: 'bg-cyan-500/20',
  },
  teal: {
    border: 'border-teal-500/50',
    bg: 'bg-teal-500',
    text: 'text-teal-500',
    ring: 'focus:ring-teal-500',
    bgLight: 'bg-teal-500/20',
  },
};

/**
 * Get Tailwind color classes for an attribute color
 * Falls back to gray if color not found
 */
export const getAttributeColorClasses = (color: string): AttributeColorClasses =>
  attributeColorMap[color] || attributeColorMap.gray;

/**
 * Available colors for color picker in Manage Attributes modal
 */
export const availableColors = Object.keys(attributeColorMap);
