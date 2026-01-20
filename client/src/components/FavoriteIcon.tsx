import React, { useState } from 'react';

interface FavoriteIconProps {
  isFavorite: boolean;
  onToggle?: () => Promise<void> | void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export const FavoriteIcon: React.FC<FavoriteIconProps> = ({
  isFavorite,
  onToggle,
  size = 'md',
  className = '',
  disabled = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const isInteractive = !!onToggle && !disabled;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!onToggle || isLoading || disabled) return;

    setIsLoading(true);
    try {
      await onToggle();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isInteractive || isLoading}
      className={`
        ${SIZE_CLASSES[size]}
        ${isInteractive ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-default'}
        ${isLoading ? 'opacity-50' : ''}
        transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-pink-400/50 focus:ring-offset-2 focus:ring-offset-transparent
        rounded-full p-0.5
        ${className}
      `}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <svg
        viewBox="0 0 24 24"
        fill={isFavorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={isFavorite ? 0 : 2}
        className={`
          w-full h-full
          ${isFavorite ? 'text-pink-500' : 'text-white/60 hover:text-pink-400'}
          transition-colors duration-150
        `}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    </button>
  );
};

export default FavoriteIcon;
