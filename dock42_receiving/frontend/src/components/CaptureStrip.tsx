import React from 'react';
import { CheckCircle2, Radio, Circle } from 'lucide-react';
import { CaptureStep } from '../types';

interface CaptureStripProps {
  currentStep: CaptureStep;
  onSelectStep: (step: CaptureStep) => void;
  onTriggerCapture: () => void;
  isScanningAI: boolean;
}

export const CaptureStrip: React.FC<CaptureStripProps> = ({
  currentStep,
  onSelectStep,
  onTriggerCapture,
  isScanningAI,
}) => {
  return (
    <section className="p-4 bg-white border-b border-slate-200 select-none shadow-xs">
      <div className="flex gap-3 w-full">
        {/* Segment 1: LABEL */}
        <button
          onClick={() => onSelectStep('LABEL')}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 px-2 rounded-xl relative overflow-hidden transition-all min-h-[64px] border ${
            currentStep === 'LABEL'
              ? 'bg-[#714B67]/10 border-[#714B67] text-[#714B67] shadow-sm'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          <CheckCircle2 className="text-emerald-600 mb-1 w-5 h-5" />
          <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">
            1. LABEL
          </span>
          <span className="text-[8px] text-emerald-600 uppercase tracking-widest font-bold">
            DONE
          </span>
        </button>

        {/* Segment 2: PACKAGE (ACTIVE / TAP TO CAPTURE) */}
        <button
          disabled={isScanningAI}
          onClick={() => {
            if (isScanningAI) return;
            onSelectStep('PACKAGE');
            onTriggerCapture();
          }}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 px-2 rounded-xl relative overflow-hidden transition-all min-h-[64px] border-2 ${
            currentStep === 'PACKAGE'
              ? 'bg-[#714B67] text-white border-[#714B67] shadow-md scale-[1.02]'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#714B67]'
          }`}
        >
          <Radio className={`${currentStep === 'PACKAGE' ? 'text-white' : 'text-[#714B67]'} mb-1 w-5 h-5 animate-pulse`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${currentStep === 'PACKAGE' ? 'text-white' : 'text-slate-800'}`}>
            2. PACKAGE
          </span>
          <span className={`text-[8px] font-bold uppercase tracking-widest ${currentStep === 'PACKAGE' ? 'text-purple-200 animate-pulse' : 'text-[#714B67]'}`}>
            TAP TO CAPTURE
          </span>
        </button>

        {/* Segment 3: SHELF (PENDING) */}
        <button
          onClick={() => onSelectStep('SHELF')}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 px-2 rounded-xl relative overflow-hidden transition-all min-h-[64px] border ${
            currentStep === 'SHELF'
              ? 'bg-amber-50 border-amber-400 text-amber-800 shadow-sm'
              : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <Circle className="text-slate-400 mb-1 w-5 h-5" />
          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
            3. SHELF
          </span>
          <span className="text-[8px] text-amber-600 uppercase tracking-widest font-bold">
            ASSIGN BIN
          </span>
        </button>
      </div>
    </section>
  );
};
