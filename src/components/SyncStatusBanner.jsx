import { useEffect, useState } from 'react';
import { CircleDot, RefreshCw, AlertTriangle } from 'lucide-react';

function timeAgo(date) {
  if (!date) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Small, non-intrusive indicator of whether the dashboard is actually
// connected to the live database. Shown as a floating pill so it never
// disturbs FleetPulseDashboard's own layout.
export default function SyncStatusBanner({ status, error, lastSynced, onRetry }) {
  // Re-render every few seconds so "synced Xs ago" keeps counting up.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {status === 'error' ? (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-bold shadow-lg hover:bg-rose-700 transition-colors"
          title={error || 'Could not reach the live database'}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Sync error — tap to retry
        </button>
      ) : status === 'loading' ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-lg">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Connecting to live data…
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-lg backdrop-blur">
          <CircleDot className="w-3.5 h-3.5 text-emerald-500" />
          Live{lastSynced ? ` • synced ${timeAgo(lastSynced)}` : ''}
        </div>
      )}
    </div>
  );
}
