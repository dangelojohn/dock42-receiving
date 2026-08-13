import React from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import { PackageItem } from '../types';

interface ArrivedTodayListProps {
  packages: PackageItem[];
  onSelectPackage: (pkg: PackageItem) => void;
}

export const ArrivedTodayList: React.FC<ArrivedTodayListProps> = ({
  packages,
  onSelectPackage,
}) => {
  return (
    <div className="flex flex-col gap-2 select-none">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mt-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-headline">
          ARRIVED TODAY ({packages.length})
        </h3>
        <span className="text-[10px] text-[#714B67] font-mono font-bold uppercase">Dock-42 Realtime</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {packages.map((item) => {
          let statusBadge = (
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                STORED
              </span>
            </div>
          );

          if (item.status === 'SHELF_PENDING') {
            statusBadge = (
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                  SHELF PENDING
                </span>
              </div>
            );
          } else if (item.status === 'DAMAGED') {
            statusBadge = (
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                  DAMAGED
                </span>
              </div>
            );
          } else if (item.status === 'IN_TRANSIT') {
            statusBadge = (
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                  IN TRANSIT
                </span>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              onClick={() => onSelectPackage(item)}
              className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-100 shadow-xs hover:border-slate-300 active:bg-slate-50 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 border border-slate-200 shrink-0">
                  {item.status === 'DAMAGED' ? (
                    <AlertTriangle className="text-rose-500 w-5 h-5" />
                  ) : (
                    <Package className="text-slate-700 w-5 h-5" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold font-headline text-slate-900 text-sm group-hover:text-[#714B67] transition-colors">
                    {item.id}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate max-w-[180px] sm:max-w-[280px]">
                    {item.itemName}
                  </span>
                  {statusBadge}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-slate-400 font-mono">{item.timeReceived}</span>
                <span className="text-[10px] text-[#714B67] font-mono font-semibold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                  {item.shelfLocation}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
