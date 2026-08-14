import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CameraViewfinder, CameraViewfinderHandle } from './components/CameraViewfinder';
import { CaptureStrip } from './components/CaptureStrip';
import { SyncBar } from './components/SyncBar';
import { ArrivedTodayList } from './components/ArrivedTodayList';
import { BottomNavBar } from './components/BottomNavBar';
import { InboundView } from './components/InboundView';
import { SyncView } from './components/SyncView';
import { FlagView } from './components/FlagView';
import { PackageDetailModal } from './components/PackageDetailModal';
import { LocationModal } from './components/LocationModal';

import {
  PackageItem,
  ActiveTab,
  CaptureStep,
  DockLocation,
  OdooConfig,
} from './types';
import {
  INITIAL_PACKAGES,
  INITIAL_LOCATIONS,
  DEFAULT_ODOO_CONFIG,
} from './data/initialData';
import {
  getStoredPackages,
  savePackagesToLocal,
  registerServiceWorker,
  triggerLocalPushNotification,
} from './utils/indexedDB';
import { odooCall } from './utils/odooRpc';

function generateUuid(): string {
  // crypto.randomUUID() is a secure-context-only browser API — it's
  // undefined (and throws if called) on a plain http:// origin, which is
  // common for internal Odoo deployments. Fall back to a non-crypto but
  // perfectly adequate idempotency key in that case.
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'dock42-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

// FlagView's UI uses display-friendly uppercase ids for damage category/
// severity; the backend's Selection fields use lowercase snake_case keys
// (and "CRITICAL" maps to the model's "critical_quarantine", not a plain
// lowercase of itself) — map explicitly rather than relying on the two
// vocabularies staying accidentally in sync.
function mapDamageCategoryToBackend(uiValue: string): string {
  return uiValue.toLowerCase();
}
function mapDamageSeverityToBackend(uiValue: string): string {
  if (uiValue === 'CRITICAL') return 'critical_quarantine';
  return uiValue.toLowerCase();
}

export default function App() {
  const [packages, setPackages] = useState<PackageItem[]>(() =>
    getStoredPackages(INITIAL_PACKAGES)
  );
  const [locations] = useState<DockLocation[]>(INITIAL_LOCATIONS);
  const [currentLocation, setCurrentLocation] = useState<DockLocation>(
    INITIAL_LOCATIONS[0]
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan');
  const [currentStep, setCurrentStep] = useState<CaptureStep>('PACKAGE');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isScanningAI, setIsScanningAI] = useState<boolean>(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageItem | null>(
    null
  );
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [odooConfig, setOdooConfig] = useState<OdooConfig>(DEFAULT_ODOO_CONFIG);
  // Visible error surface — the notification-permission path in indexedDB.ts
  // is opt-in-only and (pre-I1-fix) could never resolve, so it structurally
  // cannot be relied on to report a failed backend call to the operator.
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const cameraRef = React.useRef<CameraViewfinderHandle>(null);
  // Idempotency keys for the two capture entry points, minted once per
  // logical attempt and held stable across a retry of that same attempt —
  // cleared only once the server has confirmed the write actually landed.
  // A fresh generateUuid() call is deliberately *not* made inline inside
  // handleCaptureScan/handleAddPackage, since that would mint a new key (and
  // thus a new duplicate row) on every retry instead of deduping it.
  const captureUuidRef = React.useRef<string | null>(null);
  const addPackageUuidRef = React.useRef<string | null>(null);

  // Pull the package feed from Odoo — this is now the single source of
  // truth for `packages`, rather than a locally-constructed record that
  // could drift from what the server actually stored.
  // Returns the mapped list so callers that also need to re-sync a
  // separately-held snapshot (selectedPackage) don't have to read `packages`
  // back out of a stale closure right after calling setPackages.
  const refreshFeed = async (): Promise<PackageItem[]> => {
    const feed = await odooCall<any[]>('/dock42/api/feed', { limit: 50 });
    const mapped: PackageItem[] = feed.map((r) => {
      // pwa_feed returns create_date as a naive-UTC ISO string (Odoo stores
      // create_date in UTC); append 'Z' so the browser parses it as UTC
      // instead of misreading it as local time.
      const created = r.create_date ? new Date(r.create_date + 'Z') : null;
      const validCreated = created && !isNaN(created.getTime()) ? created : null;
      return {
        id: String(r.id),
        poNumber: r.po_number,
        vendor: r.vendor,
        itemName: r.item_name,
        weightKg: r.weight_kg,
        timeReceived: validCreated
          ? validCreated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
          : '',
        dateReceived: validCreated ? validCreated.toISOString().split('T')[0] : '',
        status: r.state === 'stored' ? 'STORED' : r.state === 'damaged' ? 'DAMAGED' : 'SHELF_PENDING',
        shelfLocation: r.shelf_location,
        labelScanned: true,
        packageCaptured: true,
        shelfAssigned: r.state === 'stored',
        odooSynced: true,
        dockLocation: currentLocation.name,
      };
    });
    setPackages(mapped);
    return mapped;
  };

  // Manually re-pull the latest state from Odoo. Bound to the "SYNC NOW" /
  // "TRIGGER FORCE BACKGROUND DATA SYNC" controls in SyncBar/SyncView —
  // there's no local offline queue to flush anymore, so this just refreshes
  // from server truth.
  const handleManualRefresh = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await refreshFeed();
      setOdooConfig((prev) => ({
        ...prev,
        lastSyncTime: `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      }));
    } catch (e) {
      console.warn('Refresh failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Mount service worker & pull the initial feed from Odoo on startup.
  // connected/lastSyncTime only flip to a real value once this genuinely
  // succeeds — DEFAULT_ODOO_CONFIG starts blank/false rather than claiming
  // a connection that hasn't happened yet.
  useEffect(() => {
    registerServiceWorker();
    refreshFeed()
      .then(() => {
        setOdooConfig((prev) => ({
          ...prev,
          connected: true,
          lastSyncTime: `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        }));
      })
      .catch((e) => {
        console.warn('Initial feed load failed:', e);
        setErrorBanner(`Could not load packages from Odoo: ${e instanceof Error ? e.message : String(e)}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save packages to local storage whenever updated (client-side cache only;
  // refreshFeed() from the server remains the source of truth)
  useEffect(() => {
    savePackagesToLocal(packages);
  }, [packages]);

  // Handle Online / Offline network status changes
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle barcode/package scan capture
  const handleCaptureScan = async (scannedData?: Partial<PackageItem>) => {
    setIsScanningAI(true);
    // Mint the idempotency key once per logical capture attempt and hold it
    // in a ref so a retry (this function called again before a prior call
    // ever succeeded) reuses the same uuid instead of creating a duplicate
    // row server-side.
    if (!captureUuidRef.current) captureUuidRef.current = generateUuid();
    const captureUuid = captureUuidRef.current;
    // The write and the follow-up refresh are deliberately in separate
    // try/catch blocks: if the write succeeds but refreshFeed() then fails
    // (e.g. a flaky connection right after a good POST), that must NOT be
    // reported to the operator as a failed capture — a false "failed"
    // banner here previously led an operator to retry a write that had
    // already landed.
    let response: { id: number; duplicate: boolean };
    try {
      response = await odooCall<{ id: number; duplicate: boolean }>('/dock42/api/capture', {
        capture_uuid: captureUuid,
        po_number: scannedData?.poNumber,
        vendor: scannedData?.vendor ?? 'Unknown Vendor',
        item_name: scannedData?.itemName ?? 'Unlabeled Item',
        weight_kg: scannedData?.weightKg ?? 0,
        photo_package: scannedData?.imageUrl,
        notes: scannedData?.notes,
        // The AI scan may have flagged the package as damaged on sight —
        // record that at creation time instead of silently storing it as
        // undamaged with no trace of what the scan actually found.
        initial_damaged: scannedData?.status === 'DAMAGED',
      });
    } catch (e) {
      console.warn('Capture failed:', e);
      triggerLocalPushNotification('Capture Failed', String(e));
      setErrorBanner(`Capture failed: ${e instanceof Error ? e.message : String(e)}`);
      setIsScanningAI(false);
      return;
    }
    setIsScanningAI(false);

    if (response.duplicate) {
      // The server matched captureUuid to a record that already exists
      // instead of creating a new one. That's the CORRECT, safe outcome
      // for a genuine retry of the same capture (e.g. the client never saw
      // the first response, so the ref was never cleared, and this resend
      // lands on the same row) — but it's indistinguishable, from here,
      // from an operator who abandoned that capture and scanned a
      // *different* physical package next while the stale ref was still
      // set. Silently treating both cases as a normal success would
      // discard the second package's data with no visible signal. Rather
      // than guess intent, surface it and require the operator to notice:
      // don't clear captureUuidRef (so a genuine resend of the SAME item
      // stays deduped), and don't advance to the SHELF step or claim a
      // fresh capture succeeded.
      triggerLocalPushNotification(
        'Duplicate Scan Detected',
        'Matched an existing record — check the feed before scanning the next item.'
      );
      setErrorBanner(
        'This scan matched an existing record instead of creating a new one — check the feed before scanning the next item.'
      );
      return;
    }

    // Confirmed a genuinely new row was created — the next capture attempt
    // gets a fresh uuid.
    captureUuidRef.current = null;
    triggerLocalPushNotification(
      'Package Scanned & Logged',
      `Recorded at ${currentLocation.code}`
    );
    setErrorBanner(null);
    setCurrentStep('SHELF');

    try {
      // Re-fetch the feed so local state always reflects server truth,
      // rather than optimistically constructing a local record that could
      // diverge from what the server actually stored.
      await refreshFeed();
    } catch (e) {
      console.warn('Post-capture refresh failed:', e);
      setErrorBanner(`Package captured, but refreshing the list failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Add new package manually (Inbound "manual entry" form) — persisted via
  // the same capture endpoint as camera-based scans, no more local-only
  // state + fake offline queue.
  const handleAddPackage = async (newPkg: PackageItem) => {
    if (!addPackageUuidRef.current) addPackageUuidRef.current = generateUuid();
    const captureUuid = addPackageUuidRef.current;
    // Write and refresh live in separate try/catch blocks — see
    // handleCaptureScan above for why a refresh failure must never be
    // reported as if the write itself failed.
    try {
      await odooCall('/dock42/api/capture', {
        capture_uuid: captureUuid,
        po_number: newPkg.poNumber,
        vendor: newPkg.vendor,
        item_name: newPkg.itemName,
        weight_kg: newPkg.weightKg,
        shelf_location: newPkg.shelfLocation,
      });
    } catch (e) {
      console.warn('Manual package add failed:', e);
      triggerLocalPushNotification('Manual Entry Failed', String(e));
      setErrorBanner(`Manual entry failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    addPackageUuidRef.current = null;
    try {
      await refreshFeed();
      setErrorBanner(null);
    } catch (e) {
      console.warn('Manual package add refresh failed:', e);
      setErrorBanner(`Package added, but refreshing the list failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Update shelf bin — actually persisted, no more local-only mutation.
  // Returns whether it actually succeeded so callers (PackageDetailModal)
  // can gate their own success UI on a real result instead of assuming.
  const handleUpdateShelf = async (pkgId: string, newShelf: string): Promise<boolean> => {
    // Write and refresh live in separate try/catch blocks — a refresh
    // failure after a successful write must not be reported to the
    // operator as the write itself having failed (see handleCaptureScan).
    try {
      const result = await odooCall<{ ok: boolean }>('/dock42/api/update_shelf', {
        package_id: Number(pkgId),
        shelf_location: newShelf,
      });
      if (!result?.ok) {
        throw new Error('Odoo rejected the shelf update.');
      }
    } catch (e) {
      console.warn('Shelf update failed:', e);
      setErrorBanner(`Shelf update failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    try {
      const fresh = await refreshFeed();
      // Re-sync the open modal's snapshot, not just the list behind it — the
      // original handlers (pre-Task-7) kept selectedPackage in sync; the
      // rewrite above dropped that, leaving the modal showing a stale
      // status/shelf value until closed and reopened (found by Task 7's own
      // review). PackageDetailModal is keyed only by id, so it won't remount
      // on its own just because the object's contents changed underneath it.
      setSelectedPackage((prev) =>
        prev && prev.id === pkgId ? fresh.find((p) => p.id === pkgId) ?? prev : prev
      );
      setErrorBanner(null);
    } catch (e) {
      console.warn('Shelf update refresh failed:', e);
      setErrorBanner(`Shelf updated, but refreshing the list failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true; // the WRITE succeeded, which is what the caller needs to know
  };

  // Toggle damage flag on package — actually persisted. Returns whether it
  // actually succeeded, same reasoning as handleUpdateShelf above.
  const handleToggleDamage = async (pkgId: string): Promise<boolean> => {
    // Write and refresh live in separate try/catch blocks. Previously both
    // were caught together, so a write that actually succeeded but whose
    // follow-up refreshFeed() failed was reported to the operator as a
    // failed toggle — an operator retrying off that false error flipped an
    // already-toggled damage flag right back off.
    try {
      const result = await odooCall<{ ok: boolean; flagged: boolean }>('/dock42/api/flag_damage', {
        package_id: Number(pkgId),
      });
      if (!result?.ok) {
        throw new Error('Odoo rejected the damage flag toggle.');
      }
    } catch (e) {
      console.warn('Damage flag toggle failed:', e);
      setErrorBanner(`Damage flag toggle failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    try {
      const fresh = await refreshFeed();
      setSelectedPackage((prev) =>
        prev && prev.id === pkgId ? fresh.find((p) => p.id === pkgId) ?? prev : prev
      );
      setErrorBanner(null);
    } catch (e) {
      console.warn('Damage flag toggle refresh failed:', e);
      setErrorBanner(`Damage flag updated, but refreshing the list failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true; // the WRITE succeeded, which is what the caller needs to know
  };

  // Flag damaged shipment from FlagView — actually persisted via
  // pwa_report_damage, not a local-only mutation. Returns whether it
  // actually succeeded so FlagView only shows its "filed" banner when a
  // real write happened.
  const handleReportDamage = async (
    pkgId: string,
    category: string,
    severity: string,
    notes: string,
    photoUrl?: string
  ): Promise<boolean> => {
    try {
      const result = await odooCall<{ ok: boolean }>('/dock42/api/report_damage', {
        package_id: Number(pkgId),
        category: mapDamageCategoryToBackend(category),
        severity: mapDamageSeverityToBackend(severity),
        notes,
        photo: photoUrl,
      });
      if (!result?.ok) {
        throw new Error('Odoo rejected the damage report.');
      }
      await refreshFeed();
      triggerLocalPushNotification('⚠️ Damaged Package Flagged', `${pkgId} flagged as ${severity} damage.`);
      setErrorBanner(null);
      return true;
    } catch (e) {
      console.warn('Damage report failed:', e);
      setErrorBanner(`Damage report failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  };

  const flaggedCount = packages.filter((p) => p.status === 'DAMAGED').length;

  return (
    <div className="flex flex-col min-h-screen relative pb-20 bg-[#F8FAFC] text-slate-900 font-body">
      {/* Top App Bar */}
      <Header
        currentLocation={currentLocation}
        onOpenLocationModal={() => setShowLocationModal(true)}
        isOnline={isOnline}
        onToggleOnline={() => setIsOnline(!isOnline)}
        queuedCount={0}
      />

      {/* Main Screen Canvas */}
      <main className="flex-grow pt-14 flex flex-col w-full max-w-3xl mx-auto">
        {/* Visible error surface — the only reliable channel for surfacing a
            failed backend call, since notification permission is opt-in and
            can't be relied on (see indexedDB.ts triggerLocalPushNotification). */}
        {errorBanner && (
          <div className="mx-4 mt-3 bg-rose-50 text-rose-800 border border-rose-200 p-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-between gap-2 shadow-xs">
            <span className="normal-case font-semibold">{errorBanner}</span>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-rose-600 hover:text-rose-900 font-black px-1 shrink-0"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {activeTab === 'scan' && (
          <>
            {/* Live Camera Viewfinder */}
            <CameraViewfinder
              ref={cameraRef}
              onCaptureScan={handleCaptureScan}
              isScanningAI={isScanningAI}
            />

            {/* 3-Stage Capture Strip */}
            <CaptureStrip
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
              onTriggerCapture={() => cameraRef.current?.triggerScan()}
              isScanningAI={isScanningAI}
            />

            {/* Sync Status Bar & Arrived Today List */}
            <section className="flex-1 bg-[#F8FAFC] p-4 flex flex-col gap-4">
              <SyncBar
                queuedCount={0}
                isSyncing={isSyncing}
                onForceSync={handleManualRefresh}
                lastSyncTime={odooConfig.lastSyncTime}
              />

              <ArrivedTodayList
                packages={packages}
                onSelectPackage={(pkg) => setSelectedPackage(pkg)}
              />
            </section>
          </>
        )}

        {activeTab === 'inbound' && (
          <InboundView
            packages={packages}
            onSelectPackage={(pkg) => setSelectedPackage(pkg)}
            onAddPackage={handleAddPackage}
          />
        )}

        {activeTab === 'sync' && (
          <SyncView
            odooConfig={odooConfig}
            onUpdateConfig={setOdooConfig}
            queue={[]}
            onForceSync={handleManualRefresh}
            isSyncing={isSyncing}
            isOnline={isOnline}
            onToggleOnline={() => setIsOnline(!isOnline)}
          />
        )}

        {activeTab === 'flag' && (
          <FlagView
            packages={packages}
            onReportDamage={handleReportDamage}
          />
        )}
      </main>

      {/* Package Detail Drawer / Modal */}
      <PackageDetailModal
        key={selectedPackage?.id ?? 'none'}
        pkg={selectedPackage}
        onClose={() => setSelectedPackage(null)}
        onUpdateShelf={handleUpdateShelf}
        onToggleDamage={handleToggleDamage}
      />

      {/* Location Picker Modal */}
      {showLocationModal && (
        <LocationModal
          locations={locations}
          currentLocation={currentLocation}
          onSelectLocation={(loc) => setCurrentLocation(loc)}
          onClose={() => setShowLocationModal(false)}
        />
      )}

      {/* Fixed Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        flaggedCount={flaggedCount}
      />
    </div>
  );
}
