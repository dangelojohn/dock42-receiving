import React, { useState } from 'react';
import { Search, Plus, Filter, Download, ArrowUpRight, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { PackageItem, PackageStatus } from '../types';

interface InboundViewProps {
  packages: PackageItem[];
  onSelectPackage: (pkg: PackageItem) => void;
  onAddPackage: (newPkg: PackageItem) => void;
}

export const InboundView: React.FC<InboundViewProps> = ({
  packages,
  onSelectPackage,
  onAddPackage,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<PackageStatus | 'ALL'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [newId, setNewId] = useState(`PR-${Math.floor(1000 + Math.random() * 9000)}`);
  const [newPo, setNewPo] = useState(`PO-2026-${Math.floor(100 + Math.random() * 900)}`);
  const [newVendor, setNewVendor] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newWeight, setNewWeight] = useState(10);
  const [newShelf, setNewShelf] = useState('BAY-03-B1');

  const filtered = packages.filter((pkg) => {
    const matchesSearch =
      pkg.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.shelfLocation.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = selectedStatus === 'ALL' || pkg.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const handleCreatePackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendor || !newItemName) return;

    // Only po_number/vendor/item_name/weight_kg/shelf_location actually get
    // forwarded to the backend by App.tsx's handleAddPackage — the real
    // record (id, odooPickingRef, timestamps, sync state) comes back from
    // Odoo via the subsequent refreshFeed(), not from anything fabricated
    // here.
    const created: PackageItem = {
      id: newId,
      poNumber: newPo,
      vendor: newVendor,
      itemName: newItemName,
      weightKg: Number(newWeight),
      timeReceived: '',
      dateReceived: '',
      status: 'SHELF_PENDING',
      shelfLocation: newShelf,
      labelScanned: true,
      packageCaptured: true,
      shelfAssigned: false,
      odooSynced: false,
      dockLocation: 'DOCK-42 BAY 1',
    };

    onAddPackage(created);
    setShowAddModal(false);
    setNewVendor('');
    setNewItemName('');
    setNewId(`PR-${Math.floor(1000 + Math.random() * 9000)}`);
  };

  const csvEscape = (value: unknown): string => {
    let s = String(value ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralize formula injection
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const exportCSV = () => {
    const csvRows = [
      ['Package ID', 'PO Number', 'Vendor', 'Item', 'Weight (kg)', 'Status', 'Shelf Bin', 'Time', 'Odoo Ref'],
      ...filtered.map((p) => [p.id, p.poNumber, p.vendor, p.itemName, p.weightKg, p.status, p.shelfLocation, p.timeReceived, p.odooPickingRef || '']),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `dock42_inbound_manifest_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto flex flex-col gap-4 select-none">
      {/* View Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-headline text-slate-900 uppercase tracking-wide">
            INBOUND SHIPMENTS
          </h2>
          <p className="text-xs text-slate-500">Odoo v19 CE Stock Picking Queue</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all"
            title="Export Manifest CSV"
          >
            <Download size={14} className="text-[#714B67]" />
            <span className="hidden sm:inline">EXPORT</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-[#714B67] hover:bg-[#5E3F56] text-white rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Plus size={16} />
            <span>MANUAL ENTRY</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative w-full">
        <Search className="absolute left-3.5 top-3 text-slate-400 w-4 h-4" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by Package ID, PO, Vendor or Shelf..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#714B67] shadow-xs"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {(['ALL', 'STORED', 'SHELF_PENDING', 'DAMAGED'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setSelectedStatus(st)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider shrink-0 transition-colors ${
              selectedStatus === st
                ? 'bg-[#714B67] text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            {st === 'ALL' ? 'ALL SHIPMENTS' : st.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Package Manifest List */}
      <div className="flex flex-col gap-3">
        {filtered.map((pkg) => (
          <div
            key={pkg.id}
            onClick={() => onSelectPackage(pkg)}
            className="p-4 bg-white border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col gap-2.5 cursor-pointer transition-all shadow-xs active:bg-slate-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-headline font-bold text-base text-slate-900">{pkg.id}</span>
                <span className="text-xs font-mono text-[#714B67] bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100 font-semibold">
                  {pkg.poNumber}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">{pkg.timeReceived}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-800">{pkg.itemName}</span>
                <span className="text-[11px] text-slate-500">{pkg.vendor} • {pkg.weightKg} kg</span>
              </div>

              {pkg.status === 'STORED' && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                  STORED
                </span>
              )}
              {pkg.status === 'SHELF_PENDING' && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase tracking-wider">
                  SHELF PENDING
                </span>
              )}
              {pkg.status === 'DAMAGED' && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold uppercase tracking-wider">
                  DAMAGED
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Shelf Bin: <strong className="text-slate-800 font-mono">{pkg.shelfLocation}</strong></span>
              <span className="flex items-center gap-1 text-[#714B67] font-semibold">
                Odoo: {pkg.odooPickingRef || '—'} <ArrowUpRight size={12} />
              </span>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500">
            <p className="text-sm">No packages match search filter.</p>
          </div>
        )}
      </div>

      {/* Manual Package Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-headline font-bold text-base text-slate-900 uppercase tracking-wide">
                LOG MANUAL INBOUND PACKAGE
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePackage} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-600 uppercase font-bold">Package ID</label>
                <input
                  type="text"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  required
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:border-[#714B67] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-600 uppercase font-bold">Purchase Order (Odoo PO)</label>
                <input
                  type="text"
                  value={newPo}
                  onChange={(e) => setNewPo(e.target.value)}
                  required
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:border-[#714B67] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-600 uppercase font-bold">Vendor / Supplier Name</label>
                <input
                  type="text"
                  value={newVendor}
                  onChange={(e) => setNewVendor(e.target.value)}
                  placeholder="e.g. Apex Industrial Supplies"
                  required
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#714B67] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-600 uppercase font-bold">Item Description</label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Hydraulic Couplings 50mm"
                  required
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#714B67] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600 uppercase font-bold">Weight (kg)</label>
                  <input
                    type="number"
                    value={newWeight}
                    onChange={(e) => setNewWeight(Number(e.target.value))}
                    required
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#714B67] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 uppercase font-bold">Target Shelf Bin</label>
                  <input
                    type="text"
                    value={newShelf}
                    onChange={(e) => setNewShelf(e.target.value)}
                    required
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:border-[#714B67] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase border border-slate-200 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#714B67] hover:bg-[#5E3F56] text-white rounded-lg text-xs font-bold uppercase shadow-sm transition-colors"
                >
                  SAVE SHIPMENT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
