import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CameraViewfinder } from './components/CameraViewfinder';
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
  OfflineQueueItem,
} from './types';
import {
  INITIAL_PACKAGES,
  INITIAL_LOCATIONS,
  DEFAULT_ODOO_CONFIG,
} from './data/initialData';
import {
  getStoredPackages,
  savePackagesToLocal,
  getOfflineQueue,
  addToOfflineQueue,
  clearOfflineQueue,
  registerServiceWorker,
  triggerLocalPushNotification,
} from './utils/indexedDB';

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
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(() =>
    getOfflineQueue()
  );
  const [selectedPackage, setSelectedPackage] = useState<PackageItem | null>(
    null
  );
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [odooConfig, setOdooConfig] = useState<OdooConfig>(DEFAULT_ODOO_CONFIG);

  // Mount service worker on startup
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Save packages to local storage whenever updated
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

  // Force background data sync function
  const handleForceSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const res = await fetch('/api/odoo-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueItems: offlineQueue,
          odooEndpoint: odooConfig.hostUrl,
        }),
      });
      const data = await res.json();

      if (data.success) {
        clearOfflineQueue();
        setOfflineQueue([]);
        // Mark all local packages as synced
        setPackages((prev) =>
          prev.map((p) => ({ ...p, odooSynced: true }))
        );
        setOdooConfig((prev) => ({
          ...prev,
          lastSyncTime: `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        }));
      }
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      setTimeout(() => setIsSyncing(false), 1200);
    }
  };

  // Handle barcode/package scan capture
  const handleCaptureScan = async (scannedData?: Partial<PackageItem>) => {
    setIsScanningAI(true);

    const nowTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const newPkg: PackageItem = {
      id: scannedData?.id || `PR-${Math.floor(1000 + Math.random() * 9000)}`,
      poNumber: scannedData?.poNumber || `PO-2026-${Math.floor(100 + Math.random() * 900)}`,
      vendor: scannedData?.vendor || 'Industrial Logistics Corp',
      itemName: scannedData?.itemName || 'Heavy Duty Replacement Parts',
      weightKg: scannedData?.weightKg || 15.2,
      timeReceived: nowTime,
      dateReceived: new Date().toISOString().split('T')[0],
      status: scannedData?.status || 'SHELF_PENDING',
      shelfLocation: scannedData?.shelfLocation || `BAY-01-A${Math.floor(1 + Math.random() * 9)}`,
      labelScanned: true,
      packageCaptured: true,
      shelfAssigned: false,
      imageUrl: scannedData?.imageUrl || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
      notes: scannedData?.notes || 'Scanned at DOCK-42 camera station',
      odooPickingRef: `WH/IN/${Math.floor(10000 + Math.random() * 90000)}`,
      odooSynced: isOnline,
      dockLocation: currentLocation.name,
    };

    setPackages((prev) => [newPkg, ...prev]);

    // Add to offline queue if offline
    if (!isOnline) {
      const qItem: OfflineQueueItem = {
        id: `q-${Date.now()}`,
        type: 'NEW_PACKAGE',
        timestamp: new Date().toISOString(),
        data: newPkg,
        status: 'PENDING',
        retryCount: 0,
      };
      addToOfflineQueue(qItem);
      setOfflineQueue(getOfflineQueue());
    } else {
      // Trigger instant background sync
      handleForceSync();
    }

    // Trigger local push notification
    triggerLocalPushNotification(
      'Package Scanned & Logged',
      `${newPkg.id} (${newPkg.vendor}) recorded at ${currentLocation.code}`
    );

    setIsScanningAI(false);
    setCurrentStep('SHELF');
  };

  // Add new package manually
  const handleAddPackage = (newPkg: PackageItem) => {
    setPackages((prev) => [newPkg, ...prev]);
    if (!isOnline) {
      addToOfflineQueue({
        id: `q-${Date.now()}`,
        type: 'NEW_PACKAGE',
        timestamp: new Date().toISOString(),
        data: newPkg,
        status: 'PENDING',
        retryCount: 0,
      });
      setOfflineQueue(getOfflineQueue());
    } else {
      handleForceSync();
    }
  };

  // Update shelf bin
  const handleUpdateShelf = (pkgId: string, newShelf: string) => {
    setPackages((prev) =>
      prev.map((p) =>
        p.id === pkgId
          ? {
              ...p,
              shelfLocation: newShelf,
              status: p.status === 'DAMAGED' ? 'DAMAGED' : 'STORED',
              shelfAssigned: true,
            }
          : p
      )
    );
    if (selectedPackage && selectedPackage.id === pkgId) {
      setSelectedPackage((prev) =>
        prev
          ? {
              ...prev,
              shelfLocation: newShelf,
              status: prev.status === 'DAMAGED' ? 'DAMAGED' : 'STORED',
              shelfAssigned: true,
            }
          : null
      );
    }
  };

  // Toggle damage flag on package
  const handleToggleDamage = (pkgId: string) => {
    setPackages((prev) =>
      prev.map((p) =>
        p.id === pkgId
          ? {
              ...p,
              status: p.status === 'DAMAGED' ? 'STORED' : 'DAMAGED',
            }
          : p
      )
    );
    if (selectedPackage && selectedPackage.id === pkgId) {
      setSelectedPackage((prev) =>
        prev
          ? {
              ...prev,
              status: prev.status === 'DAMAGED' ? 'STORED' : 'DAMAGED',
            }
          : null
      );
    }
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
        queuedCount={offlineQueue.length}
      />

      {/* Main Screen Canvas */}
      <main className="flex-grow pt-14 flex flex-col w-full max-w-3xl mx-auto">
        {activeTab === 'scan' && (
          <>
            {/* Live Camera Viewfinder */}
            <CameraViewfinder
              onCaptureScan={handleCaptureScan}
              isScanningAI={isScanningAI}
            />

            {/* 3-Stage Capture Strip */}
            <CaptureStrip
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
              onTriggerCapture={handleCaptureScan}
            />

            {/* Sync Status Bar & Arrived Today List */}
            <section className="flex-1 bg-[#F8FAFC] p-4 flex flex-col gap-4">
              <SyncBar
                queuedCount={offlineQueue.length}
                isSyncing={isSyncing}
                onForceSync={handleForceSync}
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
            queue={offlineQueue}
            onForceSync={handleForceSync}
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
