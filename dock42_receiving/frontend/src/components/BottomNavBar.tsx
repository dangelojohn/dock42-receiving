import React from 'react';
import { Scan, Package, RefreshCw, AlertOctagon } from 'lucide-react';
import { ActiveTab } from '../types';

interface BottomNavBarProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  flaggedCount: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onChangeTab,
  flaggedCount,
}) => {
  return (
    <nav className="bg-white border-t border-slate-200 fixed bottom-0 w-full z-40 flex justify-around items-center px-2 py-2 select-none pb-safe shadow-lg">
      {/* SCAN TAB */}
      <button
        onClick={() => onChangeTab('scan')}
        className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 min-w-[72px] min-h-[48px] transition-all active:scale-95 ${
          activeTab === 'scan'
            ? 'bg-[#714B67] text-white shadow-sm font-semibold'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <Scan size={20} className="mb-0.5" />
        <span className="text-[10px] uppercase font-bold tracking-wider">Scan</span>
      </button>

      {/* INBOUND TAB */}
      <button
        onClick={() => onChangeTab('inbound')}
        className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 min-w-[72px] min-h-[48px] transition-all active:scale-95 ${
          activeTab === 'inbound'
            ? 'bg-[#714B67] text-white shadow-sm font-semibold'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <Package size={20} className="mb-0.5" />
        <span className="text-[10px] uppercase font-bold tracking-wider">Inbound</span>
      </button>

      {/* SYNC TAB */}
      <button
        onClick={() => onChangeTab('sync')}
        className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 min-w-[72px] min-h-[48px] transition-all active:scale-95 ${
          activeTab === 'sync'
            ? 'bg-[#714B67] text-white shadow-sm font-semibold'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <RefreshCw size={20} className="mb-0.5" />
        <span className="text-[10px] uppercase font-bold tracking-wider">Sync</span>
      </button>

      {/* FLAG TAB */}
      <button
        onClick={() => onChangeTab('flag')}
        className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 min-w-[72px] min-h-[48px] relative transition-all active:scale-95 ${
          activeTab === 'flag'
            ? 'bg-[#714B67] text-white shadow-sm font-semibold'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <AlertOctagon size={20} className="mb-0.5 text-rose-500" />
        <span className="text-[10px] uppercase font-bold tracking-wider">Flag</span>
        {flaggedCount > 0 && (
          <span className="absolute top-1 right-2.5 bg-rose-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-xs">
            {flaggedCount}
          </span>
        )}
      </button>
    </nav>
  );
};
