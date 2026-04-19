import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Search, 
  ExternalLink, 
  MoreVertical, 
  Layers, 
  Tv, 
  ShieldCheck, 
  Clock,
  LayoutGrid,
  List,
  Loader2
} from 'lucide-react';

interface Playlist {
  id: number | string;
  name: string;
  slug: string;
  is_system: boolean;
  channel_count: number;
  security_token: string;
  created_at: string;
}

export const Playlists: React.FC = () => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    fetch('/api/playlists')
      .then(res => res.json())
      .then(data => {
        setPlaylists(data);
        setLoading(false);
      })
      .catch(err => console.error("Playlists fetch error:", err));
  }, []);

  const filtered = playlists.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.slug.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-indigo-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white">Registry <span className="text-indigo-500">Profiles</span></h2>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Manage and distribute your curated IPTV namespaces.</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20 w-full md:w-auto">
           <Plus size={18} /> New Profile
        </button>
      </header>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/40 p-3 rounded-2xl border border-white/5">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search profiles..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950/50 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-white/5">
           <button 
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-indigo-500/10 text-indigo-400 shadow-lg' : 'text-slate-500 hover:text-white'}`}
           >
              <LayoutGrid size={18} />
           </button>
           <button 
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-indigo-500/10 text-indigo-400 shadow-lg' : 'text-slate-500 hover:text-white'}`}
           >
              <List size={18} />
           </button>
        </div>
      </div>

      {/* Playlists Grid */}
      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
        {filtered.map((item, i) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            key={item.id} 
            className={`glass relative group transition-all hover:bg-slate-900/60 ${viewMode === 'grid' ? 'p-6 rounded-[2rem]' : 'p-4 rounded-2xl flex items-center justify-between'}`}
          >
            <div className="flex items-center gap-4">
               <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${item.is_system ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
                  <Layers size={24} />
               </div>
               <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-white tracking-tight">{item.name}</h3>
                    {item.is_system && (
                       <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/30">System</span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs font-medium tracking-wide">/{item.slug}</p>
               </div>
            </div>

            {viewMode === 'grid' ? (
              <>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-slate-500 mb-1">
                         <Tv size={14} />
                         <span className="text-[10px] font-black uppercase tracking-widest">Channels</span>
                      </div>
                      <p className="text-xl font-black text-white">{item.channel_count}</p>
                   </div>
                   <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-slate-500 mb-1">
                         <ShieldCheck size={14} />
                         <span className="text-[10px] font-black uppercase tracking-widest">Auth</span>
                      </div>
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1.5">Secure</p>
                   </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-2 text-slate-500">
                      <Clock size={12} />
                      <span className="text-[10px] whitespace-nowrap">{item.created_at}</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-indigo-500/10 hover:text-indigo-400 rounded-xl transition-all text-slate-500">
                         <ExternalLink size={16} />
                      </button>
                      <button className="p-2 hover:bg-indigo-500/10 hover:text-indigo-400 rounded-xl transition-all text-slate-500">
                         <MoreVertical size={16} />
                      </button>
                   </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-8">
                 <div className="hidden md:block">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Channels</p>
                    <p className="text-sm font-black text-white">{item.channel_count}</p>
                 </div>
                 <div className="hidden md:block">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Last Update</p>
                    <p className="text-sm font-black text-white">{item.created_at}</p>
                 </div>
                 <div className="flex items-center gap-2 pl-4 border-l border-white/5">
                    <button className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all active:scale-95">
                       Manage
                    </button>
                    <button className="p-2.5 hover:bg-white/5 text-slate-500 rounded-xl transition-all">
                       <MoreVertical size={16} />
                    </button>
                 </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="p-20 text-center glass rounded-[3rem]">
           <Layers className="text-slate-800 mx-auto mb-4" size={48} />
           <h3 className="text-xl font-bold text-slate-400">No profiles found</h3>
           <p className="text-slate-600 text-sm mt-1">Try refining your search or create a new registry profile.</p>
        </div>
      )}
    </div>
  );
};
