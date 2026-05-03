import React, { useState, useEffect } from 'react';
import { Inventory, Material, UserProfile } from '../types';
import { Search, ArrowDownLeft, ArrowUpRight, User } from 'lucide-react';
import ExportButton from '../components/ExportButton';
import { DataService } from '../services/dataService';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const reloadData = async () => {
    const invData = await DataService.getCollection('inventory');
    const matData = await DataService.getCollection('materials');
    const userData = await DataService.getCollection('users');
    setInventory(invData);
    setMaterials(matData);
    setUsers(userData);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const filtered = inventory.filter(i => {
    const matName = materials.find(m => m.id === i.materialId)?.name || '';
    const holder = users.find(u => (u.uid || (u as any).id) === i.holderId);
    const holderName = holder?.fullName || 'Sklad';
    return matName.toLowerCase().includes(searchTerm.toLowerCase()) || holderName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Ombor Inventari</h1>
          <p className="text-slate-500 font-medium font-mono text-sm">Umumiy qoldiqlar va harakatlar nazorati</p>
        </div>
        <ExportButton 
          data={filtered.map(i => ({ 
            'Material': materials.find(m => m.id === i.materialId)?.name, 
            'Mas\'ul': users.find(u => (u.uid || (u as any).id) === i.holderId)?.fullName || 'Sklad',
            'Qoldiq': i.balance,
            'Kirish': i.totalReceived,
            'Chiqish': i.totalUsed
          }))} 
          headers={['Material', 'Mas\'ul', 'Qoldiq', 'Kirish', 'Chiqish']} 
          title="Ombor qoldiqlari" 
          filename="inventory_report" 
        />
      </div>

      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
        <input 
          type="text" 
          placeholder="Material yoki mas'ul shaxs bo'yicha qidirish..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-[1.25rem] focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-2xl shadow-slate-200/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900 text-white font-mono uppercase tracking-widest text-[10px]">
                <th className="px-8 py-5">Material</th>
                <th className="px-8 py-5">Mas'ul shaxs</th>
                <th className="px-8 py-5 text-center">Jami Kirish</th>
                <th className="px-8 py-5 text-center">Jami Chiqish</th>
                <th className="px-8 py-5 text-right">Hozirgi Qoldiq</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 italic">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-all group">
                  <td className="px-8 py-5">
                    <div className="font-black text-slate-900 uppercase tracking-tighter leading-tight">
                      {materials.find(m => m.id === item.materialId)?.name || 'Noma\'lum'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono font-bold">
                      ID: {materials.find(m => m.id === item.materialId)?.code}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                     <div className="flex items-center space-x-2 text-sm text-slate-600 font-bold">
                       <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px]">
                         <User className="w-3 h-3" />
                       </div>
                       <span>{users.find(u => (u.uid || (u as any).id) === item.holderId)?.fullName || 'Mas\'ul aniqlanmadi'}</span>
                     </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                     <div className="inline-flex items-center space-x-1 text-green-600 font-black text-sm">
                       <ArrowDownLeft className="w-3 h-3" />
                       <span>{item.totalReceived}</span>
                     </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                     <div className="inline-flex items-center space-x-1 text-red-500 font-black text-sm">
                       <ArrowUpRight className="w-3 h-3" />
                       <span>{item.totalUsed}</span>
                     </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="text-xl font-black text-blue-600 tracking-tighter">
                      {item.balance} <span className="text-[10px] font-bold text-slate-400 uppercase">{item.unit}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
