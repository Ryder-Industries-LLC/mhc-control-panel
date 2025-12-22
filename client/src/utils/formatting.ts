/**
 * Formatting utilities for consistent display across the app
 */

/**
 * Format a date string into YYYY-MM-DD HH:MM format
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

  // Format as YYYY-MM-DD HH:MM (24-hour)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  let formatted = `${year}-${month}-${day}`;

  if (includeTime) {
    formatted += ` ${hours}:${minutes}`;
    if (includeSeconds) {
      formatted += `:${seconds}`;
    }
  }

  return formatted;
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
 * Format a number without commas
 * @param num Number to format
 * @returns Formatted number string
 */
export const formatNumberWithoutCommas = (num: number | null | undefined): string => {
  if (num === null || num === undefined) {
    return '0';
  }
  return num.toString();
};

/**
 * Format a field name into a human-readable label in Camel Case
 * @param fieldName Snake_case or camelCase field name
 * @returns Human-readable label in Camel Case
 */
export const formatLabel = (fieldName: string): string => {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => {
      // Keep common acronyms uppercase
      const upperWord = word.toUpperCase();
      if (['USD', 'RID', 'DID', 'ID', 'PM', 'DM'].includes(upperWord)) {
        return upperWord;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
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
    // Gender: convert number to text
    if (fieldName === 'gender') {
      const genderMap: { [key: number]: string } = {
        0: 'Male',
        1: 'Female',
        2: 'Trans',
        3: 'Couple',
      };
      return genderMap[value] || 'Unknown';
    }
    // RID: treat as text without commas
    if (fieldName === 'rid') {
      return formatNumberWithoutCommas(value);
    }
    // Income USD: format as currency
    if (fieldName === 'income_usd') {
      return `$${formatNumber(value)}`;
    }
    // Duration minutes: convert to hours and minutes
    if (fieldName?.includes('duration_minutes') || fieldName?.includes('total_duration')) {
      const hours = Math.floor(value / 60);
      const minutes = value % 60;
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
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
    // Special handling for tags array with objects
    if (fieldName === 'tags' && value.length > 0 && typeof value[0] === 'object' && value[0]?.name) {
      return value.map((tag: any) => tag.name).join(', ');
    }
    // Special handling for other arrays of objects
    if (value.length > 0 && typeof value[0] === 'object') {
      return value.map((item: any) => {
        if (item.name) return item.name;
        return JSON.stringify(item);
      }).join(', ');
    }
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
