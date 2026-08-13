export type PackageStatus = 'STORED' | 'SHELF_PENDING' | 'DAMAGED' | 'IN_TRANSIT' | 'SYNCING';

export interface PackageItem {
  id: string; // e.g., "PR-1040"
  poNumber: string; // e.g., "PO-2026-104"
  vendor: string; // e.g., "Acme Fasteners Co."
  itemName: string; // e.g., "Precision Roller Bearings"
  weightKg: number;
  timeReceived: string; // e.g., "14:02"
  dateReceived: string; // e.g., "2026-08-12"
  status: PackageStatus;
  shelfLocation: string; // e.g., "A-12-04"
  labelScanned: boolean;
  packageCaptured: boolean;
  shelfAssigned: boolean;
  imageUrl?: string;
  labelImageUrl?: string;
  notes?: string;
  odooPickingRef?: string; // e.g., "WH/IN/00142"
  odooSynced: boolean;
  dockLocation: string;
}

export type ActiveTab = 'scan' | 'inbound' | 'sync' | 'flag';

export type CaptureStep = 'LABEL' | 'PACKAGE' | 'SHELF';

export interface OfflineQueueItem {
  id: string;
  type: 'NEW_PACKAGE' | 'UPDATE_SHELF' | 'FLAG_DAMAGE' | 'STOCK_QUANT_SYNC';
  timestamp: string;
  data: Partial<PackageItem>;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'COMPLETED';
  retryCount: number;
}

export interface DockLocation {
  id: string;
  name: string;
  code: string;
  capacityUsed: number;
}

export interface DamageReport {
  id: string;
  packageId: string;
  category: 'CRUSHED_BOX' | 'LIQUID_LEAK' | 'MISSING_CONTENT' | 'LABEL_UNREADABLE' | 'SEAL_BROKEN';
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL_QUARANTINE';
  notes: string;
  photoUrl?: string;
  reportedBy: string;
  timestamp: string;
  odooTicketRef?: string;
}

export interface OdooConfig {
  hostUrl: string;
  database: string;
  username: string;
  connected: boolean;
  autoBackgroundSync: boolean;
  lastSyncTime: string;
}
