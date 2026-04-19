import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Plus,
  RefreshCw,
  Trash2,
  Link,
  FileText,
  Clock,
  Loader2
} from 'lucide-react';

interface EPGSource {
  id: number;
  name: string;
  url: string;
  last_sync: string;
}

export const EPG: React.FC = () => {
  const [sources, setSources] = useState<EPGSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', url: '' });

  const fetchSources = () => {
    setLoading(true);
    fetch('/api/epg/sources')
      .then(res => res.json())
      .then(data => {
        setSources(data);
        setLoading(false);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/epg/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSource)
      });
      if (res.ok) {
        setIsAdding(false);
        setNewSource({ name: '', url: '' });
        fetchSources();
      }
    } catch (err) { alert('Add failed'); }
  };

  const handleSync = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await fetch(`/api/epg/sources/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Sync complete! Ingested ${data.count} programs.`);
      } else {
        alert(`Sync error: ${data.error}`);
      }
      fetchSources();
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this EPG source?')) return;
    try {
      await fetch(`/api/epg/sources/${id}`, { method: 'DELETE' });
      fetchSources();
    } catch (err) { alert('Delete failed'); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-white">Program <span className="text-indigo-500">Registry</span></h2>
          <p className="text-slate-400 text-sm mt-1">XMLTV source aggregation and EPG sync engine.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
        >
           <Plus size={18} /> New XMLTV Source
        </button>
      </header>

      {/* Add Source Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAdd} className="glass p-8 rounded-[2.5rem] mb-8 space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Friendly Name</label>
                     <div className="relative">
                        <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="text" 
                          required
                          value={newSource.name}
                          onChange={e => setNewSource({...newSource, name: e.target.value})}
                          className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="e.g. US Sports EPG"
                        />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">XMLTV URL</label>
                     <div className="relative">
                        <Link className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="url" 
                          required
                          value={newSource.url}
                          onChange={e => setNewSource({...newSource, url: e.target.value})}
                          className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="https://example.com/guide.xml"
                        />
                     </div>
                  </div>
               </div>
               <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Discard</button>
                  <button type="submit" className="bg-white text-slate-950 px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all">Submit Source</button>
               </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="p-40 text-center">
           <Loader2 className="animate-spin text-indigo-500 mx-auto" size={40} />
        </div>
      ) : sources.length === 0 ? (
        <div className="p-20 text-center glass rounded-[3rem]">
           <Calendar className="text-slate-800 mx-auto mb-4" size={48} />
           <h3 className="text-xl font-bold text-slate-400">No Program Data</h3>
           <p className="text-slate-600 text-sm mt-1">Connect an XMLTV source to populate your electronic program guide.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sources.map((source) => (
            <div key={source.id} className="glass p-6 rounded-3xl border border-white/5 group hover:bg-slate-900/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
               <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                     <Calendar size={28} />
                  </div>
                  <div>
                     <h3 className="text-lg font-black text-white tracking-tight">{source.name}</h3>
                     <p className="text-xs text-slate-500 font-medium truncate max-w-md">{source.url}</p>
                  </div>
               </div>

               <div className="flex flex-wrap items-center gap-6 md:gap-12 pl-4 md:pl-0">
                  <div>
                     <div className="flex items-center gap-2 text-slate-500 mb-1">
                        <Clock size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Last Sync</span>
                     </div>
                     <p className="text-sm font-black text-white">{source.last_sync}</p>
                  </div>
                  
                  <div className="flex items-center gap-2 border-l border-white/5 pl-6 md:pl-12">
                     <button 
                      onClick={() => handleSync(source.id)}
                      disabled={syncingId === source.id}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                     >
                        {syncingId === source.id ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                        Sync Guide
                     </button>
                     <button 
                      onClick={() => handleDelete(source.id)}
                      className="p-2.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
                     >
                        <Trash2 size={20} />
                     </button>
                  </div>
               </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
