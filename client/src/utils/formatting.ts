/**
 * Formatting utilities for consistent display across the app
 */

/**
 * Format a date string into a more readable format
 * @param dateString ISO date string
 * @param options Formatting options
 * @returns Formatted date string
 */
export const formatDate = (
  dateString: string,
  options: {
    includeTime?: boolean;
    includeSeconds?: boolean;
    relative?: boolean;
  } = {}
): string => {
  const { includeTime = true, includeSeconds = false, relative = false } = options;
  const date = new Date(dateString);

  // Check if date is invalid
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  // Relative time (e.g., "2 hours ago")
  if (relative) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }

  // Format date and time
  const dateOptions: Intl.DateTimeFormatOptions = {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  };

  if (includeTime) {
    dateOptions.hour = 'numeric';
    dateOptions.minute = '2-digit';
    dateOptions.hour12 = true;
  }

  if (includeSeconds) {
    dateOptions.second = '2-digit';
  }

  return date.toLocaleString('en-US', dateOptions);
};

/**
 * Format a number with commas for thousands
 * @param num Number to format
 * @returns Formatted number string
 */
export const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) {
    return '0';
  }
  return num.toLocaleString('en-US');
};

/**
 * Format a field name into a human-readable label
 * @param fieldName Snake_case or camelCase field name
 * @returns Human-readable label
 */
export const formatLabel = (fieldName: string): string => {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

/**
 * Format a value for display based on its type and field name
 * @param value The value to format
 * @param fieldName Optional field name for context-specific formatting
 * @returns Formatted value string
 */
export const formatValue = (
  value: any,
  fieldName?: string
): string => {
  // Null/undefined
  if (value === null || value === undefined) {
    return 'N/A';
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // Number
  if (typeof value === 'number') {
    // Check if it's a date field
    if (fieldName?.includes('date') || fieldName?.includes('time')) {
      return formatDate(new Date(value).toISOString());
    }
    return formatNumber(value);
  }

  // Date string
  if (typeof value === 'string') {
    const dateTest = new Date(value);
    if (!isNaN(dateTest.getTime()) && value.includes('T')) {
      return formatDate(value);
    }
  }

  // Array
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  // Object
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  // Default: string conversion
  return String(value);
};

/**
 * Truncate text to a maximum length
 * @param text Text to truncate
 * @param maxLength Maximum length
 * @returns Truncated text with ellipsis if needed
 */
export const truncate = (text: string, maxLength: number = 50): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
};
