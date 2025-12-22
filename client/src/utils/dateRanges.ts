/**
 * Date range utilities for Statbate API date filtering
 */

export type DateRangePreset =
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'all_time'
  | 'custom';

export interface DateRange {
  start: string; // YYYY-MM-DD HH:mm:ss format (UTC)
  end: string;   // YYYY-MM-DD HH:mm:ss format (UTC)
}

/**
 * Format a Date object to Statbate API format: "YYYY-MM-DD HH:mm:ss"
 */
function formatDateForAPI(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Get the start of week (Sunday) for a given date
 */
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day;
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of week (Saturday 23:59:59) for a given date
 */
function getEndOfWeek(date: Date): Date {
  const d = getStartOfWeek(date);
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Get the start of month for a given date
 */
function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of month for a given date
 */
function getEndOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Get the start of year for a given date
 */
function getStartOfYear(date: Date): Date {
  const d = new Date(date);
  d.setUTCMonth(0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of year for a given date
 */
function getEndOfYear(date: Date): Date {
  const d = new Date(date);
  d.setUTCMonth(11, 31);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Get date range for a preset
 */
export function getDateRange(preset: DateRangePreset): DateRange | null {
  const now = new Date();

  switch (preset) {
    case 'this_week': {
      const start = getStartOfWeek(now);
      const end = new Date(); // Current time
      return {
        start: formatDateForAPI(start),
        end: formatDateForAPI(end),
      };
    }

    case 'last_week': {
      const thisWeekStart = getStartOfWeek(now);
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
      const lastWeekEnd = getEndOfWeek(lastWeekStart);
      return {
        start: formatDateForAPI(lastWeekStart),
        end: formatDateForAPI(lastWeekEnd),
      };
    }

    case 'this_month': {
      const start = getStartOfMonth(now);
      const end = new Date(); // Current time
      return {
        start: formatDateForAPI(start),
        end: formatDateForAPI(end),
      };
    }

    case 'last_month': {
      const lastMonth = new Date(now);
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      const start = getStartOfMonth(lastMonth);
      const end = getEndOfMonth(lastMonth);
      return {
        start: formatDateForAPI(start),
        end: formatDateForAPI(end),
      };
    }

    case 'this_year': {
      const start = getStartOfYear(now);
      const end = new Date(); // Current time
      return {
        start: formatDateForAPI(start),
        end: formatDateForAPI(end),
      };
    }

    case 'last_year': {
      const lastYear = new Date(now);
      lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 1);
      const start = getStartOfYear(lastYear);
      const end = getEndOfYear(lastYear);
      return {
        start: formatDateForAPI(start),
        end: formatDateForAPI(end),
      };
    }

    case 'all_time':
      // No date range - returns all data
      return null;

    case 'custom':
      // Custom ranges handled separately
      return null;

    default:
      return null;
  }
}

/**
 * Get human-readable label for a preset
 */
export function getPresetLabel(preset: DateRangePreset): string {
  const labels: Record<DateRangePreset, string> = {
    this_week: 'This Week',
    last_week: 'Last Week',
    this_month: 'This Month',
    last_month: 'Last Month',
    this_year: 'This Year',
    last_year: 'Last Year',
    all_time: 'All Time',
    custom: 'Custom Range',
  };
  return labels[preset];
}

/**
 * Parse a date string in YYYY-MM-DD format to Date object
 */
export function parseDateInput(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

/**
 * Format Date to YYYY-MM-DD for input fields
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Create custom date range from input dates
 */
export function createCustomRange(startDate: string, endDate: string): DateRange {
  const start = parseDateInput(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = parseDateInput(endDate);
  end.setUTCHours(23, 59, 59, 999);

  return {
    start: formatDateForAPI(start),
    end: formatDateForAPI(end),
  };
}
