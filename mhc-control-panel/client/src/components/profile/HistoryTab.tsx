import React, { useState, useEffect } from 'react';

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

type HistorySubTab = 'messaged' | 'tipped';

interface HistoryTabProps {
  username: string;
}

const TOKEN_ACTIVITY_PER_PAGE = 31;

export const HistoryTab: React.FC<HistoryTabProps> = ({ username }) => {
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historySubTab, setHistorySubTab] = useState<HistorySubTab>('tipped');
  const [tokenActivityPage, setTokenActivityPage] = useState(0);

  useEffect(() => {
    if (!username) return;

    setLoading(true);
    setError(null);

    fetch(`/api/profile/${username}/member-info`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch member info');
        }
        return response.json();
      })
      .then(response => {
        // API returns { data: {...}, meta: {...} }
        setMemberInfo(response.data);
      })
      .catch(err => {
        setError(err.message || 'Failed to load member info');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [username]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-mhc-text-muted">Loading member info from Statbate...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/20 border-l-4 border-red-500 text-red-300 px-4 py-3 rounded-md mb-5">
        <strong className="font-bold mr-1">Error:</strong> {error}
      </div>
    );
  }

  if (!memberInfo) {
    return (
      <p className="text-mhc-text-muted">No member history available.</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats - Reordered: All-Time | Models Tipped | Last Tip | First Tip | First Message */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-emerald-500">
          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">All-Time Tokens</span>
          <span className="block text-emerald-400 text-base font-semibold">
            {(memberInfo.all_time_tokens ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-blue-500">
          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Models Tipped</span>
          <span className="block text-blue-400 text-base font-semibold">
            {memberInfo.models_tipped_2weeks ?? 0}
          </span>
        </div>
        <div className="p-4 bg-mhc-surface-light rounded-md border-l-4 border-yellow-500">
          <span className="block font-semibold text-mhc-text-muted text-sm mb-1">Last Tip</span>
          <span className="block text-yellow-400 text-base font-semibold">
            {(memberInfo.last_tip_amount ?? 0) > 0 ? (
              <>
                {(memberInfo.last_tip_amount ?? 0).toLocaleString()} tokens
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
          Models Tipped ({memberInfo.models_tipped_2weeks ?? 0})
        </button>
        <button
          onClick={() => setHistorySubTab('messaged')}
          className={`px-4 py-2 rounded-t-md font-medium transition-all ${
            historySubTab === 'messaged'
              ? 'bg-mhc-primary text-white'
              : 'text-mhc-text-muted hover:bg-mhc-surface-light hover:text-mhc-text'
          }`}
        >
          Models Messaged ({memberInfo.models_messaged_2weeks ?? 0})
        </button>
      </div>

      {/* Sub-tab content */}
      <div className="mt-4">
        {historySubTab === 'messaged' && (
          <div>
            {(memberInfo.models_messaged_2weeks_list ?? []).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {(memberInfo.models_messaged_2weeks_list ?? []).map((modelUsername) => (
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
            {(memberInfo.models_tipped_2weeks_list ?? []).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {(memberInfo.models_tipped_2weeks_list ?? []).map((modelUsername) => (
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
  );
};

export default HistoryTab;
