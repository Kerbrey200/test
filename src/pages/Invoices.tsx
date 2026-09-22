import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Invoice, Material, UserProfile, UserRole } from '../types';
import { Plus, Tag, Calendar, Trash2, X } from 'lucide-react';
import { DataService } from '../services/dataService';

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [newInvoice, setNewInvoice] = useState({
    number: '',
    date: new Date().toISOString().split('T')[0],
    supplier: '',
    supplyOfficerUid: '',
  });

  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [currentMatId, setCurrentMatId] = useState('');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [currentQty, setCurrentQty] = useState(0);

  const reloadData = async () => {
    const inv = await DataService.getCollection('invoices');
    const mats = await DataService.getCollection('materials');
    const uList = await DataService.getCollection('users');
    setInvoices(inv);
    setMaterials(mats);
    setUsers(uList);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const addItem = () => {
    const mat = materials.find(m => m.id === currentMatId);
    if (!mat) return alert('Materialni tanlang');
    if (!(currentQty > 0)) return alert('Miqdor 0 dan katta bo\'lishi kerak');
    if (!(currentPrice >= 0)) return alert('Narx noto\'g\'ri');
    setInvoiceItems([...invoiceItems, {
      materialId: mat.id,
      name: mat.name,
      price: currentPrice,
      quantity: currentQty,
      unit: mat.unit
    }]);
    setCurrentMatId('');
    setCurrentPrice(0);
    setCurrentQty(0);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invoiceItems.length === 0) return alert('Kamida bitta material qo\'shing');
    const number = newInvoice.number.trim();
    if (invoices.some(i => i.number.trim() === number && i.supplier.trim().toLowerCase() === newInvoice.supplier.trim().toLowerCase())) {
      return alert(`№ ${number} shet-faktura bu yetkazib beruvchidan allaqachon kiritilgan`);
    }

    try {
      await DataService.addInvoice({
        ...newInvoice,
        items: invoiceItems
      });
      setShowAddModal(false);
      setInvoiceItems([]);
      setNewInvoice({ number: '', date: new Date().toISOString().split('T')[0], supplier: '', supplyOfficerUid: '' });
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Shet-Fakturalar</h1>
          <p className="text-slate-500 font-medium">Birlamchi hujjatlar va materiallar kirimi</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>Shet bo'yicha kirim</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {invoices.map((inv) => (
          <div key={inv.id} className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm hover:shadow-xl transition-all relative group overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/30 rounded-bl-[3rem] -mr-12 -mt-12 group-hover:scale-150 transition-all"></div>
             <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 relative z-10">
               <div>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Shet-faktura raqami</span>
                 <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">№ {inv.number}</h2>
               </div>
               <div className="mt-4 md:mt-0 text-left md:text-right">
                 <div className="flex items-center md:justify-end text-slate-500 font-bold font-mono text-sm">
                   <Calendar className="w-4 h-4 mr-2 text-blue-500" />
                   <span>{inv.date}</span>
                 </div>
                 <div className="text-sm font-black text-blue-600 uppercase tracking-tighter mt-1 italic">{inv.supplier}</div>
               </div>
             </div>
             
             <div className="bg-slate-50/50 rounded-2xl p-6 flex flex-wrap gap-3 border border-slate-100">
               {inv.items.map((item: any, i: number) => (
                 <div key={i} className="flex items-center bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm shadow-sm group/item hover:border-blue-300 transition-all">
                   <Tag className="w-3 h-3 mr-2 text-blue-400" />
                   <span className="font-black text-slate-800 mr-3 uppercase text-xs">{item.name}</span>
                   <span className="bg-blue-600 text-white px-2 py-0.5 rounded-lg text-[9px] font-black mr-3 uppercase shadow-lg shadow-blue-100">{item.quantity} {item.unit}</span>
                   <span className="text-green-600 font-black text-xs font-mono">{item.price?.toLocaleString()} som</span>
                 </div>
               ))}
             </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowAddModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-2xl border-t-8 border-blue-600 animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter italic">Shet-Faktura Kirimi</h2>
                <p className="text-slate-400 text-sm font-mono tracking-tight">Hujjat ma'lumotlarini kiriting</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>

            <form onSubmit={handleAdd} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Shet Raqami</label>
                  <input type="text" value={newInvoice.number} onChange={e => setNewInvoice({...newInvoice, number: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all font-mono" required placeholder="SF-2023-001" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Sana</label>
                  <input type="date" value={newInvoice.date} onChange={e => setNewInvoice({...newInvoice, date: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all font-mono" required />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Yetkazib beruvchi</label>
                  <input type="text" value={newInvoice.supplier} onChange={e => setNewInvoice({...newInvoice, supplier: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all" required placeholder="Korxona nomi..." />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Mas'ul xodim</label>
                  <select className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold bg-white focus:ring-4 focus:ring-blue-50 transition-all" value={newInvoice.supplyOfficerUid} onChange={e => setNewInvoice({...newInvoice, supplyOfficerUid: e.target.value})} required>
                    <option value="">Tanlang</option>
                    {users.filter((u: any) => u.role === UserRole.SUPPLY || u.role === UserRole.WAREHOUSE).map((u: any) => <option key={u.uid || u.id} value={u.uid || u.id}>{u.fullName}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-6 text-blue-400">Materiallar qo'shish</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                     <select className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl outline-none font-bold text-sm" value={currentMatId} onChange={e => setCurrentMatId(e.target.value)}>
                        <option value="">Tanlash...</option>
                        {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                     </select>
                     <input type="number" placeholder="Narxi (som)" className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl outline-none font-bold text-sm" value={currentPrice || ''} onChange={e => setCurrentPrice(parseFloat(e.target.value))} />
                     <input type="number" placeholder="Miqdori" className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl outline-none font-bold text-sm" value={currentQty || ''} onChange={e => setCurrentQty(parseFloat(e.target.value))} />
                  </div>
                  <button type="button" onClick={addItem} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-blue-500/20">Pozitsiyani qo'shish</button>
                </div>
              </div>

              <div className="space-y-3">
                {invoiceItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl text-sm shadow-sm hover:border-blue-200 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center font-black text-[10px] text-blue-600 tracking-tighter">{(idx + 1).toString().padStart(2, '0')}</div>
                      <span className="font-black text-slate-800 uppercase italic tracking-tighter">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-slate-400 font-mono font-bold">{item.quantity} {item.unit} <span className="mx-2">•</span> {item.price?.toLocaleString()} som</span>
                      <button type="button" onClick={() => setInvoiceItems(invoiceItems.filter((_, i) => i !== idx))} className="p-2 hover:bg-red-50 text-red-400 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-6 flex gap-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs">Bekor qilish</button>
                <button type="submit" className="flex-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-100 active:scale-95 transition-all">Shetni saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
