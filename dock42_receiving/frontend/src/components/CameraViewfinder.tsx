import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Camera, Upload, RefreshCw, Zap, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PackageItem } from '../types';

interface CameraViewfinderProps {
  onCaptureScan: (scannedData?: Partial<PackageItem>) => void;
  isScanningAI: boolean;
}

export interface CameraViewfinderHandle {
  triggerScan: () => void;
}

export const CameraViewfinder = forwardRef<CameraViewfinderHandle, CameraViewfinderProps>(({
  onCaptureScan,
  isScanningAI,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCapturingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [useRealCamera, setUseRealCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [lastScannedBanner, setLastScannedBanner] = useState<string | null>(null);

  // Initialize or stop real camera stream
  useEffect(() => {
    let cancelled = false;
    if (useRealCamera) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
          setCameraError(null);
        })
        .catch((err) => {
          console.warn('Camera access error:', err);
          setCameraError('Camera access unavailable. Using high-contrast dock viewfinder.');
          setUseRealCamera(false);
        });
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [useRealCamera]);

  // Trigger snapshot or AI Label Scan
  const handleTriggerScan = async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    try {
      let imageBase64: string | undefined = undefined;

      // Capture frame from real video if active
      if (useRealCamera && videoRef.current) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth || 640;
          canvas.height = videoRef.current.videoHeight || 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
          }
        } catch (e) {
          console.warn('Canvas capture error:', e);
        }
      }

      // Call the real Odoo AI scanner endpoint
      try {
        const res = await fetch('/dock42/api/scan-label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call',
            params: { image_base64: imageBase64?.replace(/^data:image\/\w+;base64,/, '') },
          }),
        });
        const body = await res.json();
        const data = body.result;
        if (data?.success) {
          setLastScannedBanner(`Scanned ${data.vendor}`);
          setTimeout(() => setLastScannedBanner(null), 4000);
          onCaptureScan({
            poNumber: data.po_number,
            vendor: data.vendor,
            itemName: data.item_name,
            weightKg: data.weight_kg,
            shelfLocation: data.shelf_location,
            status: data.is_damaged ? 'DAMAGED' : 'SHELF_PENDING',
            notes: data.notes,
          });
        } else {
          setCameraError(data?.error || 'Scan failed.');
        }
      } catch (e) {
        setCameraError('Scan request failed: ' + e);
      }
    } finally {
      isCapturingRef.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    triggerScan: handleTriggerScan,
  }));

  // Handle uploaded photo for OCR scan
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const res = await fetch('/dock42/api/scan-label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call',
            params: {
              image_base64: base64.replace(/^data:image\/\w+;base64,/, ''),
              mime_type: file.type,
            },
          }),
        });
        const body = await res.json();
        const data = body.result;
        if (data?.success) {
          setLastScannedBanner(`AI OCR extracted (${data.vendor})`);
          setTimeout(() => setLastScannedBanner(null), 4000);
          onCaptureScan({
            poNumber: data.po_number,
            vendor: data.vendor,
            itemName: data.item_name,
            weightKg: data.weight_kg,
            shelfLocation: data.shelf_location,
            status: data.is_damaged ? 'DAMAGED' : 'SHELF_PENDING',
            imageUrl: base64,
            notes: data.notes,
          });
        } else {
          setCameraError(data?.error || 'Scan failed.');
        }
      } catch (err) {
        setCameraError('Scan request failed: ' + err);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="relative w-full h-[320px] sm:h-[360px] bg-[#0d1015] overflow-hidden border-b border-[#2f2923] flex items-center justify-center select-none group">
      {/* Real Video Stream or Static Simulated Dock Background */}
      {useRealCamera ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover grayscale brightness-90 contrast-125"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full opacity-60 mix-blend-luminosity">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCTVViFQ-YrNH0tzGY2keqTpxUW_u6dFDKZsfpzvm70Z8a2V5-ts6gHkKCa1XbkIUV9Yato_GGPVLO6foqBCeCWowJxJAAG_XbTgo9m4PUCgZaAGwtT0gW_BpTlonvTlvn45_6JPNSBb5jED4jhLBSWPLFua7knKvvO-pwCWtjOvRzfeXkl6HmuqYQ4lA5KPCxhMS3eJSMq_vTJmUPBmd71QzxmsJAfsh8vyzQBAKwH_K_zIvHJpCcX5fytmOA7UrJ8bjK7UW5IFfg1"
            alt="Warehouse camera view"
            className="w-full h-full object-cover grayscale"
          />
        </div>
      )}

      {/* Viewfinder Corners */}
      <div className="viewfinder-corner tl-corner border-[#714B67]"></div>
      <div className="viewfinder-corner tr-corner border-[#714B67]"></div>
      <div className="viewfinder-corner bl-corner border-[#714B67]"></div>
      <div className="viewfinder-corner br-corner border-[#714B67]"></div>

      {/* Animated Scan Laser Beam */}
      <div className="absolute w-3/4 h-[2px] bg-[#714B67] shadow-[0_0_12px_rgba(113,75,103,0.9)] opacity-80 animate-pulse pointer-events-none"></div>

      {/* Top Camera Controls Overlay */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <button
          onClick={() => setUseRealCamera(!useRealCamera)}
          className="p-2 rounded-lg bg-slate-900/80 text-white border border-slate-700/60 backdrop-blur-sm hover:bg-slate-800 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
          title="Toggle Device Camera"
        >
          <Camera size={14} className="text-purple-300" />
          <span className="hidden sm:inline">{useRealCamera ? 'LIVE CAM' : 'SIM CAM'}</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg bg-slate-900/80 text-white border border-slate-700/60 backdrop-blur-sm hover:bg-slate-800 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
          title="Upload photo of barcode label for Gemini AI OCR scan"
        >
          <Upload size={14} className="text-blue-400" />
          <span className="hidden sm:inline">UPLOAD</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* Success / Scanned Banner Notification */}
      {lastScannedBanner && (
        <div className="absolute top-12 left-0 w-full z-40 px-4 animate-bounce">
          <div className="bg-emerald-900/90 text-emerald-200 border border-emerald-500/40 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 justify-center backdrop-blur-sm">
            <CheckCircle2 size={16} />
            <span>{lastScannedBanner}</span>
          </div>
        </div>
      )}

      {/* Center Scan Text */}
      <div className="absolute bottom-4 left-0 w-full text-center z-20 px-4">
        <div className="bg-slate-900/90 backdrop-blur-md inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-widest text-white border border-slate-700/60 shadow-xl">
          <Sparkles size={14} className="text-purple-300 animate-spin" />
          <span>{isScanningAI ? 'AI OCR ANALYZING LABEL...' : 'HOLD STEADY TO SCAN PACKAGE'}</span>
        </div>
      </div>

      {cameraError && (
        <div className="absolute bottom-16 z-20 text-[10px] text-[#fabb6c] bg-[#351000]/90 px-3 py-1 rounded border border-[#653e00]">
          {cameraError}
        </div>
      )}
    </section>
  );
});
