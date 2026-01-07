import React, { useState } from 'react';

interface StarRatingProps {
  rating: number;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const RATING_LABELS: Record<number, string> = {
  0: 'Not Rated',
  1: "Don't Like",
  2: 'Meh',
  3: 'Potential',
  4: 'Yum',
  5: 'HOT AF',
};

const RATING_COLORS: Record<number, string> = {
  0: 'text-white/30',
  1: 'text-red-400',
  2: 'text-orange-400',
  3: 'text-yellow-400',
  4: 'text-lime-400',
  5: 'text-pink-500',
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'text-sm gap-0.5',
  md: 'text-lg gap-1',
  lg: 'text-2xl gap-1.5',
};

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  onChange,
  size = 'md',
  showLabel = false,
}) => {
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const isInteractive = !!onChange;
  const displayRating = hoverRating !== null ? hoverRating : rating;
  const activeColor = RATING_COLORS[displayRating] || RATING_COLORS[0];

  const handleClick = (starIndex: number) => {
    if (onChange) {
      // Clicking the same rating clears it (sets to 0)
      const newRating = starIndex === rating ? 0 : starIndex;
      onChange(newRating);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`flex ${SIZE_CLASSES[size]}`}>
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const isFilled = starIndex <= displayRating;
          return (
            <span
              key={starIndex}
              className={`
                ${isFilled ? activeColor : 'text-white/20'}
                ${isInteractive ? 'cursor-pointer hover:scale-110 transition-transform' : ''}
              `}
              onClick={() => handleClick(starIndex)}
              onMouseEnter={() => isInteractive && setHoverRating(starIndex)}
              onMouseLeave={() => isInteractive && setHoverRating(null)}
              title={RATING_LABELS[starIndex]}
            >
              {isFilled ? '★' : '☆'}
            </span>
          );
        })}
      </div>
      {showLabel && displayRating > 0 && (
        <span className={`text-xs ${activeColor} font-medium`}>
          {RATING_LABELS[displayRating]}
        </span>
      )}
    </div>
  );
};

export default StarRating;
