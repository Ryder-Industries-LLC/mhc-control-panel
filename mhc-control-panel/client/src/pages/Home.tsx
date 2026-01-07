import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api, LookupResponse } from '../api/client';
import { formatDate, formatNumber, formatNumberWithoutCommas, formatLabel, formatValue } from '../utils/formatting';
import { DateRangePreset, getDateRange, getPresetLabel, supportsComparison, getComparisonPreset } from '../utils/dateRanges';
// Home.css removed - fully migrated to Tailwind CSS

const Home: React.FC = () => {
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pasteType, setPasteType] = useState<'PM' | 'DM' | 'PROFILE' | 'NOTES'>('PM');
  const [showPasteField, setShowPasteField] = useState(false);
  const [rolePreference, setRolePreference] = useState<'MODEL' | 'VIEWER'>('MODEL');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('all_time');
  const [comparisonMode, setComparisonMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [apiRequest, setApiRequest] = useState<any>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  const handleLookup = async () => {
    if (!username && !pastedText) {
      setError('Please enter a username or paste text');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const dateRange = getDateRange(dateRangePreset);

      // Get comparison date range if in comparison mode
      let comparisonDateRange = undefined;
      if (comparisonMode && supportsComparison(dateRangePreset)) {
        const comparisonPreset = getComparisonPreset(dateRangePreset);
        if (comparisonPreset) {
          comparisonDateRange = getDateRange(comparisonPreset);
        }
      }

      const requestParams = {
        username: username || undefined,
        pastedText: pastedText || undefined,
        includeStatbate: true,
        role: rolePreference,
        dateRange: dateRange || undefined,
        comparisonDateRange: comparisonDateRange || undefined,
      };
      setApiRequest(requestParams);
      const data = await api.lookup(requestParams);
      setResult(data);
    } catch (err) {
      setError('Failed to lookup user. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Handle username from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const usernameParam = params.get('username');
    if (usernameParam && username !== usernameParam) {
      setUsername(usernameParam);
    }
  }, [location.search]);

  // Auto-trigger lookup when username is set from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const usernameParam = params.get('username');
    if (usernameParam && username === usernameParam && !result && !loading) {
      handleLookup();
    }
  }, [username, location.search]);

  // Autocomplete username search with debouncing
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

  // Helper function for interaction type styling
  const getInteractionStyles = (type: string) => {
    switch (type) {
      case 'TIP_EVENT':
        return { border: 'border-l-emerald-500', text: 'text-emerald-500' };
      case 'CHAT_MESSAGE':
        return { border: 'border-l-mhc-primary', text: 'text-mhc-primary' };
      case 'PRIVATE_MESSAGE':
        return { border: 'border-l-purple-400', text: 'text-purple-400' };
      case 'USER_ENTER':
        return { border: 'border-l-teal-500', text: 'text-mhc-text-dim' };
      case 'USER_LEAVE':
        return { border: 'border-l-gray-600', text: 'text-gray-500', opacity: 'opacity-40' };
      case 'FOLLOW':
        return { border: 'border-l-orange-500', text: 'text-orange-500' };
      default:
        return { border: 'border-l-mhc-primary', text: 'text-mhc-primary' };
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-5">
      <div className="text-center mb-10 py-8 border-b-2 border-mhc-primary">
        <h1 className="text-mhc-primary text-4xl font-bold m-0 mb-2">MHC Control Panel</h1>
        <p className="text-mhc-text-dim text-lg">Streaming Intelligence & Memory System</p>
      </div>

      <div className="bg-mhc-surface p-8 rounded-xl mb-8 shadow-lg">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-mhc-text m-0 text-xl font-semibold">Lookup User</h2>
          <div className="flex items-center gap-3">
            <label className="text-mhc-text-muted font-medium text-sm m-0">Role</label>
            <div className="inline-flex bg-mhc-surface-light rounded-full p-1 border-2 border-gray-600">
              <button
                type="button"
                className={`bg-transparent border-none px-6 py-2 rounded-full text-sm font-medium cursor-pointer transition-all min-w-[100px] text-center ${
                  rolePreference === 'MODEL'
                    ? 'bg-mhc-primary text-white font-semibold shadow-lg'
                    : 'text-mhc-text-dim hover:text-mhc-text-muted'
                }`}
                onClick={() => setRolePreference('MODEL')}
                disabled={loading}
              >
                Model
              </button>
              <button
                type="button"
                className={`bg-transparent border-none px-6 py-2 rounded-full text-sm font-medium cursor-pointer transition-all min-w-[100px] text-center ${
                  rolePreference === 'VIEWER'
                    ? 'bg-mhc-primary text-white font-semibold shadow-lg'
                    : 'text-mhc-text-dim hover:text-mhc-text-muted'
                }`}
                onClick={() => setRolePreference('VIEWER')}
                disabled={loading}
              >
                Viewer
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-mhc-text-muted mb-2 font-medium">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\//g, ''))}
            placeholder="Enter username..."
            disabled={loading}
            list="username-suggestions"
            autoComplete="off"
            className="w-full px-3 py-3 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-sm font-inherit focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/10"
          />
          <datalist id="username-suggestions">
            {usernameSuggestions.map((suggestion, idx) => (
              <option key={idx} value={suggestion} />
            ))}
          </datalist>
        </div>

        <div className="flex justify-between items-center mb-5">
          <button onClick={handleLookup} disabled={loading} className="bg-gradient-primary text-white border-none px-8 py-3 rounded-md text-base font-semibold cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mhc-primary/30 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none">
            {loading ? 'Looking up...' : 'Lookup'}
          </button>
          {!showPasteField && (
            <button
              type="button"
              onClick={() => setShowPasteField(true)}
              className="bg-transparent text-mhc-primary border border-mhc-primary px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:bg-mhc-primary hover:text-white disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              + Paste Text
            </button>
          )}
        </div>

        {showPasteField && (
          <div className="mb-5">
            <div className="flex justify-between items-center">
              <label className="block text-mhc-text-muted mb-2 font-medium">Or Paste Text</label>
              <button
                type="button"
                onClick={() => {
                  setShowPasteField(false);
                  setPastedText('');
                }}
                className="bg-transparent text-mhc-text-dim border border-gray-600 px-3 py-1 rounded text-xs cursor-pointer transition-all hover:bg-mhc-surface-light hover:border-mhc-primary hover:text-mhc-text-muted disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={loading}
              >
                Collapse
              </button>
            </div>

            <div className="flex gap-4 mb-3 py-2">
              {(['PM', 'DM', 'PROFILE', 'NOTES'] as const).map((type) => (
                <label key={type} className="flex items-center cursor-pointer text-mhc-text-muted font-normal text-sm m-0 hover:text-gray-200">
                  <input
                    type="radio"
                    name="pasteType"
                    value={type}
                    checked={pasteType === type}
                    onChange={(e) => setPasteType(e.target.value as typeof type)}
                    disabled={loading}
                    className="mr-1.5 w-4 h-4 cursor-pointer accent-mhc-primary"
                  />
                  {type === 'PROFILE' ? 'Profile' : type === 'NOTES' ? 'Notes' : type}
                </label>
              ))}
            </div>

            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste profile text, chat logs, etc..."
              rows={4}
              disabled={loading}
              className="w-full px-3 py-3 bg-mhc-surface-light border border-gray-600 rounded-md text-mhc-text text-sm font-inherit focus:outline-none focus:border-mhc-primary focus:ring-2 focus:ring-mhc-primary/10"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-400 text-white p-4 rounded-md mb-5">
          {error}
        </div>
      )}

      {result && (
        <div className="animate-fade-in">
          <h2 className="text-mhc-text mb-5 flex justify-between items-center">
            <span>Results</span>
            <label className="flex items-center gap-2 text-sm font-normal text-mhc-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showRawData}
                onChange={(e) => setShowRawData(e.target.checked)}
                className="w-4 h-4 cursor-pointer"
              />
              Show Raw Data
            </label>
          </h2>

          {/* Date Range Selector - Only show for MODEL role with Statbate data */}
          {rolePreference === 'MODEL' && result.latestSnapshot?.source?.includes('statbate_model') && (
            <div className="my-5 p-5 bg-mhc-surface-light rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <label className="text-mhc-text-muted font-semibold text-sm block">Date Range:</label>
                {supportsComparison(dateRangePreset) && (
                  <label className="flex items-center gap-2 text-sm font-normal text-mhc-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={comparisonMode}
                      onChange={(e) => {
                        setComparisonMode(e.target.checked);
                        // Auto-refresh when toggling comparison
                        setTimeout(() => handleLookup(), 100);
                      }}
                      disabled={loading}
                      className="w-4 h-4 cursor-pointer"
                    />
                    Compare with Previous Period
                  </label>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {(['all_time', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year'] as DateRangePreset[]).map((preset) => (
                  <button
                    key={preset}
                    className={`px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-all border-2 ${
                      dateRangePreset === preset
                        ? 'bg-mhc-primary border-mhc-primary text-white font-semibold'
                        : 'bg-mhc-surface border-gray-600 text-mhc-text-muted hover:bg-gray-600 hover:border-mhc-primary hover:text-mhc-text'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => {
                      setDateRangePreset(preset);
                      // Auto-refresh data with new date range
                      setTimeout(() => handleLookup(), 100);
                    }}
                    disabled={loading}
                  >
                    {getPresetLabel(preset)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showRawData && (
            <div className="mt-3 bg-black border border-mhc-surface-light rounded-md p-4 overflow-x-auto">
              <div className="mb-5 pb-2.5 border-b border-mhc-surface-light">
                <h4 className="text-mhc-primary m-0 mb-2.5">API Request</h4>
                <pre className="m-0 text-emerald-500 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{JSON.stringify(apiRequest, null, 2)}</pre>
              </div>
              {result.statbateApiUrl && (
                <div className="mb-5 pb-2.5 border-b border-mhc-surface-light">
                  <h4 className="text-mhc-primary m-0 mb-2.5">Statbate API URL</h4>
                  <pre className="m-0 text-emerald-500 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{result.statbateApiUrl}</pre>
                </div>
              )}
              <div>
                <h4 className="text-mhc-primary m-0 mb-2.5">API Response</h4>
                <pre className="m-0 text-emerald-500 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
              </div>
            </div>
          )}

          {result.extractedUsernames.length > 1 && (
            <div className="bg-mhc-surface-light p-5 rounded-lg mb-5">
              <h3 className="text-mhc-text mt-0 mb-3 text-lg">Extracted Usernames</h3>
              <div className="flex flex-wrap gap-2">
                {result.extractedUsernames.map((user, idx) => (
                  <span key={idx} className="bg-mhc-primary text-white px-3 py-1.5 rounded text-sm">{user}</span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-mhc-surface p-6 rounded-lg mb-5 border border-mhc-surface-light">
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0">
                <a
                  href={`https://chaturbate.com/${result.person.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mhc-primary no-underline font-semibold hover:text-indigo-400 hover:underline transition-colors"
                >
                  {result.person.username}
                </a>
              </h3>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase bg-mhc-primary text-white">{result.person.role}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {result.latestSnapshot?.normalized_metrics?.gender !== undefined && (
                <div className="flex flex-col gap-1">
                  <span className="text-mhc-text-dim font-medium text-sm">Gender</span>
                  <span className="text-mhc-text font-semibold text-sm">{formatValue(result.latestSnapshot.normalized_metrics.gender, 'gender')}</span>
                </div>
              )}
              {result.latestSnapshot?.normalized_metrics?.rank !== undefined && (
                <div className="flex flex-col gap-1">
                  <span className="text-mhc-text-dim font-medium text-sm">Rank</span>
                  <span className="text-mhc-text font-semibold text-sm">{formatValue(result.latestSnapshot.normalized_metrics.rank, 'rank')}</span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-mhc-text-dim font-medium text-sm">Last Seen</span>
                <span className="text-mhc-text font-semibold text-sm">{formatDate(result.person.last_seen_at)}</span>
              </div>
            </div>
          </div>

          {result.latestSnapshot && (
            <div className="bg-mhc-surface p-6 rounded-lg mb-5 border border-mhc-surface-light">
              <h3 className="text-mhc-text mt-0 mb-4 border-b-2 border-mhc-primary pb-2">Latest Snapshot</h3>
              <div className="flex justify-between mb-4 p-3 bg-mhc-surface-light rounded-md text-mhc-text-muted text-sm">
                <span>Source: {result.latestSnapshot.source}</span>
                <span>Last Captured: {formatDate(result.latestSnapshot.captured_at, { includeTime: false })}</span>
              </div>

              {result.latestSnapshot.normalized_metrics && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
                    {(() => {
                      const metrics = result.latestSnapshot.normalized_metrics;
                      const isViewer = result.latestSnapshot.source === 'statbate_member';

                      // Different metric orders for models vs viewers
                      const modelMetricOrder = [
                        'income_usd',
                        'income_tokens',
                        'session_count',
                        'total_duration_minutes',
                        'average_duration_minutes'
                      ];

                      const viewerMetricOrder = [
                        'all_time_tokens',
                        'last_tip_amount',
                        'models_tipped_2weeks',
                        'models_messaged_2weeks'
                      ];

                      const metricOrder = isViewer ? viewerMetricOrder : modelMetricOrder;

                      // Create ordered list
                      const orderedMetrics: [string, any][] = [];

                      // Add metrics in specified order
                      metricOrder.forEach(key => {
                        if (metrics[key] !== undefined) {
                          orderedMetrics.push([key, metrics[key]]);
                        }
                      });

                      // Add date fields for viewers
                      if (isViewer) {
                        if (metrics.first_tip_date) {
                          orderedMetrics.push(['first_tip_date', metrics.first_tip_date]);
                        }
                        if (metrics.last_tip_date) {
                          orderedMetrics.push(['last_tip_date', metrics.last_tip_date]);
                        }
                        if (metrics.first_message_date) {
                          orderedMetrics.push(['first_message_date', metrics.first_message_date]);
                        }
                      }

                      // Add First Seen, RID, and DID as metric cards
                      orderedMetrics.splice(4, 0, ['first_seen', result.person.first_seen_at]);
                      if (result.person.rid) {
                        orderedMetrics.push(['rid', result.person.rid]);
                      }
                      if (result.person.did) {
                        orderedMetrics.push(['did', result.person.did]);
                      }

                      return orderedMetrics.map(([key, value]) => (
                        <div key={key} className="flex flex-col p-4 bg-mhc-surface-light rounded-md gap-2">
                          <span className="text-mhc-text-dim font-medium text-sm">{formatLabel(key)}:</span>
                          <span className="text-mhc-text font-semibold text-2xl break-words">
                            {key === 'first_seen' ? formatDate(value, { includeTime: false }) :
                             key === 'first_tip_date' || key === 'last_tip_date' || key === 'first_message_date' ? formatDate(value, { includeTime: false }) :
                             key === 'rid' || key === 'did' ? formatNumberWithoutCommas(value as number) :
                             formatValue(value, key)}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Model Tags */}
                  {result.latestSnapshot.normalized_metrics.tags && (
                    <div className="flex flex-col p-4 bg-mhc-surface-light rounded-md gap-2 mt-4">
                      <span className="text-mhc-text-dim font-medium text-sm">Tags:</span>
                      <span className="text-mhc-text font-semibold text-2xl break-words">{formatValue(result.latestSnapshot.normalized_metrics.tags, 'tags')}</span>
                    </div>
                  )}

                  {/* Viewer: Models Tipped List */}
                  {result.latestSnapshot.source === 'statbate_member' && result.latestSnapshot.normalized_metrics.models_tipped_2weeks_list &&
                   Array.isArray(result.latestSnapshot.normalized_metrics.models_tipped_2weeks_list) &&
                   (result.latestSnapshot.normalized_metrics.models_tipped_2weeks_list as string[]).length > 0 && (
                    <div className="mt-4 p-3 bg-mhc-surface-light rounded-md">
                      <h4 className="text-mhc-text m-0 mb-2.5 text-sm">Models Tipped (Last 2 Weeks)</h4>
                      <div className="flex flex-wrap gap-2">
                        {(result.latestSnapshot.normalized_metrics.models_tipped_2weeks_list as string[]).map((model, idx) => (
                          <a key={idx} href={`/?username=${model}`} className="bg-mhc-primary text-white px-2.5 py-1 rounded text-sm no-underline transition-colors hover:bg-indigo-600 hover:underline">{model}</a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Viewer: Models Messaged List */}
                  {result.latestSnapshot.source === 'statbate_member' && result.latestSnapshot.normalized_metrics.models_messaged_2weeks_list &&
                   Array.isArray(result.latestSnapshot.normalized_metrics.models_messaged_2weeks_list) &&
                   (result.latestSnapshot.normalized_metrics.models_messaged_2weeks_list as string[]).length > 0 && (
                    <div className="mt-4 p-3 bg-mhc-surface-light rounded-md">
                      <h4 className="text-mhc-text m-0 mb-2.5 text-sm">Models Messaged (Last 2 Weeks)</h4>
                      <div className="flex flex-wrap gap-2">
                        {(result.latestSnapshot.normalized_metrics.models_messaged_2weeks_list as string[]).map((model, idx) => (
                          <a key={idx} href={`/?username=${model}`} className="bg-mhc-primary text-white px-2.5 py-1 rounded text-sm no-underline transition-colors hover:bg-indigo-600 hover:underline">{model}</a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Viewer: Per Day Tokens - Collapsible */}
                  {result.latestSnapshot.source === 'statbate_member' && result.latestSnapshot.normalized_metrics.per_day_tokens &&
                   Array.isArray(result.latestSnapshot.normalized_metrics.per_day_tokens) &&
                   (result.latestSnapshot.normalized_metrics.per_day_tokens as any[]).length > 0 && (
                    <details className="mt-4 p-3 bg-mhc-surface-light rounded-md">
                      <summary className="cursor-pointer list-none select-none">
                        <h4 className="text-mhc-text m-0 text-sm inline-flex items-center">
                          <span className="mr-2 text-xs transition-transform">▶</span>
                          Daily Token Activity ({(result.latestSnapshot.normalized_metrics.per_day_tokens as any[]).length} days)
                        </h4>
                      </summary>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-3 max-h-[300px] overflow-y-auto">
                        {(result.latestSnapshot.normalized_metrics.per_day_tokens as any[]).map((day: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center px-2.5 py-1.5 bg-mhc-surface rounded">
                            <span className="text-mhc-text-muted text-xs">{formatDate(day.date, { includeTime: false })}</span>
                            <span className="text-emerald-500 font-semibold text-sm">{formatNumber(day.tokens)} tokens</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}

              {/* Member Tips History */}
              {result.memberTips && result.memberTips.data && result.memberTips.data.length > 0 && (
                <details className="mt-4 p-3 bg-mhc-surface-light rounded-md" open>
                  <summary className="cursor-pointer list-none select-none">
                    <h4 className="text-mhc-text m-0 text-sm inline-flex items-center">
                      <span className="mr-2 text-xs transition-transform">▶</span>
                      Tip History ({result.memberTips.data.length} tips, ${result.memberTips.data.reduce((sum, tip) => sum + tip.usd, 0).toFixed(2)} total)
                    </h4>
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3 max-h-[400px] overflow-y-auto">
                    {result.memberTips.data.map((tip, idx) => (
                      <div key={idx} className="flex flex-col gap-1.5 p-2.5 bg-mhc-surface rounded border-l-[3px] border-l-emerald-500">
                        <div className="flex justify-between items-center gap-2">
                          {tip.model && (
                            <a href={`/?username=${tip.model}`} className="text-mhc-primary no-underline font-semibold text-sm transition-opacity hover:opacity-80 hover:underline">{tip.model}</a>
                          )}
                          <span className="text-mhc-text-dim text-xs whitespace-nowrap">{formatDate(tip.time)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-emerald-400 font-semibold text-sm">{formatNumber(tip.tokens)} tokens</span>
                          <span className="text-emerald-500 font-bold text-base px-1.5 py-0.5 bg-emerald-500/10 rounded">${tip.usd.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {result.delta && Object.keys(result.delta).length > 0 && !comparisonMode && (
                <div className="mt-5 p-4 bg-mhc-surface-light rounded-md">
                  <h4 className="text-mhc-text mt-0 mb-3">Changes Since Last Snapshot</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(result.delta)
                      .filter(([key]) => key !== 'tags' && key !== 'gender')
                      .map(([key, value]) => {
                        // Check if value is actually a number type (not null, not array, not object)
                        const isNumber = typeof value === 'number' && !isNaN(value);
                        const numValue = isNumber ? value : 0;

                        return (
                          <div key={key} className="flex justify-between">
                            <span className="text-mhc-text-muted">{formatLabel(key)}:</span>
                            <span className={`font-semibold ${isNumber && numValue > 0 ? 'text-emerald-500' : isNumber && numValue < 0 ? 'text-red-400' : 'text-mhc-text'}`}>
                              {value === null ? 'N/A' : isNumber ? (numValue > 0 ? `+${formatNumber(numValue)}` : formatNumber(numValue)) : formatValue(value, key)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Comparison View */}
              {comparisonMode && result.comparison && result.comparison.comparisonDelta && (
                <div className="mt-5 p-4 bg-mhc-surface-light rounded-md">
                  <h4 className="text-mhc-text mt-0 mb-3 text-base">
                    {getPresetLabel(getComparisonPreset(dateRangePreset) || 'last_week')} vs {getPresetLabel(dateRangePreset)}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(result.comparison.comparisonDelta)
                      .filter(([key]) => key !== 'tags' && key !== 'gender')
                      .map(([key, value]) => {
                        const isNumber = typeof value === 'number' && !isNaN(value);
                        const numValue = isNumber ? value : 0;

                        // Get values from both periods for display
                        const period1Value = result.comparison?.period1Snapshot?.normalized_metrics?.[key];
                        const period2Value = result.comparison?.period2Snapshot?.normalized_metrics?.[key];

                        return (
                          <div key={key} className="flex flex-col gap-1.5 p-2 bg-mhc-surface rounded">
                            <span className="text-mhc-text-muted font-medium text-sm">{formatLabel(key)}:</span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-gray-200 text-sm px-1.5 py-0.5 bg-gray-600 rounded">
                                {period1Value !== undefined ? formatValue(period1Value, key) : 'N/A'}
                              </span>
                              <span className="text-mhc-text-dim font-bold">→</span>
                              <span className="text-mhc-text font-semibold text-base px-1.5 py-0.5 bg-mhc-primary rounded">
                                {period2Value !== undefined ? formatValue(period2Value, key) : 'N/A'}
                              </span>
                              <span className={`text-sm font-medium px-1.5 py-0.5 rounded ${
                                isNumber && numValue > 0 ? 'text-emerald-400 bg-emerald-500/10' :
                                isNumber && numValue < 0 ? 'text-red-400 bg-red-500/10' :
                                'text-gray-200 bg-gray-600'
                              }`}>
                                {value === null ? 'N/A' : isNumber ? (numValue > 0 ? `+${formatNumber(numValue)}` : formatNumber(numValue)) : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {result.interactions.length > 0 && (
            <div className="bg-mhc-surface p-6 rounded-lg mb-5 border border-mhc-surface-light">
              <h3 className="text-mhc-text mt-0 mb-4 border-b-2 border-mhc-primary pb-2">Recent Interactions ({result.interactions.length})</h3>
              <div className="flex flex-col gap-3">
                {result.interactions.slice(0, 10).map((interaction) => {
                  const username = interaction.metadata?.username as string | undefined;
                  const fromUser = interaction.metadata?.fromUser as string | undefined;
                  const toUser = interaction.metadata?.toUser as string | undefined;

                  // For PRIVATE_MESSAGE, show direction using fromUser/toUser if available
                  let displayText = username || 'Unknown';
                  if (interaction.type === 'PRIVATE_MESSAGE' && fromUser && toUser) {
                    displayText = `${fromUser} to ${toUser}`;
                  } else if (interaction.type === 'PRIVATE_MESSAGE' && username) {
                    // Fallback for old data without fromUser/toUser
                    displayText = `${username} to hudson_cage`;
                  }

                  const styles = getInteractionStyles(interaction.type);

                  return (
                    <div key={interaction.id} className={`bg-mhc-surface-light p-4 rounded-md border-l-[3px] ${styles.border} ${styles.opacity || ''}`}>
                      <div className="flex justify-between mb-2">
                        <span className={`font-semibold text-sm ${styles.text}`}>
                          {displayText}
                          {username && <span className="text-mhc-text-muted font-medium uppercase text-xs ml-1"> - {interaction.type}</span>}
                        </span>
                        <span className="text-mhc-text text-xs">{formatDate(interaction.timestamp)}</span>
                      </div>
                      {interaction.content && (
                        <div className="text-gray-200 leading-relaxed">{interaction.content}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
