import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface HudsonBroadcast {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  peak_viewers: number;
  total_tokens: number;
  followers_gained: number;
  summary: string | null;
  notes: string | null;
  tags: string[];
  room_subject: string | null;
  auto_detected: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

interface BroadcastStats {
  totalBroadcasts: number;
  totalMinutes: number;
  avgDuration: number;
  totalTokens: number;
  avgViewers: number;
  peakViewers: number;
  totalFollowersGained: number;
}

interface BroadcastSummary {
  id: string;
  broadcast_id: string;
  theme: string | null;
  tokens_received: number;
  tokens_per_hour: number | null;
  max_viewers: number | null;
  unique_viewers: number | null;
  new_followers: number;
  lost_followers: number;
  net_followers: number;
  full_markdown: string | null;
  generated_at: string;
  ai_model: string | null;
}

interface AIStatus {
  available: boolean;
  model: string;
}

interface PreviewResult {
  summary: Partial<BroadcastSummary>;
  parsedData: {
    tokensReceived: number;
    tokensPerHour: number;
    uniqueViewers: number;
    avgWatchTimeSeconds: number;
    newFollowers: number;
    lostFollowers: number;
    netFollowers: number;
    roomSubjects: string[];
    topTippers: Array<{ username: string; tokens: number }>;
    topLoversBoard: Array<{ rank: number; username: string; tokens: number }>;
    chatMessageCount: number;
    filteredChatLineCount: number;
  };
  tokensUsed: number;
  cost: number;
}

const MyBroadcasts: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<HudsonBroadcast[]>([]);
  const [stats, setStats] = useState<BroadcastStats | null>(null);
  const [currentBroadcast, setCurrentBroadcast] = useState<HudsonBroadcast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    summary: string;
    notes: string;
    tags: string;
    peak_viewers: string;
    total_tokens: string;
    followers_gained: string;
  }>({
    summary: '',
    notes: '',
    tags: '',
    peak_viewers: '',
    total_tokens: '',
    followers_gained: '',
  });
  const [showNewBroadcastForm, setShowNewBroadcastForm] = useState(false);
  const [statsDays, setStatsDays] = useState(30);

  // AI Summary state
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [summaryBroadcastId, setSummaryBroadcastId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [currentSummary, setCurrentSummary] = useState<BroadcastSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Preview mode state (analyze without saving)
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [previewTranscript, setPreviewTranscript] = useState('');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchAIStatus();
  }, [statsDays]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [broadcastsRes, statsRes, currentRes] = await Promise.all([
        fetch('/api/broadcasts'),
        fetch(`/api/broadcasts/stats?days=${statsDays}`),
        fetch('/api/broadcasts/current'),
      ]);

      if (broadcastsRes.ok) {
        setBroadcasts(await broadcastsRes.json());
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (currentRes.ok) {
        const current = await currentRes.json();
        setCurrentBroadcast(current);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load broadcasts');
    } finally {
      setLoading(false);
    }
  };

  const fetchAIStatus = async () => {
    try {
      const res = await fetch('/api/broadcasts/ai/status');
      if (res.ok) {
        setAIStatus(await res.json());
      }
    } catch {
      // AI not available
    }
  };

  const fetchSummary = async (broadcastId: string) => {
    try {
      const res = await fetch(`/api/broadcasts/${broadcastId}/summary`);
      if (res.ok) {
        const summary = await res.json();
        setCurrentSummary(summary);
        return summary;
      }
      return null;
    } catch {
      return null;
    }
  };

  const startBroadcast = async () => {
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          started_at: new Date().toISOString(),
          source: 'manual',
          auto_detected: false,
        }),
      });
      if (res.ok) {
        fetchData();
        setShowNewBroadcastForm(false);
      }
    } catch (err) {
      setError('Failed to start broadcast');
    }
  };

  const endBroadcast = async (id: string) => {
    try {
      const res = await fetch(`/api/broadcasts/${id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      setError('Failed to end broadcast');
    }
  };

  const startEditing = (broadcast: HudsonBroadcast) => {
    setEditingId(broadcast.id);
    setEditForm({
      summary: broadcast.summary || '',
      notes: broadcast.notes || '',
      tags: (broadcast.tags || []).join(', '),
      peak_viewers: broadcast.peak_viewers?.toString() || '',
      total_tokens: broadcast.total_tokens?.toString() || '',
      followers_gained: broadcast.followers_gained?.toString() || '',
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;

    try {
      const res = await fetch(`/api/broadcasts/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: editForm.summary || null,
          notes: editForm.notes || null,
          tags: editForm.tags ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          peak_viewers: editForm.peak_viewers ? parseInt(editForm.peak_viewers) : undefined,
          total_tokens: editForm.total_tokens ? parseInt(editForm.total_tokens) : undefined,
          followers_gained: editForm.followers_gained ? parseInt(editForm.followers_gained) : undefined,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchData();
      }
    } catch (err) {
      setError('Failed to save broadcast');
    }
  };

  const deleteBroadcast = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this broadcast?')) return;

    try {
      const res = await fetch(`/api/broadcasts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      setError('Failed to delete broadcast');
    }
  };

  const openSummaryPanel = async (broadcast: HudsonBroadcast) => {
    setSummaryBroadcastId(broadcast.id);
    setTranscript('');
    setSummaryError(null);
    setCurrentSummary(null);

    // Try to fetch existing summary
    await fetchSummary(broadcast.id);
  };

  const generateSummary = async () => {
    if (!summaryBroadcastId || !transcript.trim()) return;

    setGeneratingSummary(true);
    setSummaryError(null);

    try {
      const res = await fetch(`/api/broadcasts/${summaryBroadcastId}/summary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });

      if (res.ok) {
        const summary = await res.json();
        setCurrentSummary(summary);
      } else {
        const err = await res.json();
        setSummaryError(err.error || 'Failed to generate summary');
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const regenerateSummary = async () => {
    if (!summaryBroadcastId) return;

    setGeneratingSummary(true);
    setSummaryError(null);

    try {
      const res = await fetch(`/api/broadcasts/${summaryBroadcastId}/summary/regenerate`, {
        method: 'POST',
      });

      if (res.ok) {
        const summary = await res.json();
        setCurrentSummary(summary);
      } else {
        const err = await res.json();
        setSummaryError(err.error || 'Failed to regenerate summary');
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to regenerate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const generatePreview = async () => {
    if (!previewTranscript.trim()) return;

    setGeneratingPreview(true);
    setPreviewError(null);

    try {
      const res = await fetch('/api/broadcasts/ai/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: previewTranscript }),
      });

      if (res.ok) {
        const result = await res.json();
        setPreviewResult(result);
      } else {
        const err = await res.json();
        setPreviewError(err.error || 'Failed to generate preview');
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setGeneratingPreview(false);
    }
  };

  const openPreviewPanel = () => {
    setShowPreviewPanel(true);
    setPreviewTranscript('');
    setPreviewResult(null);
    setPreviewError(null);
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading && broadcasts.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-6">
        <p className="text-mhc-text-muted">Loading broadcasts...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
          My Broadcasts
        </h1>
        <p className="text-mhc-text-muted">Track and summarize your broadcast sessions</p>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Current Broadcast Banner */}
      {currentBroadcast && (
        <div className="mb-5 p-5 bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-emerald-400 font-semibold text-lg">LIVE NOW</span>
              </div>
              <p className="text-white/80">
                Started {formatDate(currentBroadcast.started_at)}
                {currentBroadcast.room_subject && ` - ${currentBroadcast.room_subject}`}
              </p>
            </div>
            <button
              onClick={() => endBroadcast(currentBroadcast.id)}
              className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
            >
              End Broadcast
            </button>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">Statistics</h2>
            <div className="flex gap-2">
              {[7, 30, 90].map(days => (
                <button
                  key={days}
                  onClick={() => setStatsDays(days)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    statsDays === days
                      ? 'bg-mhc-primary text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-mhc-primary">{stats.totalBroadcasts}</div>
              <div className="text-xs text-white/60 uppercase">Broadcasts</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-mhc-primary">{formatDuration(stats.totalMinutes)}</div>
              <div className="text-xs text-white/60 uppercase">Total Time</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-mhc-primary">{formatDuration(Math.round(stats.avgDuration))}</div>
              <div className="text-xs text-white/60 uppercase">Avg Duration</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-amber-400">{stats.totalTokens.toLocaleString()}</div>
              <div className="text-xs text-white/60 uppercase">Total Tokens</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">{Math.round(stats.avgViewers)}</div>
              <div className="text-xs text-white/60 uppercase">Avg Viewers</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">{stats.peakViewers}</div>
              <div className="text-xs text-white/60 uppercase">Peak Viewers</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-emerald-400">+{stats.totalFollowersGained}</div>
              <div className="text-xs text-white/60 uppercase">Followers</div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mb-5 flex gap-3 flex-wrap">
        {!currentBroadcast && (
          <button
            onClick={() => setShowNewBroadcastForm(!showNewBroadcastForm)}
            className="px-5 py-2.5 bg-mhc-primary hover:bg-mhc-primary-dark text-white font-semibold rounded-lg transition-colors"
          >
            {showNewBroadcastForm ? 'Cancel' : 'Start Manual Broadcast'}
          </button>
        )}
        {aiStatus?.available && (
          <button
            onClick={openPreviewPanel}
            className="px-5 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-400 font-semibold rounded-lg transition-colors"
          >
            Preview Mode (No Save)
          </button>
        )}
      </div>

      {/* Preview Mode Panel */}
      {showPreviewPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-mhc-surface border border-amber-500/30 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-amber-500/10">
              <div>
                <h3 className="text-xl font-semibold text-amber-400">Preview Mode</h3>
                <p className="text-sm text-white/60 mt-1">
                  Analyze any transcript without saving to database
                </p>
              </div>
              <button
                onClick={() => setShowPreviewPanel(false)}
                className="p-2 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {previewError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {previewError}
                </div>
              )}

              {!previewResult ? (
                // Input mode
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Paste Any Chat Transcript
                    </label>
                    <textarea
                      value={previewTranscript}
                      onChange={(e) => setPreviewTranscript(e.target.value)}
                      placeholder="Paste a chat transcript from any broadcaster..."
                      rows={15}
                      className="w-full px-4 py-3 bg-mhc-surface-light border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-amber-500 resize-y font-mono text-sm"
                    />
                    <p className="text-xs text-amber-400/70 mt-2">
                      This will generate an AI summary and show parsed data without saving anything to the database.
                    </p>
                  </div>

                  <button
                    onClick={generatePreview}
                    disabled={!previewTranscript.trim() || generatingPreview}
                    className={`w-full px-5 py-3 font-semibold rounded-lg transition-all ${
                      !previewTranscript.trim() || generatingPreview
                        ? 'bg-white/10 text-white/40 cursor-not-allowed'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {generatingPreview ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating Preview...
                      </span>
                    ) : (
                      'Generate Preview'
                    )}
                  </button>
                </div>
              ) : (
                // Results mode
                <div className="space-y-4">
                  {/* Cost info */}
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex justify-between items-center">
                    <span className="text-amber-400 font-medium">Preview Generated</span>
                    <span className="text-white/60 text-sm">
                      {previewResult.tokensUsed.toLocaleString()} tokens | ${previewResult.cost.toFixed(4)}
                    </span>
                  </div>

                  {/* Parsed Data Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold text-amber-400">{previewResult.parsedData.tokensReceived}</div>
                      <div className="text-xs text-white/60">Tokens</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold text-blue-400">{previewResult.parsedData.uniqueViewers}</div>
                      <div className="text-xs text-white/60">Unique Viewers</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold text-emerald-400">+{previewResult.parsedData.newFollowers}</div>
                      <div className="text-xs text-white/60">New Followers</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold text-red-400">-{previewResult.parsedData.lostFollowers}</div>
                      <div className="text-xs text-white/60">Unfollows</div>
                    </div>
                  </div>

                  {/* More parsed stats */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-white/5 rounded-lg">
                      <div className="text-xs text-white/50 uppercase mb-1">Tokens/Hour</div>
                      <div className="text-lg font-bold text-amber-400">{previewResult.parsedData.tokensPerHour.toFixed(1)}</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                      <div className="text-xs text-white/50 uppercase mb-1">Chat Messages</div>
                      <div className="text-lg font-bold text-blue-400">{previewResult.parsedData.chatMessageCount}</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                      <div className="text-xs text-white/50 uppercase mb-1">Net Followers</div>
                      <div className={`text-lg font-bold ${previewResult.parsedData.netFollowers >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {previewResult.parsedData.netFollowers >= 0 ? '+' : ''}{previewResult.parsedData.netFollowers}
                      </div>
                    </div>
                  </div>

                  {/* Top Tippers */}
                  {previewResult.parsedData.topTippers.length > 0 && (
                    <div className="p-4 bg-white/5 rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Top Tippers</h4>
                      <div className="flex flex-wrap gap-2">
                        {previewResult.parsedData.topTippers.slice(0, 10).map((tipper, i) => (
                          <span key={i} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-sm">
                            {tipper.username}: {tipper.tokens}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Room Subjects */}
                  {previewResult.parsedData.roomSubjects.length > 0 && (
                    <div className="p-4 bg-white/5 rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Room Subjects</h4>
                      <ul className="text-sm text-white/70 space-y-1">
                        {previewResult.parsedData.roomSubjects.map((subject, i) => (
                          <li key={i} className="truncate">• {subject}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Theme */}
                  {previewResult.summary.theme && (
                    <div className="p-3 bg-mhc-primary/10 border border-mhc-primary/30 rounded-lg">
                      <span className="text-mhc-primary font-medium">Theme:</span>{' '}
                      <span className="text-white">{previewResult.summary.theme}</span>
                    </div>
                  )}

                  {/* Full markdown */}
                  <div className="relative">
                    <div className="absolute top-2 right-2 flex gap-2 z-10">
                      <button
                        onClick={() => previewResult.summary.full_markdown && copyToClipboard(previewResult.summary.full_markdown)}
                        className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm rounded-md transition-colors flex items-center gap-1 backdrop-blur-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Markdown
                      </button>
                    </div>
                    <div className="p-5 bg-mhc-surface-light border border-white/10 rounded-lg prose prose-invert prose-sm max-w-none
                      prose-headings:text-white prose-headings:font-semibold prose-headings:border-b prose-headings:border-white/10 prose-headings:pb-2 prose-headings:mb-3
                      prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                      prose-p:text-white/85 prose-p:leading-relaxed
                      prose-strong:text-mhc-primary prose-strong:font-bold
                      prose-ul:text-white/80 prose-li:text-white/80 prose-li:marker:text-mhc-primary
                      prose-a:text-mhc-primary prose-a:no-underline hover:prose-a:underline
                    ">
                      <ReactMarkdown>
                        {previewResult.summary.full_markdown || ''}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setPreviewResult(null);
                        setPreviewTranscript('');
                      }}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Analyze Another Transcript
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showNewBroadcastForm && !currentBroadcast && (
        <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg mb-5 p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Start New Broadcast</h3>
          <p className="text-white/60 mb-4">
            This will manually start a broadcast session. Use this when you're going live but want to track the session manually.
          </p>
          <button
            onClick={startBroadcast}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors"
          >
            Start Broadcast Now
          </button>
        </div>
      )}

      {/* AI Summary Panel */}
      {summaryBroadcastId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-mhc-surface border border-white/20 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-semibold text-white">AI Stream Summary</h3>
                {aiStatus && (
                  <p className="text-sm text-white/60 mt-1">
                    Using {aiStatus.model} {!aiStatus.available && '(not configured)'}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSummaryBroadcastId(null)}
                className="p-2 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {summaryError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {summaryError}
                </div>
              )}

              {!currentSummary ? (
                // Input mode - paste transcript
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Paste Chat Transcript
                    </label>
                    <textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      placeholder="Paste the full chat transcript from your stream here..."
                      rows={15}
                      className="w-full px-4 py-3 bg-mhc-surface-light border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-mhc-primary resize-y font-mono text-sm"
                    />
                    <p className="text-xs text-white/50 mt-2">
                      Copy the entire chat log from your Chaturbate broadcast and paste it above.
                      The AI will analyze it and generate a comprehensive summary.
                    </p>
                  </div>

                  <button
                    onClick={generateSummary}
                    disabled={!transcript.trim() || generatingSummary || !aiStatus?.available}
                    className={`w-full px-5 py-3 font-semibold rounded-lg transition-all ${
                      !transcript.trim() || generatingSummary || !aiStatus?.available
                        ? 'bg-white/10 text-white/40 cursor-not-allowed'
                        : 'bg-mhc-primary hover:bg-mhc-primary-dark text-white'
                    }`}
                  >
                    {generatingSummary ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating Summary...
                      </span>
                    ) : (
                      'Generate AI Summary'
                    )}
                  </button>
                </div>
              ) : (
                // Display mode - show summary
                <div className="space-y-4">
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold text-amber-400">{currentSummary.tokens_received}</div>
                      <div className="text-xs text-white/60">Tokens</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold text-blue-400">{currentSummary.unique_viewers || '-'}</div>
                      <div className="text-xs text-white/60">Unique Viewers</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold text-emerald-400">+{currentSummary.new_followers}</div>
                      <div className="text-xs text-white/60">New Followers</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg text-center">
                      <div className="text-lg font-bold text-red-400">-{currentSummary.lost_followers}</div>
                      <div className="text-xs text-white/60">Unfollows</div>
                    </div>
                  </div>

                  {/* Theme */}
                  {currentSummary.theme && (
                    <div className="p-3 bg-mhc-primary/10 border border-mhc-primary/30 rounded-lg">
                      <span className="text-mhc-primary font-medium">Theme:</span>{' '}
                      <span className="text-white">{currentSummary.theme}</span>
                    </div>
                  )}

                  {/* Full markdown */}
                  <div className="relative">
                    <div className="absolute top-2 right-2 flex gap-2 z-10">
                      <button
                        onClick={() => currentSummary.full_markdown && copyToClipboard(currentSummary.full_markdown)}
                        className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm rounded-md transition-colors flex items-center gap-1 backdrop-blur-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Markdown
                      </button>
                    </div>
                    <div className="p-5 bg-mhc-surface-light border border-white/10 rounded-lg prose prose-invert prose-sm max-w-none
                      prose-headings:text-white prose-headings:font-semibold prose-headings:border-b prose-headings:border-white/10 prose-headings:pb-2 prose-headings:mb-3
                      prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                      prose-p:text-white/85 prose-p:leading-relaxed
                      prose-strong:text-mhc-primary prose-strong:font-bold
                      prose-ul:text-white/80 prose-li:text-white/80 prose-li:marker:text-mhc-primary
                      prose-a:text-mhc-primary prose-a:no-underline hover:prose-a:underline
                    ">
                      <ReactMarkdown>
                        {currentSummary.full_markdown || ''}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Regenerate button */}
                  <div className="flex gap-3">
                    <button
                      onClick={regenerateSummary}
                      disabled={generatingSummary}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {generatingSummary ? 'Regenerating...' : 'Regenerate Summary'}
                    </button>
                    <button
                      onClick={() => {
                        setCurrentSummary(null);
                        setTranscript('');
                      }}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      New Transcript
                    </button>
                  </div>

                  <p className="text-xs text-white/40">
                    Generated {new Date(currentSummary.generated_at).toLocaleString()} using {currentSummary.ai_model}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Broadcasts List */}
      <div className="bg-mhc-surface/60 border border-white/10 rounded-lg shadow-lg">
        <div className="p-5 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Past Broadcasts</h2>
        </div>
        <div className="divide-y divide-white/10">
          {broadcasts.length === 0 ? (
            <div className="p-10 text-center text-white/60">
              No broadcasts recorded yet. Start your first broadcast to begin tracking!
            </div>
          ) : (
            broadcasts.map(broadcast => (
              <div key={broadcast.id} className="p-5">
                {editingId === broadcast.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-white font-medium">{formatDate(broadcast.started_at)}</span>
                        <span className="text-white/40 mx-2">-</span>
                        <span className="text-white/60">{formatDuration(broadcast.duration_minutes)}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-md transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-md transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-white/60 mb-1">Peak Viewers</label>
                        <input
                          type="number"
                          value={editForm.peak_viewers}
                          onChange={e => setEditForm({ ...editForm, peak_viewers: e.target.value })}
                          className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-white/60 mb-1">Total Tokens</label>
                        <input
                          type="number"
                          value={editForm.total_tokens}
                          onChange={e => setEditForm({ ...editForm, total_tokens: e.target.value })}
                          className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-white/60 mb-1">Followers Gained</label>
                        <input
                          type="number"
                          value={editForm.followers_gained}
                          onChange={e => setEditForm({ ...editForm, followers_gained: e.target.value })}
                          className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-white/60 mb-1">Summary</label>
                      <input
                        type="text"
                        value={editForm.summary}
                        onChange={e => setEditForm({ ...editForm, summary: e.target.value })}
                        placeholder="Brief summary of this broadcast..."
                        className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-white/60 mb-1">Tags (comma separated)</label>
                      <input
                        type="text"
                        value={editForm.tags}
                        onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                        placeholder="e.g., gaming, chill, late night"
                        className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-white/60 mb-1">Notes (detailed)</label>
                      <textarea
                        value={editForm.notes}
                        onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={4}
                        placeholder="Detailed notes about this broadcast..."
                        className="w-full px-3 py-2 bg-mhc-surface-light border border-white/20 rounded-md text-white focus:outline-none focus:border-mhc-primary resize-y"
                      />
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-white font-medium">{formatDate(broadcast.started_at)}</span>
                          <span className="text-white/40">-</span>
                          <span className="text-mhc-primary font-medium">{formatDuration(broadcast.duration_minutes)}</span>
                          {broadcast.auto_detected && (
                            <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              Auto-detected
                            </span>
                          )}
                        </div>
                        {broadcast.room_subject && (
                          <p className="text-white/60 text-sm">{broadcast.room_subject}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {aiStatus?.available && broadcast.ended_at && (
                          <button
                            onClick={() => openSummaryPanel(broadcast)}
                            className="px-3 py-1.5 bg-mhc-primary/20 hover:bg-mhc-primary/30 text-mhc-primary text-sm font-medium rounded-md transition-colors"
                          >
                            AI Summary
                          </button>
                        )}
                        <button
                          onClick={() => startEditing(broadcast)}
                          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteBroadcast(broadcast.id)}
                          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium rounded-md transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex gap-6 mb-3 text-sm">
                      <div>
                        <span className="text-white/50">Peak:</span>{' '}
                        <span className="text-blue-400 font-medium">{broadcast.peak_viewers || 0}</span>
                      </div>
                      <div>
                        <span className="text-white/50">Tokens:</span>{' '}
                        <span className="text-amber-400 font-medium">{broadcast.total_tokens?.toLocaleString() || 0}</span>
                      </div>
                      <div>
                        <span className="text-white/50">Followers:</span>{' '}
                        <span className="text-emerald-400 font-medium">+{broadcast.followers_gained || 0}</span>
                      </div>
                    </div>

                    {/* Tags */}
                    {broadcast.tags && broadcast.tags.length > 0 && (
                      <div className="flex gap-2 mb-3 flex-wrap">
                        {broadcast.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded text-xs bg-mhc-primary/20 text-mhc-primary border border-mhc-primary/30"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Summary */}
                    {broadcast.summary && (
                      <p className="text-white/80 mb-2">{broadcast.summary}</p>
                    )}

                    {/* Notes (expandable) */}
                    {broadcast.notes && (
                      <details className="mt-2">
                        <summary className="text-white/50 text-sm cursor-pointer hover:text-white/70">
                          View notes
                        </summary>
                        <div className="mt-2 p-3 bg-white/5 rounded-md text-white/70 text-sm whitespace-pre-wrap">
                          {broadcast.notes}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MyBroadcasts;
