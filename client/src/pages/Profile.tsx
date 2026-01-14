import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatDuration, formatGender } from '../utils/formatting';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { SocialLinksEditor } from '../components/SocialLinksEditor';
import { ServiceRelationshipEditor, type ServiceRelationship } from '../components/ServiceRelationshipEditor';
import { CommsSection } from '../components/profile/CommsSection';
import { TimelineTab } from '../components/profile/TimelineTab';
import { InteractionsTab } from '../components/profile/InteractionsTab';
import { HistoryTab } from '../components/profile/HistoryTab';
import { RelationshipEditor, type Relationship, type RelationshipTraitSeed } from '../components/RelationshipEditor';
import { NamesEditor, type ProfileNames, type AddressTermSeed } from '../components/NamesEditor';
import { RelationshipHistoryViewer } from '../components/RelationshipHistoryViewer';
import { StarRating } from '../components/StarRating';
import { Modal } from '../components/Modal';
// Profile.css removed - fully migrated to Tailwind CSS

interface ProfilePageProps {}

type TabType = 'snapshot' | 'sessions' | 'interactions' | 'timeline';
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

/**
 * Get the correct image URL for profile images.
 *
 * All images are now served from /images/ which has fallback logic on the server:
 * - First tries SSD (new username-based paths: people/{username}/{folder}/...)
 * - Then falls back to Docker volume (legacy UUID paths during migration)
 *
 * New path structure: /images/people/{username}/{auto|uploads|snaps|profile}/filename
 * Legacy paths: /images/{uuid}/filename or /images/profiles/{uuid}/filename
 */
const getProfileImageUrl = (image: { file_path: string; storage_provider?: string | null; source?: string }): string => {
  // All images now served from unified /images/ route
  // Server handles fallback between SSD and Docker paths
  return `/images/${image.file_path}`;
};

// Get the best available image URL
// - If live: use Chaturbate's real-time thumbnail
// - If offline: use our locally cached image
const getSessionImageUrl = (session: any, isLive: boolean): string | null => {
  if (!session) return null;

  if (isLive) {
    // When live, prefer real-time Chaturbate image
    return session.image_url_360x270 || session.image_path_360x270
      ? `/images/${session.image_path_360x270}`
      : null;
  }

  // When offline, prefer local cached image
  if (session.image_path_360x270) {
    return `/images/${session.image_path_360x270}`;
  }
  // Fall back to external URL if no local cache
  return session.image_url_360x270 || null;
};

// Placeholder images for profiles without photos
// Viewer: Simple silhouette in grayscale
const VIEWER_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 270" fill="none">
  <rect width="360" height="270" fill="#1a1a2e"/>
  <circle cx="180" cy="100" r="45" fill="#374151"/>
  <ellipse cx="180" cy="220" rx="70" ry="50" fill="#374151"/>
  <text x="180" y="255" text-anchor="middle" fill="#6b7280" font-family="system-ui" font-size="14">Viewer</text>
</svg>
`)}`;

// Model: Stylized male silhouette in grayscale
const MODEL_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 270" fill="none">
  <rect width="360" height="270" fill="#1a1a2e"/>
  <defs>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4b5563"/>
      <stop offset="100%" style="stop-color:#374151"/>
    </linearGradient>
  </defs>
  <circle cx="180" cy="90" r="40" fill="url(#glow)"/>
  <path d="M120 200 Q140 140 180 140 Q220 140 240 200 L250 270 L110 270 Z" fill="url(#glow)"/>
  <rect x="155" y="125" width="50" height="25" rx="5" fill="url(#glow)"/>
  <text x="180" y="255" text-anchor="middle" fill="#9ca3af" font-family="system-ui" font-size="14">Model</text>
</svg>
`)}`;

