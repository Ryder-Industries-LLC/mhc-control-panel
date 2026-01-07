import React from 'react';
import { formatEventType } from '../utils/formatting';

export type BadgeVariant = 'interaction' | 'role' | 'status' | 'custom';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  variant?: BadgeVariant;
  type?: string;
  size?: BadgeSize;
  clickable?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

// Interaction type colors
const INTERACTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  TIP: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  TIP_EVENT: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  CHAT_MESSAGE: { bg: 'bg-mhc-primary/20', text: 'text-mhc-primary', border: 'border-mhc-primary/30' },
  CHATMESSAGE: { bg: 'bg-mhc-primary/20', text: 'text-mhc-primary', border: 'border-mhc-primary/30' },
  PRIVATE_MESSAGE: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  PRIVATEMESSAGE: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  USER_ENTER: { bg: 'bg-teal-500/20', text: 'text-teal-500', border: 'border-teal-500/30' },
  USERENTER: { bg: 'bg-teal-500/20', text: 'text-teal-500', border: 'border-teal-500/30' },
  USER_LEAVE: { bg: 'bg-gray-500/20', text: 'text-gray-500', border: 'border-gray-500/30' },
  USERLEAVE: { bg: 'bg-gray-500/20', text: 'text-gray-500', border: 'border-gray-500/30' },
  FOLLOW: { bg: 'bg-orange-500/20', text: 'text-orange-500', border: 'border-orange-500/30' },
  UNFOLLOW: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  BROADCAST_START: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  BROADCASTSTART: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  BROADCAST_STOP: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  BROADCASTSTOP: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  FANCLUB_JOIN: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  FANCLUBJOIN: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  MEDIA_PURCHASE: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  MEDIAPURCHASE: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
};

// Role colors
const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  MODEL: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  VIEWER: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  UNKNOWN: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
};

// Status colors
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  RUNNING: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  PAUSED: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  STOPPED: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
  PROCESSING: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  ERROR: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  LIVE: { bg: 'bg-red-500/90', text: 'text-white', border: 'border-red-500' },
  FOLLOWER: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  BANNED: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
};

// Size classes
const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

function getColors(variant: BadgeVariant, type?: string): { bg: string; text: string; border: string } {
  const normalizedType = type?.toUpperCase() || '';

  switch (variant) {
    case 'interaction':
      return INTERACTION_COLORS[normalizedType] || { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' };
    case 'role':
      return ROLE_COLORS[normalizedType] || ROLE_COLORS.UNKNOWN;
    case 'status':
      return STATUS_COLORS[normalizedType] || STATUS_COLORS.STOPPED;
    case 'custom':
    default:
      return { bg: '', text: '', border: '' };
  }
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'custom',
  type,
  size = 'md',
  clickable = false,
  onClick,
  className = '',
  children,
}) => {
  const colors = getColors(variant, type);
  const sizeClass = SIZE_CLASSES[size];

  const baseClasses = `
    inline-flex items-center justify-center
    rounded-full font-semibold uppercase tracking-wide
    border transition-colors
    ${sizeClass}
    ${colors.bg} ${colors.text} ${colors.border}
    ${clickable ? 'cursor-pointer hover:opacity-80' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  // Format the display text - apply formatEventType for interaction types
  const displayText = children || (type ? formatEventType(type) : type);

  if (clickable && onClick) {
    return (
      <button type="button" className={baseClasses} onClick={onClick}>
        {displayText}
      </button>
    );
  }

  return (
    <span className={baseClasses}>
      {displayText}
    </span>
  );
};

export default Badge;
