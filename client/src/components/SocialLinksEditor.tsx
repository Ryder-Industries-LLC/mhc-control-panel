import React, { useState, useEffect } from 'react';

/**
 * Validates a Twitter/X handle or URL
 * Valid handles: @username or username (1-15 chars, alphanumeric + underscore)
 * Valid URLs: twitter.com/username or x.com/username
 */
export const isValidTwitterHandle = (value: string): boolean => {
  if (!value) return false;

  // Check if it's a URL
  if (value.includes('twitter.com/') || value.includes('x.com/')) {
    // Extract username from URL
    const urlMatch = value.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/i);
    if (urlMatch) {
      const username = urlMatch[1];
      // Skip special pages like /intent/, /share, etc.
      if (['intent', 'share', 'home', 'search', 'explore', 'settings', 'notifications', 'messages', 'i'].includes(username.toLowerCase())) {
        return false;
      }
      return /^[A-Za-z0-9_]{1,15}$/.test(username);
    }
    return false;
  }

  // Check if it's a direct handle (with or without @)
  const cleaned = value.replace(/^@/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(cleaned);
};

// Social platform configuration
export const SOCIAL_PLATFORMS: Record<string, { label: string; icon: string; placeholder: string }> = {
  twitter: { label: 'X (Twitter)', icon: 'twitter', placeholder: 'username or full URL' },
  bluesky: { label: 'Bluesky', icon: 'at-sign', placeholder: 'username.bsky.social or full URL' },
  linktree: { label: 'Linktree', icon: 'link', placeholder: 'username or full URL' },
  alllinks: { label: 'AllLinks', icon: 'link', placeholder: 'full URL' },
  throne: { label: 'Throne', icon: 'gift', placeholder: 'username or full URL' },
  revolut: { label: 'Revolut', icon: 'dollar-sign', placeholder: 'full payment URL' },
  cashapp: { label: 'Cash App', icon: 'dollar-sign', placeholder: '$cashtag or full URL' },
  telegram: { label: 'Telegram', icon: 'message-circle', placeholder: 'username or full URL' },
  snapchat: { label: 'Snapchat', icon: 'camera', placeholder: 'username' },
  instagram: { label: 'Instagram', icon: 'instagram', placeholder: 'username or full URL' },
  amazon_wishlist: { label: 'Amazon Wishlist', icon: 'gift', placeholder: 'full wishlist URL' },
  onlyfans: { label: 'OnlyFans', icon: 'star', placeholder: 'username or full URL' },
  fansly: { label: 'Fansly', icon: 'star', placeholder: 'username or full URL' },
  website: { label: 'Website', icon: 'globe', placeholder: 'full URL' },
  other: { label: 'Other', icon: 'link', placeholder: 'full URL' },
};

export interface SocialLinksEditorProps {
  links: Record<string, string>;
  onSave: (links: Record<string, string>) => Promise<void>;
  onAddLink?: (platform: string, url: string) => Promise<void>;
  onRemoveLink?: (platform: string) => Promise<void>;
  readOnly?: boolean;
}

// Simple icon component
const PlatformIcon: React.FC<{ platform: string; className?: string }> = ({ platform, className = 'w-4 h-4' }) => {
  const iconMap: Record<string, React.ReactNode> = {
    twitter: (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    instagram: (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="18" cy="6" r="1.5" fill="currentColor" />
      </svg>
    ),
    link: (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    globe: (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    gift: (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </svg>
    ),
    star: (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
    'dollar-sign': (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    'message-circle': (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    camera: (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    'at-sign': (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
      </svg>
    ),
  };

  const icon = SOCIAL_PLATFORMS[platform]?.icon || 'link';
  return <span className="text-white/60">{iconMap[icon] || iconMap.link}</span>;
};

export const SocialLinksEditor: React.FC<SocialLinksEditorProps> = ({
  links,
  onSave,
  onAddLink,
  onRemoveLink,
  readOnly = false,
}) => {
  const [localLinks, setLocalLinks] = useState<Record<string, string>>(links);
  const [newPlatform, setNewPlatform] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalLinks(links);
  }, [links]);

  const availablePlatforms = Object.keys(SOCIAL_PLATFORMS).filter(
    p => !localLinks[p]
  );

  const handleAdd = async () => {
    if (!newPlatform || !newUrl.trim()) return;

    setError(null);

    // Validate Twitter handles before adding
    if (newPlatform === 'twitter' && !isValidTwitterHandle(newUrl.trim())) {
      setError('Invalid Twitter/X handle. Must be 1-15 characters (letters, numbers, underscore only).');
      return;
    }

    setSaving(true);

    try {
      if (onAddLink) {
        await onAddLink(newPlatform, newUrl.trim());
      } else {
        const updated = { ...localLinks, [newPlatform]: newUrl.trim() };
        await onSave(updated);
        setLocalLinks(updated);
      }
      setNewPlatform('');
      setNewUrl('');
    } catch (err: any) {
      setError(err.message || 'Failed to add link');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (platform: string) => {
    setError(null);
    setSaving(true);

    try {
      if (onRemoveLink) {
        await onRemoveLink(platform);
      } else {
        const { [platform]: _, ...remaining } = localLinks;
        await onSave(remaining);
        setLocalLinks(remaining);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to remove link');
    } finally {
      setSaving(false);
    }
  };

  // Filter and sort links - skip invalid Twitter handles
  const sortedLinks = Object.entries(localLinks)
    .filter(([platform, url]) => {
      // Filter out invalid Twitter/X handles
      if (platform === 'twitter' && !isValidTwitterHandle(url)) {
        return false;
      }
      return true;
    })
    .sort((a, b) =>
      SOCIAL_PLATFORMS[a[0]]?.label.localeCompare(SOCIAL_PLATFORMS[b[0]]?.label || b[0])
    );

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Existing links */}
      {sortedLinks.length > 0 ? (
        <div className="space-y-2">
          {sortedLinks.map(([platform, url]) => (
            <div
              key={platform}
              className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
            >
              <PlatformIcon platform={platform} />
              <span className="text-white/80 font-medium min-w-[100px]">
                {SOCIAL_PLATFORMS[platform]?.label || platform}
              </span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mhc-primary hover:text-mhc-primary/80 truncate flex-1 text-sm"
              >
                {url}
              </a>
              {!readOnly && (
                <button
                  onClick={() => handleRemove(platform)}
                  disabled={saving}
                  className="p-1 text-white/40 hover:text-red-400 transition-colors disabled:opacity-50"
                  title="Remove link"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-white/40 text-sm italic">No social links added yet.</p>
      )}

      {/* Add new link */}
      {!readOnly && availablePlatforms.length > 0 && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
          <select
            value={newPlatform}
            onChange={e => setNewPlatform(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-mhc-primary"
          >
            <option value="">Select platform...</option>
            {availablePlatforms.map(p => (
              <option key={p} value={p}>
                {SOCIAL_PLATFORMS[p].label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder={newPlatform ? SOCIAL_PLATFORMS[newPlatform]?.placeholder : 'URL or username'}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-mhc-primary"
            onKeyDown={e => {
              if (e.key === 'Enter' && newPlatform && newUrl.trim()) {
                handleAdd();
              }
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!newPlatform || !newUrl.trim() || saving}
            className="px-4 py-2 bg-mhc-primary hover:bg-mhc-primary/80 disabled:bg-white/10 disabled:text-white/30 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
};

export default SocialLinksEditor;
