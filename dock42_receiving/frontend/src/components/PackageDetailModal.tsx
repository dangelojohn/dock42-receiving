import React, { useState } from 'react';
import { Package, X, CheckCircle2, AlertTriangle, ArrowRight, Printer, QrCode, Tag, MapPin } from 'lucide-react';
import { PackageItem } from '../types';

interface PackageDetailModalProps {
  pkg: PackageItem | null;
  onClose: () => void;
  onUpdateShelf: (pkgId: string, newShelf: string) => Promise<boolean>;
  onToggleDamage: (pkgId: string) => Promise<boolean>;
}

export const PackageDetailModal: React.FC<PackageDetailModalProps> = ({
  pkg,
  onClose,
  onUpdateShelf,
  onToggleDamage,
}) => {
  const [shelfInput, setShelfInput] = useState(pkg?.shelfLocation ?? '');
  const [copiedBanner, setCopiedBanner] = useState(false);
  const [savingShelf, setSavingShelf] = useState(false);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [togglingDamage, setTogglingDamage] = useState(false);
  const [damageError, setDamageError] = useState<string | null>(null);

  if (!pkg) return null;

  const handleSaveShelf = async () => {
    setSavingShelf(true);
    setShelfError(null);
    const ok = await onUpdateShelf(pkg.id, shelfInput);
    setSavingShelf(false);
    if (ok) {
      setCopiedBanner(true);
      setTimeout(() => setCopiedBanner(false), 3000);
    } else {
      setShelfError('Failed to update shelf bin. Please try again.');
    }
  };

  const handleToggleDamageClick = async () => {
    setTogglingDamage(true);
    setDamageError(null);
    const ok = await onToggleDamage(pkg.id);
    setTogglingDamage(false);
    if (!ok) {
      setDamageError('Failed to update damage flag. Please try again.');
    }
  };

  const handlePrintLabel = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs select-none">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Package size={20} className="text-[#714B67]" />
            <div>
              <h3 className="font-headline font-bold text-base text-slate-900">{pkg.id}</h3>
              <p className="text-[10px] font-mono text-slate-500">PO: {pkg.poNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {copiedBanner && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold uppercase tracking-wider p-2.5 rounded-xl flex items-center gap-2 shadow-xs">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span>SHELF BIN UPDATED IN ODOO v19 CE</span>
          </div>
        )}

        {shelfError && (
          <div className="bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold uppercase tracking-wider p-2.5 rounded-xl flex items-center gap-2 shadow-xs">
            <AlertTriangle size={14} className="text-rose-600" />
            <span>{shelfError}</span>
          </div>
        )}

        {damageError && (
          <div className="bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold uppercase tracking-wider p-2.5 rounded-xl flex items-center gap-2 shadow-xs">
            <AlertTriangle size={14} className="text-rose-600" />
            <span>{damageError}</span>
          </div>
        )}

        {/* Status Badge */}
        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
          <span className="text-xs font-bold text-slate-500 uppercase">STATUS</span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
              pkg.status === 'STORED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : pkg.status === 'DAMAGED'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {pkg.status.replace('_', ' ')}
          </span>
        </div>

        {/* Image Preview if available */}
        {pkg.imageUrl && (
          <div className="w-full h-44 rounded-xl bg-slate-100 overflow-hidden border border-slate-200">
            <img src={pkg.imageUrl} alt={pkg.itemName} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Item & Vendor Details */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[10px] block uppercase font-bold">Item Description</span>
            <span className="font-semibold text-slate-900">{pkg.itemName}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[10px] block uppercase font-bold">Vendor / Supplier</span>
            <span className="font-semibold text-slate-900">{pkg.vendor}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[10px] block uppercase font-bold">Gross Weight</span>
            <span className="font-mono text-slate-900">{pkg.weightKg} kg</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[10px] block uppercase font-bold">Odoo Stock Ref</span>
            <span className="font-mono text-[#714B67] font-semibold">{pkg.odooPickingRef || '—'}</span>
          </div>
        </div>

        {/* Simulated Barcode Banner */}
        <div className="bg-slate-900 p-3.5 rounded-xl flex flex-col items-center justify-center gap-1 text-white shadow-xs">
          <div className="font-mono font-bold text-xs tracking-[0.3em] uppercase text-slate-200">
            ||||||| | ||||| |||| |||||| |||
          </div>
          <span className="font-mono text-[10px] font-bold text-slate-400">{pkg.id} • {pkg.poNumber}</span>
        </div>

        {/* Assign / Change Shelf Bin */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5">
            <MapPin size={14} className="text-[#714B67]" />
            ASSIGN / REASSIGN SHELF BIN
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={shelfInput}
              onChange={(e) => setShelfInput(e.target.value)}
              className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:border-[#714B67] focus:outline-none"
            />
            <button
              onClick={handleSaveShelf}
              disabled={savingShelf}
              className="px-3.5 py-2 bg-[#714B67] hover:bg-[#5E3F56] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg font-bold text-xs uppercase shadow-xs transition-colors"
            >
              {savingShelf ? 'SAVING...' : 'SAVE BIN'}
            </button>
          </div>
        </div>

        {/* Notes */}
        {pkg.notes && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-500 font-bold uppercase block mb-1">Receiving Inspection Log</span>
            <p className="text-slate-800 italic">{pkg.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <button
            onClick={handlePrintLabel}
            className="flex-1 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 font-bold text-xs uppercase flex items-center justify-center gap-1.5 shadow-xs transition-colors"
          >
            <Printer size={14} className="text-[#714B67]" />
            <span>PRINT DOCK TAG</span>
          </button>

          <button
            onClick={handleToggleDamageClick}
            disabled={togglingDamage}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase border flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              pkg.status === 'DAMAGED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle size={14} />
            <span>
              {togglingDamage
                ? 'UPDATING...'
                : pkg.status === 'DAMAGED'
                ? 'CLEAR DAMAGE FLAG'
                : 'FLAG DAMAGED'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
