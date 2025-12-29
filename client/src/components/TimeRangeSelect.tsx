import React, { useState } from 'react';

export type TimeRange =
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'all_time'
  | 'custom';

export interface TimeRangeDates {
  start: Date;
  end: Date;
}

export interface TimeRangeSelectProps {
  value: TimeRange;
  onChange: (range: TimeRange, dates?: TimeRangeDates) => void;
  showAllTime?: boolean;
  showCustom?: boolean;
  className?: string;
}

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  last_quarter: 'Last Quarter',
  this_year: 'This Year',
  last_year: 'Last Year',
  all_time: 'All Time',
  custom: 'Custom',
};

// Helper to get date range for a given time range
export function getDateRangeForTimeRange(range: TimeRange): TimeRangeDates {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'last_week': {
      const dayOfWeek = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek - 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'this_quarter': {
      const quarterStart = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), quarterStart, 1);
      const end = new Date(today.getFullYear(), quarterStart + 3, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'last_quarter': {
      const currentQuarterStart = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), currentQuarterStart - 3, 1);
      const end = new Date(today.getFullYear(), currentQuarterStart, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'this_year': {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    case 'last_year': {
      const start = new Date(today.getFullYear() - 1, 0, 1);
      const end = new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    case 'all_time':
    case 'custom':
    default: {
      // Return a very wide range for all_time
      const start = new Date(2020, 0, 1);
      const end = new Date(today.getFullYear() + 1, 0, 1);
      return { start, end };
    }
  }
}

export const TimeRangeSelect: React.FC<TimeRangeSelectProps> = ({
  value,
  onChange,
  showAllTime = true,
  showCustom = false,
  className = '',
}) => {
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomInputs, setShowCustomInputs] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRange = e.target.value as TimeRange;
    if (newRange === 'custom') {
      setShowCustomInputs(true);
    } else {
      setShowCustomInputs(false);
      const dates = getDateRangeForTimeRange(newRange);
      onChange(newRange, dates);
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      onChange('custom', { start, end });
    }
  };

  const options: TimeRange[] = [
    'this_week',
    'last_week',
    'this_month',
    'last_month',
    'this_quarter',
    'last_quarter',
    'this_year',
    'last_year',
  ];

  if (showAllTime) {
    options.push('all_time');
  }
  if (showCustom) {
    options.push('custom');
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <select
        value={value}
        onChange={handleChange}
        className="px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-mhc-primary cursor-pointer"
      >
        {options.map((range) => (
          <option key={range} value={range}>
            {TIME_RANGE_LABELS[range]}
          </option>
        ))}
      </select>

      {showCustomInputs && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2 py-1.5 bg-mhc-surface-light border border-white/20 rounded text-white text-sm focus:outline-none focus:border-mhc-primary"
          />
          <span className="text-white/60">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2 py-1.5 bg-mhc-surface-light border border-white/20 rounded text-white text-sm focus:outline-none focus:border-mhc-primary"
          />
          <button
            type="button"
            onClick={handleCustomApply}
            disabled={!customStart || !customEnd}
            className="px-3 py-1.5 bg-mhc-primary hover:bg-mhc-primary-dark text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

export default TimeRangeSelect;
