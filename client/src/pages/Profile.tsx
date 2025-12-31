import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { formatDuration, formatGender } from '../utils/formatting';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { SocialLinksEditor } from '../components/SocialLinksEditor';
import { ServiceRelationshipEditor, type ServiceRelationship } from '../components/ServiceRelationshipEditor';
// Profile.css removed - fully migrated to Tailwind CSS

interface ProfilePageProps {}

type TabType = 'snapshot' | 'sessions' | 'profile' | 'interactions' | 'images' | 'history';
type HistorySubTab = 'messaged' | 'tipped';

interface MemberInfo {
  name: string;
  did: number;
  first_message_date: string | null;
  first_tip_date: string | null;
  last_tip_date: string | null;
  last_tip_amount: number;
  last_tip_to: string | null;
  models_messaged_2weeks: number;
  models_messaged_2weeks_list: string[];
  models_tipped_2weeks: number;
  models_tipped_2weeks_list: string[];
  per_day_tokens: Array<{ date: string; tokens: number }>;
  all_time_tokens: number;
}

interface ProfileNote {
  id: string;
  profile_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

// Check if a session is currently live (observed within the last 30 minutes)
const isSessionLive = (session: any): boolean => {
  if (!session?.observed_at || !session?.current_show) return false;
  const observedAt = new Date(session.observed_at);
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return observedAt > thirtyMinutesAgo;
};

// Get the best available image URL
// - If live: use Chaturbate's real-time thumbnail
// - If offline: use our locally cached image
const getSessionImageUrl = (session: any, isLive: boolean): string | null => {
  if (!session) return null;

  if (isLive) {
    // When live, prefer real-time Chaturbate image
    return session.image_url_360x270 || session.image_path_360x270
      ? `http://localhost:3000/images/${session.image_path_360x270}`
      : null;
  }

  // When offline, prefer local cached image
  if (session.image_path_360x270) {
    return `http://localhost:3000/images/${session.image_path_360x270}`;
  }
  // Fall back to external URL if no local cache
  return session.image_url_360x270 || null;
};

interface ImageHistoryItem {
  image_url: string;
  observed_at: string;
  session_start: string;
  current_show: string;
  num_users: number;
  room_subject: string;
}

const Profile: React.FC<ProfilePageProps> = () => {
  const { username: urlUsername } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Parse tab from query params
  const queryParams = new URLSearchParams(location.search);
  const tabFromUrl = queryParams.get('tab') as TabType | null;

  const [username, setUsername] = useState(urlUsername || '');
  const [lookupCollapsed, setLookupCollapsed] = useState(!!urlUsername);
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl || 'snapshot');
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [showRawData, setShowRawData] = useState(false);

  // Image history state
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Member info (Statbate) state
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [memberInfoLoading, setMemberInfoLoading] = useState(false);
  const [memberInfoError, setMemberInfoError] = useState<string | null>(null);
  const [historySubTab, setHistorySubTab] = useState<HistorySubTab>('tipped');

