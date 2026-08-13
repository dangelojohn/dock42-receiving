import React from 'react';
import { MapPin, X, Check } from 'lucide-react';
import { DockLocation } from '../types';

interface LocationModalProps {
  locations: DockLocation[];
  currentLocation: DockLocation;
  onSelectLocation: (loc: DockLocation) => void;
  onClose: () => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  locations,
  currentLocation,
  onSelectLocation,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs select-none">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 flex flex-col gap-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-[#714B67]" />
            <h3 className="font-headline font-bold text-base text-slate-900 uppercase tracking-wide">
              SELECT DOCK RECEIVING BAY
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {locations.map((loc) => {
            const isSelected = loc.id === currentLocation.id;
            return (
              <button
                key={loc.id}
                onClick={() => {
                  onSelectLocation(loc);
                  onClose();
                }}
                className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                  isSelected
                    ? 'bg-[#714B67]/10 border-[#714B67] text-slate-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col text-left">
                  <span className="font-bold font-headline text-sm text-slate-900">{loc.name}</span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Code: {loc.code} • Capacity: {loc.capacityUsed}%
                  </span>
                </div>

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-[#714B67] text-white flex items-center justify-center shadow-xs">
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
