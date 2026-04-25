import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Search, 
  ExternalLink, 
  MoreVertical, 
  Layers, 
  Tv, 
  Clock,
  LayoutGrid,
  List,
  Loader2,
  Copy,
  Check,
  Zap,
  Trash2,
  Activity,
  Globe,
  FolderTree,
  Wifi,
  XSquare
} from 'lucide-react';

interface Playlist {
  id: number | string;
  name: string;
  slug: string;
  is_system: boolean;
  channel_count: number;
  live_count: number;
  die_count: number;
  security_token: string;
  created_at: string;
  owner_username: string;
  auto_scan_enabled: boolean;
  auto_scan_time: string | null;
  last_auto_scan_at: string | null;
  is_scanning: boolean;
  current_scanning_name: string | null;
}

interface ScannerStatus {
  is_running: boolean;
  total: number;
  current: number;
  current_name: string;
  playlist_id: number | null;
  live_count: number;
  die_count: number;
}

export const Playlists: React.FC = () => {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeDropdown, setActiveDropdown] = useState<number | string | null>(null);
  const [activeMenu, setActiveMenu] = useState<number | string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hideDieFilter, setHideDieFilter] = useState(true);
  
  // Scanner Progress State
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus | null>(null);
  
  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [checkingId, setCheckingId] = useState<number | string | null>(null);
  const [checkResult, setCheckResult] = useState<{id: number|string, live: number, die: number, total: number, updated: number} | null>(null);
  const [scanDelayMenu, setScanDelayMenu] = useState<number | string | null>(null);

  // Auto Scan Modal State
  const [isAutoScanModalOpen, setIsAutoScanModalOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [tempTime, setTempTime] = useState('00:00');
  const [tempEnabled, setTempEnabled] = useState(false);
  const [savingAutoScan, setSavingAutoScan] = useState(false);

  const fetchPlaylists = () => {
    fetch('/api/playlists')
      .then(res => res.json())
      .then(data => {
        setPlaylists(data);
        setLoading(false);
      })
      .catch(err => console.error("Playlists fetch error:", err));
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  // Use a ref to track the previous running state to avoid infinite effect loops
  const wasRunningRef = React.useRef(false);

  // Polling for Scanner Status - Safe recursive approach
  useEffect(() => {
    let timeoutId: any;
    let isMounted = true;

    const poll = async () => {
      if (!isMounted) return;
      try {
        const res = await fetch('/api/health/status');
        if (!res.ok) return;
        const data = await res.json();
        
        if (!isMounted) return;

        // If scan is running, refresh the full list to get updated current_scanning_name from DB
        if (data.is_running) {
          fetchPlaylists();
        }
        
        // If scan just finished (transition from running to not running)
        if (wasRunningRef.current && !data.is_running) {
          fetchPlaylists();
        }
        
        wasRunningRef.current = data.is_running;
        setScannerStatus(data);
        
        // Dynamic interval: Poll faster if scanning
        const delay = data.is_running ? 3000 : 10000;
        timeoutId = setTimeout(poll, delay);
      } catch (err) {
        console.error("Scanner status poll error:", err);
        if (isMounted) timeoutId = setTimeout(poll, 10000);
      }
    };

    poll(); // Start loop

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []); // Empty dependency array ensures this runs exactly once on mount

  const filtered = playlists.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.slug.toLowerCase().includes(search.toLowerCase())
  );

  const copyToClipboard = (playlist: Playlist, hideDie: boolean, mode: string) => {
    const baseUrl = window.location.origin;
    const status = hideDie ? 'live' : 'all';
    const finalMode = mode === 'default' ? 'smart' : mode;
    let url = `${baseUrl}/p/${playlist.owner_username}/${playlist.slug}/${finalMode}/${status}`;
    
    // For public/system playlists, we still need the token to identify the viewer
    if (playlist.is_system || playlist.slug === 'public') {
      url += `?token=${playlist.security_token}`;
    }
    
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(`${playlist.id}-${mode}`);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this playlist? This action cannot be undone.')) return;
    
    try {
      const resp = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.status === 'ok') {
        setPlaylists(prev => prev.filter(p => p.id !== id));
        setActiveMenu(null);
      } else {
        alert(data.message || 'Error deleting playlist');
      }
    } catch (err) {
      alert('Failed to delete playlist');
    }
  };

  const handleUpdateAutoScan = async () => {
    if (!editingPlaylist) return;
    setSavingAutoScan(true);
    try {
      const resp = await fetch(`/api/playlists/${editingPlaylist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_scan_enabled: tempEnabled,
          auto_scan_time: tempTime
        })
      });
      const data = await resp.json();
      if (data.status === 'ok') {
        setPlaylists(prev => prev.map(p => p.id === editingPlaylist.id ? { 
          ...p, 
          auto_scan_enabled: data.playlist.auto_scan_enabled,
          auto_scan_time: data.playlist.auto_scan_time
        } : p));
        setIsAutoScanModalOpen(false);
      } else {
        alert(data.message || 'Error updating settings');
      }
    } catch (err) {
      alert('Failed to update auto-scan settings');
    } finally {
      setSavingAutoScan(false);
    }
  };

  const openAutoScanModal = (playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setTempEnabled(playlist.auto_scan_enabled);
    setTempTime(playlist.auto_scan_time || '00:00');
    setIsAutoScanModalOpen(true);
  };

  const handleQuickCheck = async (id: number | string, delay: number = 5) => {
    setCheckingId(id);
    setCheckResult(null);
    setScanDelayMenu(null);
    
    // Optimistic Update: Mark as scanning immediately in UI
    setPlaylists(prev => prev.map(p => p.id === id ? { ...p, is_scanning: true, current_scanning_name: 'Initiating...' } : p));

    try {
      const res = await fetch(`/api/playlists/${id}/quick-check`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delay })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setCheckResult({ id, live: data.live, die: data.die, total: data.total, updated: data.updated });
        setTimeout(() => setCheckResult(prev => prev?.id === id ? null : prev), 8000);
      } else if (data.status === 'background') {
        console.log("Background scan started");
      }
    } catch (err: any) {
      console.error('Quick check failed:', err);
      alert(`Lỗi: Không thể khởi chạy tiến trình quét ngầm. ${err.message || 'Máy chủ phản hồi lỗi.'}`);
      setPlaylists(prev => prev.map(p => p.id === id ? { ...p, is_scanning: false } : p));
    } finally {
      setCheckingId(null);
    }
  };

  const handleStopScan = async () => {
    try {
      await fetch('/api/health/stop', { method: 'POST' });
      // Immediately clear UI state — don't wait for next poll
      setScannerStatus(prev => prev ? { ...prev, is_running: false, stop_requested: true } : prev);
      setPlaylists(prev => prev.map(p => ({ ...p, is_scanning: false, current_scanning_name: null })));
      // Re-fetch fresh data from server
      setTimeout(fetchPlaylists, 500);
    } catch (err) {
      console.error("Failed to stop scan:", err);
    }
  };

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
        <button 
          onClick={() => {
            setNewName('');
            setNewSlug('');
            setIsCreateModalOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20 w-full md:w-auto"
        >
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
        <div className="flex items-center gap-2">
           <button 
             onClick={() => navigate('/groups')}
             className="bg-slate-950/50 hover:bg-indigo-500/10 text-indigo-400 border border-white/5 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
           >
              <FolderTree size={14} /> Group Manager
           </button>
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
      </div>

      {/* Playlists Grid */}
      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
        {filtered.map((item, i) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            key={item.id} 
            className={`glass relative group transition-all hover:bg-slate-900/60 ${viewMode === 'grid' ? 'p-6 rounded-[2rem]' : 'p-4 rounded-2xl flex items-center justify-between'} ${scanDelayMenu === item.id || activeDropdown === item.id || activeMenu === item.id ? 'z-[60]' : ''}`}
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
                    {item.auto_scan_enabled && (
                       <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30 flex items-center gap-1">
                          <Clock size={8} /> Auto: {item.auto_scan_time || '00:00'}
                       </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs font-medium tracking-wide">/{item.slug}</p>
               </div>
            </div>

            {viewMode === 'grid' ? (
              <>
                <div className="mt-8 grid grid-cols-1 gap-4">
                   <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-slate-500 mb-1">
                         <Tv size={14} />
                         <span className="text-[10px] font-black uppercase tracking-widest">Channels</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[32px] font-black text-white leading-none">
                          {item.channel_count}
                        </span>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] font-bold text-emerald-500/80 uppercase">
                              {scannerStatus?.is_running && Number(scannerStatus?.playlist_id) === Number(item.id) 
                                ? scannerStatus.live_count 
                                : item.live_count} LIVE
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span className="text-[10px] font-bold text-rose-500/80 uppercase">
                              {scannerStatus?.is_running && Number(scannerStatus?.playlist_id) === Number(item.id) 
                                ? scannerStatus.die_count 
                                : item.die_count} DIE
                            </span>
                          </div>
                        </div>
                        
                        {scannerStatus?.is_running && Number(scannerStatus?.playlist_id) === Number(item.id) && (
                          <div className="mt-4 space-y-3 p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <Activity size={12} className="text-indigo-400 animate-pulse shrink-0" />
                                <span className="text-[10px] text-slate-300 font-bold truncate">
                                  {item.current_scanning_name || scannerStatus?.current_name || 'Preparing...'}
                                </span>
                              </div>
                              <span className="text-[10px] text-indigo-400 font-black tracking-widest">
                                {Number(scannerStatus?.playlist_id) === Number(item.id) 
                                  ? `${Math.round(((scannerStatus?.current || 0) / (scannerStatus?.total || 1)) * 100)}%`
                                  : 'STARTING'}
                              </span>
                            </div>
                            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-white/5 p-0.5">
                              <motion.div 
                                className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                                initial={{ width: "5%" }}
                                animate={{ width: Number(scannerStatus?.playlist_id) === Number(item.id) 
                                  ? `${((scannerStatus?.current || 0) / (scannerStatus?.total || 1)) * 100}%`
                                  : '10%' 
                                }}
                                transition={{ type: 'spring', stiffness: 50 }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                   </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                       <Clock size={12} />
                       <span className="text-[10px] whitespace-nowrap">{item.created_at}</span>
                    </div>
                    {/* Check Result Toast */}
                    {checkResult?.id === item.id && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-950/95 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3 shadow-2xl z-50 flex items-center gap-4 whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-black text-emerald-400">{checkResult.live} LIVE</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-rose-500" />
                          <span className="text-[10px] font-black text-rose-400">{checkResult.die} DIE</span>
                        </div>
                        {checkResult.updated > 0 && (
                          <span className="text-[10px] font-black text-amber-400">{checkResult.updated} changed</span>
                        )}
                      </motion.div>
                    )}
                     <div className="flex items-center gap-2">
                       {/* Auto Scan Settings Button */}
                       <button 
                         onClick={() => openAutoScanModal(item)}
                         className={`p-2 rounded-xl transition-all border ${item.auto_scan_enabled ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'hover:bg-white/5 text-slate-500 border-transparent hover:border-white/10'}`}
                         title="Auto-Scan Settings"
                       >
                          <Clock size={16} />
                       </button>

                       <div className="relative">
                          <button 
                            onClick={() => setActiveDropdown(activeDropdown === item.id ? null : item.id)}
                            className={`p-2 rounded-xl transition-all ${activeDropdown === item.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'hover:bg-indigo-500/10 hover:text-indigo-400 text-slate-500'}`}
                          >
                             <Copy size={16} />
                          </button>

                          {activeDropdown === item.id && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className="absolute right-0 bottom-full mb-4 w-64 bg-slate-950/98 backdrop-blur-3xl rounded-3xl p-4 shadow-[0_20px_70px_rgba(0,0,0,0.8)] z-[100] border border-white/10"
                              >
                                 <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                                    <div className="flex flex-col">
                                       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Export Config</span>
                                       <span className="text-[9px] text-slate-500 font-medium">Configure your manifest</span>
                                    </div>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setHideDieFilter(!hideDieFilter); }}
                                      className={`relative flex items-center h-5 w-10 p-0.5 rounded-full transition-all duration-300 ${hideDieFilter ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-slate-800'}`}
                                    >
                                       <div className={`h-4 w-4 rounded-full bg-white shadow-md transition-transform duration-300 ${hideDieFilter ? 'translate-x-5' : 'translate-x-0'}`} />
                                       <span className="absolute -top-4 right-0 text-[8px] font-bold uppercase text-slate-400">
                                          {hideDieFilter ? 'Live Only' : 'Show All'}
                                       </span>
                                    </button>
                                 </div>
                                 
                                 <div className="space-y-1.5">
                                    <button 
                                      onClick={() => copyToClipboard(item, hideDieFilter, 'smart')}
                                      className={`w-full flex items-center justify-between px-3 py-3.5 rounded-2xl transition-all duration-300 border ${copiedId === `${item.id}-smart` ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5 hover:border-indigo-500/30 hover:bg-white/5'} group`}
                                    >
                                       <div className="flex items-center gap-3">
                                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${copiedId === `${item.id}-smart` ? 'bg-emerald-500 text-white' : 'bg-indigo-500/10 text-indigo-400 group-hover:scale-110'}`}>
                                             {copiedId === `${item.id}-smart` ? <Check size={16} /> : <Zap size={16} />}
                                          </div>
                                          <div className="text-left">
                                             <p className="text-[11px] font-black text-white uppercase tracking-tight">Smart Gateway</p>
                                             <p className="text-[9px] text-slate-500 font-medium leading-none mt-1">High-stability auto-fix</p>
                                          </div>
                                       </div>
                                       {copiedId === `${item.id}-smart` && <Check size={14} className="text-emerald-400" />}
                                    </button>

                                    <button 
                                      onClick={() => copyToClipboard(item, hideDieFilter, 'tracking')}
                                      className={`w-full flex items-center justify-between px-3 py-3.5 rounded-2xl transition-all duration-300 border ${copiedId === `${item.id}-tracking` ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5 hover:border-blue-500/30 hover:bg-white/5'} group`}
                                    >
                                       <div className="flex items-center gap-3">
                                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${copiedId === `${item.id}-tracking` ? 'bg-emerald-500 text-white' : 'bg-blue-500/10 text-blue-400 group-hover:scale-110'}`}>
                                             {copiedId === `${item.id}-tracking` ? <Check size={16} /> : <Activity size={16} />}
                                          </div>
                                          <div className="text-left">
                                             <p className="text-[11px] font-black text-white uppercase tracking-tight">Track Redirect</p>
                                             <p className="text-[9px] text-slate-500 font-medium leading-none mt-1">Analytical routing</p>
                                          </div>
                                       </div>
                                       {copiedId === `${item.id}-tracking` && <Check size={14} className="text-emerald-400" />}
                                    </button>

                                    <button 
                                      onClick={() => copyToClipboard(item, hideDieFilter, 'direct')}
                                      className={`w-full flex items-center justify-between px-3 py-3.5 rounded-2xl transition-all duration-300 border ${copiedId === `${item.id}-direct` ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5 hover:border-emerald-500/30 hover:bg-white/5'} group`}
                                    >
                                       <div className="flex items-center gap-3">
                                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${copiedId === `${item.id}-direct` ? 'bg-emerald-500 text-white' : 'bg-emerald-400/10 text-emerald-400 group-hover:scale-110'}`}>
                                             {copiedId === `${item.id}-direct` ? <Check size={16} /> : <Globe size={16} />}
                                          </div>
                                          <div className="text-left">
                                             <p className="text-[11px] font-black text-white uppercase tracking-tight">Original Source</p>
                                             <p className="text-[9px] text-slate-500 font-medium leading-none mt-1">Backup direct source</p>
                                          </div>
                                       </div>
                                       {copiedId === `${item.id}-direct` && <Check size={14} className="text-emerald-400" />}
                                    </button>
                                 </div>
                              </motion.div>
                           )}
                       </div>
                       
                       {/* Quick Check / Stop Button */}
                       {scannerStatus?.is_running && Number(scannerStatus?.playlist_id) === Number(item.id) ? (
                         <button 
                           onClick={handleStopScan}
                           className="p-2 rounded-xl transition-all border bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                           title="Stop Scan"
                         >
                           <XSquare size={16} className="animate-pulse" />
                         </button>
                       ) : (
                         <div className="relative">
                           <button 
                              onClick={() => setScanDelayMenu(scanDelayMenu === item.id ? null : item.id)}
                              disabled={checkingId === item.id}
                              className={`p-2 rounded-xl transition-all border ${
                                checkingId === item.id 
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                                  : 'hover:bg-emerald-500/10 hover:text-emerald-400 text-slate-500 border-transparent hover:border-emerald-500/20'
                              }`}
                              title="Quick Signal Check"
                            >
                               {checkingId === item.id 
                                 ? <Loader2 size={16} className="animate-spin" /> 
                                 : <Wifi size={16} />}
                            </button>
                            {scanDelayMenu === item.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setScanDelayMenu(null)} />
                                <div className="absolute right-0 top-full mt-2 z-50 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 min-w-[140px] animate-in fade-in zoom-in-95 duration-200">
                                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2 py-1 mb-1">Scan Delay</p>
                                   {[0, 1, 3, 5, 10, 30].map(d => (
                                     <button
                                       key={d}
                                       onClick={() => handleQuickCheck(item.id, d)}
                                       className="w-full text-left px-3 py-2 text-xs font-bold text-slate-300 hover:bg-indigo-500/10 hover:text-indigo-400 rounded-lg transition-all flex items-center justify-between"
                                     >
                                       <span>{d === 0 ? 'No delay' : `${d}s / channel`}</span>
                                       {d === 5 && <span className="text-[8px] text-indigo-500 font-black">DEFAULT</span>}
                                     </button>
                                   ))}
                                </div>
                              </>
                            )}
                         </div>
                       )}

                       <button 
                          onClick={() => navigate(`/playlists/${item.id}`)}
                          className="px-4 py-2 bg-slate-950/50 hover:bg-white/5 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                        >
                           Manage
                        </button>

                       <div className="relative">
                          <button 
                            onClick={() => setActiveMenu(activeMenu === item.id ? null : item.id)}
                            className={`p-2 rounded-xl transition-all ${activeMenu === item.id ? 'bg-indigo-500 text-white shadow-lg' : 'hover:bg-indigo-500/10 text-slate-500'}`}
                          >
                             <MoreVertical size={16} />
                          </button>

                          {activeMenu === item.id && (
                             <motion.div 
                               initial={{ opacity: 0, y: 10, scale: 0.95 }}
                               animate={{ opacity: 1, y: 0, scale: 1 }}
                               className="absolute bottom-full right-0 mb-3 w-48 glass-card rounded-2xl p-2 shadow-2xl z-50 border border-white/10"
                             >
                                <p className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-500 border-b border-white/5 mb-1">Playlist Tools</p>
                                <button 
                                  onClick={() => navigate(`/playlists/${item.id}`)}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-500 text-slate-300 hover:text-white transition-all group"
                                >
                                   <FolderTree size={14} className="group-hover:scale-110 transition-transform" />
                                   <span className="text-[10px] font-black uppercase tracking-tight">Manage Sequence</span>
                                </button>
                                <button 
                                  onClick={() => window.open(`/p/${item.owner_username}/${item.slug}`, '_blank')}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-500 text-slate-300 hover:text-white transition-all group"
                                >
                                   <ExternalLink size={14} className="group-hover:scale-110 transition-transform" />
                                   <span className="text-[10px] font-black uppercase tracking-tight">Open Player</span>
                                </button>
                                {!item.is_system && (
                                   <button 
                                     onClick={() => handleDelete(item.id as number)}
                                     className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-rose-500 text-rose-400 hover:text-white transition-all group"
                                   >
                                      <Trash2 size={14} className="group-hover:scale-110 transition-transform" />
                                      <span className="text-[10px] font-black uppercase tracking-tight">Delete Profile</span>
                                   </button>
                                )}
                             </motion.div>
                          )}
                       </div>
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
                     <div className="relative">
                        <button 
                          onClick={() => setActiveDropdown(activeDropdown === item.id ? null : item.id)}
                          className={`p-2 rounded-xl transition-all ${activeDropdown === item.id ? 'bg-indigo-500 text-white shadow-lg' : 'hover:bg-white/5 text-slate-500'}`}
                        >
                           <Copy size={16} />
                        </button>
                        
                        {activeDropdown === item.id && (
                            <motion.div 
                              initial={{ opacity: 0, x: 20, scale: 0.95 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              className="absolute bottom-0 right-[calc(100%+1rem)] w-64 bg-slate-950/98 backdrop-blur-3xl rounded-3xl p-4 shadow-[0_20px_70px_rgba(0,0,0,0.8)] z-[100] border border-white/10"
                            >
                               <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                                  <div className="flex flex-col">
                                     <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Export Config</span>
                                     <span className="text-[9px] text-slate-500 font-medium">Configure your manifest</span>
                                  </div>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setHideDieFilter(!hideDieFilter); }}
                                    className={`relative flex items-center h-5 w-10 p-0.5 rounded-full transition-all duration-300 ${hideDieFilter ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-slate-800'}`}
                                  >
                                     <div className={`h-4 w-4 rounded-full bg-white shadow-md transition-transform duration-300 ${hideDieFilter ? 'translate-x-5' : 'translate-x-0'}`} />
                                     <span className="absolute -top-4 right-0 text-[8px] font-bold uppercase text-slate-400">
                                        {hideDieFilter ? 'Live Only' : 'Show All'}
                                     </span>
                                  </button>
                               </div>
                               
                               <div className="space-y-1.5">
                                  <button 
                                    onClick={() => copyToClipboard(item, hideDieFilter, 'smart')}
                                    className={`w-full flex items-center justify-between px-3 py-3.5 rounded-2xl transition-all duration-300 border ${copiedId === `${item.id}-smart` ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5 hover:border-indigo-500/30 hover:bg-white/5'} group`}
                                  >
                                     <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${copiedId === `${item.id}-smart` ? 'bg-emerald-500 text-white' : 'bg-indigo-500/10 text-indigo-400 group-hover:scale-110'}`}>
                                           {copiedId === `${item.id}-smart` ? <Check size={16} /> : <Zap size={16} />}
                                        </div>
                                        <div className="text-left">
                                           <p className="text-[11px] font-black text-white uppercase tracking-tight">Smart Gateway</p>
                                           <p className="text-[9px] text-slate-500 font-medium leading-none mt-1">High-stability auto-fix</p>
                                        </div>
                                     </div>
                                     {copiedId === `${item.id}-smart` && <Check size={14} className="text-emerald-400" />}
                                  </button>

                                  <button 
                                    onClick={() => copyToClipboard(item, hideDieFilter, 'tracking')}
                                    className={`w-full flex items-center justify-between px-3 py-3.5 rounded-2xl transition-all duration-300 border ${copiedId === `${item.id}-tracking` ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5 hover:border-blue-500/30 hover:bg-white/5'} group`}
                                  >
                                     <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${copiedId === `${item.id}-tracking` ? 'bg-emerald-500 text-white' : 'bg-blue-500/10 text-blue-400 group-hover:scale-110'}`}>
                                           {copiedId === `${item.id}-tracking` ? <Check size={16} /> : <Activity size={16} />}
                                        </div>
                                        <div className="text-left">
                                           <p className="text-[11px] font-black text-white uppercase tracking-tight">Track Redirect</p>
                                           <p className="text-[9px] text-slate-500 font-medium leading-none mt-1">Analytical routing</p>
                                        </div>
                                     </div>
                                     {copiedId === `${item.id}-tracking` && <Check size={14} className="text-emerald-400" />}
                                  </button>

                                  <button 
                                    onClick={() => copyToClipboard(item, hideDieFilter, 'direct')}
                                    className={`w-full flex items-center justify-between px-3 py-3.5 rounded-2xl transition-all duration-300 border ${copiedId === `${item.id}-direct` ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5 hover:border-emerald-500/30 hover:bg-white/5'} group`}
                                  >
                                     <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${copiedId === `${item.id}-direct` ? 'bg-emerald-500 text-white' : 'bg-emerald-400/10 text-emerald-400 group-hover:scale-110'}`}>
                                           {copiedId === `${item.id}-direct` ? <Check size={16} /> : <Globe size={16} />}
                                        </div>
                                        <div className="text-left">
                                           <p className="text-[11px] font-black text-white uppercase tracking-tight">Original Source</p>
                                           <p className="text-[9px] text-slate-500 font-medium leading-none mt-1">Backup direct source</p>
                                        </div>
                                     </div>
                                     {copiedId === `${item.id}-direct` && <Check size={14} className="text-emerald-400" />}
                                  </button>
                               </div>
                            </motion.div>
                         )}
                     </div>
                      <button 
                        onClick={() => navigate(`/playlists/${item.id}`)}
                        className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all active:scale-95"
                      >
                         Manage
                      </button>
                     <div className="relative">
                        <button 
                          onClick={() => setActiveMenu(activeMenu === item.id ? null : item.id)}
                          className={`p-2.5 rounded-xl transition-all ${activeMenu === item.id ? 'bg-indigo-500 text-white shadow-lg' : 'hover:bg-white/5 text-slate-500'}`}
                        >
                           <MoreVertical size={16} />
                        </button>

                        {activeMenu === item.id && (
                             <motion.div 
                               initial={{ opacity: 0, y: 10, scale: 0.95 }}
                               animate={{ opacity: 1, y: 0, scale: 1 }}
                               className="absolute bottom-full right-0 mb-3 w-48 glass-card rounded-2xl p-2 shadow-2xl z-50 border border-white/10"
                             >
                                <p className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-500 border-b border-white/5 mb-1">Playlist Tools</p>
                                <button 
                                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-slate-300 transition-colors"
                                >
                                   <ExternalLink size={14} />
                                   <span className="text-[10px] font-black uppercase tracking-tight">Open Player</span>
                                </button>
                                {!item.is_system && (
                                   <button 
                                     onClick={() => handleDelete(item.id as number)}
                                     className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-rose-500/10 text-rose-400 transition-colors"
                                   >
                                      <Trash2 size={14} />
                                      <span className="text-[10px] font-black uppercase tracking-tight">Delete Profile</span>
                                   </button>
                                )}
                             </motion.div>
                          )}
                     </div>
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

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setIsCreateModalOpen(false)}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" 
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
          >
             <div className="absolute top-0 right-0 p-8">
                <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                   <Plus className="rotate-45" size={24} />
                </button>
             </div>

             <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center">
                   <Plus size={24} />
                </div>
                <div>
                   <h3 className="text-xl font-black text-white tracking-tight">New Registry <span className="text-indigo-400">Profile</span></h3>
                   <p className="text-slate-500 text-xs">Create a new curated namespace for distribution.</p>
                </div>
             </div>

             <div className="space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Profile Name</label>
                   <input 
                      type="text"
                      placeholder="e.g. Premium Sports Pack"
                      value={newName}
                      onChange={e => {
                        setNewName(e.target.value);
                        // Auto-gen slug if empty or matching previous auto-gen
                        const suggestion = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                        setNewSlug(suggestion);
                      }}
                      className="w-full bg-slate-950/50 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
                   />
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Slug (URL Path)</label>
                   <div className="relative group">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 font-medium text-sm">/</span>
                      <input 
                        type="text"
                        placeholder="sports-pack"
                        value={newSlug}
                        onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-10 pr-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium text-sm"
                      />
                   </div>
                </div>

                <div className="pt-4 flex flex-col md:flex-row gap-3">
                   <button 
                      onClick={() => setIsCreateModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                   >
                      Cancel
                   </button>
                   <button 
                      disabled={!newName || !newSlug || creating}
                      onClick={async () => {
                        setCreating(true);
                        try {
                          const res = await fetch('/api/playlists', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName, slug: newSlug })
                          });
                          const data = await res.json();
                          if (data.status === 'ok') {
                            setPlaylists([data.playlist, ...playlists]);
                            setIsCreateModalOpen(false);
                          } else {
                            alert(data.message || 'Error creating playlist');
                          }
                        } catch (err) {
                           alert('Network error');
                        } finally {
                          setCreating(false);
                        }
                      }}
                      className="flex-[2] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2"
                   >
                      {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Create Profile
                   </button>
                </div>
             </div>
          </motion.div>
        </div>
      )}

      {/* Auto-Scan Settings Modal */}
      {isAutoScanModalOpen && editingPlaylist && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
           <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             onClick={() => setIsAutoScanModalOpen(false)}
             className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
           />
           <motion.div 
             initial={{ scale: 0.9, opacity: 0, y: 20 }}
             animate={{ scale: 1, opacity: 1, y: 0 }}
             className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
           >
              <div className="flex items-center gap-4 mb-8">
                 <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Clock size={24} />
                 </div>
                 <div>
                    <h2 className="text-xl font-black text-white tracking-tight">Auto-Scan Settings</h2>
                    <p className="text-slate-500 text-xs font-medium">Configure periodic signal checks</p>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                    <div>
                       <p className="text-xs font-black text-white uppercase tracking-wider">Enable Scheduler</p>
                       <p className="text-[10px] text-slate-500 mt-0.5">Automatically scan in background</p>
                    </div>
                    <button 
                      onClick={() => setTempEnabled(!tempEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-all duration-300 p-1 ${tempEnabled ? 'bg-amber-500' : 'bg-slate-800'}`}
                    >
                       <div className={`w-4 h-4 rounded-full bg-white transition-all duration-300 ${tempEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                 </div>

                 <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block ml-1">Scan Time (UTC+7)</label>
                    <input 
                      type="time"
                      value={tempTime}
                      onChange={(e) => setTempTime(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all font-bold block"
                    />
                 </div>

                 <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => setIsAutoScanModalOpen(false)}
                      className="flex-1 h-12 rounded-2xl text-slate-400 font-black text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                    >
                       Cancel
                    </button>
                    <button 
                      onClick={handleUpdateAutoScan}
                      disabled={savingAutoScan}
                      className="flex-[2] h-12 bg-amber-500 hover:bg-amber-400 text-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50"
                    >
                       {savingAutoScan ? 'Saving...' : 'Save Settings'}
                    </button>
                 </div>
              </div>
           </motion.div>
        </div>
      )}
    </div>
  );
};
