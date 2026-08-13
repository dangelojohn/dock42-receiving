import { PackageItem, DockLocation, OdooConfig } from '../types';

// Deliberately empty: the app's source of truth is the live Odoo feed
// (App.tsx's refreshFeed() on startup). Seeding this with fabricated
// demo packages meant a failed initial sync silently showed fake vendor
// names and fake "synced" records as if they were real Odoo data —
// the exact class of bug this whole rebuild exists to eliminate. An
// empty starting list is the honest state until the server responds.
export const INITIAL_PACKAGES: PackageItem[] = [];

export const INITIAL_LOCATIONS: DockLocation[] = [
  { id: 'dock-42-b1', name: 'DOCK-42 BAY 1 (MAIN)', code: 'DOCK-42-B1', capacityUsed: 78 },
  { id: 'dock-42-b2', name: 'DOCK-42 BAY 2 (EXPRESS)', code: 'DOCK-42-B2', capacityUsed: 42 },
  { id: 'dock-42-cold', name: 'COLD STORAGE RECEIVING', code: 'DOCK-COLD-01', capacityUsed: 90 },
  { id: 'dock-42-haz', name: 'HAZMAT & CHEMICAL BAYS', code: 'DOCK-HAZ-03', capacityUsed: 15 },
];

// No connection has happened yet at app boot — hostUrl/database/username/
// connected/lastSyncTime must stay blank/false until a real sync actually
// occurs, rather than implying a live Odoo connection that doesn't exist.
export const DEFAULT_ODOO_CONFIG: OdooConfig = {
  hostUrl: '',
  database: '',
  username: '',
  connected: false,
  autoBackgroundSync: true,
  lastSyncTime: '',
};
