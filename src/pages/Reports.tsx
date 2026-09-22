import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { TechnicalReport, ReportStatus, Project, Material, UserRole, Inventory } from '../types';
import { FileText, Plus, CheckCircle, Calendar, ChevronRight, Trash2, X, FileSpreadsheet, AlertCircle } from 'lucide-react';
import ExportButton from '../components/ExportButton';
import ExcelImport from '../components/ExcelImport';
import { DataService } from '../services/dataService';

export default function Reports() {
  const [reports, setReports] = useState<TechnicalReport[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [reportItems, setReportItems] = useState<any[]>([]);
  const [currentMatId, setCurrentMatId] = useState('');
  const [currentQty, setCurrentQty] = useState(0);

  const reloadData = async () => {
    const repL = await DataService.getCollection('reports');
    const projL = await DataService.getCollection('projects');
    const matL = await DataService.getCollection('materials');
    const invL = await DataService.getCollection('inventory');
    setReports(repL);
    setProjects(projL);
    setMaterials(matL);
    setInventory(invL);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const addItem = () => {
    const mat = materials.find(m => m.id === currentMatId);
    if (!mat || !(currentQty > 0)) return;
    setReportItems([...reportItems, { materialId: mat.id, name: mat.name, quantity: currentQty, unit: mat.unit }]);
    setCurrentMatId('');
    setCurrentQty(0);
  };

  const myId = profile?.uid || '';

  const handleCreate = async () => {
    if (!myId) return;
    if (!selectedProjectId) return alert('Obyektni tanlang');
    if (reportItems.length === 0) return alert('Kamida bitta material qo\'shing');
    if (reportItems.some(i => !i.materialId)) return alert('Barcha qatorlarni tizimdagi materialga bog\'lang');
    if (reportItems.some(i => !(i.quantity > 0))) return alert('Miqdor 0 dan katta bo\'lishi kerak');

    const duplicate = reports.find(r => r.foremanUid === myId && r.objectId === selectedProjectId && r.month === month && r.year === year);
    if (duplicate) return alert(`${month}/${year} davri uchun bu obyektga hisobot allaqachon mavjud`);

    try {
      await DataService.addToCollection('reports', {
        objectId: selectedProjectId,
        foremanUid: myId,
        month,
        year,
        items: reportItems.map(({ excelName, ...item }) => item),
        status: ReportStatus.PENDING_PTO,
        ptoApproved: false,
        chiefApproved: false
      });
      setShowAddModal(false);
      setReportItems([]);
      setSelectedProjectId('');
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  const canApprove = (report: TechnicalReport) => {
    if (!profile) return false;
    if (report.status === ReportStatus.PENDING_PTO) return profile.role === UserRole.PTO || profile.role === UserRole.ADMIN;
    if (report.status === ReportStatus.PENDING_CHIEF) return profile.role === UserRole.CHIEF_ENGINEER || profile.role === UserRole.ADMIN;
    return false;
  };

  const approveReport = async (report: TechnicalReport) => {
    if (!canApprove(report)) return;
    try {
      await DataService.approveReport(report.id, myId);
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  const visibleReports = profile?.role === UserRole.FOREMAN
    ? reports.filter(r => r.foremanUid === myId)
    : reports;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">{t('reports')}</h1>
          <p className="text-slate-500 font-medium">{t('reports')} & M-29</p>
        </div>
        <div className="flex items-center space-x-2">
          {profile?.role === UserRole.FOREMAN && (
            <button 
              onClick={() => setShowExcelModal(true)}
              className="flex items-center space-x-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-200 transition-all active:scale-95"
            >
              <FileSpreadsheet className="w-5 h-5 text-blue-500" />
              <span>{t('compare')}</span>
            </button>
          )}
          
          {(profile?.role === UserRole.FOREMAN || profile?.role === UserRole.ADMIN) && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span>{t('reports')} yaratish</span>
            </button>
          )}
          <ExportButton 
            data={visibleReports.map(r => ({ 'Obyekt': projects.find(p => p.id === r.objectId)?.name, 'Muddat': `${r.month}/${r.year}`, 'Status': r.status }))} 
            headers={['Obyekt', 'Muddat', 'Status']} 
            title={t('reports')} 
            filename="tech_reports_m29" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleReports.map((report) => (
          <div key={report.id} className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl transition-all flex flex-col group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-50/50 rounded-bl-[3rem] -mr-12 -mt-12 group-hover:scale-150 transition-all"></div>
            <div className="flex items-center justify-between mb-6 relative z-10">
               <div className="p-3 bg-white shadow-xl rounded-2xl text-orange-600 border border-orange-50">
                 <Calendar className="w-6 h-6" />
               </div>
               <span className={`text-[10px] font-black px-3 py-1 rounded-xl uppercase tracking-widest ring-1 ring-inset ${
                 report.status === ReportStatus.APPROVED ? 'bg-green-50 text-green-700 ring-green-100' : 'bg-blue-50 text-blue-700 ring-blue-100'
               }`}>
                 {report.status}
               </span>
            </div>
            
            <h3 className="font-black text-2xl text-slate-900 mb-2 uppercase italic tracking-tighter leading-tight relative z-10">
               {projects.find(p => p.id === report.objectId)?.name || 'Ob\'yekt noma\'lum'}
            </h3>
            <p className="text-sm text-slate-400 mb-6 font-mono font-bold uppercase">{t('reports')} davri: {report.month}/{report.year}</p>
            
            <div className="mt-auto pt-6 border-t border-slate-50 flex items-center justify-between">
              <div className="flex -space-x-3">
                 <div className={`w-10 h-10 rounded-2xl border-4 border-white flex items-center justify-center text-[10px] font-black shadow-lg ${report.ptoApproved ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`} title="PTO">PTO</div>
                 <div className={`w-10 h-10 rounded-2xl border-4 border-white flex items-center justify-center text-[10px] font-black shadow-lg ${report.chiefApproved ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`} title="GI">GI</div>
              </div>
              
              {canApprove(report) && (
                <button
                  onClick={() => approveReport(report)}
                  title="Tasdiqlash"
                  className="bg-blue-600 text-white p-3 rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-90"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showExcelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowExcelModal(false)}></div>
          <div className="relative w-full max-w-2xl transform transition-all">
            <ExcelImport 
              materials={materials} 
              inventory={inventory.filter(i => i.holderId === myId)}
              onCompare={() => {}} 
              onImport={(data) => {
                 setReportItems(data.map(item => ({
                   materialId: item.materialId || '',
                   name: item.name || '',
                   quantity: item.excelQty,
                   unit: materials.find(m => m.id === item.materialId)?.unit || item.unit || 'dona',
                   excelName: item.name // Keep temporary name for UI display
                 })));
                 setShowExcelModal(false);
                 setShowAddModal(true);
              }}
            />
            <button 
              onClick={() => setShowExcelModal(false)}
              className="absolute -top-4 -right-4 bg-white text-slate-900 p-2 rounded-full shadow-xl hover:scale-110 transition-all border border-slate-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowAddModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-2xl border-t-8 border-orange-500 animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter italic">M-29 Hisoboti</h2>
                <p className="text-slate-400 text-sm font-mono tracking-tight uppercase">Materiallarni hisobdan chiqarish</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Qurilish Obyekti</label>
                <select 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-orange-50 transition-all"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  <option value="">Tanlang...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Muddat (Oy / Yil)</label>
                <div className="grid grid-cols-2 gap-4">
                  <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white transition-all">
                    {Array.from({length: 12}).map((_, i) => <option key={i+1} value={i+1}>{i+1}-oy</option>)}
                  </select>
                  <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold font-mono outline-none focus:bg-white transition-all" />
                </div>
              </div>

              <div className="bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-6 text-orange-400">Ishlatilgan Materiallar</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                     <select className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl outline-none font-bold text-sm" value={currentMatId} onChange={e => setCurrentMatId(e.target.value)}>
                        <option value="">Materialni tanlang...</option>
                        {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                     </select>
                     <input type="number" placeholder="Miqdori" className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl outline-none font-bold text-sm" value={currentQty || ''} onChange={e => setCurrentQty(parseFloat(e.target.value))} />
                  </div>
                  <button type="button" onClick={addItem} className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-orange-500/20">Hisobotga qo'shish</button>
                </div>
              </div>

              <div className="space-y-3">
                {reportItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col bg-white border border-slate-200 p-4 rounded-2xl shadow-sm hover:border-orange-200 transition-all group">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center font-black text-[10px] text-orange-600 tracking-tighter">{(idx + 1).toString().padStart(2, '0')}</div>
                        <span className="font-black text-slate-800 uppercase italic tracking-tighter truncate max-w-[200px]">
                          {item.excelName || materials.find(m => m.id === item.materialId)?.name || "Yangi material"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-xl font-black text-xs uppercase tracking-tighter">{item.quantity} {item.unit}</span>
                        <button type="button" onClick={() => setReportItems(reportItems.filter((_, i) => i !== idx))} className="p-2 hover:bg-red-50 text-red-300 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl">
                      <select 
                        className="flex-1 bg-transparent border-none outline-none text-[10px] font-bold text-slate-600 uppercase"
                        value={item.materialId}
                        onChange={(e) => {
                          const mat = materials.find(m => m.id === e.target.value);
                          const newItems = [...reportItems];
                          newItems[idx] = { 
                            ...newItems[idx], 
                            materialId: e.target.value,
                            unit: mat?.unit || newItems[idx].unit
                          };
                          setReportItems(newItems);
                        }}
                      >
                        <option value="">Tizimdagi materialni tanlang...</option>
                        {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      {!item.materialId && (
                        <div className="flex items-center gap-1 text-[8px] font-black text-orange-500 uppercase animate-pulse">
                          <AlertCircle className="w-3 h-3" />
                          <span>Bog'lanmagan</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {reportItems.length === 0 && <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest py-8 animate-pulse italic">Hali materiallar qo'shilmadi</p>}
              </div>

              <div className="pt-6 flex gap-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs">Bekor qilish</button>
                <button type="button" onClick={handleCreate} className="flex-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-100 active:scale-95 transition-all">Hisobotni saqlash</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
