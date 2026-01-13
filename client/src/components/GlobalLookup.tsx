import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface UserSuggestion {
  username: string;
  role: string;
  following?: boolean;
  friend_tier?: number;
}

interface GlobalLookupProps {
  inline?: boolean;
}

/**
 * Parse username from various input formats:
 * - username
 * - /username
 * - /username/
 * - https://chaturbate.com/username
 * - https://chaturbate.com/username/
 * - https://chaturbate.com/username#
 */
const parseUsername = (input: string): string => {
  let cleaned = input.trim();

  // Remove URL prefix if present
  cleaned = cleaned.replace(/^https?:\/\/(www\.)?chaturbate\.com\//i, '');

  // Remove leading slashes
  cleaned = cleaned.replace(/^\/+/, '');

  // Remove trailing slashes and hash fragments
  cleaned = cleaned.replace(/[/#]+$/, '');

  // Take only the first path segment (in case there's extra path)
  cleaned = cleaned.split('/')[0];

  return cleaned.toLowerCase();
};

export const GlobalLookup: React.FC<GlobalLookupProps> = ({ inline = false }) => {
  const [isExpanded, setIsExpanded] = useState(inline);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Focus input when expanded (only for non-inline mode)
  useEffect(() => {
    if (isExpanded && inputRef.current && !inline) {
      inputRef.current.focus();
    }
  }, [isExpanded, inline]);

  // Keyboard shortcut: Cmd/Ctrl + K to open/focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (inline) {
          inputRef.current?.focus();
        } else {
          setIsExpanded(true);
        }
      }
      if (e.key === 'Escape' && isExpanded && !inline) {
        setIsExpanded(false);
        setQuery('');
        setSuggestions([]);
      }
      if (e.key === 'Escape' && inline) {
        inputRef.current?.blur();
        setQuery('');
        setSuggestions([]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, inline]);

  // Click outside to close suggestions (and collapse for non-inline)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!inline) {
          setIsExpanded(false);
        }
        setQuery('');
        setSuggestions([]);
      }
    };

    if (isExpanded || inline) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded, inline]);

  // Fetch suggestions with debounce
  useEffect(() => {
    // Parse the query to extract username from URL/path formats
    const parsedQuery = parseUsername(query);
    if (!parsedQuery) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/person/search?q=${encodeURIComponent(parsedQuery)}&limit=8`);
        if (response.ok) {
          const data = await response.json();
          // API returns { usernames: string[] }, convert to our format
          const usernames = data.usernames || [];
          setSuggestions(usernames.map((username: string) => ({
            username,
            role: 'USER',
          })));
        }
      } catch (err) {
        console.error('Autocomplete error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (username: string) => {
    navigate(`/profile/${username}`);
    setIsExpanded(false);
    setQuery('');
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSelect(suggestions[selectedIndex].username);
      } else if (query.trim()) {
        // Parse username from various input formats (URLs, paths, etc.)
        const parsedUsername = parseUsername(query);
        if (parsedUsername) {
          handleSelect(parsedUsername);
        }
      }
    }
  };

  // Inline mode renders search directly in header
  if (inline) {
    return (
      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search users... (⌘K)"
          className="w-80 px-3 py-1.5 bg-mhc-surface-light border border-white/20 rounded-md text-white placeholder-mhc-text-muted focus:outline-none focus:border-mhc-primary focus:w-96 transition-all text-sm"
        />
        {loading && (
          <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-mhc-primary animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}

        {/* Dropdown suggestions */}
        {(suggestions.length > 0 || (query.trim() && !loading)) && (
          <div className="absolute top-full left-0 mt-1 w-80 bg-mhc-surface border border-white/20 rounded-lg shadow-2xl overflow-hidden z-50">
            {suggestions.length > 0 ? (
              <div className="max-h-64 overflow-y-auto">
                {suggestions.map((user, index) => (
                  <button
                    key={user.username}
                    onClick={() => handleSelect(user.username)}
                    className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-mhc-primary/20 text-white'
                        : 'hover:bg-white/5 text-mhc-text'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{user.username}</div>
                      <div className="text-xs text-mhc-text-muted flex items-center gap-2">
                        <span>{user.role}</span>
                        {user.following && (
                          <span className="text-emerald-400">Following</span>
                        )}
                        {user.friend_tier && user.friend_tier > 0 && (
                          <span className="text-amber-400">T{user.friend_tier}</span>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-mhc-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-4 text-center text-mhc-text-muted text-sm">
                No users found. Press Enter to search "{parseUsername(query)}"
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Floating mode (original behavior)
  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50">
      {isExpanded ? (
        <div className="bg-mhc-surface border border-mhc-primary/50 rounded-lg shadow-2xl w-80 overflow-hidden">
          {/* Search Input */}
          <div className="p-3 border-b border-white/10">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mhc-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search users..."
                className="w-full pl-10 pr-4 py-2 bg-mhc-surface-light border border-white/10 rounded-md text-white placeholder-mhc-text-muted focus:outline-none focus:border-mhc-primary text-sm"
              />
              {loading && (
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mhc-primary animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
            </div>
            <div className="mt-1 text-xs text-mhc-text-muted">
              Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">Enter</kbd> to go or <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">Esc</kbd> to close
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="max-h-64 overflow-y-auto">
              {suggestions.map((user, index) => (
                <button
                  key={user.username}
                  onClick={() => handleSelect(user.username)}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-mhc-primary/20 text-white'
                      : 'hover:bg-white/5 text-mhc-text'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{user.username}</div>
                    <div className="text-xs text-mhc-text-muted flex items-center gap-2">
                      <span>{user.role}</span>
                      {user.following && (
                        <span className="text-emerald-400">Following</span>
                      )}
                      {user.friend_tier && user.friend_tier > 0 && (
                        <span className="text-amber-400">T{user.friend_tier}</span>
                      )}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-mhc-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {query.trim() && !loading && suggestions.length === 0 && (
            <div className="px-4 py-6 text-center text-mhc-text-muted text-sm">
              No users found. Press Enter to search "{parseUsername(query)}"
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-14 h-14 bg-mhc-primary hover:bg-mhc-primary/90 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          title="Quick Lookup (Cmd+K)"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default GlobalLookup;
