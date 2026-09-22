import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Requisition, RequisitionStatus, Material, Project, UserRole, RequisitionItem } from '../types';
import { ClipboardList, Plus, Search, CheckCircle2, XCircle, Clock, ArrowRight, User, X } from 'lucide-react';
import { formatDateTime } from '../lib/utils';
import { DataService } from '../services/dataService';

export default function Requisitions() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const { profile } = useAuth();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [cart, setCart] = useState<RequisitionItem[]>([]);
  const [searchMat, setSearchMat] = useState('');

  const reloadData = async () => {
    const rL = await DataService.getCollection('requisitions');
    const mL = await DataService.getCollection('materials');
    const pL = await DataService.getCollection('projects');
    setRequisitions(rL as Requisition[]);
    setMaterials(mL);
    setProjects(pL);
    setLoading(false);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const addToCart = (mat: Material) => {
    if (cart.find(c => c.materialId === mat.id)) return;
    setCart([...cart, { materialId: mat.id, name: mat.name, quantity: 1, unit: mat.unit }]);
  };

  const updateCartQty = (id: string, qty: number) => {
    setCart(cart.map(c => c.materialId === id ? { ...c, quantity: qty } : c));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(c => c.materialId !== id));
  };

  const myId = profile?.uid || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myId || !selectedProjectId || cart.length === 0) return;
    if (cart.some(c => !(c.quantity > 0))) return alert('Barcha materiallar miqdori 0 dan katta bo\'lishi kerak');

    const newReq = {
      objectId: selectedProjectId,
      requesterUid: myId,
      items: cart,
      status: RequisitionStatus.PENDING_CHIEF,
      history: [{
        status: RequisitionStatus.PENDING_CHIEF,
        timestamp: new Date().toISOString(),
        userUid: myId,
        comment: 'Zayavka yaratildi'
      }],
    };

    try {
      await DataService.addToCollection('requisitions', newReq);
      setShowAddModal(false);
      setCart([]);
      setSelectedProjectId('');
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  const decide = async (req: Requisition, decision: 'approve' | 'reject') => {
    let comment: string | undefined;
    if (decision === 'reject') {
      const reason = prompt('Rad etish sababi:');
      if (reason === null) return;
      comment = reason.trim() || undefined;
    }
    try {
      await DataService.decideRequisition(req.id, myId, decision, comment);
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  const getStatusColor = (status: RequisitionStatus) => {
    switch (status) {
      case RequisitionStatus.APPROVED: return 'text-green-600 bg-green-50 border-green-200';
      case RequisitionStatus.REJECTED: return 'text-red-600 bg-red-50 border-red-200';
      case RequisitionStatus.DRAFT: return 'text-slate-600 bg-slate-50 border-slate-200';
      default: return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const APPROVER_ROLE: Partial<Record<RequisitionStatus, UserRole>> = {
    [RequisitionStatus.PENDING_CHIEF]: UserRole.CHIEF_ENGINEER,
    [RequisitionStatus.PENDING_PTO]: UserRole.PTO,
    [RequisitionStatus.PENDING_MGMT]: UserRole.MANAGEMENT,
  };

  const canApprove = (req: Requisition) => {
    const role = APPROVER_ROLE[req.status];
    if (!profile || !role) return false;
    return profile.role === role || profile.role === UserRole.ADMIN;
  };

  const visibleRequisitions = profile?.role === UserRole.FOREMAN
    ? requisitions.filter(r => r.requesterUid === myId)
    : requisitions;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Materiallarga Zakazlar</h1>
          <p className="text-slate-500 font-medium font-mono text-sm uppercase">Tasdiqlash va xarid qilish jarayoni</p>
        </div>
        <div className="flex space-x-2">
          {(profile?.role === UserRole.FOREMAN || profile?.role === UserRole.ADMIN) && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 animate-pulse"
            >
              <Plus className="w-5 h-5" />
              <span>Zayavka yaratish</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {visibleRequisitions.map((req) => (
          <div key={req.id} className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl transition-all relative group">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
              <div className="flex items-center space-x-4">
                <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-inner ${getStatusColor(req.status)}`}>
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-xl tracking-tighter uppercase italic">Zayavka #{req.id?.slice(0,6)}</h3>
                  <p className="text-sm text-slate-400 font-bold uppercase">{projects.find(p => p.id === req.objectId)?.name || 'Ob\'yekt noma\'lum'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-8">
                <div className="text-left md:text-right">
                  <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Status</div>
                  <div className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-xl ring-1 ring-inset ${getStatusColor(req.status)}`}>{req.status}</div>
                </div>
                <div className="text-left md:text-right hidden sm:block">
                  <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Sana</div>
                  <div className="text-xs font-black font-mono text-slate-600">{req.createdAt ? formatDateTime(req.createdAt) : '-'}</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50/50 rounded-2xl p-6 mb-6 border border-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {req.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl text-sm border border-slate-100 shadow-sm">
                    <span className="font-black text-slate-700 truncate mr-3 uppercase italic text-xs">{item.name}</span>
                    <span className="font-black text-blue-600 shrink-0 text-xs">{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-slate-50">
               <div className="flex items-center text-[10px] text-slate-400 font-bold uppercase tracking-widest space-x-2">
                 <User className="w-3 h-3 text-blue-500" />
                 <span>ID: {req.requesterUid?.slice(0,12)}</span>
               </div>
               
               <div className="flex gap-3">
                  {canApprove(req) && (
                    <>
                      <button 
                        onClick={() => decide(req, 'reject')}
                        className="flex items-center space-x-2 px-5 py-2.5 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 text-xs font-black uppercase tracking-widest transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Rad etish</span>
                      </button>
                      <button 
                        onClick={() => decide(req, 'approve')}
                        className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-green-500 text-white hover:bg-green-600 text-xs font-black uppercase tracking-widest shadow-lg shadow-green-100 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Tasdiqlash</span>
                      </button>
                    </>
                  )}
               </div>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowAddModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl p-0 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border-t-8 border-blue-600 animate-in fade-in zoom-in">
            <div className="p-8 border-b bg-slate-50/50 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter italic">Yangi Zayavka</h2>
                <p className="text-slate-400 text-sm font-mono tracking-tight uppercase">Kerakli materiallar ro'yxatini shakllantiring</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              <div className="w-full md:w-1/2 p-8 overflow-y-auto border-r border-slate-100">
                <div className="relative mb-6">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Material qidirish..." 
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all shadow-inner"
                    value={searchMat}
                    onChange={(e) => setSearchMat(e.target.value)}
                  />
                </div>
                <div className="space-y-3">
                  {materials.filter(m => m.name.toLowerCase().includes(searchMat.toLowerCase())).map(mat => (
                    <button 
                      key={mat.id}
                      onClick={() => addToCart(mat)}
                      className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-left shadow-sm hover:shadow-md group"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all"><ClipboardList className="w-6 h-6" /></div>
                        <div>
                          <p className="font-bold text-slate-800 uppercase italic tracking-tighter">{mat.name}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{mat.code} • {mat.unit}</p>
                        </div>
                      </div>
                      <Plus className="w-5 h-5 text-blue-600 group-hover:scale-125 transition-transform" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-1/2 p-8 flex flex-col bg-slate-50/30">
                <div className="mb-8">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Obyektni tanlang</label>
                  <select 
                    required
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-50 shadow-sm"
                  >
                    <option value="">Tanlanmagan</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 mb-8">
                  <div className="flex justify-between items-center mb-4">
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Savat ({cart.length})</label>
                     <button onClick={() => setCart([])} className="text-[10px] font-black text-red-400 uppercase hover:text-red-600 transition-colors">Tozalash</button>
                  </div>
                  {cart.length === 0 && (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-300 space-y-3 animate-pulse">
                      <ClipboardList className="w-16 h-16" />
                      <p className="font-bold italic uppercase tracking-tighter">Savat bo'sh</p>
                    </div>
                  )}
                  {cart.map(item => (
                    <div key={item.materialId} className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="font-black text-slate-800 text-sm truncate uppercase italic tracking-tighter">{item.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.unit}</p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <input 
                          type="number" 
                          min="0.1"
                          step="0.1"
                          value={item.quantity}
                          onChange={(e) => updateCartQty(item.materialId, parseFloat(e.target.value))}
                          className="w-20 px-3 py-2 border border-slate-200 rounded-xl text-center font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                        />
                        <button onClick={() => removeFromCart(item.materialId)} className="p-2 hover:bg-red-50 text-red-300 hover:text-red-500 rounded-xl transition-all"><XCircle className="w-5 h-5" /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleSubmit}
                  disabled={!selectedProjectId || cart.length === 0}
                  className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-[0.2em] text-sm hover:bg-blue-700 transition-all shadow-2xl shadow-blue-200 disabled:opacity-50 flex items-center justify-center space-x-3 active:scale-95"
                >
                  <ArrowRight className="w-6 h-6" />
                  <span>Tasdiqlashga yuborish</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
