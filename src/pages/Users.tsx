import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { UserProfile, UserRole, Project } from '../types';
import { Mail, Shield, Building, Edit2, Plus, X } from 'lucide-react';
import ExportButton from '../components/ExportButton';
import { DataService } from '../services/dataService';

export default function Users() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  const reloadData = async () => {
    const uList = await DataService.getCollection('users');
    const pList = await DataService.getCollection('projects');
    setUsers(uList);
    setProjects(pList);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isAdding) {
        await DataService.addToCollection('users', editingUser);
      } else {
        await DataService.updateInCollection('users', editingUser.uid || editingUser.id, editingUser);
      }
      setShowModal(false);
      setEditingUser(null);
      reloadData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  const getRoleBadge = (role: string) => {
    switch(role) {
      case UserRole.ADMIN: return 'bg-red-100 text-red-800';
      case UserRole.PENDING: return 'bg-slate-100 text-slate-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">{t('users')}</h1>
          <p className="text-slate-500 font-medium font-mono text-sm leading-none">Huquqlar va rollarni boshqarish markazi</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setEditingUser({ fullName: '', email: '', password: '', role: UserRole.PENDING });
              setIsAdding(true);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t('add')} {t('users')}</span>
          </button>
          <ExportButton 
            data={users.map(u => ({ 'F.I.O': u.fullName, 'Email': u.email, 'Rol': u.role, 'Obyekt': projects.find(p => p.id === u.objectId)?.name || '-' }))} 
            headers={['F.I.O', 'Email', 'Rol', 'Obyekt']} 
            title={t('users')} 
            filename="users_erp" 
          />
        </div>
      </div>

      <div className="bg-white border rounded-[2rem] overflow-hidden shadow-2xl shadow-slate-200/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900 text-white font-mono uppercase tracking-widest text-[10px]">
                <th className="px-8 py-5">Foydalanuvchi ma'lumotlari</th>
                <th className="px-8 py-5">Tizimdagi roli</th>
                <th className="px-8 py-5">Biriktirilgan obyekt</th>
                <th className="px-8 py-5 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 italic">
              {users.map((u: any) => (
                <tr key={u.uid || u.id} className="hover:bg-slate-50/80 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center font-black text-slate-600 shadow-inner group-hover:from-blue-100 group-hover:to-blue-200 transition-all">
                        {u.fullName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-black text-slate-900 text-lg leading-tight uppercase tracking-tight">{u.fullName}</div>
                        <div className="text-[11px] text-slate-400 font-mono font-bold flex items-center space-x-1">
                          <Mail className="w-3 h-3" />
                          <span>{u.email}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`inline-flex items-center px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${getRoleBadge(u.role)}`}>
                      <Shield className="w-3 h-3 mr-1.5" />
                      {u.role === 'PENDING' ? 'Kutilmoqda' : u.role}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                       <Building className="w-4 h-4 text-slate-300" />
                       <span className="font-bold text-slate-600 text-sm">
                         {projects.find(p => p.id === u.objectId)?.name || 'Obyekt yo\'q'}
                       </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button 
                      onClick={() => { setEditingUser(u); setIsAdding(false); setShowModal(true); }}
                      className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-lg border-t-8 border-blue-600 animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter italic">{isAdding ? "Yangi Foydalanuvchi" : "Sozlamalar"}</h2>
                <p className="text-slate-400 text-sm font-mono">{isAdding ? "Tizimga yangi xodim qo'shish" : "Foydalanuvchi profilini yangilash"}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">F.I.O.</label>
                <input 
                  type="text" required
                  value={editingUser.fullName}
                  onChange={(e) => setEditingUser({...editingUser, fullName: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="Aliyev Vali..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('email')}</label>
                <input 
                  type="email" required
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="name@erp.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('password')}</label>
                <input 
                  type="text" required
                  value={editingUser.password || ''}
                  onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="Kamida 6 belgi"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Tizimdagi Rol</label>
                  <select 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                  >
                    <option value="PENDING">Kutilmoqda</option>
                    {Object.values(UserRole).filter(r => r !== 'PENDING').map(r => <option key={r} value={r}>{t(r as any)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Obyektni Biriktirish</label>
                  <select 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                    value={editingUser.objectId || ''}
                    onChange={(e) => setEditingUser({...editingUser, objectId: e.target.value})}
                  >
                    <option value="">Biriktirilmagan</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Bekor qilish</button>
                <button type="submit" className="flex-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                  {isAdding ? t('add') : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
