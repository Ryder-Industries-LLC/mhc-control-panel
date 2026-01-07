export interface SocialPlatformConfig {
  label: string;
  icon: string;
  urlPattern: string;
  placeholder?: string;
}

export const SOCIAL_PLATFORMS: Record<string, SocialPlatformConfig> = {
  twitter: {
    label: 'X (Twitter)',
    icon: 'twitter',
    urlPattern: 'https://twitter.com/',
    placeholder: 'username or full URL',
  },
  bluesky: {
    label: 'Bluesky',
    icon: 'bluesky',
    urlPattern: 'https://bsky.app/profile/',
    placeholder: 'username.bsky.social or full URL',
  },
  linktree: {
    label: 'Linktree',
    icon: 'link',
    urlPattern: 'https://linktr.ee/',
    placeholder: 'username or full URL',
  },
  alllinks: {
    label: 'AllLinks',
    icon: 'link',
    urlPattern: '',
    placeholder: 'full URL',
  },
  throne: {
    label: 'Throne',
    icon: 'gift',
    urlPattern: 'https://throne.com/',
    placeholder: 'username or full URL',
  },
  revolut: {
    label: 'Revolut',
    icon: 'dollar-sign',
    urlPattern: '',
    placeholder: 'full payment URL',
  },
  cashapp: {
    label: 'Cash App',
    icon: 'dollar-sign',
    urlPattern: 'https://cash.app/',
    placeholder: '$cashtag or full URL',
  },
  telegram: {
    label: 'Telegram',
    icon: 'message-circle',
    urlPattern: 'https://t.me/',
    placeholder: 'username or full URL',
  },
  snapchat: {
    label: 'Snapchat',
    icon: 'camera',
    urlPattern: 'https://snapchat.com/add/',
    placeholder: 'username',
  },
  instagram: {
    label: 'Instagram',
    icon: 'instagram',
    urlPattern: 'https://instagram.com/',
    placeholder: 'username or full URL',
  },
  amazon_wishlist: {
    label: 'Amazon Wishlist',
    icon: 'gift',
    urlPattern: '',
    placeholder: 'full wishlist URL',
  },
  onlyfans: {
    label: 'OnlyFans',
    icon: 'star',
    urlPattern: 'https://onlyfans.com/',
    placeholder: 'username or full URL',
  },
  fansly: {
    label: 'Fansly',
    icon: 'star',
    urlPattern: 'https://fansly.com/',
    placeholder: 'username or full URL',
  },
  website: {
    label: 'Website',
    icon: 'globe',
    urlPattern: '',
    placeholder: 'full URL',
  },
  other: {
    label: 'Other',
    icon: 'link',
    urlPattern: '',
    placeholder: 'full URL',
  },
} as const;

export type SocialPlatform = keyof typeof SOCIAL_PLATFORMS;

export const VALID_PLATFORMS = Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[];

/**
 * Normalize a social media URL or username to a full URL
 */
export function normalizeSocialUrl(platform: string, input: string): string {
  const config = SOCIAL_PLATFORMS[platform];
  if (!config) {
    return input;
  }

  // Already a full URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }

  // No URL pattern - just return the input
  if (!config.urlPattern) {
    return input;
  }

  // Special handling for Cash App
  if (platform === 'cashapp') {
    const cleanTag = input.replace(/^\$/, '');
    return `${config.urlPattern}$${cleanTag}`;
  }

  // Strip @ from username if present
  const cleanUsername = input.replace(/^@/, '');

  return `${config.urlPattern}${cleanUsername}`;
}

/**
 * Get just the username/handle from a social URL
 */
export function extractUsername(platform: string, url: string): string {
  const config = SOCIAL_PLATFORMS[platform];
  if (!config || !config.urlPattern) {
    return url;
  }

  // Remove the URL pattern prefix if present
  if (url.startsWith(config.urlPattern)) {
    return url.slice(config.urlPattern.length);
  }

  // Try to extract from full URL patterns
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return pathParts[pathParts.length - 1];
    }
  } catch {
    // Not a valid URL, return as-is
  }

  return url;
}