  // Notes and status state
  const [profileNotes, setProfileNotes] = useState<ProfileNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [editingNoteDate, setEditingNoteDate] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);

  // Profile attributes state
  const [bannedMe, setBannedMe] = useState(false);
  const [watchList, setWatchList] = useState(false);
  const [friendTier, setFriendTier] = useState<number | null>(null);


  // Top mover badge state
  const [topMoverStatus, setTopMoverStatus] = useState<'gainer' | 'loser' | null>(null);

  // Image preview modal state
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Image upload state
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [selectedImageSource, setSelectedImageSource] = useState<'manual_upload' | 'screensnap' | 'external'>('manual_upload');
  const [imageDescription, setImageDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Social links state
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [socialLinksLoading, setSocialLinksLoading] = useState(false);

  // Service relationships state
  const [serviceRelationships, setServiceRelationships] = useState<ServiceRelationship[]>([]);
  const [serviceRelationshipsLoading, setServiceRelationshipsLoading] = useState(false);

  // Room visits state
  const [roomVisitStats, setRoomVisitStats] = useState<{
    total_visits: number;
    first_visit: string | null;
    last_visit: string | null;
    visits_this_week: number;
    visits_this_month: number;
  } | null>(null);

  // Interactions pagination state
  const [interactionsPage, setInteractionsPage] = useState(0);
  const INTERACTIONS_PER_PAGE = 20;

  // Token activity pagination state
  const [tokenActivityPage, setTokenActivityPage] = useState(0);
  const TOKEN_ACTIVITY_PER_PAGE = 31;

  // Auto-load profile if username in URL
  useEffect(() => {
    if (urlUsername) {
      setUsername(urlUsername);
      setLoading(true);
      setError(null);

      fetch(`/api/profile/${urlUsername}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch profile');
          }
          return response.json();
        })
        .then(data => {
          setProfileData(data);
          setLookupCollapsed(true);
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setProfileData(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [urlUsername]);

  // Username autocomplete suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (username.length >= 2) {
        try {
          const suggestions = await api.searchUsernames(username);
          setUsernameSuggestions(suggestions);
        } catch (err) {
          console.error('Failed to fetch username suggestions', err);
          setUsernameSuggestions([]);
        }
      } else {
        setUsernameSuggestions([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [username]);

  // Sync profile attribute states from profile data
  useEffect(() => {
    if (profileData?.profile) {
      setBannedMe(profileData.profile.banned_me || false);
      setWatchList(profileData.profile.watch_list || false);
      setFriendTier(profileData.profile.friend_tier || null);
    }
  }, [profileData?.profile]);

  // Fetch notes when profile changes
  useEffect(() => {
    if (profileData?.person?.username) {
      // Reset notes state
      setProfileNotes([]);
      setNewNoteContent('');
      setEditingNoteId(null);
      setEditingNoteContent('');
      // Fetch notes
      const fetchProfileNotes = async () => {
        setNotesLoading(true);
        try {
          const response = await fetch(`/api/profile/${profileData.person.username}/notes`);
          if (response.ok) {
            const data = await response.json();
            setProfileNotes(data.notes || []);
          }
        } catch (err) {
          console.error('Error fetching notes:', err);
        } finally {
          setNotesLoading(false);
        }
      };
      fetchProfileNotes();

      // Fetch service relationships
      const fetchServiceRelationships = async () => {
        setServiceRelationshipsLoading(true);
        try {
          const response = await fetch(`/api/profile/${profileData.person.username}/service-relationships`);
          if (response.ok) {
            const data = await response.json();
            setServiceRelationships(data.relationships || []);
          }
        } catch (err) {
          console.error('Error fetching service relationships:', err);
        } finally {
          setServiceRelationshipsLoading(false);
        }
      };
      fetchServiceRelationships();

      // Fetch room visit stats
      const fetchRoomVisitStats = async () => {
        try {
          const response = await fetch(`/api/profile/${profileData.person.username}/visits/stats`);
          if (response.ok) {
            const data = await response.json();
            setRoomVisitStats(data);
          }
        } catch (err) {
          console.error('Error fetching room visit stats:', err);
        }
      };
      fetchRoomVisitStats();
    }
  }, [profileData?.person?.username]);

  // Check if current profile is a top mover (7 day)
  useEffect(() => {
    if (profileData?.person?.username) {
      fetch('/api/system/follower-trends/dashboard?days=7&limit=10')
        .then(response => response.json())
        .then(data => {
          const currentUsername = profileData.person.username.toLowerCase();
          const isTopGainer = data.topGainers?.some(
            (m: { username: string }) => m.username.toLowerCase() === currentUsername
          );
          const isTopLoser = data.topLosers?.some(
            (m: { username: string }) => m.username.toLowerCase() === currentUsername
          );
          if (isTopGainer) {
            setTopMoverStatus('gainer');
          } else if (isTopLoser) {
            setTopMoverStatus('loser');
          } else {
            setTopMoverStatus(null);
          }
        })
        .catch(() => {
          setTopMoverStatus(null);
        });
    }
  }, [profileData?.person?.username]);

  // Fetch image history when profile loads
  useEffect(() => {
    if (profileData?.person?.id) {
      fetch(`http://localhost:3000/api/person/${profileData.person.id}/images?limit=10`)
        .then(response => response.json())
        .then(data => {
          setImageHistory(data.images || []);
          setCurrentImageIndex(0);
        })
        .catch(err => {
          console.error('Failed to fetch image history', err);
          setImageHistory([]);
        });
    }
  }, [profileData?.person?.id]);

  // Extract social links from profile data
  // Handle both array format [{platform, url}] and object format {platform: url}
  useEffect(() => {
    if (profileData?.profile?.social_links) {
      const links = profileData.profile.social_links;
      if (Array.isArray(links)) {
        // Convert array format to object format
        const linksObj: Record<string, string> = {};
        links.forEach((link: { platform: string; url: string }) => {
          if (link.platform && link.url) {
            linksObj[link.platform] = link.url;
          }
        });
        setSocialLinks(linksObj);
      } else {
        // Already in object format
        setSocialLinks(links);
      }
    } else {
      setSocialLinks({});
    }
  }, [profileData?.profile?.social_links]);

  // Fetch uploaded images when Images tab is selected
  useEffect(() => {
    if (activeTab === 'images' && profileData?.person?.username) {
      setImageUploadLoading(true);
      fetch(`/api/profile/${profileData.person.username}/images`)
        .then(response => response.json())
        .then(data => {
          setUploadedImages(data.images || []);
        })
        .catch(err => {
          console.error('Failed to fetch profile images', err);
          setUploadedImages([]);
        })
        .finally(() => {
          setImageUploadLoading(false);
        });
    }
  }, [activeTab, profileData?.person?.username]);

  // Fetch member info from Statbate when History tab is selected
  useEffect(() => {
    if (activeTab === 'history' && profileData?.person?.username && !memberInfo && !memberInfoLoading) {
      setMemberInfoLoading(true);
      setMemberInfoError(null);

      fetch(`/api/profile/${profileData.person.username}/member-info`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('Member not found in Statbate');
            }
            throw new Error('Failed to fetch member info');
          }
          return response.json();
        })
        .then(data => {
          setMemberInfo(data.data);
        })
        .catch(err => {
          console.error('Failed to fetch member info', err);
          setMemberInfoError(err.message || 'Failed to fetch member info');
        })
        .finally(() => {
          setMemberInfoLoading(false);
        });
    }
  }, [activeTab, profileData?.person?.username, memberInfo, memberInfoLoading]);

  // Reset member info when profile changes
  useEffect(() => {
    setMemberInfo(null);
    setMemberInfoError(null);
    setHistorySubTab('tipped');
  }, [profileData?.person?.username]);

  const handleLookup = async (lookupUsername?: string) => {
    const usernameToLookup = lookupUsername || username;
    if (!usernameToLookup) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch enriched profile data
      const response = await fetch(`/api/profile/${usernameToLookup}`);
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }
      const data = await response.json();
      setProfileData(data);
      setLookupCollapsed(true);

      // Update URL without reloading
      if (!urlUsername || urlUsername !== usernameToLookup) {
        navigate(`/profile/${usernameToLookup}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setProfileData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLookup();
    }
  };

  // Add a new note
  const handleAddNote = async () => {
    if (!profileData?.person?.username || !newNoteContent.trim()) return;

    setNotesSaving(true);
    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNoteContent.trim() }),
      });

      if (response.ok) {
        const note = await response.json();
        setProfileNotes(prev => [note, ...prev]);
        setNewNoteContent('');
        setNotesMessage('Note added!');
        setTimeout(() => setNotesMessage(null), 3000);
      }
    } catch (err) {
      setNotesMessage('Error adding note');
      setTimeout(() => setNotesMessage(null), 3000);
    } finally {
      setNotesSaving(false);
    }
  };

  // Update an existing note
  const handleUpdateNote = async (noteId: string) => {
    if (!profileData?.person?.username || !editingNoteContent.trim()) return;

    setNotesSaving(true);
    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editingNoteContent.trim(),
          created_at: editingNoteDate ? new Date(editingNoteDate).toISOString() : undefined,
        }),
      });

      if (response.ok) {
        const updatedNote = await response.json();
        setProfileNotes(prev => prev.map(n => n.id === noteId ? updatedNote : n));
        setEditingNoteId(null);
        setEditingNoteContent('');
        setEditingNoteDate('');
        setNotesMessage('Note updated!');
        setTimeout(() => setNotesMessage(null), 3000);
      }
    } catch (err) {
      setNotesMessage('Error updating note');
      setTimeout(() => setNotesMessage(null), 3000);
    } finally {
      setNotesSaving(false);
    }
  };

  // Delete a note
  const handleDeleteNote = async (noteId: string) => {
    if (!profileData?.person?.username) return;
    if (!window.confirm('Are you sure you want to delete this note?')) return;

    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/notes/${noteId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setProfileNotes(prev => prev.filter(n => n.id !== noteId));
        setNotesMessage('Note deleted!');
        setTimeout(() => setNotesMessage(null), 3000);
      }
    } catch (err) {
      setNotesMessage('Error deleting note');
      setTimeout(() => setNotesMessage(null), 3000);
    }
  };

  // Start editing a note
  const startEditingNote = (note: ProfileNote) => {
    setEditingNoteId(note.id);
    setEditingNoteContent(note.content);
    // Format date for datetime-local input (YYYY-MM-DDTHH:MM)
    const date = new Date(note.created_at);
    const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditingNoteDate(localDateTime);
  };

  // Cancel editing
  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditingNoteContent('');
    setEditingNoteDate('');
  };

  // Image upload handler
  const handleImageUpload = async (file: File) => {
    if (!profileData?.person?.username) return;

    setImageUploadLoading(true);
    setImageUploadError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('source', selectedImageSource);
      if (imageDescription.trim()) {
        formData.append('description', imageDescription.trim());
      }

      const response = await fetch(`/api/profile/${profileData.person.username}/images`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload image');
      }

      const newImage = await response.json();
      setUploadedImages(prev => [newImage, ...prev]);
      setImageDescription('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setImageUploadError(err.message || 'Failed to upload image');
    } finally {
      setImageUploadLoading(false);
    }
  };

  // Delete uploaded image
  const handleDeleteImage = async (imageId: string) => {
    if (!profileData?.person?.username) return;
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/images/${imageId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setUploadedImages(prev => prev.filter(img => img.id !== imageId));
      }
    } catch (err) {
      console.error('Failed to delete image', err);
    }
  };

  // Social links save handler
  const handleSaveSocialLinks = async (links: Record<string, string>) => {
    if (!profileData?.person?.username) return;

    setSocialLinksLoading(true);
    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/social-links`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save social links');
      }

      const data = await response.json();
      setSocialLinks(data.links);
    } finally {
      setSocialLinksLoading(false);
    }
  };

  // Add single social link
  const handleAddSocialLink = async (platform: string, url: string) => {
    if (!profileData?.person?.username) return;

    setSocialLinksLoading(true);
    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/social-links`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, url }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add social link');
      }

      const data = await response.json();
      setSocialLinks(data.links);
    } finally {
      setSocialLinksLoading(false);
    }
  };

  // Remove single social link
  const handleRemoveSocialLink = async (platform: string) => {
    if (!profileData?.person?.username) return;

    setSocialLinksLoading(true);
    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/social-links/${platform}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove social link');
      }

      const data = await response.json();
      setSocialLinks(data.links);
    } finally {
      setSocialLinksLoading(false);
    }
  };

  const handleBannedToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !bannedMe;
    setBannedMe(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned_me: newValue }),
      });
    } catch (err) {
      // Revert on error
      setBannedMe(!newValue);
    }
  };

  const handleWatchListToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !watchList;
    setWatchList(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watch_list: newValue }),
      });
    } catch (err) {
      // Revert on error
      setWatchList(!newValue);
    }
  };

  // Service relationship handlers
  const handleSaveServiceRelationship = async (
    role: 'sub' | 'dom',
    data: {
      serviceLevel: string;
      serviceTypes: string[];
      startedAt?: string | null;
      endedAt?: string | null;
      notes?: string | null;
    }
  ) => {
    if (!profileData?.person?.username) return;

    const response = await fetch(`/api/profile/${profileData.person.username}/service-relationships`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceRole: role,
        serviceLevel: data.serviceLevel,
        serviceTypes: data.serviceTypes,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        notes: data.notes,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save service relationship');
    }

    const result = await response.json();

    // Update local state
    setServiceRelationships(prev => {
      const filtered = prev.filter(r => r.service_role !== role);
      return [...filtered, result];
    });
  };

  const handleRemoveServiceRelationship = async (role: 'sub' | 'dom') => {
    if (!profileData?.person?.username) return;

    const response = await fetch(`/api/profile/${profileData.person.username}/service-relationships/${role}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to remove service relationship');
    }

    // Update local state
    setServiceRelationships(prev => prev.filter(r => r.service_role !== role));
  };

  const handleFriendTierChange = async (newTier: number | null) => {
    if (!profileData?.person?.username) return;

    const oldTier = friendTier;
    setFriendTier(newTier);

    try {
      await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_tier: newTier }),
      });
    } catch (err) {
      // Revert on error
      setFriendTier(oldTier);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-5">
      <h1 className="text-mhc-primary text-4xl font-bold mb-8 py-4 border-b-2 border-mhc-primary">Profile Viewer</h1>

      {/* Lookup Section */}
      <div className="bg-mhc-surface rounded-lg shadow-lg mb-5">
        <div
          className="px-5 py-4 border-b border-gray-700 flex justify-between items-center cursor-pointer hover:bg-mhc-surface-light transition-colors"
          onClick={() => setLookupCollapsed(!lookupCollapsed)}
        >
          <h2 className="m-0 text-xl font-semibold text-mhc-text">Lookup User {lookupCollapsed ? '▼' : '▲'}</h2>
        </div>

        {!lookupCollapsed && (
          <div className="p-5">
            <div className="flex gap-3">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\//g, ''))}
                onKeyPress={handleKeyPress}
                placeholder="Enter username..."
                disabled={loading}
                list="profile-username-suggestions"
                autoComplete="off"
                className="flex-1 px-4 py-2.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-base focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20 disabled:opacity-50"
              />
              <datalist id="profile-username-suggestions">
                {usernameSuggestions.map((suggestion, idx) => (
                  <option key={idx} value={suggestion} />
                ))}
              </datalist>
              <button
                onClick={() => handleLookup()}
                disabled={loading}
                className="px-6 py-2.5 bg-gradient-primary text-white border-none rounded-md text-base font-semibold cursor-pointer transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Lookup'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/20 border-l-4 border-red-500 text-red-300 px-4 py-3 rounded-md mb-5">
          <strong className="font-bold mr-1">Error:</strong> {error}
        </div>
      )}

      {/* Profile Content */}
      {profileData && (
        <div>
          {/* Profile Header */}
          <div className="bg-gradient-primary text-white rounded-lg p-8 mb-5 shadow-lg">
            <div className="flex gap-5 items-center flex-wrap md:flex-nowrap">
              {(imageHistory.length > 0 || getSessionImageUrl(profileData.latestSession, isSessionLive(profileData.latestSession)) || (profileData.profile?.photos && profileData.profile.photos.length > 0)) && (
                <div className="flex-shrink-0 flex flex-col items-center gap-3">
                  {/* Image with navigation arrows */}
                  <div className="relative group">
                    {/* LIVE indicator - overlaid on image */}
                    {isSessionLive(profileData.latestSession) && (
                      <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-3 py-1 rounded-full font-bold text-xs uppercase tracking-wider shadow-lg animate-pulse border border-white/50">
                        ● LIVE
                      </div>
                    )}
                    <img
                      src={
                        imageHistory.length > 0
                          ? `http://localhost:3000/images/${imageHistory[currentImageIndex]?.image_url}`
                          : getSessionImageUrl(profileData.latestSession, isSessionLive(profileData.latestSession)) || (profileData.profile.photos.find((p: any) => p.isPrimary)?.url || profileData.profile.photos[0]?.url)
                      }
                      alt={profileData.person.username}
                      className="w-[200px] h-[150px] rounded-lg object-cover border-4 border-white/30 shadow-lg"
                      width="360"
                      height="270"
                    />
                    {/* Navigation arrows - only show if multiple images */}
                    {imageHistory.length > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : imageHistory.length - 1))}
                          className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Previous image"
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => setCurrentImageIndex(prev => (prev < imageHistory.length - 1 ? prev + 1 : 0))}
                          className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Next image"
                        >
                          ›
                        </button>
                        {/* Image counter */}
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          {currentImageIndex + 1} / {imageHistory.length}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Image timestamp */}
                  {imageHistory.length > 0 && imageHistory[currentImageIndex] && (
                    <div className="text-xs text-white/90 text-center">
                      {new Date(imageHistory[currentImageIndex].observed_at).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1">
                {/* Username row with role indicator, followers, and viewers */}
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <h2 className="m-0 text-3xl font-bold">
                    <a
                      href={`https://chaturbate.com/${profileData.person.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white no-underline hover:underline"
                    >
                      {profileData.person.username}
                    </a>
                  </h2>
                  {/* Role indicator - styled differently for MODEL vs VIEWER */}
                  <span className={`text-xs px-2 py-1 rounded font-semibold uppercase tracking-wider ${
                    profileData.person.role === 'MODEL'
                      ? 'bg-pink-500/30 text-pink-300 border border-pink-500/50'
                      : 'bg-white/20 text-white/80'
                  }`}>
                    {profileData.person.role}
                  </span>
                  {/* Followers */}
                  {(profileData.latestSession?.num_followers || profileData.latestSnapshot?.normalized_metrics?.followers) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      ❤️ {(profileData.latestSession?.num_followers || profileData.latestSnapshot?.normalized_metrics?.followers || 0).toLocaleString()} followers
                    </span>
                  )}
                  {/* Viewers (if live) */}
                  {isSessionLive(profileData.latestSession) && profileData.latestSession?.num_users !== undefined && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/30 border border-emerald-500/50">
                      👁 {profileData.latestSession.num_users.toLocaleString()} viewers
                    </span>
                  )}
                </div>

                {/* Badges row */}
                <div className="mb-3 flex items-center gap-2 flex-wrap">
                  {profileData.profile?.following && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/30 border border-emerald-500/50" title="You follow this user">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                      </svg>
                      Following
                    </span>
                  )}
                  {profileData.profile?.follower && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-blue-500/30 border border-blue-500/50" title="Follows you">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                      </svg>
                      Follows You
                    </span>
                  )}
                  {/* Sub/Dom relationship badges */}
                  {serviceRelationships.find(r => r.service_role === 'sub' && r.service_level === 'Current') && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/30 border border-emerald-500/50" title="Current Sub">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                      Sub
                    </span>
                  )}
                  {serviceRelationships.find(r => r.service_role === 'dom' && r.service_level === 'Actively Serving') && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-purple-500/30 border border-purple-500/50" title="Actively Serving Dom">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                      Dom
                    </span>
                  )}
                  {bannedMe && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-500/30 border border-red-500/50" title="This user has banned you">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                      </svg>
                      Banned Me
                    </span>
                  )}
                  {watchList && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-yellow-500/30 border border-yellow-500/50" title="On your watchlist">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                      Watchlist
                    </span>
                  )}
                  {topMoverStatus === 'gainer' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/30 border border-emerald-500/50 animate-pulse" title="Top Gainer (7 day)">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd"/>
                      </svg>
                      Top Gainer
                    </span>
                  )}
                  {topMoverStatus === 'loser' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-500/30 border border-red-500/50 animate-pulse" title="Top Loser (7 day)">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12 13a1 1 0 100 2h5a1 1 0 001-1V9a1 1 0 10-2 0v2.586l-4.293-4.293a1 1 0 00-1.414 0L8 9.586 3.707 5.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L11 9.414 14.586 13H12z" clipRule="evenodd"/>
                      </svg>
                      Top Loser
                    </span>
                  )}
                </div>

                {/* Stats row - Total Sessions, Images, Visits */}
                <div className="flex gap-4 mb-3 text-white/80 text-sm">
                  {profileData.sessionStats?.totalSessions > 0 && (
                    <span title="Total broadcast sessions observed">
                      📺 {profileData.sessionStats.totalSessions.toLocaleString()} sessions
                    </span>
                  )}
                  {imageHistory.length > 0 && (
                    <span title="Total images captured">
                      🖼️ {imageHistory.length} images
                    </span>
                  )}
                  {roomVisitStats && roomVisitStats.total_visits > 0 && (
                    <span title={`Visited your room ${roomVisitStats.total_visits} times${roomVisitStats.last_visit ? `. Last visit: ${new Date(roomVisitStats.last_visit).toLocaleDateString()}` : ''}`}>
                      👋 {roomVisitStats.total_visits.toLocaleString()} visits
                    </span>
                  )}
                </div>

                {/* Info row */}
                <div className="flex gap-2.5 flex-wrap">
                  {/* Gender */}
                  {(profileData.profile?.gender || profileData.latestSession?.gender || profileData.latestSnapshot?.normalized_metrics?.gender) && (
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      (() => {
                        const gender = (profileData.profile?.gender || profileData.latestSession?.gender || profileData.latestSnapshot?.normalized_metrics?.gender || '').toLowerCase();
                        if (gender === 'f' || gender === 'female') return 'bg-pink-500/30 border border-pink-500/50';
                        if (gender === 't' || gender === 'trans') return 'bg-purple-500/30 border border-purple-500/50';
                        if (gender === 'c' || gender === 'couple') return 'bg-teal-500/30 border border-teal-500/50';
                        return 'bg-white/20';
                      })()
                    }`}>
                      {formatGender(profileData.profile?.gender || profileData.latestSession?.gender || profileData.latestSnapshot?.normalized_metrics?.gender)}
                    </span>
                  )}

                  {/* Age */}
                  {(profileData.profile?.age || profileData.latestSession?.age) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      {profileData.profile?.age || profileData.latestSession?.age} years
                    </span>
                  )}

                  {/* Location */}
                  {(profileData.profile?.location || profileData.latestSession?.location) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      📍 {profileData.profile?.location || profileData.latestSession?.location}
                    </span>
                  )}

                  {/* Rank */}
                  {profileData.latestSnapshot?.normalized_metrics?.rank && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      Rank #{Math.round(profileData.latestSnapshot.normalized_metrics.rank).toLocaleString()}
                    </span>
                  )}

                  {/* Offline status */}
                  {!isSessionLive(profileData.latestSession) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-500/30 border border-gray-500/50 text-white/80">
                      Offline
                    </span>
                  )}

                  {/* Last Seen (if offline) - prioritize most recent data source */}
                  {!isSessionLive(profileData.latestSession) && (
                    profileData.latestSession?.observed_at ||
                    profileData.profile?.last_seen_online ||
                    profileData.person?.last_seen_at
                  ) && (
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-white/20">
                      Last Seen: {new Date(
                        // Prioritize most accurate last seen data:
                        // 1. Session observed_at (model was broadcasting)
                        // 2. Profile last_seen_online (scraped data)
                        // 3. Person last_seen_at (any interaction)
                        profileData.latestSession?.observed_at ||
                        profileData.profile?.last_seen_online ||
                        profileData.person?.last_seen_at
                      ).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' })} ET
                    </span>
                  )}
                </div>

                {/* Room Subject with extracted tags (when live) */}
                {profileData.latestSession?.room_subject && (
                  <div className="mt-4">
                    <div className="px-4 py-3 bg-white/15 rounded-lg text-base leading-relaxed border-l-4 border-white/40">
                      {profileData.latestSession.room_subject}
                    </div>
                    {/* Extract hashtags from room subject */}
                    {isSessionLive(profileData.latestSession) && (() => {
                      const hashtags = profileData.latestSession.room_subject.match(/#\w+/g);
                      if (hashtags && hashtags.length > 0) {
                        return (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {hashtags.map((tag: string, idx: number) => (
                              <span key={idx} className="px-2.5 py-1 bg-mhc-primary/80 text-white rounded-full text-xs font-medium">
                                {tag}
                              </span>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Session Started (when live) - bottom right aligned text */}
                {isSessionLive(profileData.latestSession) && (
                  <div className="mt-3 text-right text-white/80 text-sm">
                    Session Started: {new Date(profileData.latestSession.session_start).toLocaleString('en-US', {
                      timeZone: 'America/New_York',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })} ET
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Attributes Section (Collapsible) */}
          <div className="mb-5">
            <CollapsibleSection title="Attributes" defaultCollapsed={false} className="bg-mhc-surface">
              <div className="flex flex-wrap items-center gap-6">
                {/* Friend Tier Dropdown */}
                <div className="flex items-center gap-2">
                  <label className="text-mhc-text font-medium whitespace-nowrap">Friend Tier:</label>
                  <select
                    value={friendTier || ''}
                    onChange={(e) => handleFriendTierChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                    className="px-3 py-1.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-sm focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20 min-w-[150px]"
                  >
                    <option value="">None</option>
                    <option value="1">Tier 1 - Special</option>
                    <option value="2">Tier 2 - Tipper</option>
                    <option value="3">Tier 3 - Regular</option>
                    <option value="4">Tier 4 - Drive-by</option>
                  </select>
                </div>

                {/* Banned Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bannedMe}
                    onChange={handleBannedToggle}
                    className="w-5 h-5 rounded border-2 border-red-500/50 bg-mhc-surface-light text-red-500 focus:ring-red-500 cursor-pointer"
                  />
                  <span className="text-mhc-text font-medium">Banned Me</span>
                </label>

                {/* Watchlist Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watchList}
                    onChange={handleWatchListToggle}
                    className="w-5 h-5 rounded border-2 border-yellow-500/50 bg-mhc-surface-light text-yellow-500 focus:ring-yellow-500 cursor-pointer"
                  />
                  <span className="text-mhc-text font-medium">Watchlist</span>
                </label>
              </div>
            </CollapsibleSection>
          </div>

          {/* Service Relationships Section (Collapsible) */}
          <div className="mb-5">
            <CollapsibleSection
              title={
                <div className="flex items-center gap-2">
                  <span>Service Relationships</span>
                  {serviceRelationships.length > 0 && (
                    <span className="text-xs text-white/50 font-normal">({serviceRelationships.length})</span>
                  )}
                </div>
              }
              defaultCollapsed={true}
              className="bg-mhc-surface"
            >
              {serviceRelationshipsLoading ? (
                <div className="text-white/50 text-sm py-4 text-center">Loading...</div>
              ) : (
                <ServiceRelationshipEditor
                  relationships={serviceRelationships}
                  onSave={handleSaveServiceRelationship}
                  onRemove={handleRemoveServiceRelationship}
                />
              )}
            </CollapsibleSection>
          </div>

          {/* Notes Section (Collapsible) */}
          <div className="mb-5">
            <CollapsibleSection
              title={
                <div className="flex items-center gap-2">
                  <span>Notes</span>
                  {profileNotes.length > 0 && (
                    <span className="text-xs text-white/50 font-normal">({profileNotes.length})</span>
                  )}
                </div>
              }
              defaultCollapsed={false}
              className="bg-mhc-surface"
            >
              {/* Add New Note */}
              <div className="flex gap-3 mb-4">
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Add a new note..."
                  rows={2}
                  className="flex-1 px-4 py-2.5 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-base resize-y focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                />
                <button
                  onClick={handleAddNote}
                  disabled={notesSaving || !newNoteContent.trim()}
                  className="px-5 py-2 bg-mhc-primary text-white border-none rounded-md text-sm font-semibold cursor-pointer transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed self-start"
                >
                  {notesSaving ? 'Adding...' : 'Add Note'}
                </button>
              </div>

              {/* Status Message */}
              {notesMessage && (
                <div className={`text-sm mb-3 px-3 py-2 rounded ${
                  notesMessage.includes('Error')
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {notesMessage}
                </div>
              )}

              {/* Notes List */}
              {notesLoading ? (
                <div className="text-white/50 text-sm py-4 text-center">Loading notes...</div>
              ) : profileNotes.length === 0 ? (
                <div className="text-white/50 text-sm py-4 text-center">No notes yet. Add one above.</div>
              ) : (
                <div className="space-y-3">
                  {profileNotes.map((note) => (
                    <div key={note.id} className="bg-mhc-surface-light rounded-md p-4 border border-white/10">
                      {editingNoteId === note.id ? (
                        /* Editing Mode */
                        <div className="space-y-3">
                          <textarea
                            value={editingNoteContent}
                            onChange={(e) => setEditingNoteContent(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-2.5 bg-mhc-surface border border-gray-600 rounded-md text-mhc-text text-base resize-y focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                            autoFocus
                          />
                          <div className="flex items-center gap-3">
                            <label className="text-white/60 text-sm">Date:</label>
                            <input
                              type="datetime-local"
                              value={editingNoteDate}
                              onChange={(e) => setEditingNoteDate(e.target.value)}
                              className="px-3 py-1.5 bg-mhc-surface border border-gray-600 rounded-md text-mhc-text text-sm focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={cancelEditingNote}
                              className="px-4 py-1.5 text-white/70 hover:text-white text-sm transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleUpdateNote(note.id)}
                              disabled={notesSaving || !editingNoteContent.trim()}
                              className="px-4 py-1.5 bg-mhc-primary text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
                            >
                              {notesSaving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Display Mode */
                        <>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs text-white/40">
                              {new Date(note.created_at).toLocaleString('en-US', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                              {note.updated_at !== note.created_at && (
                                <span className="ml-2 italic">(edited)</span>
                              )}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEditingNote(note)}
                                className="text-white/40 hover:text-white/80 text-xs transition-colors"
                                title="Edit note"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="text-red-400/60 hover:text-red-400 text-xs transition-colors"
                                title="Delete note"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          <p className="text-mhc-text text-sm whitespace-pre-wrap m-0">{note.content}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-mhc-surface rounded-t-lg pt-2.5 px-2.5 shadow-lg flex-wrap">
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'snapshot'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('snapshot')}
            >
              Latest Snapshot
            </button>
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'sessions'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('sessions')}
            >
              Broadcast Sessions
            </button>
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'profile'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('profile')}
            >
              Profile Details
            </button>
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'interactions'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('interactions')}
            >
              Interactions
            </button>
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'images'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('images')}
            >
              Images {imageHistory.length > 0 && `(${imageHistory.length})`}
            </button>
            <button
              className={`px-6 py-3 border-none bg-transparent text-base font-medium cursor-pointer rounded-t-md transition-all ${
                activeTab === 'history'
                  ? 'bg-mhc-primary text-white'
                  : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
              }`}
              onClick={() => setActiveTab('history')}
            >
              History
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-mhc-surface rounded-b-lg shadow-lg p-8 min-h-[400px]">
            {activeTab === 'snapshot' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Latest Snapshot</h3>
                {(profileData.latestSession || profileData.latestSnapshot) ? (
                  <div className="space-y-6">
                    {/* Basic Info Section */}
                    <div>
                      <h4 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3">Live Session</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {profileData.latestSession && (
                          <>
                            <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                              <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Viewers:</span>
                              <span className="block text-mhc-text text-lg font-semibold">{(profileData.latestSession.num_users || 0).toLocaleString()}</span>
                            </div>
                            <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                              <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Followers:</span>
                              <span className="block text-mhc-text text-lg font-semibold">{(profileData.latestSession.num_followers || 0).toLocaleString()}</span>
                            </div>
                            <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                              <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Current Show:</span>
                              <span className="block text-mhc-text text-base">{profileData.latestSession.current_show || 'Public'}</span>
                            </div>
                            <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                              <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Online Duration:</span>
                              <span className="block text-mhc-text text-base">{formatDuration(Math.floor(profileData.latestSession.seconds_online / 60))}</span>
                            </div>
                          </>
                        )}
                      </div>
                      {/* Room Subject - Full Width */}
                      {profileData.latestSession?.room_subject && (
                        <div className="mt-4 p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Room Subject:</span>
                          <span className="block text-mhc-text text-base">{profileData.latestSession.room_subject}</span>
                        </div>
                      )}
                    </div>

                    {/* Financial Section */}
                    {profileData.latestSnapshot?.normalized_metrics && (
                      (profileData.latestSnapshot.normalized_metrics.income_usd !== undefined ||
                       profileData.latestSnapshot.normalized_metrics.income_tokens !== undefined) && (
                        <div>
                          <h4 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3">Financial</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {profileData.latestSnapshot.normalized_metrics.income_usd !== undefined && (
                              <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-emerald-500">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Income (USD):</span>
                                <span className="block text-emerald-400 text-xl font-bold">${profileData.latestSnapshot.normalized_metrics.income_usd.toLocaleString()}</span>
                              </div>
                            )}
                            {profileData.latestSnapshot.normalized_metrics.income_tokens !== undefined && (
                              <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-yellow-500">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Income (Tokens):</span>
                                <span className="block text-yellow-400 text-xl font-bold">{profileData.latestSnapshot.normalized_metrics.income_tokens.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    )}

                    {/* Session Statistics Section */}
                    {profileData.latestSnapshot?.normalized_metrics && (
                      (profileData.latestSnapshot.normalized_metrics.session_count !== undefined ||
                       profileData.latestSnapshot.normalized_metrics.total_duration_minutes !== undefined ||
                       profileData.latestSnapshot.normalized_metrics.average_duration_minutes !== undefined) && (
                        <div>
                          <h4 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3">Session Statistics</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {profileData.latestSnapshot.normalized_metrics.session_count !== undefined && (
                              <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Session Count:</span>
                                <span className="block text-mhc-text text-lg font-semibold">{profileData.latestSnapshot.normalized_metrics.session_count}</span>
                              </div>
                            )}
                            {profileData.latestSnapshot.normalized_metrics.total_duration_minutes !== undefined && (
                              <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Total Duration:</span>
                                <span className="block text-mhc-text text-lg font-semibold">{formatDuration(profileData.latestSnapshot.normalized_metrics.total_duration_minutes)}</span>
                              </div>
                            )}
                            {profileData.latestSnapshot.normalized_metrics.average_duration_minutes !== undefined && (
                              <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Avg Duration:</span>
                                <span className="block text-mhc-text text-lg font-semibold">{formatDuration(profileData.latestSnapshot.normalized_metrics.average_duration_minutes)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    )}

                    {/* Tags Section */}
                    {((profileData.latestSession?.tags && profileData.latestSession.tags.length > 0) ||
                      (profileData.profile?.tags && profileData.profile.tags.length > 0)) && (
                      <div>
                        <h4 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3">Tags</h4>
                        <div className="flex flex-wrap gap-2">
                          {(profileData.latestSession?.tags || profileData.profile?.tags || []).map((tag: string, idx: number) => (
                            <span key={idx} className="px-3 py-1 bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30 rounded-full text-sm">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Data Sources Section */}
                    <div>
                      <h4 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3">Data Sources</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {profileData.latestSession && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-gray-500">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Affiliate API:</span>
                            <span className="block text-mhc-text text-sm">{new Date(profileData.latestSession.observed_at).toLocaleString()}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-gray-500">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Statbate:</span>
                            <span className="block text-mhc-text text-sm">{new Date(profileData.latestSnapshot.captured_at).toLocaleDateString()}</span>
                          </div>
                        )}
                        {profileData.profile?.scraped_at && (
                          <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-gray-500">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Profile Scraper:</span>
                            <span className="block text-mhc-text text-sm">{new Date(profileData.profile.scraped_at).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-mhc-text-muted">No recent snapshot data available.</p>
                )}
              </div>
            )}

            {activeTab === 'sessions' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Broadcast Sessions</h3>
                {profileData.sessionStats ? (
                  <div className="flex flex-col gap-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{profileData.sessionStats.totalSessions.toLocaleString()}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Total Sessions</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{Math.round(profileData.sessionStats.avgViewersPerSession || 0).toLocaleString()}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Avg Viewers</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{(profileData.sessionStats.peakViewers || 0).toLocaleString()}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Max Viewers</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{Math.round(profileData.sessionStats.avgFollowersGained || 0).toLocaleString()}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Avg Followers Gained</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">{formatDuration(profileData.sessionStats.totalMinutesOnline || 0)}</div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Total Time Online</div>
                      </div>
                      <div className="text-center p-5 bg-gradient-primary rounded-lg text-white">
                        <div className="text-3xl font-bold mb-2">
                          {formatDuration(
                            profileData.sessionStats.totalSessions > 0
                              ? Math.round((profileData.sessionStats.totalMinutesOnline || 0) / profileData.sessionStats.totalSessions)
                              : 0
                          )}
                        </div>
                        <div className="text-sm opacity-90 uppercase tracking-wider">Avg Duration</div>
                      </div>
                    </div>

                    {profileData.sessions && profileData.sessions.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        <h4 className="mt-5 mb-4 text-mhc-text-muted text-xl font-semibold">Recent Sessions ({profileData.sessions.length})</h4>
                        {profileData.sessions.map((session: any) => (
                          <div key={session.id} className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                            <div className="flex justify-between items-center mb-3">
                              <span className="font-semibold text-mhc-text">{new Date(session.observed_at).toLocaleString()}</span>
                              <span className="text-mhc-text-muted text-sm">{formatDuration(Math.floor(session.seconds_online / 60))} online</span>
                            </div>
                            <div className="flex gap-4 mb-3 text-sm text-mhc-text-muted">
                              <span>👥 {session.num_users.toLocaleString()} viewers</span>
                              <span>❤️ {session.num_followers.toLocaleString()} followers</span>
                              {session.is_hd && <span>🎥 HD</span>}
                            </div>
                            {session.room_subject && (
                              <div className="p-3 bg-mhc-surface rounded-md italic text-mhc-text">{session.room_subject}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-mhc-text-muted">No session history available.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-mhc-text-muted">No session statistics available.</p>
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div>
                <h3 className="m-0 mb-2 text-mhc-text text-2xl font-semibold">Profile Details</h3>
                <p className="text-mhc-text-muted text-sm mb-5">Static bio from Chaturbate profile</p>
                <div className="flex gap-8 flex-wrap lg:flex-nowrap">
                  {/* Left side - Profile details */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-mhc-surface-light rounded-md">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Display Name:</span>
                      <span className={`block text-base ${profileData.profile?.display_name ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.display_name || 'Not set'}
                      </span>
                    </div>
                    <div className="p-4 bg-mhc-surface-light rounded-md">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Age:</span>
                      <span className={`block text-base ${profileData.profile?.age ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.age || 'Not set'}
                      </span>
                    </div>
                    <div className="p-4 bg-mhc-surface-light rounded-md">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Gender:</span>
                      <span className={`block text-base ${profileData.profile?.gender ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.gender ? formatGender(profileData.profile.gender) : 'Not set'}
                      </span>
                    </div>
                    <div className="p-4 bg-mhc-surface-light rounded-md">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Location:</span>
                      <span className={`block text-base ${profileData.profile?.location ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.location || 'Not set'}
                      </span>
                    </div>
                    <div className="p-4 bg-mhc-surface-light rounded-md">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Country:</span>
                      <span className={`block text-base ${profileData.profile?.country ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.country || 'Not set'}
                      </span>
                    </div>
                    <div className="p-4 bg-mhc-surface-light rounded-md">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Languages:</span>
                      <span className={`block text-base ${profileData.profile?.spoken_languages ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.spoken_languages || 'Not set'}
                      </span>
                    </div>
                    <div className="p-4 bg-mhc-surface-light rounded-md">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">New Model:</span>
                      <span className={`block text-base ${profileData.profile?.is_new !== null && profileData.profile?.is_new !== undefined ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.is_new !== null && profileData.profile?.is_new !== undefined
                          ? (profileData.profile.is_new ? 'Yes' : 'No')
                          : 'Unknown'}
                      </span>
                    </div>
                    <div className="p-4 bg-mhc-surface-light rounded-md">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Last Broadcast:</span>
                      <span className={`block text-base ${profileData.profile?.last_broadcast ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.last_broadcast
                          ? new Date(profileData.profile.last_broadcast).toLocaleDateString()
                          : 'Not set'}
                      </span>
                    </div>
                    <div className="p-4 bg-mhc-surface-light rounded-md col-span-1 md:col-span-2">
                      <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Bio:</span>
                      <p className={`mt-2 mb-0 leading-relaxed ${profileData.profile?.bio ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                        {profileData.profile?.bio || 'No bio set'}
                      </p>
                    </div>
                  </div>

                  {/* Right side - Profile image */}
                  {profileData.profile?.photos && profileData.profile.photos.length > 0 && (
                    <div className="flex-shrink-0">
                      <img
                        src={profileData.profile.photos.find((p: any) => p.isPrimary)?.url || profileData.profile.photos[0]?.url}
                        alt={profileData.person.username}
                        className="max-w-[400px] h-auto rounded-lg"
                      />
                    </div>
                  )}
                </div>

                {/* Social Media Links Section */}
                <div className="mt-8">
                  <CollapsibleSection title="Social Media Links" defaultCollapsed={false}>
                    {socialLinksLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="text-mhc-text-muted">Loading...</div>
                      </div>
                    ) : (
                      <SocialLinksEditor
                        links={socialLinks}
                        onSave={handleSaveSocialLinks}
                        onAddLink={handleAddSocialLink}
                        onRemoveLink={handleRemoveSocialLink}
                      />
                    )}
                  </CollapsibleSection>
                </div>

                {/* Raw Data Toggle Button */}
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => setShowRawData(!showRawData)}
                    className="px-8 py-3 bg-gray-600 text-white border-none rounded-md text-base font-semibold cursor-pointer transition-all hover:bg-gray-500"
                  >
                    {showRawData ? 'Hide Raw Data' : 'Show Raw Data'}
                  </button>
                </div>

                {/* Raw Data Display */}
                {showRawData && (
                  <div className="mt-8">
                    <h4 className="text-mhc-text-muted text-xl font-semibold mb-4">Raw Profile Data</h4>
                    <pre className="bg-black text-emerald-400 p-4 rounded-md overflow-auto text-sm leading-relaxed min-h-[600px] whitespace-pre-wrap break-words border border-gray-700">
                      {JSON.stringify(profileData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'interactions' && (
              <div>
                <div className="flex justify-between items-center mb-5">
                  <h3 className="m-0 text-mhc-text text-2xl font-semibold">Interactions</h3>
                  {profileData.interactions && profileData.interactions.length > 0 && (
                    <span className="text-mhc-text-muted text-sm">
                      Showing {Math.min((interactionsPage + 1) * INTERACTIONS_PER_PAGE, profileData.interactions.length)} of {profileData.interactions.length}
                    </span>
                  )}
                </div>
                {profileData.interactions && profileData.interactions.length > 0 ? (
                  <>
                    <div className="flex flex-col gap-4">
                      {profileData.interactions
                        .slice(interactionsPage * INTERACTIONS_PER_PAGE, (interactionsPage + 1) * INTERACTIONS_PER_PAGE)
                        .map((interaction: any) => (
                          <div key={interaction.id} className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                            <div className="flex justify-between items-center mb-3">
                              <span className="font-semibold text-mhc-primary text-sm uppercase">{interaction.type.replace(/_/g, ' ')}</span>
                              <span className="text-mhc-text-muted text-sm">{new Date(interaction.timestamp).toLocaleString()}</span>
                            </div>
                            {interaction.content && (
                              <div className="p-3 bg-mhc-surface rounded-md text-mhc-text leading-relaxed">{interaction.content}</div>
                            )}
                          </div>
                        ))}
                    </div>
                    {/* Pagination Controls */}
                    {profileData.interactions.length > INTERACTIONS_PER_PAGE && (
                      <div className="flex justify-center items-center gap-4 mt-6">
                        <button
                          onClick={() => setInteractionsPage(prev => Math.max(0, prev - 1))}
                          disabled={interactionsPage === 0}
                          className="px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-mhc-surface-light text-white hover:bg-mhc-primary"
                        >
                          ← Previous
                        </button>
                        <span className="text-mhc-text-muted text-sm">
                          Page {interactionsPage + 1} of {Math.ceil(profileData.interactions.length / INTERACTIONS_PER_PAGE)}
                        </span>
                        <button
                          onClick={() => setInteractionsPage(prev => Math.min(Math.ceil(profileData.interactions.length / INTERACTIONS_PER_PAGE) - 1, prev + 1))}
                          disabled={interactionsPage >= Math.ceil(profileData.interactions.length / INTERACTIONS_PER_PAGE) - 1}
                          className="px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-mhc-surface-light text-white hover:bg-mhc-primary"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-mhc-text-muted">No interactions found.</p>
                )}
              </div>
            )}

            {activeTab === 'images' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Images</h3>

                {/* Upload Image Section */}
                <CollapsibleSection title="Upload Image" defaultCollapsed={true} className="mb-6">
                  {imageUploadError && (
                    <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
                      {imageUploadError}
                    </div>
                  )}
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                        disabled={imageUploadLoading}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-mhc-primary file:text-white file:cursor-pointer disabled:opacity-50"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <select
                        value={selectedImageSource}
                        onChange={e => setSelectedImageSource(e.target.value as 'manual_upload' | 'screensnap' | 'external')}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-mhc-primary"
                      >
                        <option value="manual_upload">Manual Upload</option>
                        <option value="screensnap">Screen Capture</option>
                        <option value="external">External Source</option>
                      </select>
                      <input
                        type="text"
                        value={imageDescription}
                        onChange={e => setImageDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-mhc-primary"
                      />
                    </div>
                    {imageUploadLoading && (
                      <div className="flex items-center gap-2 text-mhc-text-muted text-sm">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Uploading...
                      </div>
                    )}
                  </div>
                </CollapsibleSection>

                {/* Image Grid - combines uploaded and affiliate images */}
                {uploadedImages.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {uploadedImages.map((image, index) => {
                      const imageUrl = image.source === 'affiliate_api'
                        ? `http://localhost:3000/images/${image.file_path}`
                        : `http://localhost:3000/images/profiles/${image.file_path}`;
                      const imageDate = image.captured_at || image.uploaded_at;
                      const isUploaded = image.source !== 'affiliate_api';

                      return (
                        <div
                          key={image.id}
                          className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer hover:border-mhc-primary hover:-translate-y-1 hover:shadow-lg ${
                            currentImageIndex === index ? 'border-mhc-primary ring-2 ring-mhc-primary/50' : 'border-white/10'
                          }`}
                          onClick={() => setCurrentImageIndex(index)}
                          onMouseEnter={() => setPreviewImageUrl(imageUrl)}
                          onMouseLeave={() => setPreviewImageUrl(null)}
                        >
                          <div className="aspect-[4/3]">
                            <img
                              src={imageUrl}
                              alt={`${profileData.person.username} - ${new Date(imageDate).toLocaleDateString()}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          {/* Overlay with info */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="absolute bottom-0 left-0 right-0 p-2 text-white text-xs">
                              <div className="font-semibold">
                                {new Date(imageDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                              <div className="text-white/70">
                                {new Date(imageDate).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}
                              </div>
                              {image.viewers > 0 && (
                                <div className="text-white/70 mt-1">
                                  {image.viewers.toLocaleString()} viewers
                                </div>
                              )}
                              {image.description && (
                                <div className="text-white/70 mt-1 truncate">
                                  {image.description}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Source badge */}
                          <div className={`absolute top-1 left-1 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            image.source === 'affiliate_api' ? 'bg-blue-500/80' :
                            image.source === 'screensnap' ? 'bg-purple-500/80' :
                            image.source === 'external' ? 'bg-orange-500/80' :
                            'bg-gray-500/80'
                          }`}>
                            {image.source === 'affiliate_api' ? 'Auto' :
                             image.source === 'screensnap' ? 'Snap' :
                             image.source === 'external' ? 'Ext' :
                             'Upload'}
                          </div>
                          {/* Delete button for uploaded images */}
                          {isUploaded && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleDeleteImage(image.id);
                              }}
                              className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete image"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          {/* Current indicator */}
                          {currentImageIndex === index && (
                            <div className="absolute bottom-1 right-1 bg-mhc-primary text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                              Current
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : imageUploadLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-mhc-text-muted">Loading images...</div>
                  </div>
                ) : (
                  <p className="text-mhc-text-muted">No images saved yet. Images are captured when the user broadcasts, or you can upload them above.</p>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Member History</h3>

                {memberInfoLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-mhc-text-muted">Loading member info from Statbate...</div>
                  </div>
                )}

                {memberInfoError && (
                  <div className="bg-red-500/20 border-l-4 border-red-500 text-red-300 px-4 py-3 rounded-md mb-5">
                    <strong className="font-bold mr-1">Error:</strong> {memberInfoError}
                  </div>
                )}

                {memberInfo && (
                  <div className="space-y-6">
                    {/* Overview Stats - Reordered: All-Time | Models Tipped | Last Tip | First Tip | First Message */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-emerald-500">
                        <span className="block font-semibold text-mhc-text-muted text-sm mb-1">All-Time Tokens</span>
                        <span className="block text-emerald-400 text-base font-semibold">
                          {memberInfo.all_time_tokens.toLocaleString()}
                        </span>
                      </div>
                      <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-blue-500">
                        <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Models Tipped</span>
                        <span className="block text-blue-400 text-base font-semibold">
                          {memberInfo.models_tipped_2weeks}
                        </span>
                      </div>
                      <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-yellow-500">
                        <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Last Tip</span>
                        <span className="block text-yellow-400 text-base font-semibold">
                          {memberInfo.last_tip_amount > 0 ? (
                            <>
                              {memberInfo.last_tip_amount.toLocaleString()} tokens
                              {memberInfo.last_tip_to && (
                                <a
                                  href={`/profile/${memberInfo.last_tip_to}`}
                                  className="block text-mhc-primary text-sm mt-1 hover:underline"
                                >
                                  to {memberInfo.last_tip_to}
                                </a>
                              )}
                              {memberInfo.last_tip_date && (
                                <span className="block text-mhc-text-muted text-xs mt-0.5">
                                  {Math.floor((Date.now() - new Date(memberInfo.last_tip_date).getTime()) / (1000 * 60 * 60 * 24))} days ago
                                </span>
                              )}
                            </>
                          ) : 'Never'}
                        </span>
                      </div>
                      <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                        <span className="block font-semibold text-mhc-text-muted text-sm mb-1">First Tip</span>
                        <span className="block text-mhc-text text-base">
                          {memberInfo.first_tip_date
                            ? new Date(memberInfo.first_tip_date).toLocaleDateString('en-US', { dateStyle: 'medium' })
                            : 'Never'}
                        </span>
                      </div>
                      <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-mhc-primary">
                        <span className="block font-semibold text-mhc-text-muted text-sm mb-1">First Message</span>
                        <span className="block text-mhc-text text-base">
                          {memberInfo.first_message_date
                            ? new Date(memberInfo.first_message_date).toLocaleDateString('en-US', { dateStyle: 'medium' })
                            : 'Never'}
                        </span>
                      </div>
                    </div>

                    {/* Sub-tab navigation - default to tipped */}
                    <div className="flex gap-2 border-b border-gray-700 pb-2">
                      <button
                        onClick={() => setHistorySubTab('tipped')}
                        className={`px-4 py-2 rounded-t-md font-medium transition-all ${
                          historySubTab === 'tipped'
                            ? 'bg-mhc-primary text-white'
                            : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
                        }`}
                      >
                        Models Tipped ({memberInfo.models_tipped_2weeks})
                      </button>
                      <button
                        onClick={() => setHistorySubTab('messaged')}
                        className={`px-4 py-2 rounded-t-md font-medium transition-all ${
                          historySubTab === 'messaged'
                            ? 'bg-mhc-primary text-white'
                            : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
                        }`}
                      >
                        Models Messaged ({memberInfo.models_messaged_2weeks})
                      </button>
                    </div>

                    {/* Sub-tab content */}
                    <div className="mt-4">
                      {historySubTab === 'messaged' && (
                        <div>
                          {memberInfo.models_messaged_2weeks_list.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                              {memberInfo.models_messaged_2weeks_list.map((modelUsername) => (
                                <a
                                  key={modelUsername}
                                  href={`/profile/${modelUsername}`}
                                  className="px-3 py-2 bg-mhc-surface-light rounded-md text-mhc-primary hover:bg-mhc-primary hover:text-white transition-colors text-center truncate"
                                  title={modelUsername}
                                >
                                  {modelUsername}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-mhc-text-muted">No models messaged in the last 2 weeks.</p>
                          )}
                        </div>
                      )}

                      {historySubTab === 'tipped' && (
                        <div>
                          {memberInfo.models_tipped_2weeks_list.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                              {memberInfo.models_tipped_2weeks_list.map((modelUsername) => (
                                <a
                                  key={modelUsername}
                                  href={`/profile/${modelUsername}`}
                                  className="px-3 py-2 bg-mhc-surface-light rounded-md text-mhc-primary hover:bg-mhc-primary hover:text-white transition-colors text-center truncate"
                                  title={modelUsername}
                                >
                                  {modelUsername}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-mhc-text-muted">No models tipped in the last 2 weeks.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Token Activity */}
                    {memberInfo.per_day_tokens && memberInfo.per_day_tokens.length > 0 && (
                      <div className="mt-6">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-mhc-text text-lg font-semibold m-0">Token Activity</h4>
                          <span className="text-mhc-text-muted text-sm">
                            {memberInfo.per_day_tokens.length} days total
                          </span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                          {memberInfo.per_day_tokens
                            .slice(tokenActivityPage * TOKEN_ACTIVITY_PER_PAGE, (tokenActivityPage + 1) * TOKEN_ACTIVITY_PER_PAGE)
                            .map((day) => (
                              <div key={day.date} className="p-2 bg-mhc-surface-light rounded-md text-center">
                                <div className="text-xs text-mhc-text-muted">
                                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                                <div className={`text-sm font-semibold ${day.tokens > 0 ? 'text-yellow-400' : 'text-mhc-text-muted'}`}>
                                  {day.tokens > 0 ? day.tokens.toLocaleString() : '-'}
                                </div>
                              </div>
                            ))}
                        </div>
                        {/* Pagination Controls */}
                        {memberInfo.per_day_tokens.length > TOKEN_ACTIVITY_PER_PAGE && (
                          <div className="flex justify-center items-center gap-4 mt-4">
                            <button
                              onClick={() => setTokenActivityPage(prev => Math.max(0, prev - 1))}
                              disabled={tokenActivityPage === 0}
                              className="px-3 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-mhc-surface-light text-white hover:bg-mhc-primary"
                            >
                              ← Newer
                            </button>
                            <span className="text-mhc-text-muted text-xs">
                              Page {tokenActivityPage + 1} of {Math.ceil(memberInfo.per_day_tokens.length / TOKEN_ACTIVITY_PER_PAGE)}
                            </span>
                            <button
                              onClick={() => setTokenActivityPage(prev => Math.min(Math.ceil(memberInfo.per_day_tokens.length / TOKEN_ACTIVITY_PER_PAGE) - 1, prev + 1))}
                              disabled={tokenActivityPage >= Math.ceil(memberInfo.per_day_tokens.length / TOKEN_ACTIVITY_PER_PAGE) - 1}
                              className="px-3 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-mhc-surface-light text-white hover:bg-mhc-primary"
                            >
                              Older →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!memberInfoLoading && !memberInfoError && !memberInfo && (
                  <p className="text-mhc-text-muted">Click on a user profile to load their member history from Statbate.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full-size Image Preview - Fixed position on right side */}
      {previewImageUrl && (
        <div
          className="fixed top-20 right-4 z-50 pointer-events-none"
        >
          <div className="bg-black/95 rounded-lg shadow-2xl border border-white/20 p-2">
            <img
              src={previewImageUrl}
              alt="Full size preview"
              className="max-w-[600px] max-h-[80vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
