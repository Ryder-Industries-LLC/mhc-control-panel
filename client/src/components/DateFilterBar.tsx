import React, { useState } from 'react';

export type DatePreset =
  | '24h'
  | '7d'
  | '14d'
  | 'last-month'
  | 'this-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'custom';

interface DateFilterBarProps {
  onFilterChange: (start: Date | null, end: Date | null, preset: DatePreset) => void;
  defaultPreset?: DatePreset;
  showFuturePresets?: boolean;
}

const DateFilterBar: React.FC<DateFilterBarProps> = ({
  onFilterChange,
  defaultPreset = '7d',
  showFuturePresets = false,
}) => {
  const [activePreset, setActivePreset] = useState<DatePreset>(defaultPreset);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [showCustom, setShowCustom] = useState(false);

  const getDateRange = (preset: DatePreset): { start: Date | null; end: Date | null } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (preset) {
      case '24h':
        return {
          start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          end: now,
        };
      case '7d':
        return {
          start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          end: now,
        };
      case '14d':
        return {
          start: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
          end: now,
        };
      case 'last-month': {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        return { start: lastMonth, end: endOfLastMonth };
      }
      case 'this-month': {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: startOfMonth, end: now };
      }
      case 'this-quarter': {
        const quarter = Math.floor(today.getMonth() / 3);
        const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
        return { start: startOfQuarter, end: now };
      }
      case 'last-quarter': {
        const quarter = Math.floor(today.getMonth() / 3);
        const lastQuarterStart = new Date(today.getFullYear(), (quarter - 1) * 3, 1);
        const lastQuarterEnd = new Date(today.getFullYear(), quarter * 3, 0, 23, 59, 59);
        return { start: lastQuarterStart, end: lastQuarterEnd };
      }
      case 'custom':
        return {
          start: customStart ? new Date(customStart) : null,
          end: customEnd ? new Date(customEnd) : null,
        };
      default:
        return { start: null, end: null };
    }
  };

  const handlePresetClick = (preset: DatePreset) => {
    setActivePreset(preset);
    if (preset === 'custom') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      const { start, end } = getDateRange(preset);
      onFilterChange(start, end, preset);
    }
  };

  const handleCustomApply = () => {
    const { start, end } = getDateRange('custom');
    onFilterChange(start, end, 'custom');
  };

  const presets: { id: DatePreset; label: string }[] = [
    { id: '24h', label: '24h' },
    { id: '7d', label: '7d' },
    { id: '14d', label: '14d' },
    { id: 'last-month', label: 'Last Month' },
    { id: 'this-month', label: 'This Month' },
    { id: 'this-quarter', label: 'This Quarter' },
    { id: 'last-quarter', label: 'Last Quarter' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetClick(preset.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activePreset === preset.id
                ? 'bg-mhc-primary text-white'
                : 'bg-white/5 text-mhc-text-muted hover:bg-white/10 hover:text-mhc-text'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 ml-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2 py-1 bg-mhc-surface border border-white/20 rounded-md text-mhc-text text-sm focus:border-mhc-primary focus:outline-none"
          />
          <span className="text-mhc-text-muted">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2 py-1 bg-mhc-surface border border-white/20 rounded-md text-mhc-text text-sm focus:border-mhc-primary focus:outline-none"
          />
          <button
            onClick={handleCustomApply}
            className="px-3 py-1.5 bg-mhc-primary text-white rounded-md text-sm font-medium hover:bg-mhc-primary-dark transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

export default DateFilterBar;