// Get placeholder image based on role
const getPlaceholderImage = (role: string): string => {
  return role === 'MODEL' ? MODEL_PLACEHOLDER : VIEWER_PLACEHOLDER;
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
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl || 'snapshot');
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);

  // Image history state
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Notes and status state
  const [profileNotes, setProfileNotes] = useState<ProfileNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [editingNoteDate, setEditingNoteDate] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set());
  const [noteLineLimit, setNoteLineLimit] = useState(6); // Configurable line limit for Read More
  const [showAllNotes, setShowAllNotes] = useState(false); // Show all notes vs first 2
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [showUploadMediaModal, setShowUploadMediaModal] = useState(false);
  const [showProfileDetailsModal, setShowProfileDetailsModal] = useState(false);

  // Profile attributes state
  const [bannedMe, setBannedMe] = useState(false);
  const [bannedByMe, setBannedByMe] = useState(false);
  const [watchList, setWatchList] = useState(false);
  const [rating, setRating] = useState(0);

  // New profile attributes (Phase 3)
  const [smokeOnCam, setSmokeOnCam] = useState(false);
  const [leatherFetish, setLeatherFetish] = useState(false);
  const [profileSmoke, setProfileSmoke] = useState(false);
  const [hadInteraction, setHadInteraction] = useState(false);
  // MHC-1104: Room Banned flag
  const [roomBanned, setRoomBanned] = useState(false);

  // MHC-1105: Seen With state
  const [seenWith, setSeenWith] = useState<Array<{ id: string; username: string; personId?: string; notes?: string; createdAt: string }>>([]);
  const [seenWithLoading, setSeenWithLoading] = useState(false);
  const [seenWithInput, setSeenWithInput] = useState('');
  const [seenWithSuggestions, setSeenWithSuggestions] = useState<Array<{ username: string; id: string }>>([]);

  // Top mover badge state
  const [topMoverStatus, setTopMoverStatus] = useState<'gainer' | 'loser' | null>(null);

  // Image preview modal state
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Image upload state
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [currentProfileImage, setCurrentProfileImage] = useState<any | null>(null);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [selectedImageSource, setSelectedImageSource] = useState<'manual_upload' | 'screensnap' | 'external'>('manual_upload');
  const [imageDescription, setImageDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [imageUploadLimits, setImageUploadLimits] = useState<{
    manual: number;
    external: number;
    screenshot: number;
  } | null>(null);

  // Media subtab state (images vs videos)
  const [mediaSubTab, setMediaSubTab] = useState<'images' | 'videos'>('images');
  const [showAllImages, setShowAllImages] = useState(false);
  const [imageSourceFilter, setImageSourceFilter] = useState<string | null>(null); // null = 'All'

  // Social links state
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [socialLinksLoading, setSocialLinksLoading] = useState(false);

  // Service relationships state (legacy - kept for backward compatibility during transition)
  const [serviceRelationships, setServiceRelationships] = useState<ServiceRelationship[]>([]);
  const [serviceRelationshipsLoading, setServiceRelationshipsLoading] = useState(false);

  // Unified relationship state (new)
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [traitSeeds, setTraitSeeds] = useState<RelationshipTraitSeed[]>([]);
  const [addressTermSeeds, setAddressTermSeeds] = useState<AddressTermSeed[]>([]);

  // Profile names state (new)
  const [profileNames, setProfileNames] = useState<ProfileNames | null>(null);
  const [profileNamesLoading, setProfileNamesLoading] = useState(false);

  // Room visits state (they visited me)
  const [roomVisitStats, setRoomVisitStats] = useState<{
    total_visits: number;
    first_visit: string | null;
    last_visit: string | null;
    visits_this_week: number;
    visits_this_month: number;
  } | null>(null);

  // My visits state (I visited them)
  const [myVisitStats, setMyVisitStats] = useState<{
    total_visits: number;
    first_visit: string | null;
    last_visit: string | null;
  } | null>(null);

  // Load image upload limits on mount
  useEffect(() => {
    fetch('/api/settings/image-upload/config')
      .then(response => response.ok ? response.json() : null)
      .then(config => {
        if (config?.limits) {
          setImageUploadLimits(config.limits);
        }
      })
      .catch(() => {
        // Use defaults if settings fail to load (20MB)
        setImageUploadLimits({ manual: 20971520, external: 20971520, screenshot: 20971520 });
      });
  }, []);

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

  // Sync profile attribute states from profile data
  useEffect(() => {
    if (profileData?.profile) {
      setBannedMe(profileData.profile.banned_me || false);
      setBannedByMe(profileData.profile.banned_by_me || false);
      setWatchList(profileData.profile.watch_list || false);
      setRating(profileData.profile.rating || 0);
      // New attributes
      setSmokeOnCam(profileData.profile.smoke_on_cam || false);
      setLeatherFetish(profileData.profile.leather_fetish || false);
      setProfileSmoke(profileData.profile.profile_smoke || false);
      setHadInteraction(profileData.profile.had_interaction || false);
      // MHC-1104: Room Banned
      setRoomBanned(profileData.profile.room_banned || false);
    }
  }, [profileData?.profile]);

  // Fetch note line limit setting
  useEffect(() => {
    const fetchNoteLineLimit = async () => {
      try {
        const response = await fetch('/api/settings/note_line_limit');
        if (response.ok) {
          const data = await response.json();
          if (data.value) {
            setNoteLineLimit(parseInt(data.value, 10) || 6);
          }
        }
      } catch (err) {
        // Use default value on error
      }
    };
    fetchNoteLineLimit();
  }, []);

  // Fetch notes when profile changes
  useEffect(() => {
    if (profileData?.person?.username) {
      // Reset notes state
      setProfileNotes([]);
      setNewNoteContent('');
      setEditingNoteId(null);
      setEditingNoteContent('');
      setExpandedNoteIds(new Set());
      // Fetch notes
      const fetchProfileNotes = async () => {
        setNotesLoading(true);
        try {
          const response = await fetch(`/api/profile/${profileData.person.username}/notes`);
          if (response.ok) {
            const data = await response.json();
            const notes = data.notes || [];
            setProfileNotes(notes);
            // Auto-expand the last (most recent) note
            if (notes.length > 0) {
              setExpandedNoteIds(new Set([notes[0].id]));
            }
          }
        } catch (err) {
          console.error('Error fetching notes:', err);
        } finally {
          setNotesLoading(false);
        }
      };
      fetchProfileNotes();

      // Fetch service relationships (legacy - kept for backward compatibility)
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

      // Fetch unified relationship (new)
      const fetchRelationship = async () => {
        setRelationshipLoading(true);
        try {
          const response = await fetch(`/api/profile/${profileData.person.username}/relationship`);
          if (response.ok) {
            const data = await response.json();
            setRelationship(data.relationship || null);
          }
        } catch (err) {
          console.error('Error fetching relationship:', err);
        } finally {
          setRelationshipLoading(false);
        }
      };
      fetchRelationship();

      // Fetch profile names (new)
      const fetchProfileNames = async () => {
        setProfileNamesLoading(true);
        try {
          const response = await fetch(`/api/profile/${profileData.person.username}/names`);
          if (response.ok) {
            const data = await response.json();
            setProfileNames(data.names || null);
          }
        } catch (err) {
          console.error('Error fetching profile names:', err);
        } finally {
          setProfileNamesLoading(false);
        }
      };
      fetchProfileNames();

      // Fetch room visit stats (they visited me)
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

      // Fetch my visit stats (I visited them)
      const fetchMyVisitStats = async () => {
        try {
          const response = await fetch(`/api/profile/${profileData.person.username}/my-visits/stats`);
          if (response.ok) {
            const data = await response.json();
            setMyVisitStats(data);
          }
        } catch (err) {
          console.error('Error fetching my visit stats:', err);
        }
      };
      fetchMyVisitStats();

      // MHC-1105: Fetch seen_with data
      const fetchSeenWithData = async () => {
        setSeenWithLoading(true);
        try {
          const response = await fetch(`/api/profile/${profileData.person.username}/seen-with`);
          if (response.ok) {
            const data = await response.json();
            setSeenWith(data.seenWith || []);
          }
        } catch (err) {
          console.error('Error fetching seen-with:', err);
        } finally {
          setSeenWithLoading(false);
        }
      };
      fetchSeenWithData();
    }
  }, [profileData?.person?.username]);

  // Fetch relationship seed data once on mount
  useEffect(() => {
    const fetchSeeds = async () => {
      try {
        const response = await fetch('/api/relationship/seeds');
        if (response.ok) {
          const data = await response.json();
          setTraitSeeds(data.traits || []);
          setAddressTermSeeds(data.addressTerms || []);
        }
      } catch (err) {
        console.error('Error fetching relationship seeds:', err);
      }
    };
    fetchSeeds();
  }, []);

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

  // Fetch image history and current profile image when profile loads
  useEffect(() => {
    if (profileData?.person?.id) {
      fetch(`/api/person/${profileData.person.id}/images?limit=10`)
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
    if (profileData?.person?.username) {
      fetch(`/api/profile/${profileData.person.username}/images/current`)
        .then(response => response.json())
        .then(data => {
          setCurrentProfileImage(data.image || null);
        })
        .catch(err => {
          console.error('Failed to fetch current profile image', err);
          setCurrentProfileImage(null);
        });
    }
  }, [profileData?.person?.id, profileData?.person?.username]);

  // Extract social links from profile data
  // Handle various formats: array [{platform, url}], object {platform: url}, or object {platform: {url, platform}}
  useEffect(() => {
    if (profileData?.profile?.social_links) {
      const links = profileData.profile.social_links;
      const linksObj: Record<string, string> = {};

      if (Array.isArray(links)) {
        // Convert array format to object format
        links.forEach((link: { platform: string; url: string }) => {
          if (link.platform && link.url) {
            linksObj[link.platform] = link.url;
          }
        });
      } else if (typeof links === 'object' && links !== null) {
        // Object format - but values might be strings or objects
        Object.entries(links).forEach(([platform, value]) => {
          if (typeof value === 'string') {
            // Already in correct format {platform: "url"}
            linksObj[platform] = value;
          } else if (value && typeof value === 'object' && 'url' in value) {
            // Value is an object like {url: "...", platform: "..."}
            linksObj[platform] = (value as { url: string }).url;
          }
        });
      }

      setSocialLinks(linksObj);
    } else {
      setSocialLinks({});
    }
  }, [profileData?.profile?.social_links]);

  // Fetch uploaded images when profile loads
  useEffect(() => {
    if (profileData?.person?.username) {
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
  }, [profileData?.person?.username]);

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

  // Helper to format bytes as human-readable size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get the current upload limit based on selected source
  const getCurrentUploadLimit = (): number => {
    if (!imageUploadLimits) return 20 * 1024 * 1024; // Default 20MB
    switch (selectedImageSource) {
      case 'manual_upload': return imageUploadLimits.manual;
      case 'screensnap': return imageUploadLimits.screenshot;
      case 'external': return imageUploadLimits.external;
      default: return imageUploadLimits.manual;
    }
  };

  // Image upload handler - supports multiple files
  const handleImageUpload = async (files: File[]) => {
    if (!profileData?.person?.username || files.length === 0) return;

    setImageUploadLoading(true);
    setImageUploadError(null);
    setUploadProgress({ current: 0, total: files.length });

    const uploadedSuccessfully: any[] = [];
    const errors: string[] = [];

    // Get the size limit for the current source type
    const sizeLimit = getCurrentUploadLimit();
    const sourceName = selectedImageSource === 'manual_upload' ? 'manual upload' :
                       selectedImageSource === 'screensnap' ? 'screenshot' : 'external';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({ current: i + 1, total: files.length });

      // Client-side size validation
      if (file.size > sizeLimit) {
        errors.push(`${file.name}: File size (${formatFileSize(file.size)}) exceeds the ${formatFileSize(sizeLimit)} limit for ${sourceName} uploads`);
        continue;
      }

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
          throw new Error(data.error || `Failed to upload ${file.name}`);
        }

        const newImage = await response.json();
        uploadedSuccessfully.push(newImage);
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    // Add all successfully uploaded images to state
    if (uploadedSuccessfully.length > 0) {
      setUploadedImages(prev => [...uploadedSuccessfully, ...prev]);
    }

    // Show errors if any
    if (errors.length > 0) {
      setImageUploadError(errors.join('\n'));
    }

    setImageDescription('');
    setUploadProgress(null);
    setImageUploadLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file =>
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)
    );

    if (files.length > 0) {
      handleImageUpload(files);
    } else if (e.dataTransfer.files.length > 0) {
      setImageUploadError('Please drop valid image files (JPEG, PNG, GIF, or WebP)');
    }
  };

  // Set image as current/primary
  // For affiliate images, first import them to profile_images, then set as current
  const handleSetAsCurrent = async (imageId: string, isAffiliateImage: boolean = false, affiliateData?: { imageUrl: string; capturedAt: string; viewers?: number }) => {
    if (!profileData?.person?.username) return;

    try {
      let targetImageId = imageId;

      // If this is an affiliate image, import it first
      if (isAffiliateImage && affiliateData) {
        const importResponse = await fetch(`/api/profile/${profileData.person.username}/images/import-affiliate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: affiliateData.imageUrl,
            capturedAt: affiliateData.capturedAt,
            viewers: affiliateData.viewers,
          }),
        });

        if (!importResponse.ok) {
          const data = await importResponse.json();
          throw new Error(data.error || 'Failed to import affiliate image');
        }

        const importedImage = await importResponse.json();
        targetImageId = importedImage.id;
      }

      // Now set as current
      const response = await fetch(`/api/profile/${profileData.person.username}/images/${targetImageId}/set-current`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set image as current');
      }

      // Refresh the images list and current profile image
      const imagesResponse = await fetch(`/api/profile/${profileData.person.username}/images`);
      if (imagesResponse.ok) {
        const data = await imagesResponse.json();
        setUploadedImages(data.images || []);
      }

      // Refresh the current profile image for the overview
      const currentResponse = await fetch(`/api/profile/${profileData.person.username}/images/current`);
      if (currentResponse.ok) {
        const data = await currentResponse.json();
        setCurrentProfileImage(data.image || null);
      }
    } catch (err: any) {
      setImageUploadError(err.message || 'Failed to set image as current');
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

  const handleBannedByMeToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !bannedByMe;
    setBannedByMe(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned_by_me: newValue }),
      });
    } catch (err) {
      // Revert on error
      setBannedByMe(!newValue);
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

  const handleRatingChange = async (newRating: number) => {
    if (!profileData?.person?.username) return;

    const oldRating = rating;
    setRating(newRating);

    try {
      await fetch(`/api/profile/${profileData.person.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating }),
      });
    } catch (err) {
      // Revert on error
      setRating(oldRating);
    }
  };

  // New profile attribute handlers
  const handleSmokeOnCamToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !smokeOnCam;
    setSmokeOnCam(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}/attributes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smoke_on_cam: newValue }),
      });
    } catch (err) {
      setSmokeOnCam(!newValue);
    }
  };

  const handleLeatherFetishToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !leatherFetish;
    setLeatherFetish(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}/attributes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leather_fetish: newValue }),
      });
    } catch (err) {
      setLeatherFetish(!newValue);
    }
  };

  const handleHadInteractionToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !hadInteraction;
    setHadInteraction(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}/attributes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ had_interaction: newValue }),
      });
    } catch (err) {
      setHadInteraction(!newValue);
    }
  };

  // MHC-1104: Room Banned handler
  const handleRoomBannedToggle = async () => {
    if (!profileData?.person?.username) return;

    const newValue = !roomBanned;
    setRoomBanned(newValue);

    try {
      await fetch(`/api/profile/${profileData.person.username}/attributes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_banned: newValue }),
      });
    } catch (err) {
      setRoomBanned(!newValue);
    }
  };

  // MHC-1105: Seen With handlers
  const fetchSeenWith = async () => {
    if (!profileData?.person?.username) return;
    setSeenWithLoading(true);
    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/seen-with`);
      if (response.ok) {
        const data = await response.json();
        setSeenWith(data.seenWith || []);
      }
    } catch (err) {
      console.error('Error fetching seen-with:', err);
    } finally {
      setSeenWithLoading(false);
    }
  };

  const handleAddSeenWith = async (username: string) => {
    if (!profileData?.person?.username || !username.trim()) return;
    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/seen-with`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seenWithUsername: username.trim() }),
      });
      if (response.ok) {
        const data = await response.json();
        setSeenWith(prev => [data.entry, ...prev]);
        setSeenWithInput('');
        setSeenWithSuggestions([]);
      }
    } catch (err) {
      console.error('Error adding seen-with:', err);
    }
  };

  const handleRemoveSeenWith = async (entryId: string) => {
    if (!profileData?.person?.username) return;
    try {
      const response = await fetch(`/api/profile/${profileData.person.username}/seen-with/${entryId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setSeenWith(prev => prev.filter(s => s.id !== entryId));
      }
    } catch (err) {
      console.error('Error removing seen-with:', err);
    }
  };

  const handleSeenWithInputChange = async (value: string) => {
    setSeenWithInput(value);
    if (value.trim().length >= 2) {
      // Fetch autocomplete suggestions from directory
      try {
        const response = await fetch(`/api/person/search?q=${encodeURIComponent(value.trim())}&limit=5`);
        if (response.ok) {
          const data = await response.json();
          // /api/person/search returns { usernames: string[] }
          setSeenWithSuggestions(data.usernames?.map((username: string) => ({ username, id: null })) || []);
        }
      } catch (err) {
        setSeenWithSuggestions([]);
      }
    } else {
      setSeenWithSuggestions([]);
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

  // Unified relationship handler
  const handleSaveRelationship = async (data: Omit<Relationship, 'id' | 'profile_id' | 'created_at' | 'updated_at'>) => {
    if (!profileData?.person?.username) return;

    const response = await fetch(`/api/profile/${profileData.person.username}/relationship`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save relationship');
    }

    const result = await response.json();
    setRelationship(result.relationship);
  };

  // Profile names handler (new)
  const handleSaveNames = async (names: ProfileNames) => {
    if (!profileData?.person?.username) return;

    const response = await fetch(`/api/profile/${profileData.person.username}/names`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(names),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save names');
    }

    const result = await response.json();
    setProfileNames(result.names);
  };

  // MHC-1101: Set browser tab title to "MHC: {username}" when viewing a profile
  useEffect(() => {
    if (profileData?.person?.username) {
      document.title = `MHC: ${profileData.person.username}`;
    } else {
      document.title = 'MHC Control Panel';
    }
    // Cleanup: restore default title when leaving the page
    return () => {
      document.title = 'MHC Control Panel';
    };
  }, [profileData?.person?.username]);

  // MHC-1102/MHC-1110: T2 section removed - content merged into T1 and Profile Details section

  return (
    <div className="max-w-7xl mx-auto px-5 pt-2 pb-5">
      {error && (
        <div className="bg-red-500/20 border-l-4 border-red-500 text-red-300 px-4 py-3 rounded-md mb-5">
          <strong className="font-bold mr-1">Error:</strong> {error}
        </div>
      )}

      {/* Profile Content */}
      {profileData && (
        <div>
          {/* MHC-1101: Page title with username and status - sticky header (transparent) */}
          <div className="sticky top-0 z-40 py-2 mb-2 flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">
              <a
                href={`https://chaturbate.com/${profileData.person.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white no-underline hover:text-mhc-primary hover:underline transition-colors"
              >
                {profileData.person.username}
              </a>
            </h1>
            {/* Online/Offline status indicator - to the right of username */}
            {isSessionLive(profileData.latestSession) ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-500/30 border border-red-500/50 text-red-300 animate-pulse">
                <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-gray-500/30 border border-gray-500/50 text-white/70">
                Offline
              </span>
            )}
          </div>

          {/* Profile Overview Card - Option B Layout (MHC-1102) */}
          <div className="bg-gradient-primary text-white rounded-lg p-6 mb-5 shadow-lg">
            <div className="flex gap-5 items-start flex-wrap md:flex-nowrap">
              {/* Profile image section - always show with placeholder fallback */}
              <div className="flex-shrink-0 flex flex-col items-start">
                  {/* Above image row: Following | Follows Me (compact, centered) */}
                  <div className="flex items-center justify-center gap-2 w-[440px] mb-1.5">
                    {profileData.profile?.following && (
                      <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-200 border border-emerald-500/30" title="You follow this user">
                        Following
                      </span>
                    )}
                    {profileData.profile?.follower && (
                      <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-200 border border-blue-500/30" title="Follows you">
                        Follows Me
                      </span>
                    )}
                    {/* Show timestamp when image history exists */}
                    {imageHistory.length > 0 && imageHistory[currentImageIndex] && (
                      <span className="text-xs text-white/50 ml-auto">
                        {new Date(imageHistory[currentImageIndex].observed_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                  {/* Image with navigation arrows - 440x330 */}
                  <div className="relative group">
                    <img
                      src={
                        imageHistory.length > 0
                          ? `/images/${imageHistory[currentImageIndex]?.image_url}`
                          : currentProfileImage
                            ? getProfileImageUrl(currentProfileImage)
                            : getSessionImageUrl(profileData.latestSession, isSessionLive(profileData.latestSession))
                              || profileData.profile.photos?.find((p: any) => p.isPrimary)?.url
                              || profileData.profile.photos?.[0]?.url
                              || getPlaceholderImage(profileData.person.role)
                      }
                      alt={profileData.person.username}
                      className={`w-[440px] h-[330px] rounded-lg object-cover shadow-lg ${
                        isSessionLive(profileData.latestSession)
                          ? 'ring-4 ring-red-500 ring-offset-2 ring-offset-mhc-surface border-2 border-red-400'
                          : 'border-4 border-white/30'
                      }`}
                      width="440"
                      height="330"
                    />
                    {/* Navigation arrows - only show if multiple images */}
                    {imageHistory.length > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : imageHistory.length - 1))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-lg"
                          title="Previous image"
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => setCurrentImageIndex(prev => (prev < imageHistory.length - 1 ? prev + 1 : 0))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-lg"
                          title="Next image"
                        >
                          ›
                        </button>
                        {/* Image counter */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          {currentImageIndex + 1} / {imageHistory.length}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Below image row: Rating (left) | CB | UN (centered) | + Add Note (right) */}
                  <div className="flex items-center justify-between w-[440px] mt-1.5">
                    {/* Rating - left side */}
                    <div className="flex items-center gap-1">
                      <StarRating
                        rating={rating}
                        onChange={handleRatingChange}
                        size="sm"
                        showLabel={true}
                      />
                    </div>

                    {/* CB/UN external links - centered */}
                    <div className="flex gap-1.5">
                      <a
                        href={`https://chaturbate.com/${profileData.person.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-0.5 bg-orange-500/30 text-orange-200 hover:bg-orange-500/50 hover:text-white rounded transition-colors font-medium text-xs min-w-[36px] text-center"
                        title="View on Chaturbate"
                      >
                        CB
                      </a>
                      <a
                        href={`https://uncams.com/${profileData.person.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-0.5 bg-cyan-500/30 text-cyan-200 hover:bg-cyan-500/50 hover:text-white rounded transition-colors font-medium text-xs min-w-[36px] text-center"
                        title="View on UN Cams"
                      >
                        UN
                      </a>
                    </div>

                    {/* Add Note button - right side */}
                    <button
                      onClick={() => setShowAddNoteModal(true)}
                      className="px-2.5 py-0.5 bg-mhc-primary hover:bg-mhc-primary/80 text-white text-xs font-medium rounded transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Note
                    </button>
                  </div>
                </div>

              {/* Right column - top-aligned with normal spacing */}
              <div className="flex-1 flex flex-col items-start gap-3">
                {/* Row 1: Relationship Status Badges */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Unified relationship status badge (takes precedence) */}
                  {relationship && ['Active', 'Occasional', 'Potential'].includes(relationship.status) && (
                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold ${
                      relationship.status === 'Active' ? 'bg-emerald-500/30 border border-emerald-500/50' :
                      relationship.status === 'Occasional' ? 'bg-blue-500/30 border border-blue-500/50' :
                      'bg-gray-500/30 border border-gray-500/50'
                    }`} title={`Status: ${relationship.status}`}>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                      {relationship.status}
                    </span>
                  )}
                  {/* Role badges from unified relationship */}
                  {relationship?.roles.includes('Sub') && (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold bg-emerald-500/30 border border-emerald-500/50" title="Sub role">
                      Sub
                    </span>
                  )}
                  {relationship?.roles.includes('Dom') && (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold bg-purple-500/30 border border-purple-500/50" title="Dom role">
                      Dom
                    </span>
                  )}
                  {relationship?.roles.includes('Friend') && (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold bg-blue-500/30 border border-blue-500/50" title="Friend role">
                      Friend
                    </span>
                  )}
                  {relationship?.roles.includes('Custom') && relationship.custom_role_label && (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold bg-gray-500/30 border border-gray-500/50" title={`Custom: ${relationship.custom_role_label}`}>
                      {relationship.custom_role_label}
                    </span>
                  )}
                  {/* Banished status with red emphasis */}
                  {relationship?.status === 'Banished' && (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold bg-red-500/40 border border-red-500/60 text-red-300" title="Banished">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                      </svg>
                      Banished
                    </span>
                  )}
                  {bannedMe && (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold bg-red-500/30 border border-red-500/50" title="This user has banned you">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                      </svg>
                      Banned Me
                    </span>
                  )}
                  {topMoverStatus === 'gainer' && (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold bg-emerald-500/30 border border-emerald-500/50 animate-pulse" title="Top Gainer (7 day)">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd"/>
                      </svg>
                      Top Gainer
                    </span>
                  )}
                  {topMoverStatus === 'loser' && (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold bg-red-500/30 border border-red-500/50 animate-pulse" title="Top Loser (7 day)">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12 13a1 1 0 100 2h5a1 1 0 001-1V9a1 1 0 10-2 0v2.586l-4.293-4.293a1 1 0 00-1.414 0L8 9.586 3.707 5.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L11 9.414 14.586 13H12z" clipRule="evenodd"/>
                      </svg>
                      Top Loser
                    </span>
                  )}
                </div>

                {/* Row 2: Stats row - Followers, Sessions, Images, Visits */}
                <div className="flex gap-5 text-white/90 text-base flex-wrap">
                  {/* Followers */}
                  {(profileData.latestSession?.num_followers || profileData.latestSnapshot?.normalized_metrics?.followers) && (
                    <span title="Follower count">
                      ❤️ {(profileData.latestSession?.num_followers || profileData.latestSnapshot?.normalized_metrics?.followers || 0).toLocaleString()} followers
                    </span>
                  )}
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
                  {/* MHC-1103: Renamed to "Visits to Me" for clarity */}
                  {roomVisitStats && roomVisitStats.total_visits > 0 && (
                    <span title={`Count of times they appeared in your context (entered your room or viewed your profile). Total: ${roomVisitStats.total_visits}${roomVisitStats.last_visit ? `. Last visit: ${new Date(roomVisitStats.last_visit).toLocaleDateString()}` : ''}`}>
                      👋 {roomVisitStats.total_visits.toLocaleString()} visits to me
                    </span>
                  )}
                  {myVisitStats && myVisitStats.total_visits > 0 && (
                    <span title={`You visited their room ${myVisitStats.total_visits} times${myVisitStats.last_visit ? `. Last visit: ${new Date(myVisitStats.last_visit).toLocaleDateString()}` : ''}`}>
                      🚀 {myVisitStats.total_visits.toLocaleString()} visits by you
                    </span>
                  )}
                </div>

                {/* Row 3: Profile stats - Gender, Age, Location, Rank */}
                <div className="flex gap-2.5 flex-wrap">
                  {/* Gender */}
                  {(profileData.profile?.gender || profileData.latestSession?.gender || profileData.latestSnapshot?.normalized_metrics?.gender) && (
                    <span className={`px-3 py-1 rounded text-sm font-medium ${
                      (() => {
                        const gender = (profileData.profile?.gender || profileData.latestSession?.gender || profileData.latestSnapshot?.normalized_metrics?.gender || '').toLowerCase();
                        if (gender === 'f' || gender === 'female') return 'bg-pink-500/20 text-pink-200';
                        if (gender === 't' || gender === 'trans') return 'bg-purple-500/20 text-purple-200';
                        if (gender === 'c' || gender === 'couple') return 'bg-teal-500/20 text-teal-200';
                        return 'bg-white/10 text-white/80';
                      })()
                    }`}>
                      {formatGender(profileData.profile?.gender || profileData.latestSession?.gender || profileData.latestSnapshot?.normalized_metrics?.gender)}
                    </span>
                  )}

                  {/* Age */}
                  {(profileData.profile?.age || profileData.latestSession?.age) && (
                    <span className="px-3 py-1 rounded text-sm font-medium bg-white/10 text-white/80">
                      {profileData.profile?.age || profileData.latestSession?.age} years
                    </span>
                  )}

                  {/* Location */}
                  {(profileData.profile?.location || profileData.latestSession?.location) && (
                    <span className="px-3 py-1 rounded text-sm font-medium bg-white/10 text-white/80">
                      📍 {profileData.profile?.location || profileData.latestSession?.location}
                    </span>
                  )}

                  {/* Rank */}
                  {profileData.latestSnapshot?.normalized_metrics?.rank && (
                    <span className="px-3 py-1 rounded text-sm font-medium bg-white/10 text-white/80">
                      Rank #{Math.round(profileData.latestSnapshot.normalized_metrics.rank).toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Row 4: Fast Flags - Safety / Blocking */}
                <div className="flex flex-wrap items-center gap-4">
                  {/* Banned Me Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bannedMe}
                      onChange={handleBannedToggle}
                      className="w-4 h-4 rounded border-2 border-red-500/50 bg-mhc-surface-light text-red-500 focus:ring-red-500 cursor-pointer"
                    />
                    <span className="text-white/90 text-sm font-medium">Banned Me</span>
                  </label>

                  {/* Banned User Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bannedByMe}
                      onChange={handleBannedByMeToggle}
                      className="w-4 h-4 rounded border-2 border-orange-500/50 bg-mhc-surface-light text-orange-500 focus:ring-orange-500 cursor-pointer"
                    />
                    <span className="text-white/90 text-sm font-medium">Banned User</span>
                  </label>

                  {/* Room Banned Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roomBanned}
                      onChange={handleRoomBannedToggle}
                      className="w-4 h-4 rounded border-2 border-red-700/50 bg-mhc-surface-light text-red-700 focus:ring-red-700 cursor-pointer"
                    />
                    <span className="text-white/90 text-sm font-medium">Room Banned</span>
                  </label>
                </div>

                {/* Row 5: Fast Flags - Curation / Interest */}
                <div className="flex flex-wrap items-center gap-4">
                  {/* Watchlist Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={watchList}
                      onChange={handleWatchListToggle}
                      className="w-4 h-4 rounded border-2 border-yellow-500/50 bg-mhc-surface-light text-yellow-500 focus:ring-yellow-500 cursor-pointer"
                    />
                    <span className="text-white/90 text-sm font-medium">Watchlist</span>
                  </label>

                  {/* Interaction Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hadInteraction}
                      onChange={handleHadInteractionToggle}
                      className="w-4 h-4 rounded border-2 border-emerald-500/50 bg-mhc-surface-light text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-white/90 text-sm font-medium">Interaction</span>
                  </label>

                  {/* Smoking Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smokeOnCam}
                      onChange={handleSmokeOnCamToggle}
                      className="w-4 h-4 rounded border-2 border-gray-400/50 bg-mhc-surface-light text-gray-400 focus:ring-gray-400 cursor-pointer"
                    />
                    <span className="text-white/90 text-sm font-medium">Smoking</span>
                  </label>

                  {/* Fetish Gear Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={leatherFetish}
                      onChange={handleLeatherFetishToggle}
                      className="w-4 h-4 rounded border-2 border-purple-500/50 bg-mhc-surface-light text-purple-500 focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="text-white/90 text-sm font-medium">Fetish Gear</span>
                  </label>

                  {/* Profile Smoke indicator (read-only) */}
                  {profileSmoke && (
                    <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-200 border border-amber-500/30" title="Profile indicates smoker">
                      🚬 Profile Smoke
                    </span>
                  )}
                </div>

                {/* Row 6: Promoted Tags - only show specific important tags */}
                {(() => {
                  const promotedTagPatterns = ['smoke', 'master', 'kinky', 'fetish', 'bdsm', 'dirty', 'daddy', 'alpha', 'dom', 'slave', 'bulge'];
                  const allHashtags = profileData.latestSession?.room_subject?.match(/#\w+/g) || [];
                  const promotedTags = allHashtags.filter((tag: string) =>
                    promotedTagPatterns.some(pattern => tag.toLowerCase().includes(pattern))
                  );

                  if (promotedTags.length === 0) return null;

                  return (
                    <div className="flex flex-wrap gap-1.5">
                      {promotedTags.map((tag: string, idx: number) => (
                        <a
                          key={idx}
                          href={`/people?tag=${encodeURIComponent(tag.replace('#', ''))}`}
                          className="px-2 py-0.5 bg-pink-500/30 text-pink-200 rounded-full text-xs font-medium hover:bg-pink-500/50 transition-colors cursor-pointer"
                          title={`Search People with tag: ${tag}`}
                        >
                          {tag}
                        </a>
                      ))}
                    </div>
                  );
                })()}

                {/* Row 7: Seen With - below tags */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm text-white/70 font-medium">Seen With:</span>
                  {seenWith.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 text-blue-300 rounded text-sm"
                    >
                      <a
                        href={`/profile/${entry.username}`}
                        className="hover:underline"
                      >
                        {entry.username}
                      </a>
                      <button
                        onClick={() => handleRemoveSeenWith(entry.id)}
                        className="ml-1 text-blue-400 hover:text-red-400 text-lg leading-none"
                        title="Remove"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {/* Add username input with autocomplete */}
                  <div className="relative">
                    <input
                      type="text"
                      value={seenWithInput}
                      onChange={(e) => handleSeenWithInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && seenWithInput.trim()) {
                          handleAddSeenWith(seenWithInput);
                        }
                      }}
                      placeholder="+ Add"
                      className="px-2.5 py-1 bg-white/10 text-white text-sm rounded border border-white/20 focus:border-mhc-primary focus:outline-none w-24"
                    />
                    {seenWithSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-mhc-surface border border-white/20 rounded shadow-lg z-10 max-h-32 overflow-y-auto">
                        {seenWithSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            onClick={() => {
                              handleAddSeenWith(suggestion.username);
                            }}
                            className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-mhc-primary/20"
                          >
                            {suggestion.username}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {seenWithLoading && (
                    <span className="text-white/40 text-sm">Loading...</span>
                  )}
                </div>

                {/* Row 8: Profile Details link - opens modal */}
                <button
                  onClick={() => setShowProfileDetailsModal(true)}
                  className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 mt-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Profile Details...
                </button>

              </div>
            </div>

          </div>

          {/* Media Section (Collapsible) - Expanded by default */}
          <div className="mb-5">
            <CollapsibleSection
              title={
                <div className="flex items-center gap-2 flex-1">
                  <span>Media</span>
                  <span className="text-xs text-white/50 font-normal">({uploadedImages.length})</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUploadMediaModal(true);
                    }}
                    className="ml-auto mr-2 text-xs text-mhc-primary hover:text-mhc-primary/80 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload
                  </button>
                </div>
              }
              defaultCollapsed={false}
              className="bg-mhc-surface"
            >
              {/* Media Section with Tabs - Now at top */}
              {(() => {
                const allImages = uploadedImages.filter(img => img.media_type !== 'video');
                const videos = uploadedImages.filter(img => img.media_type === 'video');

                // Count images by source for filter chips
                const sourceCountsMap: Record<string, number> = {};
                allImages.forEach(img => {
                  const src = img.source || 'unknown';
                  sourceCountsMap[src] = (sourceCountsMap[src] || 0) + 1;
                });

                // Filter images based on selected source filter
                const images = imageSourceFilter
                  ? allImages.filter(img => img.source === imageSourceFilter)
                  : allImages;

                // Source filter chip config
                const sourceFilters: { key: string | null; label: string; color: string }[] = [
                  { key: null, label: 'All', color: 'bg-mhc-primary' },
                  { key: 'affiliate_api', label: 'Auto', color: 'bg-blue-500' },
                  { key: 'profile', label: 'Profile', color: 'bg-cyan-500' },
                  { key: 'screensnap', label: 'Snap', color: 'bg-purple-500' },
                  { key: 'external', label: 'Ext', color: 'bg-orange-500' },
                  { key: 'manual_upload', label: 'Upload', color: 'bg-green-500' },
                ];

                return (
                  <div>
                    {/* Media Type Tabs with Source Filters */}
                    <div className="flex items-center border-b border-white/10 mb-4">
                      <button
                        onClick={() => setMediaSubTab('images')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          mediaSubTab === 'images'
                            ? 'border-mhc-primary text-mhc-primary'
                            : 'border-transparent text-mhc-text-muted hover:text-mhc-text hover:border-white/30'
                        }`}
                      >
                        Images ({allImages.length})
                      </button>
                      <button
                        onClick={() => setMediaSubTab('videos')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          mediaSubTab === 'videos'
                            ? 'border-mhc-primary text-mhc-primary'
                            : 'border-transparent text-mhc-text-muted hover:text-mhc-text hover:border-white/30'
                        }`}
                      >
                        Videos ({videos.length})
                      </button>
                      {/* Image Source Filter Chips - inline with tabs */}
                      {mediaSubTab === 'images' && (
                        <div className="flex flex-wrap gap-1.5 ml-4 py-1">
                          {sourceFilters.map(filter => {
                            const count = filter.key === null
                              ? allImages.length
                              : (sourceCountsMap[filter.key] || 0);
                            const isActive = imageSourceFilter === filter.key;
                            return (
                              <button
                                key={filter.key || 'all'}
                                onClick={() => {
                                  setImageSourceFilter(filter.key);
                                  setShowAllImages(false); // Reset pagination when filter changes
                                }}
                                className={`px-2 py-0.5 text-xs font-medium rounded-full transition-all ${
                                  isActive
                                    ? `${filter.color} text-white`
                                    : count === 0
                                      ? 'bg-white/5 text-white/30'
                                      : `${filter.color}/20 text-white/70 hover:${filter.color}/40 hover:text-white`
                                }`}
                                disabled={count === 0 && filter.key !== null}
                              >
                                {filter.label} ({count})
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Images Tab Content */}
                    {mediaSubTab === 'images' && (
                      <div>
                        {images.length > 0 ? (
                          <>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {(showAllImages ? images : images.slice(0, 12)).map((image, index) => {
                              const imageUrl = getProfileImageUrl(image);
                              const imageDate = image.captured_at || image.uploaded_at;
                              const isProfileSource = image.source === 'profile';

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
                                      alt={image.title || `${profileData.person.username} - ${new Date(imageDate).toLocaleDateString()}`}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  </div>
                                  {/* Overlay with info */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="absolute bottom-0 left-0 right-0 p-2 text-white text-xs">
                                      {isProfileSource && image.title ? (
                                        <>
                                          <div className="font-semibold truncate">{image.title}</div>
                                          {image.photoset_id && (
                                            <div className="text-white/70 text-[10px]">Photoset #{image.photoset_id}</div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="font-semibold">
                                          {new Date(imageDate).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric'
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {/* Source badge */}
                                  <div className={`absolute top-1 left-1 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                    image.source === 'affiliate_api' ? 'bg-blue-500/80' :
                                    image.source === 'profile' ? 'bg-cyan-500/80' :
                                    image.source === 'screensnap' ? 'bg-purple-500/80' :
                                    image.source === 'external' ? 'bg-orange-500/80' :
                                    'bg-green-500/80'
                                  }`}>
                                    {image.source === 'affiliate_api' ? 'Auto' :
                                     image.source === 'profile' ? 'Profile' :
                                     image.source === 'screensnap' ? 'Snap' :
                                     image.source === 'external' ? 'Ext' :
                                     'Upload'}
                                  </div>
                                  {/* Action buttons */}
                                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!image.is_current && (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          const isAffiliate = image.source === 'affiliate_api';
                                          handleSetAsCurrent(
                                            image.id,
                                            isAffiliate,
                                            isAffiliate ? {
                                              imageUrl: getProfileImageUrl(image),
                                              capturedAt: image.captured_at || image.uploaded_at,
                                              viewers: image.viewers,
                                            } : undefined
                                          );
                                        }}
                                        className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow-lg border border-white/30"
                                        title="Set as current"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </button>
                                    )}
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleDeleteImage(image.id);
                                      }}
                                      className="p-1 bg-red-500/80 hover:bg-red-500 text-white rounded"
                                      title="Delete"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  {image.is_current && (
                                    <div className="absolute bottom-1 right-1 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                                      Current
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {/* Show More button */}
                          {images.length > 12 && (
                            <div className="mt-4 text-center">
                              <button
                                onClick={() => setShowAllImages(!showAllImages)}
                                className="px-4 py-2 text-sm font-medium text-mhc-primary hover:text-white hover:bg-mhc-primary/20 rounded-lg transition-colors"
                              >
                                {showAllImages ? `Show Less` : `Show All (${images.length})`}
                              </button>
                            </div>
                          )}
                          </>
                        ) : imageUploadLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="text-mhc-text-muted text-sm">Loading images...</div>
                          </div>
                        ) : (
                          <p className="text-mhc-text-muted text-sm py-4 text-center">No images saved yet.</p>
                        )}
                      </div>
                    )}

                    {/* Videos Tab Content */}
                    {mediaSubTab === 'videos' && (
                      <div>
                        {videos.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {videos.map((video) => {
                              const videoUrl = getProfileImageUrl(video);
                              const videoDate = video.captured_at || video.uploaded_at;
                              const fileSizeMB = video.file_size ? (video.file_size / (1024 * 1024)).toFixed(1) : null;

                              return (
                                <div
                                  key={video.id}
                                  className="group relative rounded-lg overflow-hidden border-2 border-white/10 hover:border-mhc-primary transition-all"
                                >
                                  <div className="aspect-video bg-black">
                                    <video
                                      src={videoUrl}
                                      controls
                                      preload="metadata"
                                      className="w-full h-full object-contain"
                                    >
                                      Your browser does not support the video tag.
                                    </video>
                                  </div>
                                  <div className="p-2 bg-mhc-surface-light">
                                    <div className="flex items-center justify-between text-xs text-mhc-text-muted">
                                      <span>
                                        {new Date(videoDate).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric'
                                        })}
                                      </span>
                                      {fileSizeMB && <span>{fileSizeMB} MB</span>}
                                    </div>
                                    {video.title && (
                                      <div className="text-sm text-mhc-text mt-1 truncate">{video.title}</div>
                                    )}
                                  </div>
                                  <div className="absolute top-2 left-2 bg-cyan-500/80 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                                    Profile
                                  </div>
                                  <button
                                    onClick={() => handleDeleteImage(video.id)}
                                    className="absolute top-2 right-2 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Delete video"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-mhc-text-muted text-sm py-4 text-center">No videos saved yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

            </CollapsibleSection>
          </div>

          {/* Relationship & Names Section (Collapsible) - Combined */}
          <div className="mb-5">
            <CollapsibleSection
              title={
                <div className="flex items-center gap-2">
                  <span>Relationship & Names</span>
                  {/* Show identity/irl name in title if set */}
                  {(profileNames?.identity_name || profileNames?.irl_name) && (
                    <span className="text-xs text-white/50 font-normal">
                      ({profileNames?.identity_name || profileNames?.irl_name})
                    </span>
                  )}
                  {/* Show relationship status if set */}
                  {relationship && relationship.roles.length > 0 && (
                    <span className="text-xs text-mhc-primary font-normal">
                      {relationship.roles.join(', ')}{relationship.status !== 'Potential' ? ` - ${relationship.status}` : ''}
                    </span>
                  )}
                </div>
              }
              defaultCollapsed={!relationship || relationship.roles.length === 0}
              className="bg-mhc-surface"
            >
              {/* Relationship Subsection */}
              <div className="mb-4">
                <CollapsibleSection
                  title="Relationship"
                  defaultCollapsed={true}
                  className="bg-mhc-surface-light"
                >
                  {relationshipLoading ? (
                    <div className="text-white/50 text-sm py-4 text-center">Loading...</div>
                  ) : (
                    <div className="space-y-4">
                      <RelationshipEditor
                        relationship={relationship}
                        traitSeeds={traitSeeds}
                        onSave={handleSaveRelationship}
                      />
                      {relationship && profileData?.person?.username && (
                        <RelationshipHistoryViewer
                          username={profileData.person.username}
                        />
                      )}
                    </div>
                  )}
                </CollapsibleSection>
              </div>

              {/* Names Subsection */}
              <div className="mb-4">
                <CollapsibleSection
                  title={
                    <div className="flex items-center gap-2">
                      <span>Names</span>
                      {(profileNames?.irl_name || profileNames?.identity_name || (profileNames?.address_as && profileNames.address_as.length > 0)) && (
                        <span className="text-xs text-white/50 font-normal">
                          {profileNames?.address_as?.length ? `${profileNames.address_as.length} terms` : ''}
                        </span>
                      )}
                    </div>
                  }
                  defaultCollapsed={true}
                  className="bg-mhc-surface-light"
                >
                  {profileNamesLoading ? (
                    <div className="text-white/50 text-sm py-4 text-center">Loading...</div>
                  ) : (
                    <NamesEditor
                      names={profileNames}
                      addressTermSeeds={addressTermSeeds}
                      onSave={handleSaveNames}
                    />
                  )}
                </CollapsibleSection>
              </div>

              {/* Legacy Service Relationships Subsection - Only show if exists */}
              {serviceRelationships.length > 0 && (
                <div>
                  <CollapsibleSection
                    title={
                      <div className="flex items-center gap-2">
                        <span className="text-white/50">Legacy Relationships</span>
                        <span className="text-xs text-white/30 font-normal">(deprecated)</span>
                      </div>
                    }
                    defaultCollapsed={true}
                    className="bg-mhc-surface-light opacity-60"
                  >
                    <div className="space-y-4">
                      {serviceRelationships.filter(r => r.service_role === 'sub').length > 0 && (
                        <div>
                          <h4 className="text-sm text-white/60 mb-2">Sub</h4>
                          <ServiceRelationshipEditor
                            relationships={serviceRelationships.filter(r => r.service_role === 'sub')}
                            onSave={handleSaveServiceRelationship}
                            onRemove={handleRemoveServiceRelationship}
                            defaultRole="sub"
                          />
                        </div>
                      )}
                      {serviceRelationships.filter(r => r.service_role === 'dom').length > 0 && (
                        <div>
                          <h4 className="text-sm text-white/60 mb-2">Dom</h4>
                          <ServiceRelationshipEditor
                            relationships={serviceRelationships.filter(r => r.service_role === 'dom')}
                            onSave={handleSaveServiceRelationship}
                            onRemove={handleRemoveServiceRelationship}
                            defaultRole="dom"
                          />
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>
                </div>
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
              {/* Notes List */}
              {notesLoading ? (
                <div className="text-white/50 text-sm py-4 text-center">Loading notes...</div>
              ) : profileNotes.length === 0 ? (
                <div className="text-white/50 text-sm py-4 text-center">No notes yet. Use the "Add Note" section to create one.</div>
              ) : (
                <div className="space-y-3">
                  {(showAllNotes ? profileNotes : profileNotes.slice(0, 2)).map((note, noteIndex) => (
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
                          {(() => {
                            const lines = note.content.split('\n');
                            const isLong = lines.length > noteLineLimit;
                            const isExpanded = expandedNoteIds.has(note.id);
                            const displayContent = isLong && !isExpanded
                              ? lines.slice(0, noteLineLimit).join('\n')
                              : note.content;

                            return (
                              <>
                                <p className="text-mhc-text text-sm whitespace-pre-wrap m-0">{displayContent}</p>
                                {isLong && !isExpanded && (
                                  <button
                                    onClick={() => setExpandedNoteIds(prev => {
                                      const next = new Set(Array.from(prev));
                                      next.add(note.id);
                                      return next;
                                    })}
                                    className="text-mhc-primary hover:text-mhc-primary-light text-sm mt-2 transition-colors"
                                  >
                                    Read More...
                                  </button>
                                )}
                                {isLong && isExpanded && (
                                  <button
                                    onClick={() => setExpandedNoteIds(prev => {
                                      const next = new Set(Array.from(prev));
                                      next.delete(note.id);
                                      return next;
                                    })}
                                    className="text-mhc-primary hover:text-mhc-primary-light text-sm mt-2 transition-colors"
                                  >
                                    Show Less
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  ))}
                  {/* Show More Notes button */}
                  {profileNotes.length > 2 && (
                    <div className="mt-4 text-center">
                      <button
                        onClick={() => setShowAllNotes(!showAllNotes)}
                        className="px-4 py-2 text-sm font-medium text-mhc-primary hover:text-mhc-primary-light border border-mhc-primary/30 rounded-md hover:bg-mhc-primary/10 transition-colors"
                      >
                        {showAllNotes ? 'Show Less' : `Show All Notes (${profileNotes.length})`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </CollapsibleSection>
          </div>

          {/* Communications Section (Collapsible) */}
          <div className="mb-5">
            <CollapsibleSection title="Communications" defaultCollapsed={true} className="bg-mhc-surface">
              <CommsSection username={profileData.person.username} />
            </CollapsibleSection>
          </div>

          {/* Tabs */}
          <div className="bg-mhc-surface rounded-t-lg pt-2.5 px-2.5 shadow-lg border-b border-white/10">
            <div className="flex gap-1 flex-wrap">
              <button
                className={`px-6 py-3 text-base font-medium cursor-pointer transition-all relative ${
                  activeTab === 'snapshot'
                    ? 'text-mhc-primary'
                    : 'text-mhc-text-muted hover:text-mhc-text'
                }`}
                onClick={() => setActiveTab('snapshot')}
              >
                Profile
                {activeTab === 'snapshot' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-mhc-primary rounded-t" />
                )}
              </button>
              <button
                className={`px-6 py-3 text-base font-medium cursor-pointer transition-all relative ${
                  activeTab === 'sessions'
                    ? 'text-mhc-primary'
                    : 'text-mhc-text-muted hover:text-mhc-text'
                }`}
                onClick={() => setActiveTab('sessions')}
              >
                Sessions
                {activeTab === 'sessions' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-mhc-primary rounded-t" />
                )}
              </button>
              <button
                className={`px-6 py-3 text-base font-medium cursor-pointer transition-all relative ${
                  activeTab === 'interactions'
                    ? 'text-mhc-primary'
                    : 'text-mhc-text-muted hover:text-mhc-text'
                }`}
                onClick={() => setActiveTab('interactions')}
              >
                Interactions
                {activeTab === 'interactions' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-mhc-primary rounded-t" />
                )}
              </button>
              <button
                className={`px-6 py-3 text-base font-medium cursor-pointer transition-all relative ${
                  activeTab === 'timeline'
                    ? 'text-mhc-primary'
                    : 'text-mhc-text-muted hover:text-mhc-text'
                }`}
                onClick={() => setActiveTab('timeline')}
              >
                Timeline
                {activeTab === 'timeline' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-mhc-primary rounded-t" />
                )}
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="bg-mhc-surface rounded-b-lg shadow-lg p-8 min-h-[400px]">
            {activeTab === 'snapshot' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Latest Snapshot</h3>
                {(profileData.latestSession || profileData.latestSnapshot) ? (
                  <div className="space-y-6">
                    {/* Basic Info Section */}
                    <CollapsibleSection
                      title={isSessionLive(profileData.latestSession) ? 'Live Session' : 'Last Session'}
                      defaultCollapsed={false}
                      className="bg-mhc-surface-light"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {profileData.latestSession && (
                          <>
                            <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-mhc-primary">
                              <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Viewers:</span>
                              <span className="block text-mhc-text text-lg font-semibold">{(profileData.latestSession.num_users || 0).toLocaleString()}</span>
                            </div>
                            <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-mhc-primary">
                              <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Followers:</span>
                              <span className="block text-mhc-text text-lg font-semibold">{(profileData.latestSession.num_followers || 0).toLocaleString()}</span>
                            </div>
                            <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-mhc-primary">
                              <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Current Show:</span>
                              <span className="block text-mhc-text text-base">{profileData.latestSession.current_show || 'Public'}</span>
                            </div>
                            <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-mhc-primary">
                              <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Online Duration:</span>
                              <span className="block text-mhc-text text-base">{formatDuration(Math.floor(profileData.latestSession.seconds_online / 60))}</span>
                            </div>
                          </>
                        )}
                      </div>
                      {/* Room Subject - Full Width */}
                      {profileData.latestSession?.room_subject && (
                        <div className="mt-4 p-4 bg-mhc-surface rounded-md border-l-4 border-mhc-primary">
                          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Room Subject:</span>
                          <span className="block text-mhc-text text-base">{profileData.latestSession.room_subject}</span>
                        </div>
                      )}
                    </CollapsibleSection>

                    {/* Financial Section */}
                    {profileData.latestSnapshot?.normalized_metrics && (
                      (profileData.latestSnapshot.normalized_metrics.income_usd !== undefined ||
                       profileData.latestSnapshot.normalized_metrics.income_tokens !== undefined) && (
                        <CollapsibleSection title="Financial" defaultCollapsed={true} className="bg-mhc-surface-light">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {profileData.latestSnapshot.normalized_metrics.income_usd !== undefined && (
                              <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-emerald-500">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Income (USD):</span>
                                <span className="block text-emerald-400 text-xl font-bold">${profileData.latestSnapshot.normalized_metrics.income_usd.toLocaleString()}</span>
                              </div>
                            )}
                            {profileData.latestSnapshot.normalized_metrics.income_tokens !== undefined && (
                              <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-yellow-500">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Income (Tokens):</span>
                                <span className="block text-yellow-400 text-xl font-bold">{profileData.latestSnapshot.normalized_metrics.income_tokens.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        </CollapsibleSection>
                      )
                    )}

                    {/* Session Statistics Section */}
                    {profileData.latestSnapshot?.normalized_metrics && (
                      (profileData.latestSnapshot.normalized_metrics.session_count !== undefined ||
                       profileData.latestSnapshot.normalized_metrics.total_duration_minutes !== undefined ||
                       profileData.latestSnapshot.normalized_metrics.average_duration_minutes !== undefined) && (
                        <CollapsibleSection title="Session Statistics" defaultCollapsed={true} className="bg-mhc-surface-light">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {profileData.latestSnapshot.normalized_metrics.session_count !== undefined && (
                              <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-mhc-primary">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Session Count:</span>
                                <span className="block text-mhc-text text-lg font-semibold">{profileData.latestSnapshot.normalized_metrics.session_count}</span>
                              </div>
                            )}
                            {profileData.latestSnapshot.normalized_metrics.total_duration_minutes !== undefined && (
                              <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-mhc-primary">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Total Duration:</span>
                                <span className="block text-mhc-text text-lg font-semibold">{formatDuration(profileData.latestSnapshot.normalized_metrics.total_duration_minutes)}</span>
                              </div>
                            )}
                            {profileData.latestSnapshot.normalized_metrics.average_duration_minutes !== undefined && (
                              <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-mhc-primary">
                                <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Avg Duration:</span>
                                <span className="block text-mhc-text text-lg font-semibold">{formatDuration(profileData.latestSnapshot.normalized_metrics.average_duration_minutes)}</span>
                              </div>
                            )}
                          </div>
                        </CollapsibleSection>
                      )
                    )}

                    {/* Tags Section */}
                    {((profileData.latestSession?.tags && profileData.latestSession.tags.length > 0) ||
                      (profileData.profile?.tags && profileData.profile.tags.length > 0)) && (
                      <CollapsibleSection title="Tags" defaultCollapsed={true} className="bg-mhc-surface-light">
                        <div className="flex flex-wrap gap-2">
                          {(profileData.latestSession?.tags || profileData.profile?.tags || []).map((tag: string, idx: number) => (
                            <span key={idx} className="px-3 py-1 bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30 rounded-full text-sm">{tag}</span>
                          ))}
                        </div>
                      </CollapsibleSection>
                    )}

                    {/* Data Sources Section */}
                    <CollapsibleSection title="Data Sources" defaultCollapsed={true} className="bg-mhc-surface-light">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {profileData.latestSession && (
                          <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-gray-500">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Affiliate API:</span>
                            <span className="block text-mhc-text text-sm">{new Date(profileData.latestSession.observed_at).toLocaleString()}</span>
                          </div>
                        )}
                        {profileData.latestSnapshot && (
                          <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-gray-500">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Statbate:</span>
                            <span className="block text-mhc-text text-sm">{new Date(profileData.latestSnapshot.captured_at).toLocaleDateString()}</span>
                          </div>
                        )}
                        {profileData.profile?.scraped_at && (
                          <div className="p-4 bg-mhc-surface rounded-md border-l-4 border-gray-500">
                            <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Profile Scraper:</span>
                            <span className="block text-mhc-text text-sm">{new Date(profileData.profile.scraped_at).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </CollapsibleSection>

                    {/* Social Media Links Section */}
                    <CollapsibleSection title="Social Media Links" defaultCollapsed={true}>
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

                    {/* Member History Section - merged from old History tab */}
                    <CollapsibleSection title="Member History (Statbate)" defaultCollapsed={false}>
                      <HistoryTab username={profileData.person.username} />
                    </CollapsibleSection>

                    {/* Raw Data Toggle */}
                    <div className="flex justify-center">
                      <button
                        onClick={() => setShowRawData(!showRawData)}
                        className="px-8 py-3 bg-gray-600 text-white border-none rounded-md text-base font-semibold cursor-pointer transition-all hover:bg-gray-500"
                      >
                        {showRawData ? 'Hide Raw Data' : 'Show Raw Data'}
                      </button>
                    </div>

                    {/* Raw Data Display */}
                    {showRawData && (
                      <div>
                        <h4 className="text-mhc-text-muted text-xl font-semibold mb-4">Raw Profile Data</h4>
                        <pre className="bg-black text-emerald-400 p-4 rounded-md overflow-auto text-sm leading-relaxed min-h-[600px] whitespace-pre-wrap break-words border border-gray-700">
                          {JSON.stringify(profileData, null, 2)}
                        </pre>
                      </div>
                    )}
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

            {activeTab === 'interactions' && (
              <InteractionsTab interactions={profileData.interactions || []} />
            )}

            {activeTab === 'timeline' && (
              <div>
                <h3 className="m-0 mb-5 text-mhc-text text-2xl font-semibold">Activity Timeline</h3>
                <TimelineTab username={profileData.person.username} />
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

      {/* Add Note Modal */}
      <Modal
        isOpen={showAddNoteModal}
        title="Add Note"
        onClose={() => {
          setShowAddNoteModal(false);
          setNotesMessage(null);
        }}
        size="md"
      >
        <div className="space-y-4">
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Add a new note..."
            rows={4}
            className="w-full px-4 py-3 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-base resize-y focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/20"
            autoFocus
          />
          {notesMessage && (
            <div className={`text-sm px-3 py-2 rounded ${
              notesMessage.includes('Error')
                ? 'bg-red-500/20 text-red-400'
                : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {notesMessage}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setShowAddNoteModal(false);
                setNewNoteContent('');
                setNotesMessage(null);
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await handleAddNote();
                if (!notesSaving) {
                  setShowAddNoteModal(false);
                  setNewNoteContent('');
                }
              }}
              disabled={notesSaving || !newNoteContent.trim()}
              className="px-4 py-2 bg-mhc-primary hover:bg-mhc-primary/90 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {notesSaving ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Profile Details Modal */}
      <Modal
        isOpen={showProfileDetailsModal}
        title="Profile Details"
        onClose={() => setShowProfileDetailsModal(false)}
        size="xl"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Last refresh timestamp */}
          <div className="text-xs text-white/50 -mt-2 whitespace-nowrap">
            {profileData?.profile?.browser_scraped_at
              ? `Last refresh: ${formatDate(profileData.profile.browser_scraped_at, { relative: true })}`
              : 'Never refreshed'}
          </div>
          {/* Room Subject / Goal */}
          {profileData?.latestSession?.room_subject && (
            <div>
              <h5 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3 border-b border-white/10 pb-2">Room Subject / Goal</h5>
              <div className="px-4 py-3 bg-white/10 rounded-lg text-base leading-relaxed border-l-4 border-mhc-primary/50">
                {profileData.latestSession.room_subject.replace(/#\w+/g, '').trim()}
              </div>
              {(() => {
                const hashtags = profileData.latestSession.room_subject.match(/#\w+/g);
                if (hashtags && hashtags.length > 0) {
                  return (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {hashtags.map((tag: string, idx: number) => (
                        <a
                          key={idx}
                          href={`/people?tag=${encodeURIComponent(tag.replace('#', ''))}`}
                          className="px-2.5 py-1 bg-mhc-primary/80 text-white rounded-full text-xs font-medium hover:bg-mhc-primary transition-colors cursor-pointer"
                          title={`Search People with tag: ${tag}`}
                        >
                          {tag}
                        </a>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Session Info - Type, Last Seen, Session Started */}
          <div className="p-4 bg-mhc-surface-light rounded-md">
            <h5 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3 border-b border-white/10 pb-2">Session Info</h5>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-mhc-text-muted text-sm">Type:</span>
                <span className={`px-3 py-1 rounded text-sm font-semibold uppercase tracking-wider ${
                  profileData?.person?.role === 'MODEL'
                    ? 'bg-pink-500/40 text-pink-200'
                    : 'bg-gray-500/40 text-gray-200'
                }`}>
                  {profileData?.person?.role}
                </span>
              </div>
              {profileData && !isSessionLive(profileData.latestSession) &&
                (profileData.latestSession?.observed_at ||
                 profileData.profile?.last_seen_online ||
                 profileData.person?.last_seen_at) && (
                <div className="flex justify-between">
                  <span className="text-mhc-text-muted text-sm">Last Seen:</span>
                  <span className="text-mhc-text text-sm">
                    {new Date(
                      profileData.latestSession?.observed_at ||
                      profileData.profile?.last_seen_online ||
                      profileData.person?.last_seen_at
                    ).toLocaleString('en-US', {
                      timeZone: 'America/New_York',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })} ET
                  </span>
                </div>
              )}
              {profileData && isSessionLive(profileData.latestSession) && (
                <div className="flex justify-between">
                  <span className="text-mhc-text-muted text-sm">Session Started:</span>
                  <span className="text-mhc-text text-sm">
                    {new Date(profileData.latestSession.session_start).toLocaleString('en-US', {
                      timeZone: 'America/New_York',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })} ET
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Two-column layout with cards - Basic Info and Physical */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Basic Info */}
            <div className="space-y-4">
              <div className="p-4 bg-mhc-surface-light rounded-md">
                <h5 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3 border-b border-white/10 pb-2">Basic Info</h5>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Real Name:</span>
                    <span className={`text-sm ${profileData?.profile?.display_name ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.display_name || 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Age:</span>
                    <span className={`text-sm ${profileData?.profile?.age ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.age || 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Birthday:</span>
                    <span className={`text-sm ${profileData?.profile?.birthday_public ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.birthday_public || 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Gender:</span>
                    <span className={`text-sm ${profileData?.profile?.gender ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.gender ? formatGender(profileData.profile.gender) : 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Interested In:</span>
                    <span className={`text-sm ${profileData?.profile?.interested_in ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.interested_in || 'Not set'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-mhc-surface-light rounded-md">
                <h5 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3 border-b border-white/10 pb-2">Location</h5>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Location:</span>
                    <span className={`text-sm ${profileData?.profile?.location ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.location || 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Country:</span>
                    <span className={`text-sm ${profileData?.profile?.country ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.country || 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Languages:</span>
                    <span className={`text-sm ${profileData?.profile?.spoken_languages ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.spoken_languages || 'Not set'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Physical & Status */}
            <div className="space-y-4">
              <div className="p-4 bg-mhc-surface-light rounded-md">
                <h5 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3 border-b border-white/10 pb-2">Physical</h5>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Body Type:</span>
                    <span className={`text-sm ${profileData?.profile?.body_type ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.body_type || 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Body Decorations:</span>
                    <span className={`text-sm ${profileData?.profile?.body_decorations ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.body_decorations || 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Smoke/Drink:</span>
                    <span className={`text-sm ${profileData?.profile?.smoke_drink ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.smoke_drink || 'Not set'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-mhc-surface-light rounded-md">
                <h5 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3 border-b border-white/10 pb-2">Status</h5>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">New Model:</span>
                    <span className={`text-sm ${profileData?.profile?.is_new !== null && profileData?.profile?.is_new !== undefined ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.is_new !== null && profileData?.profile?.is_new !== undefined
                        ? (profileData.profile.is_new ? 'Yes' : 'No')
                        : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mhc-text-muted text-sm">Last Broadcast:</span>
                    <span className={`text-sm ${profileData?.profile?.last_broadcast ? 'text-mhc-text' : 'text-white/30 italic'}`}>
                      {profileData?.profile?.last_broadcast
                        ? new Date(profileData.profile.last_broadcast).toLocaleDateString()
                        : 'Not set'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bio - full width */}
          {profileData?.profile?.bio && (
            <div className="p-4 bg-mhc-surface-light rounded-md">
              <h5 className="text-mhc-text-muted text-sm font-semibold uppercase tracking-wider mb-3 border-b border-white/10 pb-2">Bio</h5>
              <p className="mt-2 mb-0 leading-relaxed text-mhc-text whitespace-pre-wrap">
                {profileData.profile.bio}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Upload Media Modal */}
      <Modal
        isOpen={showUploadMediaModal}
        title="Upload Media"
        onClose={() => setShowUploadMediaModal(false)}
        size="md"
      >
        <div className="space-y-4">
          {imageUploadError && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm whitespace-pre-line">
              {imageUploadError}
            </div>
          )}

          {/* Drag & Drop Zone */}
          <div
            ref={dropZoneRef}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => !imageUploadLoading && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-mhc-primary bg-mhc-primary/10'
                : 'border-white/20 hover:border-mhc-primary/50 hover:bg-white/5'
            } ${imageUploadLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={e => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) handleImageUpload(files);
              }}
              disabled={imageUploadLoading}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <svg className={`w-8 h-8 ${isDragging ? 'text-mhc-primary' : 'text-white/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div className="text-white/70 text-sm">
                {isDragging ? (
                  <span className="text-mhc-primary font-medium">Drop images here</span>
                ) : (
                  <>
                    <span className="text-mhc-primary font-medium">Click to upload</span> or drag and drop
                  </>
                )}
              </div>
              <div className="text-white/40 text-xs">
                JPEG, PNG, GIF, or WebP (max 10MB each)
              </div>
            </div>
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
            <div className="flex items-center gap-3 text-mhc-text-muted text-sm">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {uploadProgress ? (
                <span>Uploading {uploadProgress.current} of {uploadProgress.total}...</span>
              ) : (
                <span>Uploading...</span>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Profile;
