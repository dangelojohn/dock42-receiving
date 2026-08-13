import React from 'react';
import { MapPin, Wifi, WifiOff, LayoutGrid } from 'lucide-react';
import { DockLocation } from '../types';

interface HeaderProps {
  currentLocation: DockLocation;
  onOpenLocationModal: () => void;
  isOnline: boolean;
  onToggleOnline: () => void;
  queuedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentLocation,
  onOpenLocationModal,
  isOnline,
  onToggleOnline,
  queuedCount,
}) => {
  return (
    <header className="bg-[#714B67] text-white fixed top-0 w-full z-50 flex items-center justify-between px-4 h-12 shadow-md select-none">
      <div className="flex items-center gap-3">
        {/* App Switcher Grid Icon */}
        <div className="grid grid-cols-3 gap-0.5 p-1 bg-white/20 rounded cursor-pointer hover:bg-white/30 transition-colors">
          <div className="w-1 h-1 bg-white rounded-xs"></div><div className="w-1 h-1 bg-white rounded-xs"></div><div className="w-1 h-1 bg-white rounded-xs"></div>
          <div className="w-1 h-1 bg-white rounded-xs"></div><div className="w-1 h-1 bg-white rounded-xs"></div><div className="w-1 h-1 bg-white rounded-xs"></div>
          <div className="w-1 h-1 bg-white rounded-xs"></div><div className="w-1 h-1 bg-white rounded-xs"></div><div className="w-1 h-1 bg-white rounded-xs"></div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tight text-base font-headline">
            Odoo <span className="font-normal opacity-90 text-sm">v19CE</span>
          </span>
          <span className="text-white/40 font-light">|</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-white/90 hidden sm:inline">
            {currentLocation.code || 'DOCK-42'} RECEIVING
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* PWA Network & Offline Mode Simulator Badge */}
        <button
          onClick={onToggleOnline}
          title={isOnline ? 'Online - Odoo v19 CE connected' : 'Offline mode - Actions queueing locally'}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
            isOnline
              ? 'bg-emerald-500/20 text-white border-emerald-400/30'
              : 'bg-amber-500/30 text-amber-100 border-amber-300/40 animate-pulse'
          }`}
        >
          {isOnline ? (
            <>
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="hidden sm:inline">PWA Active: Offline Ready</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-amber-200" />
              <span>Offline Queue ({queuedCount})</span>
            </>
          )}
        </button>

        {/* Location Picker Button */}
        <button
          onClick={onOpenLocationModal}
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 flex items-center gap-1 text-xs font-medium"
          title="Change Dock Bay / Location"
        >
          <MapPin size={16} />
          <span className="hidden md:inline font-mono text-[11px]">{currentLocation.code}</span>
        </button>

        {/* User Avatar */}
        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center border-2 border-white/20">
          PN
        </div>
      </div>
    </header>
  );
};
