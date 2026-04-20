import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Shield, 
  ShieldOff, 
  Zap, 
  WifiOff, 
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Settings2,
  Loader2,
  Activity,
  Tv,
  Eye,
  CloudDownload
} from 'lucide-react';
import { ChannelForm } from '../components/forms/ChannelForm';
import { PreviewModal } from '../components/channels/PreviewModal';
import { useNavigate } from 'react-router-dom';
import { getLogoUrl } from '../utils';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpDown } from 'lucide-react';

interface Channel {
  id: number;
  name: string;
  logo_url: string;
  group_name: string;
  stream_url: string;
  status: 'live' | 'die' | 'unknown';
  stream_format: string;
  stream_type: string;
  quality: string;
  resolution: string;
  latency: number;
  is_original: boolean;
  last_checked: string;
  play_url?: string;
  play_links?: {
    smart: string;
    direct: string;
    tracking: string;
    hls: string;
    ts: string;
  };
}

interface Pagination {
  total: number;
  pages: number;
  current_page: number;
  has_next: boolean;
  has_prev: boolean;
}

interface FilterData {
  groups: string[];
  resolutions: string[];
  formats: string[];
}

export const Channels: React.FC = () => {
   const [searchParams, setSearchParams] = useSearchParams();
   const page = parseInt(searchParams.get('page') || '1');
   const search = searchParams.get('search') || '';
   const selectedGroup = searchParams.get('group') || '';
   const selectedStatus = searchParams.get('status') || '';
   const activeSort = searchParams.get('sort') || 'name';

   const [channels, setChannels] = useState<Channel[]>([]);
   const [pagination, setPagination] = useState<Pagination | null>(null);
   const [filters, setFilters] = useState<FilterData>({ groups: [], resolutions: [], formats: [] });
   const [loading, setLoading] = useState(true);
   const [showFilters, setShowFilters] = useState(false);
   const [processingId, setProcessingId] = useState<number | null>(null);
   const [isFormOpen, setIsFormOpen] = useState(false);
   const [editingId, setEditingId] = useState<number | null>(null);
   const [previewChannel, setPreviewChannel] = useState<Channel | null>(null);
   const [jumpPage, setJumpPage] = useState('');
  const navigate = useNavigate();

  const fetchChannels = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      search,
      group: selectedGroup,
      status: selectedStatus,
      sort: activeSort,
      per_page: '20'
    });

    fetch(`/api/channels?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setChannels(data.channels);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch(err => {
        console.error("Channels fetch error:", err);
        setLoading(false);
      });
  }, [page, search, selectedGroup, selectedStatus, activeSort]);

  const fetchFilters = () => {
    fetch('/api/channels/filters')
      .then(res => res.json())
      .then(data => setFilters(data))
      .catch(err => console.error("Filters fetch error:", err));
  };

  useEffect(() => {
    fetchChannels();
    fetchFilters();
  }, [fetchChannels]);

  const openAdd = () => { setEditingId(null); setIsFormOpen(true); };
  const openEdit = (id: number) => { setEditingId(id); setIsFormOpen(true); };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you absolutely sure? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/channels/${id}`, { method: 'DELETE' });
      if (res.ok) fetchChannels();
    } catch (err) { alert('Delete failed'); }
  };

  const toggleProtection = async (id: number) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/channels/toggle-protection/${id}`, { method: 'POST' });
      if (res.ok) {
        setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, is_original: !ch.is_original } : ch));
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleCheck = async (id: number) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/channels/${id}/check`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, ...data } : ch));
      }
    } finally {
      setProcessingId(null);
    }
  };

   const updateParams = (updates: Record<string, string>) => {
     const newParams = new URLSearchParams(searchParams);
     Object.entries(updates).forEach(([k, v]) => {
       if (v) newParams.set(k, v);
       else newParams.delete(k);
     });
     if (!updates.page) newParams.set('page', '1'); // Reset to page 1 on filter/search change
     setSearchParams(newParams);
   };

   const handleJumpPage = (e: React.FormEvent) => {
     e.preventDefault();
     const p = parseInt(jumpPage);
     if (pagination && p > 0 && p <= pagination.pages) {
       updateParams({ page: p.toString() });
       setJumpPage('');
     }
   };

   const cleanDead = async () => {
     if (!confirm('Clean all unprotected offline channels?')) return;
     try {
       const res = await fetch('/api/channels/clean-dead', { method: 'POST' });
       if (res.ok) {
         const data = await res.json();
         alert(`Successfully removed ${data.deleted_count} stale entries.`);
         fetchChannels();
       }
     } catch (err) { alert('Operation failed'); }
   };

   const renderPagination = () => {
     if (!pagination || pagination.pages <= 1) return null;
     
     const pages = [];
     const maxVisible = 5;
     let start = Math.max(1, page - 2);
     let end = Math.min(pagination.pages, start + maxVisible - 1);
     
     if (end - start + 1 < maxVisible) {
       start = Math.max(1, end - maxVisible + 1);
     }

     for (let i = start; i <= end; i++) {
        pages.push(
          <button
            key={i}
            onClick={() => updateParams({ page: i.toString() })}
            className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${
              page === i ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-white hover:bg-white/5'
            }`}
          >
            {i}
          </button>
        );
     }

     return (
       <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2">
          <div className="flex items-center gap-4">
             <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
               Total: <span className="text-white">{pagination.total}</span>
             </p>
             <form onSubmit={handleJumpPage} className="flex items-center gap-2">
                <input 
                  type="number" 
                  placeholder="Go to..." 
                  value={jumpPage}
                  onChange={e => setJumpPage(e.target.value)}
                  className="w-16 bg-slate-950/50 border border-white/5 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-500/50"
                />
             </form>
          </div>
          <div className="flex items-center gap-1 bg-slate-950/40 p-1 rounded-xl border border-white/5">
             <button 
               disabled={!pagination.has_prev}
               onClick={() => updateParams({ page: (page - 1).toString() })}
               className="p-2 text-slate-500 hover:text-white transition-all disabled:opacity-20"
             ><ChevronLeft size={16} /></button>
             
             {start > 1 && <span className="text-slate-700 px-1">...</span>}
             {pages}
             {end < pagination.pages && <span className="text-slate-700 px-1">...</span>}

             <button 
               disabled={!pagination.has_next}
               onClick={() => updateParams({ page: (page + 1).toString() })}
               className="p-2 text-slate-500 hover:text-white transition-all disabled:opacity-20"
             ><ChevronRight size={16} /></button>
          </div>
       </div>
     );
   };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'live': return <Zap className="text-emerald-400" size={14} />;
      case 'die': return <WifiOff className="text-rose-400" size={14} />;
      default: return <HelpCircle className="text-slate-500" size={14} />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex-1">
          <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white">Channel <span className="text-indigo-500">Registry</span></h2>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Enterprise-grade distribution and health monitoring.</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 md:flex-wrap">
           <button 
            onClick={cleanDead}
            className="h-12 px-5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 transition-all border border-rose-500/20 shrink-0"
           >
              <Trash2 size={16} /> <span className="hidden md:inline">Clean Dead</span>
           </button>
           <button 
            onClick={() => navigate('/import')}
            className="h-12 px-5 rounded-xl md:rounded-2xl flex items-center justify-center gap-3 text-[10px] md:text-xs font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-500/10 transition-all border border-indigo-500/20 shrink-0"
           >
              <CloudDownload size={16} /> <span className="hidden md:inline">Import Bulk</span>
           </button>
           <button 
            onClick={openAdd}
            className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20 shrink-0"
           >
              <Plus size={18} /> <span className="hidden md:inline">Add Channel</span>
           </button>
        </div>
      </header>

      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 glass p-2 rounded-2xl flex items-center gap-2">
            <div className="relative flex-1 group">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
               <input 
                 type="text" 
                 placeholder="Search streams..." 
                 value={search}
                 onChange={e => updateParams({ search: e.target.value, page: '1' })}
                 className="w-full bg-transparent border-none pl-12 pr-4 py-3 text-sm text-white focus:outline-none placeholder:text-slate-600"
               />
            </div>
           <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-3 rounded-xl transition-all ${showFilters ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-500 hover:text-white'}`}
           >
              <Filter size={18} />
           </button>
           <button onClick={fetchChannels} className="p-3 text-slate-500 hover:text-white transition-all"><RefreshCw size={18} /></button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="glass p-2 rounded-2xl flex flex-wrap gap-2 items-center"
            >
              <div className="flex items-center gap-2 px-3 border-r border-white/5 mr-2">
                 <ArrowUpDown size={14} className="text-indigo-400" />
                 <select 
                   value={activeSort} 
                   onChange={e => updateParams({ sort: e.target.value })}
                   className="bg-transparent text-white text-[11px] font-black uppercase tracking-widest focus:outline-none"
                 >
                   <option value="name">Alphabetical</option>
                   <option value="newest">Newest First</option>
                   <option value="oldest">Oldest First</option>
                 </select>
              </div>
              <select 
                value={selectedGroup} 
                onChange={e => updateParams({ group: e.target.value })}
                className="bg-slate-950/50 text-white text-[11px] font-black uppercase tracking-widest border border-white/5 rounded-xl px-4 py-2"
              >
                <option value="">All Groups</option>
                {filters.groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select 
                value={selectedStatus} 
                onChange={e => updateParams({ status: e.target.value })}
                className="bg-slate-950/50 text-white text-[11px] font-black uppercase tracking-widest border border-white/5 rounded-xl px-4 py-2"
              >
                <option value="">All Status</option>
                <option value="live">Live Now</option>
                <option value="die">Offline</option>
              </select>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Pagination */}
      {renderPagination()}

      {/* Channels List - DESKTOP TABLE */}
      <div className="hidden lg:block glass rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-5 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Identification</th>
                <th className="px-6 py-5 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Group</th>
                <th className="px-6 py-5 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Health</th>
                <th className="px-6 py-5 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-20 text-center"><Loader2 className="animate-spin text-indigo-500 mx-auto" size={32} /></td></tr>
              ) : channels.length === 0 ? (
                <tr><td colSpan={4} className="p-20 text-center text-slate-500 font-bold uppercase tracking-widest">No Channels Found</td></tr>
              ) : (
                channels.map((ch) => (
                  <tr key={ch.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-900 overflow-hidden flex items-center justify-center border border-white/5 group-hover:border-indigo-500/30 transition-colors shrink-0">
                          {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain p-1" alt="" /> : <Tv className="text-slate-700" size={20} />}
                        </div>
                        <div className="min-w-0">
                           <div className="flex items-center gap-2">
                             <h4 className="text-sm font-black text-white truncate">{ch.name}</h4>
                             {ch.is_original && <Shield className="text-indigo-400" size={12} />}
                           </div>
                           <p className="text-[10px] text-slate-500 truncate max-w-[200px] mt-0.5">{ch.stream_url}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
                        {ch.group_name || 'Uncategorized'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 w-fit bg-slate-950/40">
                          {getStatusIcon(ch.status)}
                          <span className="text-[9px] font-black uppercase tracking-widest text-white">{ch.status}</span>
                          <span className="text-slate-700 mx-1">|</span>
                          <span className="text-[9px] font-black text-slate-500 uppercase">{Math.round(ch.latency)}ms</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center justify-end gap-1">
                          {[
                            { icon: <Eye size={16} />, onClick: () => setPreviewChannel(ch), title: 'Preview' },
                            { icon: processingId === ch.id ? <Loader2 className="animate-spin" size={16} /> : <Activity size={16} />, onClick: () => handleCheck(ch.id), title: 'Check' },
                            { icon: ch.is_original ? <Shield size={16} /> : <ShieldOff size={16} />, onClick: () => toggleProtection(ch.id), title: 'Protect', active: ch.is_original },
                            { icon: <Settings2 size={16} />, onClick: () => openEdit(ch.id), title: 'Edit' },
                            { icon: <Trash2 size={16} />, onClick: () => handleDelete(ch.id), title: 'Delete', danger: true }
                          ].map((btn, idx) => (
                            <button 
                              key={idx}
                              onClick={btn.onClick}
                              className={`p-2 rounded-xl transition-all ${
                                btn.danger ? 'text-slate-600 hover:text-rose-400 hover:bg-rose-500/10' :
                                btn.active ? 'text-indigo-400 bg-indigo-500/10' :
                                'text-slate-600 hover:text-white hover:bg-white/5'
                              }`}
                            >
                              {btn.icon}
                            </button>
                          ))}
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Channels List - MOBILE CARDS */}
      <div className="lg:hidden flex flex-col gap-4">
        {loading ? (
          <div className="p-10 text-center glass rounded-3xl"><Loader2 className="animate-spin text-indigo-500 mx-auto" size={32} /></div>
        ) : channels.length === 0 ? (
          <div className="p-10 text-center glass rounded-3xl text-slate-500 font-bold uppercase tracking-widest text-xs">No Channels</div>
        ) : (
          channels.map((ch, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              key={ch.id} 
              className="glass p-5 rounded-[2rem] space-y-5"
            >
              <div className="flex items-center gap-4">
                 <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/5 flex items-center justify-center shrink-0">
                   {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain p-1.5" alt="" /> : <Tv className="text-slate-700" size={24} />}
                 </div>
                 <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-white truncate">{ch.name}</h4>
                      {ch.is_original && <Shield className="text-indigo-400 shrink-0" size={14} />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                       <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                         ch.status === 'live' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                         ch.status === 'die' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                         'bg-slate-500/10 border-slate-500/20 text-slate-400'
                       }`}>
                         {getStatusIcon(ch.status)} {ch.status}
                       </div>
                       <span className="text-[10px] font-black text-slate-600 tracking-widest uppercase">{Math.round(ch.latency)}ms</span>
                    </div>
                 </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950/40 p-2 rounded-2xl border border-white/5">
                 {[
                   { icon: <Eye size={20} />, onClick: () => setPreviewChannel(ch) },
                   { icon: processingId === ch.id ? <Loader2 className="animate-spin" size={20} /> : <Activity size={20} />, onClick: () => handleCheck(ch.id) },
                   { icon: ch.is_original ? <Shield size={20} /> : <ShieldOff size={20} />, onClick: () => toggleProtection(ch.id), active: ch.is_original },
                   { icon: <Settings2 size={20} />, onClick: () => openEdit(ch.id) },
                   { icon: <Trash2 size={20} />, onClick: () => handleDelete(ch.id), danger: true }
                 ].map((btn, idx) => (
                   <button 
                    key={idx} 
                    onClick={btn.onClick}
                    className={`p-3 rounded-xl transition-all ${
                      btn.danger ? 'text-rose-500/40 hover:text-rose-400' :
                      btn.active ? 'text-indigo-400' :
                      'text-slate-500 hover:text-white'
                    }`}
                   >
                     {btn.icon}
                   </button>
                 ))}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Pagination (Global Bottom) */}
      {renderPagination()}

      <AnimatePresence>
        {isFormOpen && <ChannelForm channelId={editingId} onClose={() => setIsFormOpen(false)} onSuccess={fetchChannels} />}
        {previewChannel && <PreviewModal channel={previewChannel} onClose={() => setPreviewChannel(null)} />}
      </AnimatePresence>
    </div>
  );
};
