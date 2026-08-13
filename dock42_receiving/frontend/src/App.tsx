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
  return crypto.randomUUID();
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
  const cameraRef = React.useRef<CameraViewfinderHandle>(null);

  // Pull the package feed from Odoo — this is now the single source of
  // truth for `packages`, rather than a locally-constructed record that
  // could drift from what the server actually stored.
  // Returns the mapped list so callers that also need to re-sync a
  // separately-held snapshot (selectedPackage) don't have to read `packages`
  // back out of a stale closure right after calling setPackages.
  const refreshFeed = async (): Promise<PackageItem[]> => {
    const feed = await odooCall<any[]>('/dock42/api/feed', { limit: 50 });
    const mapped: PackageItem[] = feed.map((r) => ({
      id: String(r.id),
      poNumber: r.po_number,
      vendor: r.vendor,
      itemName: r.item_name,
      weightKg: r.weight_kg,
      timeReceived: '',
      dateReceived: '',
      status: r.state === 'stored' ? 'STORED' : r.state === 'damaged' ? 'DAMAGED' : 'SHELF_PENDING',
      shelfLocation: r.shelf_location,
      labelScanned: true,
      packageCaptured: true,
      shelfAssigned: r.state === 'stored',
      odooSynced: true,
      dockLocation: currentLocation.name,
    }));
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

  // Mount service worker & pull the initial feed from Odoo on startup
  useEffect(() => {
    registerServiceWorker();
    refreshFeed().catch((e) => console.warn('Initial feed load failed:', e));
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
    try {
      await odooCall<{ id: number; duplicate: boolean }>('/dock42/api/capture', {
        capture_uuid: generateUuid(),
        po_number: scannedData?.poNumber,
        vendor: scannedData?.vendor ?? 'Unknown Vendor',
        item_name: scannedData?.itemName ?? 'Unlabeled Item',
        weight_kg: scannedData?.weightKg ?? 0,
        photo_package: scannedData?.imageUrl,
      });
      // Re-fetch the feed so local state always reflects server truth,
      // rather than optimistically constructing a local record that could
      // diverge from what the server actually stored.
      await refreshFeed();
      triggerLocalPushNotification(
        'Package Scanned & Logged',
        `Recorded at ${currentLocation.code}`
      );
      setCurrentStep('SHELF');
    } catch (e) {
      console.warn('Capture failed:', e);
      triggerLocalPushNotification('Capture Failed', String(e));
    } finally {
      setIsScanningAI(false);
    }
  };

  // Add new package manually (Inbound "manual entry" form) — persisted via
  // the same capture endpoint as camera-based scans, no more local-only
  // state + fake offline queue.
  const handleAddPackage = async (newPkg: PackageItem) => {
    try {
      await odooCall('/dock42/api/capture', {
        capture_uuid: generateUuid(),
        po_number: newPkg.poNumber,
        vendor: newPkg.vendor,
        item_name: newPkg.itemName,
        weight_kg: newPkg.weightKg,
      });
      await refreshFeed();
    } catch (e) {
      console.warn('Manual package add failed:', e);
      triggerLocalPushNotification('Manual Entry Failed', String(e));
    }
  };

  // Update shelf bin — actually persisted, no more local-only mutation
  const handleUpdateShelf = async (pkgId: string, newShelf: string) => {
    await odooCall('/dock42/api/update_shelf', {
      package_id: Number(pkgId),
      shelf_location: newShelf,
    });
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
  };

  // Toggle damage flag on package — actually persisted
  const handleToggleDamage = async (pkgId: string) => {
    await odooCall('/dock42/api/flag_damage', { package_id: Number(pkgId) });
    const fresh = await refreshFeed();
    setSelectedPackage((prev) =>
      prev && prev.id === pkgId ? fresh.find((p) => p.id === pkgId) ?? prev : prev
    );
  };

  // Flag damaged shipment from FlagView
  const handleReportDamage = (
    pkgId: string,
    category: string,
    severity: string,
    notes: string,
    photoUrl?: string
  ) => {
    setPackages((prev) =>
      prev.map((p) =>
        p.id === pkgId
          ? {
              ...p,
              status: 'DAMAGED',
              notes: `[DAMAGED - ${category} / ${severity}]: ${notes}`,
              imageUrl: photoUrl || p.imageUrl,
            }
          : p
      )
    );
    triggerLocalPushNotification(
      '⚠️ Damaged Package Flagged',
      `${pkgId} flagged as ${severity} damage. Odoo claim ticket created.`
    );
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
