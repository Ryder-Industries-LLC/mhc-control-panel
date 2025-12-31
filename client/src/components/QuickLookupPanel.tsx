import React, { useState, useEffect, useRef } from 'react';

interface QuickLookupPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialUsername?: string;
}

interface ProfileSummary {
  person: {
    id: string;
    username: string;
    role: string;
  };
  profile?: {
    notes?: string;
    tags?: string[];
    friend_tier?: number;
    following?: boolean;
    is_follower?: boolean;
    banned_me?: boolean;
    watch_list?: boolean;
  };
  stats?: {
    total_tips?: number;
    tip_count?: number;
    total_visits?: number;
    last_visit?: string;
  };
  serviceRelationship?: {
    sub_level?: string;
    dom_level?: string;
  };
  recentNotes?: Array<{
    id: string;
    content: string;
    created_at: string;
  }>;
}

export const QuickLookupPanel: React.FC<QuickLookupPanelProps> = ({
  isOpen,
  onClose,
  initialUsername = '',
}) => {
  const [username, setUsername] = useState(initialUsername);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Load profile when initialUsername changes
  useEffect(() => {
    if (initialUsername && initialUsername !== username) {
      setUsername(initialUsername);
      loadProfile(initialUsername);
    }
  }, [initialUsername]);

  const loadProfile = async (usernameToLoad: string) => {
    if (!usernameToLoad.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/${usernameToLoad.trim().toLowerCase()}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('User not found');
          setProfile(null);
        } else {
          throw new Error('Failed to load profile');
        }
        return;
      }

      const data = await response.json();

      // Also fetch notes
      let recentNotes: ProfileSummary['recentNotes'] = [];
      try {
        const notesResponse = await fetch(`/api/profile/${usernameToLoad.trim().toLowerCase()}/notes`);
        if (notesResponse.ok) {
          const notesData = await notesResponse.json();
          recentNotes = notesData.notes?.slice(0, 5) || [];
        }
      } catch {
        // Ignore notes errors
      }

      // Get visit stats
      let stats: ProfileSummary['stats'] = {};
      try {
        const visitsResponse = await fetch(`/api/profile/${usernameToLoad.trim().toLowerCase()}/visits/stats`);
        if (visitsResponse.ok) {
          const visitsData = await visitsResponse.json();
          stats = {
            total_visits: visitsData.total_visits,
            last_visit: visitsData.last_visit,
          };
        }
      } catch {
        // Ignore visit errors
      }

      // Get service relationship
      let serviceRelationship: ProfileSummary['serviceRelationship'];
      try {
        const srResponse = await fetch(`/api/profile/${usernameToLoad.trim().toLowerCase()}/service-relationships`);
        if (srResponse.ok) {
          serviceRelationship = await srResponse.json();
        }
      } catch {
        // Ignore SR errors
      }

      setProfile({
        person: data.person,
        profile: data.profile,
        stats,
        serviceRelationship,
        recentNotes,
      });
    } catch (err) {
      setError('Failed to load profile');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadProfile(username);
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !profile) return;

    setSavingNote(true);
    try {
      const response = await fetch(`/api/profile/${profile.person.username}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote.trim() }),
      });

      if (response.ok) {
        const savedNote = await response.json();
        setProfile(prev => prev ? {
          ...prev,
          recentNotes: [savedNote, ...(prev.recentNotes || [])].slice(0, 5),
        } : null);
        setNewNote('');
      }
    } catch {
      // Ignore errors
    } finally {
      setSavingNote(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-[#0d0d1a] border-l border-mhc-border h-full overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#0d0d1a] border-b border-mhc-border p-4 z-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Quick Lookup</h2>
            <button
              onClick={onClose}
              className="text-mhc-text-muted hover:text-white text-2xl"
            >
              &times;
            </button>
          </div>

          {/* Search form */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username..."
              className="flex-1 px-3 py-2 bg-mhc-surface border border-mhc-border rounded text-white placeholder-mhc-text-muted focus:outline-none focus:border-mhc-primary"
            />
            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="px-4 py-2 bg-mhc-primary text-white rounded hover:bg-mhc-primary/80 disabled:opacity-50"
            >
              {loading ? '...' : 'Look Up'}
            </button>
          </form>
        </div>

        {/* Content */}
        <div className="p-4 bg-[#0d0d1a]">
          {error && (
            <div className="text-red-400 text-center py-8">{error}</div>
          )}

          {loading && (
            <div className="text-mhc-text-muted text-center py-8">Loading...</div>
          )}

          {profile && !loading && (
            <div className="space-y-4">
              {/* User header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{profile.person.username}</h3>
                  <span className="text-sm text-mhc-text-muted">{profile.person.role}</span>
                </div>
                <a
                  href={`/profile/${profile.person.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mhc-primary hover:underline text-sm"
                >
                  Full Profile &rarr;
                </a>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {profile.profile?.following && (
                  <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded">Following</span>
                )}
                {profile.profile?.is_follower && (
                  <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded">Follower</span>
                )}
                {profile.profile?.banned_me && (
                  <span className="px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded">Banned</span>
                )}
                {profile.profile?.watch_list && (
                  <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded">Watch List</span>
                )}
                {profile.serviceRelationship?.sub_level && (
                  <span className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded">
                    Sub: {profile.serviceRelationship.sub_level}
                  </span>
                )}
                {profile.serviceRelationship?.dom_level && (
                  <span className="px-2 py-1 bg-pink-600/20 text-pink-400 text-xs rounded">
                    Dom: {profile.serviceRelationship.dom_level}
                  </span>
                )}
                {profile.profile?.friend_tier && profile.profile.friend_tier > 0 && (
                  <span className="px-2 py-1 bg-amber-600/20 text-amber-400 text-xs rounded">
                    Friend Tier {profile.profile.friend_tier}
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-mhc-surface p-3 rounded">
                  <div className="text-mhc-text-muted text-xs">Room Visits</div>
                  <div className="text-white font-bold">{profile.stats?.total_visits || 0}</div>
                </div>
                <div className="bg-mhc-surface p-3 rounded">
                  <div className="text-mhc-text-muted text-xs">Last Visit</div>
                  <div className="text-white font-bold text-sm">
                    {profile.stats?.last_visit
                      ? new Date(profile.stats.last_visit).toLocaleDateString()
                      : 'Never'}
                  </div>
                </div>
              </div>

              {/* Tags */}
              {profile.profile?.tags && profile.profile.tags.length > 0 && (
                <div>
                  <div className="text-mhc-text-muted text-xs mb-1">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {profile.profile.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 bg-mhc-surface text-mhc-text-muted text-xs rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Note */}
              <div>
                <div className="text-mhc-text-muted text-xs mb-2">Add Quick Note</div>
                <div className="flex flex-col gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Type a note..."
                    rows={2}
                    className="w-full px-3 py-2 bg-mhc-surface border border-mhc-border rounded text-white placeholder-mhc-text-muted text-sm focus:outline-none focus:border-mhc-primary resize-y"
                    onKeyDown={(e) => e.key === 'Enter' && e.metaKey && handleAddNote()}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={savingNote || !newNote.trim()}
                    className="self-end px-3 py-2 bg-mhc-primary text-white rounded text-sm hover:bg-mhc-primary/80 disabled:opacity-50"
                  >
                    {savingNote ? '...' : 'Add Note'}
                  </button>
                </div>
              </div>

              {/* Recent Notes */}
              {profile.recentNotes && profile.recentNotes.length > 0 && (
                <div>
                  <div className="text-mhc-text-muted text-xs mb-2">Recent Notes</div>
                  <div className="space-y-2">
                    {profile.recentNotes.map((note) => (
                      <div key={note.id} className="bg-mhc-surface p-3 rounded">
                        <div className="text-white text-sm whitespace-pre-wrap">{note.content}</div>
                        <div className="text-mhc-text-muted text-xs mt-1">
                          {new Date(note.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!profile && !loading && !error && (
            <div className="text-mhc-text-muted text-center py-8">
              Enter a username to look up their profile
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickLookupPanel;
