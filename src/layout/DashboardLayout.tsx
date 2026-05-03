import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UserRole } from '../types';
import { cn } from '../lib/utils';
import { 
  Package, Users, Building, ClipboardList, FileText, 
  ArrowLeftRight, Inbox, LogOut, LayoutDashboard, Shield, Languages
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();

  const handleLogout = async () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { label: t('materials'), path: '/materials', icon: Package, roles: [UserRole.ADMIN, UserRole.FOREMAN, UserRole.WAREHOUSE, UserRole.PTO, UserRole.ACCOUNTING, UserRole.SUPPLY, UserRole.MANAGEMENT] },
    { label: t('users'), path: '/users', icon: Users, roles: [UserRole.ADMIN] },
    { label: t('requisitions'), path: '/requisitions', icon: ClipboardList, roles: [UserRole.FOREMAN, UserRole.PTO, UserRole.CHIEF_ENGINEER, UserRole.SUPPLY, UserRole.MANAGEMENT] },
    { label: t('reports'), path: '/reports', icon: FileText, roles: [UserRole.ADMIN, UserRole.FOREMAN, UserRole.PTO, UserRole.CHIEF_ENGINEER, UserRole.ACCOUNTING] },
    { label: t('waybills'), path: '/waybills', icon: ArrowLeftRight, roles: [UserRole.FOREMAN, UserRole.WAREHOUSE] },
    { label: t('inventory'), path: '/inventory', icon: LayoutDashboard, roles: [UserRole.CHIEF_ENGINEER] },
    { label: t('invoices'), path: '/invoices', icon: Inbox, roles: [UserRole.SUPPLY] },
  ];

  const filteredMenu = menuItems.filter(item => profile && item.roles.includes(profile.role as UserRole));
  const isPending = profile?.role === UserRole.PENDING;

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h1 className="text-xl font-black tracking-tighter uppercase italic text-blue-500">Tashkilot Boshqaruvi</h1>
          <button 
            onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
            className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all flex items-center space-x-1"
          >
            <Languages className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">{lang}</span>
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {!isPending ? filteredMenu.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center space-x-3 px-4 py-3 rounded-xl transition-all",
                  isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-900" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-bold text-sm uppercase tracking-tighter">{item.label}</span>
            </NavLink>
          )) : (
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl text-orange-500 text-xs font-bold text-center italic">
              {t('pending')}
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white uppercase shadow-lg shadow-blue-900">
              {profile?.fullName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black truncate uppercase tracking-tighter">{profile?.fullName}</p>
              <p className="text-[10px] text-slate-500 truncate uppercase font-mono font-bold">{isPending ? t('pending') : t(profile?.role as any)}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all font-black text-xs uppercase tracking-widest"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-white m-4 rounded-[2.5rem] shadow-2xl border border-slate-100 ring-1 ring-slate-200">
        <div className="p-8">
          {isPending ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
               <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 animate-pulse">
                 <Shield className="w-8 h-8" />
               </div>
               <h2 className="text-2xl font-black uppercase tracking-widest">{t('role')} kutilmoqda</h2>
               <p className="text-slate-500 max-w-sm">
                 {t('pending')}
               </p>
            </div>
          ) : children}
        </div>
      </main>
    </div>
  );
}
