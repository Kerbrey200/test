import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Waybill, Material, UserProfile, Inventory, UserRole } from '../types';
import { ArrowLeftRight, Plus, CheckCircle2, User, Box, X } from 'lucide-react';
import { DataService } from '../services/dataService';

export default function Waybills() {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const { profile } = useAuth();

  const [toUserIdx, setToUserIdx] = useState('');
  const [selectedMatId, setSelectedMatId] = useState('');
  const [quantity, setQuantity] = useState(0);

  const reloadData = async () => {
    const [wayL, matL, userL, invL] = await Promise.all([
      DataService.getCollection('waybills'),
      DataService.getCollection('materials'),
      DataService.getCollection('users'),
      DataService.getCollection('inventory'),
    ]);
    setWaybills(wayL);
    setMaterials(matL);
    setUsers(userL);
    setInventory(invL);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const myId = profile?.uid || '';

  // Stock already promised in my pending waybills is not available for a new one.
  const reserved = (materialId: string) => waybills
    .filter(w => w.status === 'PENDING' && w.fromUid === myId)
    .flatMap(w => w.items)
    .filter(i => i.materialId === materialId)
    .reduce((sum, i) => sum + i.quantity, 0);

  const myStock = inventory
    .filter(i => i.holderId === myId)
    .map(i => ({ ...i, available: i.balance - reserved(i.materialId) }))
    .filter(i => i.available > 0);

  const selectedStock = myStock.find(i => i.materialId === selectedMatId);

  const resetForm = () => {
    setToUserIdx('');
    setSelectedMatId('');
    setQuantity(0);
  };

  const handleCreate = async () => {
    if (!myId) return;
    if (!toUserIdx) return alert('Qabul qiluvchini tanlang');
    if (!selectedStock) return alert('Materialni tanlang');
    if (!(quantity > 0)) return alert('Miqdor 0 dan katta bo\'lishi kerak');
    if (quantity > selectedStock.available) return alert(`Qoldiq yetarli emas: mavjud ${selectedStock.available} ${selectedStock.unit}`);
    const material = materials.find(m => m.id === selectedMatId);

    try {
      await DataService.addToCollection('waybills', {
        fromUid: myId,
        toUid: toUserIdx,
        items: [{
          materialId: selectedMatId,
          name: material?.name || selectedStock.name,
          quantity,
          unit: material?.unit || selectedStock.unit
        }],
        status: 'PENDING'
      });
      setShowAddModal(false);
      resetForm();
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  const handleApprove = async (waybill: Waybill) => {
    try {
      await DataService.approveWaybill(waybill.id, myId);
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  const handleCancel = async (waybill: Waybill) => {
    if (!confirm('Nakladnoyni bekor qilasizmi?')) return;
    try {
      await DataService.removeFromCollection('waybills', waybill.id);
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  const getUserName = (id: string) => {
    const u = users.find(u => (u.uid || (u as any).id) === id);
    return u ? u.fullName : `ID: ${id.slice(0, 6)}`;
  };

  const visibleWaybills = profile?.role === UserRole.ADMIN
    ? waybills
    : waybills.filter(w => w.fromUid === myId || w.toUid === myId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Nakladnoylar</h1>
          <p className="text-slate-500 font-medium">Xodimlar o'rtasida materiallar harakati</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100"
        >
          <Plus className="w-5 h-5" />
          <span>Nakladnoy chiqarish</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {visibleWaybills.map((bill) => (
          <div key={bill.id} className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-8 group">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="flex items-center space-x-4">
                 <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-slate-200 transition-all">
                   <ArrowLeftRight className="w-7 h-7" />
                 </div>
                 <div>
                   <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Yuboruvchi</div>
                   <div className="font-black text-slate-800 uppercase italic tracking-tighter">{getUserName(bill.fromUid)}</div>
                 </div>
              </div>
              
              <div className="hidden md:block text-slate-200">
                <Box className="w-6 h-6" />
              </div>

              <div className="flex items-center space-x-4">
                 <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                   <User className="w-7 h-7" />
                 </div>
                 <div>
                   <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Qabul qiluvchi</div>
                   <div className="font-black text-slate-800 uppercase italic tracking-tighter">{getUserName(bill.toUid)}</div>
                 </div>
              </div>
            </div>

            <div className="flex-1 flex flex-wrap gap-3 px-0 lg:px-10">
              {bill.items.map((item, i) => (
                <div key={i} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black italic tracking-widest shadow-lg shadow-blue-100 flex items-center space-x-2">
                  <Box className="w-4 h-4" />
                  <span>{item.name}: {item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center space-x-8">
              <div className="text-left md:text-right">
                <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 text-center">Status</div>
                <div className={`text-xs font-black uppercase tracking-[0.2em] px-3 py-1 rounded-xl ring-1 ring-inset ${bill.status === 'APPROVED' ? 'text-green-600 bg-green-50 ring-green-200' : 'text-orange-500 bg-orange-50 ring-orange-200'}`}>
                  {bill.status === 'APPROVED' ? 'QABUL QILINDI' : 'KUTILMOQDA'}
                </div>
              </div>
              
              {bill.status === 'PENDING' && bill.fromUid === myId && (
                <button
                  onClick={() => handleCancel(bill)}
                  className="px-6 py-3 border border-red-100 text-red-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-50 transition-all flex items-center space-x-2"
                >
                  <X className="w-4 h-4" />
                  <span>Bekor qilish</span>
                </button>
              )}
              {bill.status === 'PENDING' && bill.toUid === myId && (
                <button 
                  onClick={() => handleApprove(bill)}
                  className="px-8 py-3 bg-green-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-green-600 transition-all shadow-xl shadow-green-100 flex items-center space-x-2 active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Qabul qilish</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowAddModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-lg border-t-8 border-blue-600 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black uppercase tracking-tighter italic">Nakladnoy Yaratish</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Qabul qiluvchi xodim</label>
                <select 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  value={toUserIdx}
                  onChange={(e) => setToUserIdx(e.target.value)}
                >
                  <option value="">Tanlang...</option>
                  {users.filter(u => (u.uid || (u as any).id) !== myId && u.role !== UserRole.PENDING).map(u => <option key={u.uid || (u as any).id} value={u.uid || (u as any).id}>{u.fullName} ({u.role})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Material</label>
                <select 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  value={selectedMatId}
                  onChange={(e) => setSelectedMatId(e.target.value)}
                >
                  <option value="">{myStock.length ? 'Tanlang...' : 'Sizda yuborish uchun qoldiq yo\'q'}</option>
                  {myStock.map(i => (
                    <option key={i.materialId} value={i.materialId}>
                      {materials.find(m => m.id === i.materialId)?.name || i.name} — {i.available} {i.unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                  Miqdori{selectedStock && ` (maks. ${selectedStock.available} ${selectedStock.unit})`}
                </label>
                <input 
                  type="number"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  value={quantity || ''}
                  placeholder="0.00"
                  onChange={(e) => setQuantity(parseFloat(e.target.value))}
                />
              </div>
              <div className="pt-6 flex gap-4">
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs">Bekor qilish</button>
                <button onClick={handleCreate} className="flex-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-100 active:scale-95 transition-all">Yuborish</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
