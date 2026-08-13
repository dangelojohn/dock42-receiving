import React, { useState } from 'react';
import { RefreshCw, Bell, Database, Wifi, ShieldCheck, CheckCircle2, Send, Server, Zap } from 'lucide-react';
import { OdooConfig, OfflineQueueItem } from '../types';
import { requestNotificationPermission, triggerLocalPushNotification } from '../utils/indexedDB';

interface SyncViewProps {
  odooConfig: OdooConfig;
  onUpdateConfig: (config: OdooConfig) => void;
  queue: OfflineQueueItem[];
  onForceSync: () => void;
  isSyncing: boolean;
  isOnline: boolean;
  onToggleOnline: () => void;
}

export const SyncView: React.FC<SyncViewProps> = ({
  odooConfig,
  onUpdateConfig,
  queue,
  onForceSync,
  isSyncing,
  isOnline,
  onToggleOnline,
}) => {
  const [pushStatus, setPushStatus] = useState<string>('Check permissions');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handleEnablePush = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      setPushStatus('PUSH NOTIFICATIONS ACTIVE');
      triggerLocalPushNotification(
        'DOCK-42 PWA Active',
        'Push notifications enabled for Odoo v19 CE receiving updates!'
      );
    } else {
      setPushStatus('Notification Permission Denied');
    }
  };

  const handleTestNotification = async (type: string) => {
    let title = 'DOCK-42 INBOUND ALERT';
    let body = 'Shipment PR-1042 successfully recorded into Odoo v19 CE stock.picking';

    if (type === 'DAMAGE') {
      title = '⚠️ DAMAGED SHIPMENT FLAGGED';
      body = 'Package PR-1039 reported damaged at Bay 1. Odoo claim ticket created.';
    } else if (type === 'OVERFLOW') {
      title = '🚨 DOCK CAPACITY WARNING';
      body = 'Bay 1 receiving area at 90% capacity. Reassigning forklift staff.';
    }

    try {
      await fetch('/api/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, type }),
      });
    } catch (e) {
      console.warn('Push notify fallback:', e);
    }

    triggerLocalPushNotification(title, body);
    setSyncNotice(`Sent broadcast: "${title}"`);
    setTimeout(() => setSyncNotice(null), 4000);
  };

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto flex flex-col gap-4 select-none">
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold font-headline text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <Server size={20} className="text-[#714B67]" />
          ODOO v19 CE PWA SYNC ENGINE
        </h2>
        <p className="text-xs text-slate-500">
          Automatic background data synchronization & Web Push Notifications
        </p>
      </div>

      {syncNotice && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold uppercase tracking-wider p-3 rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* Network & Offline Mode Simulator Card */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider font-headline">
            NETWORK & BACKGROUND SYNC STATUS
          </span>
          <button
            onClick={onToggleOnline}
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase border transition-all ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
            }`}
          >
            {isOnline ? 'NETWORK: ONLINE' : 'SIMULATING OFFLINE'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Odoo JSON-RPC API</span>
            <span className="text-slate-900 font-bold font-mono">v19.0 Community Edition</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Offline Queue</span>
            <span className="text-[#714B67] font-bold font-mono">{queue.length} items pending</span>
          </div>
        </div>

        <button
          onClick={onForceSync}
          disabled={isSyncing}
          className="w-full py-2.5 bg-[#714B67] hover:bg-[#5E3F56] text-white rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? 'FORCE SYNCING WITH ODOO...' : 'TRIGGER FORCE BACKGROUND DATA SYNC'}</span>
        </button>
      </div>

      {/* Push Notification Controls Card */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider font-headline flex items-center gap-1.5">
            <Bell size={14} className="text-[#714B67]" />
            PWA PUSH NOTIFICATIONS
          </span>
          <span className="text-[10px] text-[#714B67] font-mono font-semibold">{pushStatus}</span>
        </div>

        <p className="text-xs text-slate-500">
          Service Worker background notifications inform dock workers when high-priority POs arrive or when damaged stock flags occur.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            onClick={handleEnablePush}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>ENABLE PUSH NOTIFICATIONS</span>
          </button>

          <button
            onClick={() => handleTestNotification('INBOUND')}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-blue-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <Send size={14} />
            <span>TEST INBOUND NOTIFY</span>
          </button>

          <button
            onClick={() => handleTestNotification('DAMAGE')}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-rose-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <Zap size={14} />
            <span>TEST DAMAGE FLAG NOTIFY</span>
          </button>

          <button
            onClick={() => handleTestNotification('OVERFLOW')}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-amber-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <Zap size={14} />
            <span>TEST DOCK OVERFLOW ALERT</span>
          </button>
        </div>
      </div>

      {/* Odoo Configuration Panel */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-3">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider font-headline flex items-center gap-1.5 border-b border-slate-100 pb-2">
          <Database size={14} className="text-[#714B67]" />
          ODOO SERVER CONNECTOR CONFIG
        </span>

        <div className="flex flex-col gap-2.5 text-xs">
          <div>
            <label className="text-slate-500 uppercase font-bold text-[10px]">Odoo Instance Host URL</label>
            <input
              type="text"
              value={odooConfig.hostUrl}
              onChange={(e) => onUpdateConfig({ ...odooConfig, hostUrl: e.target.value })}
              className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:border-[#714B67] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-500 uppercase font-bold text-[10px]">Database Name</label>
              <input
                type="text"
                value={odooConfig.database}
                onChange={(e) => onUpdateConfig({ ...odooConfig, database: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:border-[#714B67] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-500 uppercase font-bold text-[10px]">Operator Username</label>
              <input
                type="text"
                value={odooConfig.username}
                onChange={(e) => onUpdateConfig({ ...odooConfig, username: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:border-[#714B67] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
