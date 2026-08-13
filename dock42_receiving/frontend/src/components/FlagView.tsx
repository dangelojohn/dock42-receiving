import React, { useState } from 'react';
import { AlertOctagon, Camera, Upload, CheckCircle2, ShieldAlert, FileText } from 'lucide-react';
import { PackageItem } from '../types';

interface FlagViewProps {
  packages: PackageItem[];
  onReportDamage: (
    pkgId: string,
    category: string,
    severity: string,
    notes: string,
    photoUrl?: string
  ) => Promise<boolean>;
}

export const FlagView: React.FC<FlagViewProps> = ({ packages, onReportDamage }) => {
  const [selectedPkgId, setSelectedPkgId] = useState<string>(packages[0]?.id ?? '');
  const [category, setCategory] = useState<string>('CRUSHED_BOX');
  const [severity, setSeverity] = useState<string>('MAJOR');
  const [notes, setNotes] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPkgId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const ok = await onReportDamage(selectedPkgId, category, severity, notes, photoUrl);
    setSubmitting(false);
    if (ok) {
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    } else {
      setSubmitError('Damage report failed to save to Odoo. Please try again.');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPhotoUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto flex flex-col gap-4 select-none">
      <div>
        <h2 className="text-lg font-bold font-headline text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <AlertOctagon size={20} className="text-rose-600" />
          FLAG DAMAGED SHIPMENT
        </h2>
        <p className="text-xs text-slate-500">
          File a damage report against a received package in Odoo v19 CE
        </p>
      </div>

      {submitted && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>DAMAGE REPORT SAVED — PACKAGE MARKED DAMAGED IN ODOO v19 CE</span>
        </div>
      )}

      {submitError && (
        <div className="bg-rose-50 text-rose-800 border border-rose-200 p-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-xs">
          <AlertOctagon size={16} className="text-rose-600" />
          <span>{submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Package Selector */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider font-headline">
            1. SELECT INBOUND PACKAGE
          </label>
          <select
            value={selectedPkgId}
            onChange={(e) => setSelectedPkgId(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:border-[#714B67]"
          >
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.id} — {pkg.itemName} ({pkg.vendor})
              </option>
            ))}
          </select>
        </div>

        {/* Damage Category */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-3">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider font-headline">
            2. DAMAGE CATEGORY
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'CRUSHED_BOX', label: 'Crushed Box' },
              { id: 'LIQUID_LEAK', label: 'Liquid Leak' },
              { id: 'MISSING_CONTENT', label: 'Missing Content' },
              { id: 'LABEL_UNREADABLE', label: 'Unreadable Label' },
              { id: 'SEAL_BROKEN', label: 'Broken Seal' },
            ].map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`p-2.5 rounded-lg text-xs font-bold uppercase tracking-wider border text-center transition-colors ${
                  category === cat.id
                    ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-3">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider font-headline">
            3. SEVERITY LEVEL
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'MINOR', label: 'MINOR (Acceptable)', color: 'border-emerald-300 text-emerald-700 bg-emerald-50' },
              { id: 'MAJOR', label: 'MAJOR (Hold Bin)', color: 'border-amber-300 text-amber-700 bg-amber-50' },
              { id: 'CRITICAL', label: 'CRITICAL (Quarantine)', color: 'border-rose-300 text-rose-700 bg-rose-50' },
            ].map((sev) => (
              <button
                type="button"
                key={sev.id}
                onClick={() => setSeverity(sev.id)}
                className={`p-2.5 rounded-lg text-xs font-bold uppercase tracking-wider border text-center transition-all ${
                  severity === sev.id
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                    : `${sev.color}`
                }`}
              >
                {sev.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photo Proof & Notes */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-3">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider font-headline">
            4. PHOTO ATTACHMENT & OPERATOR NOTES
          </label>

          {photoUrl ? (
            <div className="relative w-full h-40 rounded-xl bg-slate-100 overflow-hidden border border-slate-200">
              <img src={photoUrl} alt="Damage proof" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotoUrl(undefined)}
                className="absolute top-2 right-2 bg-slate-900/80 text-white text-xs px-2.5 py-1 rounded-lg"
              >
                Remove Photo
              </button>
            </div>
          ) : (
            <label className="p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-rose-500 transition-colors">
              <Camera size={24} className="text-rose-500" />
              <span className="text-xs font-bold text-slate-600 uppercase">CAP DAMAGE PHOTO</span>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          )}

          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe outer carton condition, seal state, liquid leaks, or carrier driver notes..."
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-[#714B67]"
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={submitting || !selectedPkgId}
          className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99]"
        >
          <ShieldAlert size={18} />
          <span>{submitting ? 'SAVING TO ODOO...' : 'FLAG DAMAGED IN ODOO'}</span>
        </button>
      </form>
    </div>
  );
};
