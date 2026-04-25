import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  CloudDownload,
  Share2,
  X,
  Copy,
  Check,
  Globe,
  Lock as LockIcon,
  CalendarCheck,
  LayoutGrid,
  Link2,
  Image as ImageIcon,
  Save
} from 'lucide-react';
import { createPortal } from 'react-dom';
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
  epg_id?: string | null;
  quality: string;
  resolution: string;
  latency: number;
  is_original: boolean;
  is_public: boolean;
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

interface CustomSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon: React.ReactNode;
  placeholder?: string;
  minWidth?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, icon, minWidth = '160px' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(o => o.value === value)?.label || 'Select...';

  // Keyboard navigation: Jump to item by pressing its first letter
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const char = e.key.toLowerCase();
        const index = options.findIndex(opt => 
          opt.label.trim().toLowerCase().startsWith(char)
        );

        if (index !== -1 && listRef.current) {
          const container = listRef.current;
          const targetItem = container.children[index] as HTMLElement;
          if (targetItem) {
            targetItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      }

      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, options]);

  return (
    <div className="relative" style={{ minWidth }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 bg-slate-950/50 border border-white/5 rounded-xl px-4 py-2.5 text-white transition-all hover:bg-slate-900/80 group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="text-indigo-400 group-hover:scale-110 transition-transform">{icon}</div>
          <span className="text-[10px] font-black uppercase tracking-widest truncate">{selectedLabel}</span>
        </div>
        <ChevronRight size={14} className={`text-slate-600 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 right-0 mt-2 z-[100] glass border border-white/10 rounded-2xl overflow-hidden shadow-3xl py-1"
            >
              <div ref={listRef} className="max-h-60 overflow-y-auto scrollbar-hide">
                {options.map((opt) => (
                  <button 
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-l-2 ${
                      value === opt.value 
                      ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' 
                      : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Channels: React.FC = () => {
   const [searchParams, setSearchParams] = useSearchParams();
   const page = parseInt(searchParams.get('page') || '1');
// ... (rest of states)
   const search = searchParams.get('search') || '';
   const selectedGroup = searchParams.get('group') || '';
   const selectedStatus = searchParams.get('status') || '';
   const activeSort = searchParams.get('sort') || 'name';

   const [channels, setChannels] = useState<Channel[]>([]);
   const [pagination, setPagination] = useState<Pagination | null>(null);
   const [filters, setFilters] = useState<FilterData>({ groups: [], resolutions: [], formats: [] });
   const [loading, setLoading] = useState(true);
   const [processingId, setProcessingId] = useState<number | null>(null);
   const [isFormOpen, setIsFormOpen] = useState(false);
   const [editingId, setEditingId] = useState<number | null>(null);
   const [previewChannel, setPreviewChannel] = useState<Channel | null>(null);
   const [shareChannel, setShareChannel] = useState<Channel | null>(null);
   const [jumpPage, setJumpPage] = useState('');
   const [copiedKey, setCopiedKey] = useState<string | null>(null);
   const [viewMode, setViewMode] = useState<'standard' | 'links' | 'logos' | 'epg'>('standard');
   const [savingId, setSavingId] = useState<number | null>(null);
   
   // Bulk Actions State
   const [selectedIds, setSelectedIds] = useState<number[]>([]);
   const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
   const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
   const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
   const [checkingBatch, setCheckingBatch] = useState(false);

  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

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

  const fetchUserPlaylists = () => {
    fetch('/api/playlists')
      .then(res => res.json())
      .then(data => setUserPlaylists(data))
      .catch(err => console.error("Playlists fetch error:", err));
  };

  useEffect(() => {
    fetchChannels();
    fetchFilters();
    fetchUserPlaylists();
  }, [fetchChannels]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === channels.length) setSelectedIds([]);
    else setSelectedIds(channels.map(c => c.id));
  };

  const handleBatchAdd = async (playlistId: number, groupId?: number) => {
    try {
      const res = await fetch('/api/playlists/batch-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_id: playlistId,
          channel_ids: selectedIds,
          group_id: groupId
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        alert(`Successfully added ${data.added_count} channels!`);
        setSelectedIds([]);
        setIsBatchModalOpen(false);
      }
    } catch (err) { alert('Batch add failed'); }
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} channels? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/channels/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });
      if (res.ok) {
        alert('Bulk delete successful!');
        setSelectedIds([]);
        fetchChannels();
      }
    } catch (err) { alert('Batch delete failed'); }
  };

  const handleBatchGroupUpdate = async (groupName: string) => {
    try {
      const res = await fetch('/api/channels/batch-update-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, group_name: groupName })
      });
      if (res.ok) {
        alert('Bulk group update successful!');
        setSelectedIds([]);
        setIsGroupModalOpen(false);
        fetchChannels();
        fetchFilters();
      }
    } catch (err) { alert('Batch update failed'); }
  };

  const handleBatchCheck = async (fastMode: boolean) => {
    setCheckingBatch(true);
    try {
      const res = await fetch('/api/health/batch-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, fast_mode: fastMode })
      });
      if (res.ok) {
        // Refresh channels to show new status
        fetchChannels();
        setSelectedIds([]);
      }
    } catch (err) { alert('Batch check failed'); }
    finally { setCheckingBatch(false); }
  };

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

  const togglePublic = async (id: number) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/channels/toggle-public/${id}`, { method: 'POST' });
      if (res.ok) {
        setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, is_public: !ch.is_public } : ch));
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

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleQuickUpdate = async (id: number, data: any) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, ...data } : ch));
      } else {
        alert('Update failed');
      }
    } catch (err) {
      alert('Update error');
    } finally {
      setSavingId(null);
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
    <div className="space-y-4 lg:space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 lg:gap-6">
        <div className="flex-1">
          <h2 className="text-xl md:text-3xl font-black tracking-tighter text-white">Channel <span className="text-indigo-500">Registry</span></h2>
          <p className="text-slate-500 text-[10px] md:text-sm mt-0.5">Distribution and health monitoring system.</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 md:flex-wrap">
           {user.role !== 'free' && (
             <>
               <button 
                onClick={cleanDead}
                className="h-10 md:h-12 px-4 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 text-[9px] md:text-xs font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 transition-all border border-rose-500/20 shrink-0"
               >
                  <Trash2 size={14} /> <span className="hidden md:inline">Clean Dead</span>
               </button>
               <button 
                onClick={() => navigate('/import')}
                className="h-10 md:h-12 px-4 rounded-xl md:rounded-2xl flex items-center justify-center gap-3 text-[9px] md:text-xs font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-500/10 transition-all border border-indigo-500/20 shrink-0"
               >
                  <CloudDownload size={14} /> <span className="hidden md:inline">Import Bulk</span>
               </button>
             </>
           )}
           <button 
            onClick={openAdd}
            className="bg-indigo-600 hover:bg-indigo-500 text-white h-10 md:h-12 px-5 rounded-xl md:rounded-2xl font-black text-[9px] md:text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20 shrink-0"
           >
              <Plus size={16} /> <span className="hidden md:inline">Add Channel</span>
           </button>
        </div>
      </header>

      {/* Control Bar - Optimized for accessibility */}
      <div className="flex flex-col xl:flex-row gap-4 relative z-50">
        <div className="flex-1 glass p-2 rounded-2xl flex items-center gap-2">
            <div className="relative flex-1 group">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
               <input 
                 type="text" 
                 placeholder="Search streams..." 
                 value={search}
                 onChange={e => updateParams({ search: e.target.value, page: '1' })}
                 className="w-full bg-transparent border-none pl-12 pr-10 py-3 text-sm text-white focus:outline-none placeholder:text-slate-600"
               />
               {search && (
                 <button 
                  onClick={() => updateParams({ search: '', page: '1' })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white transition-colors"
                 >
                   <X size={14} />
                 </button>
               )}
            </div>
            
            <button onClick={fetchChannels} className="p-3 text-slate-500 hover:text-white transition-all"><RefreshCw size={18} /></button>
        </div>

        <div className="glass p-2 rounded-2xl flex flex-wrap lg:flex-nowrap gap-2 items-center">
            {/* Group Filter */}
            <CustomSelect 
              value={selectedGroup}
              onChange={(v) => updateParams({ group: v })}
              icon={<Filter size={14} />}
              options={[
                { value: '', label: 'All Groups' },
                ...filters.groups.map(g => ({ value: g, label: g }))
              ]}
              minWidth="180px"
            />

            {/* Sort Selector */}
            <CustomSelect 
              value={activeSort}
              onChange={(v) => updateParams({ sort: v })}
              icon={<ArrowUpDown size={14} />}
              options={[
                { value: 'name', label: 'Alphabetical' },
                { value: 'newest', label: 'Newest First' },
                { value: 'oldest', label: 'Oldest First' }
              ]}
              minWidth="160px"
            />

            {/* Status Filter */}
            <CustomSelect 
              value={selectedStatus}
              onChange={(v) => updateParams({ status: v })}
              icon={<Activity size={14} />}
              options={[
                { value: '', label: 'All Status' },
                { value: 'live', label: 'Live Now' },
                { value: 'die', label: 'Offline' }
              ]}
              minWidth="150px"
            />

            <div className="w-px h-8 bg-white/5 hidden lg:block mx-2" />

            {/* View Mode Selector */}
            <CustomSelect 
              value={viewMode}
              onChange={(v) => setViewMode(v as any)}
              icon={<LayoutGrid size={14} />}
              options={[
                { value: 'standard', label: 'Standard View' },
                { value: 'links', label: 'Quick Links' },
                { value: 'logos', label: 'Quick Logos' },
                { value: 'epg', label: 'Quick EPG' }
              ]}
              minWidth="160px"
            />
        </div>
      </div>

      {/* Top Pagination */}
      {renderPagination()}

      {/* Channels List - DESKTOP TABLE */}
      <div className="hidden lg:block glass rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-5 text-[10px] font-black text-white/30 uppercase tracking-[0.05em] w-[35%]">
                   <div className="flex items-center gap-4">
                      <button 
                        onClick={toggleSelectAll}
                        className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${selectedIds.length === channels.length && channels.length > 0 ? 'bg-indigo-500 border-indigo-400' : 'bg-slate-900 border-white/10 hover:border-indigo-500/50'}`}
                      >
                         {selectedIds.length === channels.length && channels.length > 0 && <Check size={12} className="text-white" />}
                      </button>
                      Identification
                   </div>
                </th>
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
                channels.map((ch) => {
                  if (viewMode === 'links') {
                    return (
                      <tr key={ch.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center border border-white/5 shrink-0">
                                {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain p-1" alt="" /> : <Tv className="text-slate-700" size={14} />}
                              </div>
                              <span className="text-xs font-black text-white truncate">{ch.name}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4" colSpan={2}>
                           <div className="relative group">
                              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400" size={14} />
                              <input 
                                type="text"
                                defaultValue={ch.stream_url}
                                onBlur={(e) => {
                                  if (e.target.value !== ch.stream_url) {
                                    handleQuickUpdate(ch.id, { stream_url: e.target.value });
                                  }
                                }}
                                className="w-full bg-slate-950/40 border border-white/5 rounded-xl pl-9 pr-10 py-2 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500/50 focus:bg-slate-950 transition-all font-mono"
                              />
                              <button 
                                onClick={(e) => {
                                  const input = e.currentTarget.parentElement?.querySelector('input');
                                  if (input) {
                                    input.value = '';
                                    input.focus();
                                  }
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <X size={14} />
                              </button>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <button 
                            disabled={savingId === ch.id}
                            className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-50"
                           >
                             {savingId === ch.id ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                           </button>
                        </td>
                      </tr>
                    );
                  }

                   if (viewMode === 'epg') {
                    return (
                      <tr key={ch.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center border border-white/5 shrink-0">
                                {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain p-1" alt="" /> : <Tv className="text-slate-700" size={14} />}
                              </div>
                              <span className="text-xs font-black text-white truncate">{ch.name}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4" colSpan={2}>
                           <div className="relative group">
                              <CalendarCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400" size={14} />
                              <input 
                                type="text"
                                defaultValue={ch.epg_id || ''}
                                placeholder="e.g. discovery.us"
                                onBlur={(e) => {
                                  if (e.target.value !== (ch.epg_id || '')) {
                                    handleQuickUpdate(ch.id, { epg_id: e.target.value });
                                  }
                                }}
                                className="w-full bg-slate-950/40 border border-white/5 rounded-xl pl-9 pr-10 py-2 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500/50 focus:bg-slate-950 transition-all"
                              />
                              <button 
                                onClick={(e) => {
                                  const input = e.currentTarget.parentElement?.querySelector('input');
                                  if (input) {
                                    input.value = '';
                                    input.focus();
                                  }
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <X size={14} />
                              </button>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <button 
                            disabled={savingId === ch.id}
                            className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-50"
                           >
                             {savingId === ch.id ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                           </button>
                        </td>
                      </tr>
                    );
                  }


                  return (
                    <tr key={ch.id} className={`border-b border-white/5 transition-colors group ${selectedIds.includes(ch.id) ? 'bg-indigo-500/5 hover:bg-indigo-500/10' : 'hover:bg-white/[0.02]'}`}>
                      <td className="px-6 py-4 max-w-sm">
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => toggleSelect(ch.id)}
                            className={`w-5 h-5 rounded border transition-all flex items-center justify-center shrink-0 ${selectedIds.includes(ch.id) ? 'bg-indigo-500 border-indigo-400' : 'bg-slate-900 border-white/10 hover:border-indigo-500/50'}`}
                          >
                             {selectedIds.includes(ch.id) && <Check size={12} className="text-white" />}
                          </button>
                          <div className="w-10 h-10 rounded-xl bg-slate-900 overflow-hidden flex items-center justify-center border border-white/5 group-hover:border-indigo-500/30 transition-colors shrink-0">
                            {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain p-1" alt="" /> : <Tv className="text-slate-700" size={16} />}
                          </div>
                          <div className="min-w-0 flex-1">
                             <div className="flex items-center gap-2">
                               <h4 className="text-sm font-black text-white truncate leading-tight">{ch.name}</h4>
                               <div className="flex gap-1 shrink-0 items-center">
                                  {ch.epg_id && <CalendarCheck className="text-indigo-400" size={10} />}
                                  {ch.is_original && <Shield className="text-indigo-400" size={10} />}
                                  {ch.is_public ? <Globe className="text-emerald-400" size={10} /> : <LockIcon className="text-slate-600" size={10} />}
                               </div>
                             </div>
                             <p className="text-[9px] text-slate-500 truncate mt-0.5 opacity-60 font-medium">{ch.stream_url}</p>
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
                              { icon: <Share2 size={16} />, onClick: () => setShareChannel(ch), title: 'Distribute', hide: user.role === 'free' },
                              { icon: processingId === ch.id ? <Loader2 className="animate-spin" size={16} /> : <Activity size={16} />, onClick: () => handleCheck(ch.id), title: 'Check' },
                              { icon: ch.is_public ? <Globe size={16} /> : <LockIcon size={16} />, onClick: () => togglePublic(ch.id), title: 'Toggle Visibility', active: ch.is_public },
                              { icon: ch.is_original ? <Shield size={16} /> : <ShieldOff size={16} />, onClick: () => toggleProtection(ch.id), title: 'Protect', active: ch.is_original },
                              { icon: <Settings2 size={16} />, onClick: () => openEdit(ch.id), title: 'Edit' },
                              { icon: <Trash2 size={16} />, onClick: () => handleDelete(ch.id), title: 'Delete', danger: true }
                            ].filter(b => !b.hide).map((btn, idx) => (
                              <button 
                                key={idx}
                                onClick={btn.onClick}
                                title={btn.title}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Select All & Summary (Only in Standard View) */}
      {viewMode === 'standard' && (
        <div className="lg:hidden flex items-center justify-between px-2 mb-1">
           <button 
             onClick={toggleSelectAll}
             className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all"
           >
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedIds.length === channels.length && channels.length > 0 ? 'bg-indigo-500 border-indigo-400' : 'bg-slate-900 border-white/10'}`}>
                 {selectedIds.length === channels.length && channels.length > 0 && <Check size={10} className="text-white" />}
              </div>
              {selectedIds.length === channels.length && channels.length > 0 ? 'Deselect All' : 'Select All'}
           </button>
           <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Total: {pagination?.total || 0}</span>
        </div>
      )}

      {/* Channels List - MOBILE CARDS (Optimized for space) */}
      <div className="lg:hidden flex flex-col gap-2 px-1">
        {loading ? (
          <div className="p-10 text-center glass rounded-3xl"><Loader2 className="animate-spin text-indigo-500 mx-auto" size={32} /></div>
        ) : channels.length === 0 ? (
          <div className="p-10 text-center glass rounded-3xl text-slate-500 font-bold uppercase tracking-widest text-xs">No Channels</div>
        ) : (
          channels.map((ch, i) => {
            // Mobile Quick Links Mode
            if (viewMode === 'links') {
              return (
                <div key={ch.id} className="glass p-3 rounded-2xl flex flex-col gap-2 border border-white/5">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                         <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center shrink-0">
                           {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain p-1.5" alt="" /> : <Tv className="text-slate-700" size={16} />}
                         </div>
                         <span className="text-[11px] font-black text-white truncate leading-tight">{ch.name}</span>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-tighter ${ch.status === 'live' ? 'border-emerald-500/20 text-emerald-400' : 'border-rose-500/20 text-rose-400'}`}>
                        {ch.status}
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                        <input 
                          type="text"
                          defaultValue={ch.stream_url}
                          onBlur={(e) => {
                            if (e.target.value !== ch.stream_url) {
                              handleQuickUpdate(ch.id, { stream_url: e.target.value });
                            }
                          }}
                          className="w-full bg-slate-950/40 border border-white/5 rounded-xl pl-8 pr-10 py-1.5 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500/50 font-mono"
                        />
                        <button 
                          onClick={(e) => {
                            const input = e.currentTarget.parentElement?.querySelector('input');
                            if (input) {
                              input.value = '';
                              input.focus();
                            }
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 active:text-rose-400 p-1"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <button 
                        disabled={savingId === ch.id}
                        className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg disabled:opacity-50"
                      >
                        {savingId === ch.id ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                      </button>
                   </div>
                </div>
              );
            }

            // Mobile Quick EPG Mode
            if (viewMode === 'epg') {
              return (
                <div key={ch.id} className="glass p-3 rounded-2xl flex flex-col gap-2 border border-white/5">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                         <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center shrink-0">
                           {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain p-1.5" alt="" /> : <Tv className="text-slate-700" size={16} />}
                         </div>
                         <span className="text-[11px] font-black text-white truncate leading-tight">{ch.name}</span>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-tighter ${ch.status === 'live' ? 'border-emerald-500/20 text-emerald-400' : 'border-rose-500/20 text-rose-400'}`}>
                        {ch.status}
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <CalendarCheck className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                        <input 
                          type="text"
                          defaultValue={ch.epg_id || ''}
                          placeholder="EPG ID"
                          onBlur={(e) => {
                            if (e.target.value !== (ch.epg_id || '')) {
                              handleQuickUpdate(ch.id, { epg_id: e.target.value });
                            }
                          }}
                          className="w-full bg-slate-950/40 border border-white/5 rounded-xl pl-8 pr-10 py-1.5 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500/50"
                        />
                        <button 
                          onClick={(e) => {
                            const input = e.currentTarget.parentElement?.querySelector('input');
                            if (input) {
                              input.value = '';
                              input.focus();
                            }
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 active:text-rose-400 p-1"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <button 
                        disabled={savingId === ch.id}
                        className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg disabled:opacity-50"
                      >
                        {savingId === ch.id ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                      </button>
                   </div>
                </div>
              );
            }

            // Mobile Quick Logos Mode
            if (viewMode === 'logos') {
              return (
                <div key={ch.id} className="glass p-2 rounded-2xl flex items-center gap-3 border border-white/5">
                   <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/10 p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
                      {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain" alt="" /> : <Tv className="text-slate-800" size={24} />}
                   </div>
                   <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <span className="text-[10px] font-black text-white truncate uppercase tracking-tighter">{ch.name}</span>
                      <div className="relative">
                        <ImageIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={10} />
                        <input 
                          type="text"
                          defaultValue={ch.logo_url || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (ch.logo_url || '')) {
                              handleQuickUpdate(ch.id, { logo_url: e.target.value });
                            }
                          }}
                          className="w-full bg-slate-950/40 border border-white/5 rounded-lg pl-7 pr-10 py-1.5 text-[9px] text-slate-300 focus:outline-none focus:border-indigo-500/50"
                        />
                        <button 
                          onClick={(e) => {
                            const input = e.currentTarget.parentElement?.querySelector('input');
                            if (input) {
                              input.value = '';
                              input.focus();
                            }
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 active:text-rose-400 p-1"
                        >
                          <X size={12} />
                        </button>
                      </div>
                   </div>
                   <button 
                      disabled={savingId === ch.id}
                      className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl"
                   >
                     {savingId === ch.id ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                   </button>
                </div>
              );
            }

            // Mobile Standard View (Tightened Layout)
            return (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                key={ch.id} 
                className={`glass p-3 rounded-[1.5rem] flex flex-col gap-2 relative overflow-hidden border transition-all ${selectedIds.includes(ch.id) ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/5'}`}
              >
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3 min-w-0">
                      <button 
                        onClick={() => toggleSelect(ch.id)}
                        className={`w-5 h-5 rounded border transition-all flex items-center justify-center shrink-0 ${selectedIds.includes(ch.id) ? 'bg-indigo-500 border-indigo-400' : 'bg-slate-900 border-white/10 hover:border-indigo-500/50'}`}
                      >
                         {selectedIds.includes(ch.id) && <Check size={12} className="text-white" />}
                      </button>
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center shrink-0">
                        {ch.logo_url ? <img src={getLogoUrl(ch.logo_url)} className="w-full h-full object-contain p-1" alt="" /> : <Tv className="text-slate-700" size={18} />}
                      </div>
                      <div className="min-w-0">
                         <div className="flex items-center gap-2">
                           <h4 className="text-[12px] font-black text-white truncate leading-tight">{ch.name}</h4>
                           {ch.epg_id && <CalendarCheck className="text-indigo-400 shrink-0" size={12} />}
                         </div>
                         <div className="flex items-center gap-1.5 mt-0.5">
                            <div className={`px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-widest ${
                              ch.status === 'live' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                              ch.status === 'die' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                              'bg-slate-500/10 border-slate-500/20 text-slate-400'
                            }`}>
                              {ch.status}
                            </div>
                            <span className="text-[8px] font-bold text-slate-600 tracking-widest uppercase">{Math.round(ch.latency)}ms</span>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="flex items-center justify-between bg-slate-950/40 px-1 py-1 rounded-xl border border-white/5">
                   {[
                     { icon: <Eye size={15} />, onClick: () => setPreviewChannel(ch) },
                     { icon: processingId === ch.id ? <Loader2 className="animate-spin" size={15} /> : <Activity size={15} />, onClick: () => handleCheck(ch.id) },
                     { icon: ch.is_original ? <Shield size={15} /> : <ShieldOff size={15} />, onClick: () => toggleProtection(ch.id), active: ch.is_original },
                     { icon: <Settings2 size={15} />, onClick: () => openEdit(ch.id) },
                     { icon: <Trash2 size={15} />, onClick: () => handleDelete(ch.id), danger: true }
                   ].map((btn, idx) => (
                     <button 
                      key={idx} 
                      onClick={(e) => { e.stopPropagation(); btn.onClick(); }}
                      className={`p-2 rounded-lg transition-all ${
                        btn.danger ? 'text-rose-500/30 hover:text-rose-400' :
                        btn.active ? 'text-indigo-400' :
                        'text-slate-600 hover:text-white'
                      }`}
                     >
                       {btn.icon}
                     </button>
                   ))}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Pagination (Global Bottom) */}
      {renderPagination()}

      <AnimatePresence>
        {isFormOpen && <ChannelForm channelId={editingId} onClose={() => setIsFormOpen(false)} onSuccess={fetchChannels} />}
        {previewChannel && <PreviewModal channel={previewChannel} onClose={() => setPreviewChannel(null)} />}
      </AnimatePresence>

      {/* Share Links Modal Portal */}
      {createPortal(
        <AnimatePresence>
          {shareChannel && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/95 flex items-center justify-center z-[1000] p-4 pointer-events-auto backdrop-blur-sm"
              onClick={() => setShareChannel(null)}
            >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="bg-slate-900 w-full max-w-lg rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl relative"
                  onClick={e => e.stopPropagation()}
                >
                  <header className="p-8 border-b border-white/5 flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-black text-white tracking-tight uppercase">Distribute Signal</h3>
                        <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mt-1">{shareChannel.name}</p>
                      </div>
                      <button 
                        onClick={() => setShareChannel(null)}
                        className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-all"
                      >
                          <X size={20} />
                      </button>
                  </header>

                  <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                      {shareChannel.play_links && (['direct', 'tracking', 'smart', 'hls', 'ts'] as const).map((mode) => {
                        const url = shareChannel.play_links?.[mode];
                        if (!url) return null;

                        const labelMap: Record<string, string> = {
                          'smart': 'SMart Dynamic Gateway',
                          'tracking': 'Direct Landing Track',
                          'direct': 'Original Source Link',
                          'hls': 'HLS Edge Cache',
                          'ts': 'TS Stream Proxy'
                        };
                        const label = labelMap[mode] || mode.toUpperCase();
                        
                        return (
                          <div 
                            key={mode}
                            className="p-4 rounded-3xl bg-white/[0.03] border border-white/5 group hover:bg-white/5 transition-all"
                          >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{label}</span>
                                <button 
                                  onClick={() => handleCopy(url as string, mode)}
                                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${
                                    copiedKey === mode 
                                    ? 'bg-emerald-500 text-slate-950 scale-95' 
                                    : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                                  }`}
                                >
                                    {copiedKey === mode ? (
                                        <><Check size={14} /> Copied</>
                                    ) : (
                                        <><Copy size={12} /> Copy link</>
                                    )}
                                </button>
                              </div>
                              <div className="text-[11px] font-medium text-slate-500 truncate bg-black/20 p-3 rounded-xl border border-white/5 select-all">
                                {url as string}
                              </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="p-8 border-t border-white/5 bg-indigo-500/5 text-center">
                      <p className="text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.2em]">Signal Distribution System v3.1</p>
                  </div>
                </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.getElementById('portal-root') || document.body
      )}

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {viewMode === 'standard' && selectedIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-6"
          >
             <div className="flex items-center gap-4 pl-4 border-r border-white/10 pr-6">
                <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-black text-sm">
                   {selectedIds.length}
                </div>
                <div className="flex flex-col">
                   <span className="text-[10px] font-black uppercase tracking-widest text-white">Channels Selected</span>
                   <button onClick={() => setSelectedIds([])} className="text-[9px] font-bold text-slate-500 hover:text-rose-400 text-left uppercase transition-colors">Clear Selection</button>
                </div>
             </div>

             <div className="flex items-center gap-2 pr-2">
                <button 
                  disabled={checkingBatch}
                  onClick={() => handleBatchCheck(true)}
                  className="w-12 h-12 bg-white/5 hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 rounded-2xl transition-all flex items-center justify-center border border-white/5 disabled:opacity-50"
                  title="Quick Signal Check (Ping Only)"
                >
                   {checkingBatch ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                </button>
                <button 
                  disabled={checkingBatch}
                  onClick={() => handleBatchCheck(false)}
                  className="w-12 h-12 bg-white/5 hover:bg-indigo-500/20 text-slate-500 hover:text-indigo-400 rounded-2xl transition-all flex items-center justify-center border border-white/5 disabled:opacity-50"
                  title="Deep Metadata Analysis (FFprobe)"
                >
                   {checkingBatch ? <Loader2 className="animate-spin" size={18} /> : <Activity size={18} />}
                </button>

                <button 
                  onClick={() => setIsBatchModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
                >
                   <Plus size={14} />
                   Add to Playlist
                </button>
                <button 
                  onClick={() => setIsGroupModalOpen(true)}
                  className="bg-slate-950/50 hover:bg-white/10 text-slate-400 hover:text-white h-12 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 border border-white/5"
                >
                   <Filter size={14} />
                   Change Group
                </button>
                <button 
                  onClick={handleBatchDelete}
                  className="w-12 h-12 bg-white/5 hover:bg-rose-500 text-slate-500 hover:text-white rounded-2xl transition-all flex items-center justify-center border border-white/5"
                  title="Bulk Delete"
                >
                   <Trash2 size={20} />
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Add Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsBatchModalOpen(false)} />
           <motion.div 
             initial={{ opacity: 0, scale: 0.9, y: 20 }}
             animate={{ opacity: 1, scale: 1, y: 0 }}
             className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
           >
              <h3 className="text-xl font-black text-white mb-2 uppercase">Batch Assignment</h3>
              <p className="text-slate-500 text-xs mb-8">Deploying <span className="text-indigo-400 font-black">{selectedIds.length}</span> signals to registry.</p>
              
              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                 {userPlaylists.map(p => (
                   <button 
                     key={p.id}
                     onClick={() => handleBatchAdd(p.id)}
                     className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all group"
                   >
                      <div className="flex items-center justify-between">
                         <div>
                            <p className="text-xs font-black text-white uppercase tracking-tight group-hover:text-indigo-400 transition-colors">{p.name}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">/{p.slug} • {p.channel_count} channels</p>
                         </div>
                         <Plus size={16} className="text-slate-700 group-hover:text-indigo-400 transition-all" />
                      </div>
                   </button>
                 ))}
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex justify-end">
                 <button onClick={() => setIsBatchModalOpen(false)} className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
              </div>
           </motion.div>
        </div>
      )}

      {/* Batch Group Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsGroupModalOpen(false)} />
           <motion.div 
             initial={{ opacity: 0, scale: 0.9, y: 20 }}
             animate={{ opacity: 1, scale: 1, y: 0 }}
             className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
           >
              <h3 className="text-xl font-black text-white mb-2 uppercase">Batch Categorization</h3>
              <p className="text-slate-500 text-xs mb-8">Re-labeling <span className="text-indigo-400 font-black">{selectedIds.length}</span> signals.</p>
              
              <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">New Group Name</label>
                    <input 
                      type="text" 
                      placeholder="Type a group name..."
                      className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleBatchGroupUpdate((e.target as HTMLInputElement).value);
                      }}
                    />
                 </div>

                 <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                    <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest"><span className="bg-slate-900 px-4 text-slate-600">Or Select Existing</span></div>
                 </div>

                 <div className="grid grid-cols-2 gap-2 max-h-[30vh] overflow-y-auto pr-2">
                    {filters.groups.map(g => (
                      <button 
                        key={g}
                        onClick={() => handleBatchGroupUpdate(g)}
                        className="p-3 text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/5 rounded-xl text-slate-400 hover:text-white hover:border-indigo-500/30 transition-all"
                      >
                         {g}
                      </button>
                    ))}
                 </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex justify-end">
                 <button onClick={() => setIsGroupModalOpen(false)} className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
              </div>
           </motion.div>
        </div>
      )}
    </div>
  );
};
