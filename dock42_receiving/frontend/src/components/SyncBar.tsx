import React from 'react';
import { RefreshCw } from 'lucide-react';

interface SyncBarProps {
  queuedCount: number;
  isSyncing: boolean;
  onForceSync: () => void;
  lastSyncTime: string;
}

export const SyncBar: React.FC<SyncBarProps> = ({
  queuedCount,
  isSyncing,
  onForceSync,
  lastSyncTime,
}) => {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 bg-white rounded-xl border border-slate-200 shadow-xs select-none">
      <div className="flex items-center gap-2">
        <RefreshCw
          size={14}
          className={`text-[#714B67] ${isSyncing ? 'animate-spin' : ''}`}
        />
        <span className="text-xs text-slate-600 font-mono">
          {queuedCount > 0
            ? `${queuedCount} queued · syncing with Odoo v19 CE`
            : `Synced with Odoo CE (${lastSyncTime})`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            queuedCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
          }`}
        ></div>

        <button
          onClick={onForceSync}
          disabled={isSyncing}
          className="text-[10px] font-bold uppercase tracking-wider text-white bg-[#714B67] hover:bg-[#5E3F56] px-2.5 py-1 rounded-lg transition-colors shadow-xs"
        >
          {isSyncing ? 'SYNCING...' : 'SYNC NOW'}
        </button>
      </div>
    </div>
  );
};
