import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { Building, Plus, MapPin, X } from 'lucide-react';
import ExportButton from '../components/ExportButton';
import { DataService } from '../services/dataService';

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', address: '' });

  const reloadData = async () => {
    const data = await DataService.getCollection('projects');
    setProjects(data);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await DataService.addToCollection('projects', newProject);
    setShowModal(false);
    setNewProject({ name: '', address: '' });
    reloadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Ob'yektlar</h1>
          <p className="text-slate-500 font-medium">Barcha qurilish maydonchalari reyestri</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 animate-bounce-slow"
          >
            <Plus className="w-5 h-5" />
            <span>Qo'shish</span>
          </button>
          <ExportButton 
            data={projects.map(p => ({ 'Nomi': p.name, 'Manzili': p.address }))} 
            headers={['Nomi', 'Manzili']} 
            title="Ob'yektlar ro'yxati" 
            filename="projects_list" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div key={project.id} className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-bl-[4rem] -mr-16 -mt-16 transition-all group-hover:scale-150"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200 text-white transition-all group-hover:rotate-6">
                <Building className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase italic tracking-tighter">{project.name}</h3>
              <div className="flex items-start gap-2 text-slate-500 text-sm italic font-medium">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <span>{project.address}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-md border-t-8 border-blue-600 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-black uppercase tracking-tighter italic">Yangi Ob'yekt</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Ob'yekt Nomi</label>
                <input 
                  type="text" required
                  value={newProject.name}
                  onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="Masalan: Golden House Block A"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Manzil</label>
                <textarea 
                  required
                  value={newProject.address}
                  onChange={(e) => setNewProject({...newProject, address: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all h-24 resize-none"
                  placeholder="Toshkent sh., Yunusobod tumani..."
                />
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs">Bekor qilish</button>
                <button type="submit" className="flex-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-100">Yaratish</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
