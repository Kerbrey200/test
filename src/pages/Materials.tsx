import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Material, UserRole, Inventory } from '../types';
import { Plus, Search, Image as ImageIcon, X, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import ExportButton from '../components/ExportButton';
import ExcelImport from '../components/ExcelImport';
import { DataService } from '../services/dataService';

export default function Materials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: '', code: '', unit: '', photoUrl: '' });
  const { profile } = useAuth();
  const { t } = useLanguage();

  const reloadData = async () => {
    const matData = await DataService.getCollection('materials');
    const invData = await DataService.getCollection('inventory');
    setMaterials(matData);
    setInventory(invData);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || profile.role !== UserRole.ADMIN) return;
    
    try {
      await DataService.addToCollection('materials', {
        ...newMaterial,
        qrCodeData: `MAT-${newMaterial.code}`,
      });
      setShowAddModal(false);
      setNewMaterial({ name: '', code: '', unit: '', photoUrl: '' });
      reloadData();
    } catch (error) {
      console.error('Error adding material:', error);
    }
  };

  const handleExcelImport = async (data: any[]) => {
    if (!profile || profile.role !== UserRole.ADMIN) return;
    setImporting(true);
    
    try {
      let addedCount = 0;
      let updatedInventoryCount = 0;

      for (const item of data) {
        // Find existing material by code or name
        let matchedMaterial = materials.find(m => 
          (m.code && item.code && m.code.toLowerCase() === item.code.toLowerCase()) ||
          (m.name.toLowerCase() === item.name.toLowerCase())
        );

        let materialId = matchedMaterial?.id;

        // 1. Create material if it doesn't exist
        if (!matchedMaterial) {
          const res = await DataService.addToCollection('materials', {
            name: item.name,
            code: item.code || `X-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            unit: item.unit || 'dona',
            photoUrl: '',
            qrCodeData: `MAT-${item.code || 'TEMP'}`
          });
          materialId = res.id;
          addedCount++;
        }

        // 2. Initialize or Update Inventory if qty is provided
        if (materialId && item.excelQty > 0) {
          const invItem = inventory.find(i => i.materialId === materialId && i.holderId === 'warehouse');
          
          if (!invItem) {
            // Create new inventory record for Main Warehouse
            await DataService.addToCollection('inventory', {
              materialId,
              holderId: 'warehouse',
              name: item.name,
              balance: item.excelQty,
              totalReceived: item.excelQty,
              totalUsed: 0,
              unit: item.unit || 'dona',
              lastUpdated: new Date().toISOString()
            });
            updatedInventoryCount++;
          } else {
            // Update existing inventory balance (Add to it)
            await DataService.updateInCollection('inventory', invItem.id, {
              ...invItem,
              balance: invItem.balance + item.excelQty,
              totalReceived: invItem.totalReceived + item.excelQty,
              lastUpdated: new Date().toISOString()
            });
            updatedInventoryCount++;
          }
        }
      }
      
      setShowExcelModal(false);
      await reloadData();
      alert(`Import yakunlandi!\nYangi materiallar: ${addedCount}\nInventar yangilandi: ${updatedInventoryCount}`);
    } catch (error) {
      console.error('Import error:', error);
      alert('Import qilishda xatolik yuz berdi');
    } finally {
      setImporting(false);
    }
  };

  const getBalance = (materialId: string) => {
    const item = inventory.find(i => i.materialId === materialId);
    return item ? item.balance : 0;
  };

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">{t('materials')}</h1>
          <p className="text-slate-500 font-medium">{t('materials')} katalogi</p>
        </div>
        
        <div className="flex items-center space-x-2">
          {profile?.role === UserRole.ADMIN && (
            <>
              <button 
                onClick={() => setShowExcelModal(true)}
                className="flex items-center space-x-2 px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all font-bold"
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span>Excel</span>
              </button>
              <button 
                onClick={() => setShowAddModal(true)}
                className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-100"
              >
                <Plus className="w-5 h-5" />
                <span>{t('add')}</span>
              </button>
            </>
          )}
          <ExportButton 
            data={filteredMaterials.map(m => ({ 'Kod': m.code, 'Nomi': m.name, 'O\'lchov': m.unit, 'Qoldiql': getBalance(m.id) }))} 
            headers={['Kod', 'Nomi', 'O\'lchov', 'Qoldiq']} 
            title={t('materials')} 
            filename="materials_list" 
          />
        </div>
      </div>

      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
        <input 
          type="text" 
          placeholder={t('materials') + "..."} 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-[1.25rem] focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredMaterials.map((material) => (
          <div key={material.id} className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group">
            <div className="h-48 bg-slate-50 flex items-center justify-center relative overflow-hidden">
              {material.photoUrl ? (
                <img src={material.photoUrl} alt={material.name} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center text-slate-300">
                  <ImageIcon className="w-12 h-12 mb-2" />
                </div>
              )}
              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-3 rounded-2xl shadow-xl group-hover:rotate-6 transition-transform">
                <QRCodeSVG value={`MAT-${material.code}`} size={48} />
              </div>
              <div className="absolute bottom-4 left-4">
                <span className="px-3 py-1 bg-slate-900 shadow-xl text-white rounded-lg text-[10px] font-black uppercase tracking-tighter">
                  {getBalance(material.id)} {material.unit}
                </span>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-tighter">Kod: {material.code}</span>
              </div>
              <h3 className="text-lg font-black text-slate-800 leading-tight uppercase italic tracking-tighter">{material.name}</h3>
            </div>
          </div>
        ))}
      </div>

      {showExcelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowExcelModal(false)}></div>
          <div className="relative w-full max-w-2xl transform transition-all bg-white rounded-[2.5rem] p-8 shadow-2xl overflow-hidden">
            {importing ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                <p className="font-black uppercase tracking-widest text-slate-500 animate-pulse">Ma'lumotlar saqlanmoqda...</p>
              </div>
            ) : (
              <div className="max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter italic">Exceldan Import</h2>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Katalogga yangi materiallar qo'shish</p>
                  </div>
                  <button onClick={() => setShowExcelModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
                </div>
                <ExcelImport 
                  materials={materials}
                  inventory={inventory}
                  onCompare={() => {}}
                  onImport={handleExcelImport}
                  importLabel="Katalogga saqlash"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowAddModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-md border-t-8 border-blue-600 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-black uppercase tracking-tighter italic">Yangi Material</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddMaterial} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Material Nomi</label>
                <input 
                  type="text" required
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial({...newMaterial, name: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                />
              </div>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Kod</label>
                  <input 
                    type="text" required
                    value={newMaterial.code}
                    onChange={(e) => setNewMaterial({...newMaterial, code: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Birlik</label>
                  <input 
                    type="text" required
                    value={newMaterial.unit}
                    onChange={(e) => setNewMaterial({...newMaterial, unit: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                    placeholder="kg, m2, litr"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Foto Rasm (URL)</label>
                <input 
                  type="url"
                  value={newMaterial.photoUrl}
                  onChange={(e) => setNewMaterial({...newMaterial, photoUrl: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="https://..."
                />
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs">Bekor qilish</button>
                <button type="submit" className="flex-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-100">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
