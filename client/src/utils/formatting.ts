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
 * Format duration in minutes to hours and minutes (e.g., "7h 44m")
 * @param minutes Duration in minutes
 * @returns Formatted duration string
 */
export const formatDuration = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || minutes === 0) {
    return '0m';
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

/**
 * Format gender to full capitalized name
 * Normalizes various raw values from different sources (Chaturbate Affiliate API,
 * Statbate, Profile Scraper) to consistent display labels.
 * @param gender Gender value (can be string or number)
 * @returns Formatted gender string
 */
export const formatGender = (gender: string | number | null | undefined): string => {
  if (gender === null || gender === undefined) {
    return 'Unknown';
  }

  // Handle numeric gender codes
  if (typeof gender === 'number') {
    const genderMap: { [key: number]: string } = {
      0: 'Male',
      1: 'Female',
      2: 'Trans',
      3: 'Couple',
    };
    return genderMap[gender] || 'Unknown';
  }

  // Handle string gender values - normalize various raw formats
  const genderStr = String(gender).toLowerCase().trim();

  // Male variations (including raw Chaturbate values)
  if (genderStr === 'male' || genderStr === 'm' || genderStr === 'a man' || genderStr === 'man') {
    return 'Male';
  }

  // Female variations
  if (genderStr === 'female' || genderStr === 'f' || genderStr === 'a woman' || genderStr === 'woman') {
    return 'Female';
  }

  // Trans variations (including various raw Chaturbate/Statbate values)
  if (genderStr === 'trans' || genderStr === 't' || genderStr === 'shemale' || genderStr === 'ts' ||
      genderStr === 'transsexual' || genderStr === 'transgender' || genderStr === 's') {
    return 'Trans';
  }

  // Couple variations
  if (genderStr === 'couple' || genderStr === 'c' || genderStr === 'couples') {
    return 'Couple';
  }

  // If already capitalized properly or unknown format, return title case
  const titleCase = gender.toString().charAt(0).toUpperCase() + gender.toString().slice(1).toLowerCase();
  return titleCase;
};

/**
 * Format a field name into a human-readable label in Camel Case
 * @param fieldName Snake_case or camelCase field name
 * @returns Human-readable label in Camel Case
 */
export const formatLabel = (fieldName: string): string => {
  // Special case labels
  const specialLabels: Record<string, string> = {
    all_time_tokens: 'All Time Tokens',
    last_tip_amount: 'Last Tip Amount',
    last_tip_date: 'Last Tip Date',
    first_tip_date: 'First Tip Date',
    first_message_date: 'First Message Date',
    models_tipped_2weeks: 'Models Tipped (2 Weeks)',
    models_messaged_2weeks: 'Models Messaged (2 Weeks)',
    per_day_tokens: 'Daily Tokens',
  };

  if (specialLabels[fieldName]) {
    return specialLabels[fieldName];
  }

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
      return formatGender(value);
    }
    // RID: treat as text without commas
    if (fieldName === 'rid') {
      return formatNumberWithoutCommas(value);
    }
    // Income USD: format as currency
    if (fieldName === 'income_usd') {
      return `$${formatNumber(value)}`;
    }
    // Token fields: add "tokens" suffix
    if (fieldName === 'all_time_tokens' || fieldName === 'income_tokens' || fieldName === 'last_tip_amount') {
      return `${formatNumber(value)} tokens`;
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

/**
 * Format a date as "Friday, December 26, 2025" (full day name, full month name)
 * Uses the user's local timezone
 * @param dateString ISO date string or Date object
 * @returns Formatted full date string
 */
export const formatFullDate = (dateString: string | Date): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Format a time as "14:30" (24-hour military time)
 * Uses the user's local timezone
 * @param dateString ISO date string or Date object
 * @returns Formatted military time string (HH:MM)
 */
export const formatMilitaryTime = (dateString: string | Date): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) {
    return '--:--';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
};

/**
 * Format a date and time as "Friday, December 26, 2025 at 14:30"
 * Uses the user's local timezone
 * @param dateString ISO date string or Date object
 * @returns Formatted full date and time string
 */
export const formatFullDateTime = (dateString: string | Date): string => {
  const fullDate = formatFullDate(dateString);
  const time = formatMilitaryTime(dateString);

  if (fullDate === 'Invalid Date') {
    return 'Invalid Date';
  }

  return `${fullDate} at ${time}`;
};

/**
 * Format event type with spaces for readability
 * Converts "PRIVATEMESSAGE" to "PRIVATE MESSAGE", "USERENTER" to "USER ENTER", etc.
 * @param eventType Raw event type string (e.g., "PRIVATEMESSAGE", "CHATMESSAGE")
 * @returns Formatted event type with spaces
 */
export const formatEventType = (eventType: string): string => {
  if (!eventType) {
    return 'UNKNOWN';
  }

  // Map of known event types to their formatted versions
  const eventTypeMap: Record<string, string> = {
    'PRIVATEMESSAGE': 'PRIVATE MESSAGE',
    'CHATMESSAGE': 'CHAT MESSAGE',
    'USERENTER': 'USER ENTER',
    'USERLEAVE': 'USER LEAVE',
    'BROADCASTSTART': 'BROADCAST START',
    'BROADCASTSTOP': 'BROADCAST STOP',
    'MEDIAPURCHASE': 'MEDIA PURCHASE',
    'FANCLUBJOINED': 'FAN CLUB JOINED',
    'FOLLOW': 'FOLLOW',
    'UNFOLLOW': 'UNFOLLOW',
    'TIP': 'TIP',
    // Handle underscore versions too
    'PRIVATE_MESSAGE': 'PRIVATE MESSAGE',
    'CHAT_MESSAGE': 'CHAT MESSAGE',
    'USER_ENTER': 'USER ENTER',
    'USER_LEAVE': 'USER LEAVE',
    'BROADCAST_START': 'BROADCAST START',
    'BROADCAST_STOP': 'BROADCAST STOP',
    'MEDIA_PURCHASE': 'MEDIA PURCHASE',
    'FAN_CLUB_JOINED': 'FAN CLUB JOINED',
  };

  const upperType = eventType.toUpperCase();

  // Check if we have a direct mapping
  if (eventTypeMap[upperType]) {
    return eventTypeMap[upperType];
  }

  // For unknown types, try to add spaces before capital letters
  // This handles cases like "SomeNewEventType" -> "SOME NEW EVENT TYPE"
  return upperType
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toUpperCase();
};

/**
 * Format a broadcast time range as "14:30 - 18:45"
 * Uses the user's local timezone
 * @param startDate Start date/time
 * @param endDate End date/time (optional)
 * @returns Formatted time range string
 */
export const formatTimeRange = (
  startDate: string | Date,
  endDate?: string | Date | null
): string => {
  const startTime = formatMilitaryTime(startDate);

  if (!endDate) {
    return `${startTime} - Ongoing`;
  }

  const endTime = formatMilitaryTime(endDate);
  return `${startTime} - ${endTime}`;
};
