import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Shield, XCircle, BarChart3, KeyRound, Briefcase, Languages } from 'lucide-react';
import { UserRole } from '../types';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(UserRole.PENDING);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t, lang, setLang } = useLanguage();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError(t('login') + ' Xatolik: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="absolute top-10 right-10 z-20">
         <button 
            onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
            className="flex items-center space-x-2 px-4 py-2 bg-white shadow-xl rounded-xl border border-slate-100 hover:scale-105 transition-all text-slate-600 font-bold uppercase text-xs"
          >
            <Languages className="w-4 h-4 text-blue-500" />
            <span>{lang === 'uz' ? 'O\'zbekcha' : 'Русский'}</span>
          </button>
      </div>

      <div className="max-w-4xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-200">
        <div className="w-full md:w-5/12 p-8 bg-slate-900 text-white flex flex-col justify-center">
          <div className="mb-8 text-center md:text-left">
            <h2 className="text-xl font-black uppercase tracking-widest text-blue-400">OpenConstruction</h2>
            <p className="text-slate-400 text-sm mt-1">Professional erp</p>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-blue-600/20 flex items-center justify-center text-blue-500">
                 <Shield className="w-6 h-6" />
               </div>
               <div>
                 <p className="font-bold text-sm">Xavfsiz tizim</p>
               </div>
            </div>
          </div>
        </div>

        <div className="w-full md:w-7/12 p-8 md:p-12 flex flex-col justify-center">
          <div className="mb-8 text-center md:text-left">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">{t('login')}</h1>
            <p className="text-slate-500 font-medium">{t('email')} va {t('password')} kiriting</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">{t('email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@erp.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">{t('password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? '...' : t('login')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
