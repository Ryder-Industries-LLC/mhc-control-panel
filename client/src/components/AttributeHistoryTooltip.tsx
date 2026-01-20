import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AttributeHistoryEntry } from '../types/attributes';

interface AttributeHistoryTooltipProps {
  /** Username to fetch history for */
  username: string;
  /** Optional: Filter to specific attribute key */
  attributeKey?: string;
  /** The element to wrap with tooltip trigger */
  children: React.ReactNode;
  /** Max entries to show (default 5) */
  maxEntries?: number;
  /** Additional CSS classes for the wrapper */
  className?: string;
}

/**
 * AttributeHistoryTooltip - Hover tooltip showing recent attribute changes
 *
 * Per spec: "Tooltip on hover - Quick view of last 5 changes with timestamps"
 * Fetches history on hover with debounce to prevent excessive API calls
 */
export const AttributeHistoryTooltip: React.FC<AttributeHistoryTooltipProps> = ({
  username,
  attributeKey,
  children,
  maxEntries = 5,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [history, setHistory] = useState<AttributeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async () => {
    if (fetched || loading) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: maxEntries.toString() });
      if (attributeKey) {
        params.append('key', attributeKey);
      }
      const response = await fetch(`/api/attributes/person/${username}/history?${params}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
        setFetched(true);
      }
    } catch (err) {
      console.error('Error fetching attribute history:', err);
    } finally {
      setLoading(false);
    }
  }, [username, attributeKey, maxEntries, fetched, loading]);

  const handleMouseEnter = () => {
    // Debounce to prevent flickering
    hoverTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      fetchHistory();
    }, 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsVisible(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Reset fetched state when username changes
  useEffect(() => {
    setFetched(false);
    setHistory([]);
  }, [username]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isVisible && (
        <div
          ref={tooltipRef}
          className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64"
        >
          <div className="bg-mhc-dark border border-white/20 rounded-lg shadow-xl p-3">
            <div className="text-xs font-semibold text-white/70 mb-2 border-b border-white/10 pb-1">
              Recent Changes
            </div>

            {loading ? (
              <div className="text-white/50 text-xs text-center py-2">
                <div className="animate-spin w-3 h-3 border border-white/30 border-t-white/70 rounded-full mx-auto" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-white/40 text-xs text-center py-2">
                No history available
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between text-xs gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-white/80 font-medium">
                        {entry.label || entry.attributeKey}
                      </span>
                      <span className="text-white/50 mx-1">→</span>
                      {entry.newValue ? (
                        <span className="text-emerald-400">on</span>
                      ) : (
                        <span className="text-red-400">off</span>
                      )}
                    </div>
                    <div className="text-white/40 text-[10px] whitespace-nowrap">
                      {formatDate(entry.changedAt)} {formatTime(entry.changedAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Arrow pointing down */}
            <div className="absolute left-1/2 transform -translate-x-1/2 -bottom-2">
              <div className="border-8 border-transparent border-t-mhc-dark" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttributeHistoryTooltip;
