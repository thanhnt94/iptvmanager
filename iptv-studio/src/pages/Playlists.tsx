import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  FolderTree, 
  Layers, 
  Globe, 
  Search, 
  Plus, 
  MoreVertical, 
  Trash2, 
  Activity, 
  Loader2,
  ExternalLink,
  LayoutGrid,
  List,
  Clock,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';

interface Playlist {
  id: number | string;
  name: string;
  slug: string;
  is_system: boolean;
  is_dynamic: boolean;
  website_url: string;
  scanner_type: string;
  last_synced_at: string | null;
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

interface ScannerType {
  id: string;
  name: string;
}

export const Playlists: React.FC = () => {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'personal' | 'system' | 'dynamic') || 'personal';

  const setActiveTab = (tab: 'personal' | 'system' | 'dynamic') => {
    setSearchParams({ tab });
  };
  const [activeDropdown, setActiveDropdown] = useState<number | string | null>(null);
  const [activeMenu, setActiveMenu] = useState<number | string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hideDieFilter, setHideDieFilter] = useState(true);
  
  // Scanner Progress State
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus | null>(null);
  
  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<'manual' | 'dynamic'>('manual');
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newScanner, setNewScanner] = useState('colatv');
  const [scannerTypes, setScannerTypes] = useState<ScannerType[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchPlaylists = () => {
    fetch('/api/playlists')
      .then(res => res.json())
      .then(data => {
        setPlaylists(data);
        setLoading(false);
      })
      .catch(err => console.error("Playlists fetch error:", err));
  };

  const fetchScannerTypes = () => {
    fetch('/api/playlists/dynamic/types')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') setScannerTypes(data.types);
      })
      .catch(err => console.error("Scanner types fetch error:", err));
  };

  useEffect(() => {
    fetchPlaylists();
    fetchScannerTypes();
  }, []);

  const wasRunningRef = React.useRef(false);

  const fetchScannerStatus = async () => {
    try {
      const res = await fetch('/api/health/status');
      if (!res.ok) return null;
      const data = await res.json();
      
      // If scanner just finished or is running, refresh list to show new counts
      if (data.is_running || (wasRunningRef.current && !data.is_running)) {
        fetchPlaylists();
      }
      
      wasRunningRef.current = data.is_running;
      setScannerStatus(data);
      return data;
    } catch (err) {
      console.error("Scanner status fetch error:", err);
      return null;
    }
  };

  useEffect(() => {
    let timeoutId: any;
    let isMounted = true;
    const pollLoop = async () => {
      if (!isMounted) return;
      const data = await fetchScannerStatus();
      if (!isMounted) return;
      const delay = data?.is_running ? 2000 : 20000;
      timeoutId = setTimeout(pollLoop, delay);
    };
    pollLoop();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  const handleHealthScan = async (playlist: Playlist) => {
    try {
      const res = await fetch('/api/health/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: playlist.id, mode: 'playlist' })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        fetchScannerStatus();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Failed to start health scan");
    }
  };

  const handleSync = async (playlist: Playlist) => {
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        fetchPlaylists();
        // Immediately trigger a poll
        fetchScannerStatus();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Failed to start sync");
    }
  };

  const filtered = playlists.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.slug.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === 'system') return p.is_system && !p.owner_username.includes('user-');
    if (activeTab === 'dynamic') return p.is_dynamic;
    return !p.is_system && !p.is_dynamic;
  });

  const copyToClipboard = (playlist: Playlist, hideDie: boolean, mode: string) => {
    const baseUrl = window.location.origin;
    let friendlySlug = playlist.slug;
    if (friendlySlug.includes('-all')) friendlySlug = 'all';
    if (friendlySlug.includes('-protected')) friendlySlug = 'protected';
    
    const finalMode = mode === 'default' ? 'smart' : mode;
    const statusPart = hideDie ? '/live' : '';
    
    let modePart = '';
    if (finalMode === 'tracking' || finalMode === 'track') modePart = '/track';
    else if (finalMode === 'direct') modePart = '/direct';
    else if (finalMode === 'smart' && hideDie) modePart = '/smart';
    
    const url = `${baseUrl}/p/${playlist.owner_username}/${friendlySlug}${modePart}${statusPart}`;
    
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(`${playlist.id}-${mode}`);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDelete = async (id: number | string) => {
    if (!confirm('Are you sure you want to delete this playlist profile?')) return;
    try {
      const resp = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.status === 'ok' || data.status === 'success') {
        setPlaylists(prev => prev.filter(p => p.id !== id));
      } else {
        alert(data.message || 'Failed to delete');
      }
    } catch (err) { alert('Network error'); }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      let res;
      if (createType === 'manual') {
        res = await fetch('/api/playlists/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName, slug: newSlug })
        });
      } else {
        res = await fetch('/api/playlists/dynamic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName, website_url: newUrl, scanner_type: newScanner })
        });
      }
      const data = await res.json();
      if (data.status === 'ok' || data.status === 'success') {
        fetchPlaylists();
        setIsCreateModalOpen(false);
        setNewName('');
        setNewSlug('');
        setNewUrl('');
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Failed to create playlist");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return (
    <div className="h-full flex items-center justify-center p-20">
      <Loader2 className="animate-spin text-indigo-500" size={40} />
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white">Playlist <span className="text-indigo-500">Registry</span></h2>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Organize your manual and automated IPTV namespaces.</p>
        </div>
        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20 w-full md:w-auto"
        >
           <Plus size={18} /> New Playlist
        </button>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-900/40 p-1 rounded-2xl border border-white/5 w-fit">
        <button 
          onClick={() => setActiveTab('personal')}
          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'personal' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
        >
          <FolderTree size={14} /> Personal
        </button>
        <button 
          onClick={() => setActiveTab('system')}
          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'system' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
        >
          <Layers size={14} /> System
        </button>
        <button 
          onClick={() => setActiveTab('dynamic')}
          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'dynamic' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
        >
          <Globe size={14} /> Website Discovery
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/40 p-3 rounded-2xl border border-white/5">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search within tab..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950/50 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-white/5">
           <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-500 hover:text-white'}`}><LayoutGrid size={18} /></button>
           <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-500 hover:text-white'}`}><List size={18} /></button>
        </div>
      </div>

      {/* Playlists Render */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center bg-slate-900/20 rounded-[3rem] border border-dashed border-white/5">
          <div className="w-16 h-16 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-600">
             <Search size={32} />
          </div>
          <h3 className="text-white font-black uppercase tracking-widest text-xs">No Profiles Found</h3>
          <p className="text-slate-500 text-[10px] mt-2">Try adjusting your filters or create a new playlist.</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
          {filtered.map((item, i) => {
            const isThisPlaylistScanning = scannerStatus?.is_running && Number(scannerStatus?.playlist_id) === Number(item.id);
            
            return (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={item.id} 
                className={`glass relative group transition-all hover:bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 ${activeDropdown === item.id || activeMenu === item.id ? 'z-50' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${item.is_dynamic ? 'bg-emerald-500/10 text-emerald-400' : item.is_system ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
                        {item.is_dynamic ? <Globe size={24} /> : <Layers size={24} />}
                      </div>
                      <div>
                        <h3 className="font-black text-white tracking-tight">{item.name}</h3>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-none mt-1">
                          {item.is_dynamic ? item.scanner_type : item.is_system ? 'System' : 'Personal'}
                        </p>
                      </div>
                  </div>
                  {!item.is_dynamic && (
                      <button 
                        onClick={() => handleHealthScan(item)}
                        disabled={isThisPlaylistScanning}
                        className={`p-2.5 rounded-xl border transition-all ${isThisPlaylistScanning ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-slate-800 border-white/5 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/20'}`}
                        title="Run Health Scan (Check Live/Die)"
                      >
                        <Activity size={16} className={isThisPlaylistScanning ? 'animate-pulse' : ''} />
                      </button>
                  )}
                  {item.is_dynamic && (
                      <button 
                        onClick={() => handleSync(item)}
                        disabled={isThisPlaylistScanning}
                        className={`p-2.5 rounded-xl border transition-all ${isThisPlaylistScanning ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 border-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20'}`}
                      >
                        <Activity size={16} className={isThisPlaylistScanning ? 'animate-pulse' : ''} />
                      </button>
                  )}
                </div>

                <div className="mt-8 bg-slate-950/40 p-4 rounded-2xl border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {item.is_dynamic ? 'Links Found' : 'Channels'}
                        </span>
                        <span className="text-2xl font-black text-white leading-none mt-1">
                          {item.channel_count}
                        </span>
                      </div>
                      
                      {!item.is_dynamic && (
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                              <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1">Live</p>
                              <p className="text-[10px] font-black text-white">
                                {isThisPlaylistScanning ? scannerStatus?.live_count : item.live_count}
                              </p>
                          </div>
                          <div className="text-right border-l border-white/5 pl-3">
                              <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest leading-none mb-1">Die</p>
                              <p className="text-[10px] font-black text-white">
                                {isThisPlaylistScanning ? scannerStatus?.die_count : item.die_count}
                              </p>
                          </div>
                        </div>
                      )}

                      {item.is_dynamic && isThisPlaylistScanning && (
                         <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                            <Activity size={12} className="text-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-black text-emerald-400 uppercase">Scanning</span>
                         </div>
                      )}
                    </div>

                    {isThisPlaylistScanning && (
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest">
                          <span className="text-indigo-400 animate-pulse truncate max-w-[120px]">
                            {scannerStatus?.current_name || 'Scanning...'}
                          </span>
                          <span className="text-slate-500">
                            {scannerStatus?.current || 0} / {scannerStatus?.total || 0}
                          </span>
                        </div>
                        <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-indigo-500"
                            initial={{ width: '0%' }}
                            animate={{ width: `${Math.round(((scannerStatus?.current || 0) / (scannerStatus?.total || 1)) * 100)}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {item.is_dynamic && item.last_synced_at && !isThisPlaylistScanning && (
                      <div className="flex items-center gap-2 mt-3 text-slate-500 text-[9px] font-bold uppercase tracking-widest">
                        <Clock size={10} /> Last Sync: {item.last_synced_at}
                      </div>
                    )}
                </div>

                <div className="mt-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setActiveDropdown(activeDropdown === item.id ? null : item.id)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeDropdown === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                        >
                           <Copy size={14} /> Copy Link
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {item.is_dynamic && (
                        <button 
                          onClick={() => handleSync(item)}
                          disabled={isThisPlaylistScanning}
                          className={`p-2.5 rounded-xl transition-all ${isThisPlaylistScanning ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' : 'bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white'}`}
                          title="Sync/Scan Website Now"
                        >
                           <RefreshCw size={16} className={isThisPlaylistScanning ? 'animate-spin' : ''} />
                        </button>
                      )}
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
                                className="absolute bottom-full right-0 mb-3 w-48 bg-slate-900 border border-white/10 rounded-2xl p-2 shadow-2xl z-[100]"
                              >
                                  <p className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-500 border-b border-white/5 mb-1">Playlist Tools</p>
                                    <button 
                                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-slate-300 transition-colors"
                                      onClick={() => navigate(`/player?playlist=${item.id}`)}
                                    >
                                      <ExternalLink size={14} />
                                      <span className="text-[10px] font-black uppercase tracking-tight">Open Player</span>
                                    </button>
                                    <button 
                                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-500/10 text-indigo-400 transition-colors"
                                      onClick={() => handleHealthScan(item)}
                                    >
                                      <Activity size={14} />
                                      <span className="text-[10px] font-black uppercase tracking-tight">Run Health Scan</span>
                                    </button>
                                  {!item.is_system && (
                                    <button 
                                      onClick={() => handleDelete(item.id)}
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

                {/* Copy Dropdown Menu */}
                {activeDropdown === item.id && (
                  <div className="absolute bottom-full left-6 mb-4 w-64 bg-slate-950/98 backdrop-blur-3xl rounded-3xl p-4 shadow-2xl z-[100] border border-white/10">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Copy Links</span>
                        <button onClick={() => setHideDieFilter(!hideDieFilter)} className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border ${hideDieFilter ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-800 border-white/5 text-slate-500'}`}>
                          {hideDieFilter ? 'Live Only' : 'All'}
                        </button>
                    </div>
                    <div className="space-y-1">
                        {['smart', 'tracking', 'direct'].map(mode => (
                          <button 
                            key={mode} 
                            onClick={() => copyToClipboard(item, hideDieFilter, mode)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all border ${copiedId === `${item.id}-${mode}` ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5 hover:bg-white/5'}`}
                          >
                            <span className="text-[10px] font-black text-white uppercase">{mode} Gateway</span>
                            {copiedId === `${item.id}-${mode}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-slate-600" />}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
           <motion.div 
             initial={{ opacity: 0, scale: 0.9 }}
             animate={{ opacity: 1, scale: 1 }}
             className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl"
           >
              <div className="p-8">
                 <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-xl font-black text-white tracking-tight">Create <span className="text-indigo-500">Playlist</span></h3>
                      <p className="text-slate-500 text-xs mt-1">Select your playlist architecture.</p>
                    </div>
                    <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                       <Plus size={20} className="rotate-45" />
                    </button>
                 </div>

                 <div className="grid grid-cols-2 gap-4 mb-8">
                    <button 
                      onClick={() => setCreateType('manual')}
                      className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${createType === 'manual' ? 'border-indigo-600 bg-indigo-600/10 text-white' : 'border-white/5 bg-slate-950/50 text-slate-500 hover:border-white/10'}`}
                    >
                       <FolderTree size={24} />
                       <span className="text-[10px] font-black uppercase tracking-widest">Manual</span>
                    </button>
                    <button 
                      onClick={() => setCreateType('dynamic')}
                      className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${createType === 'dynamic' ? 'border-indigo-600 bg-indigo-600/10 text-white' : 'border-white/5 bg-slate-950/50 text-slate-500 hover:border-white/10'}`}
                    >
                       <Globe size={24} />
                       <span className="text-[10px] font-black uppercase tracking-widest">Dynamic</span>
                    </button>
                 </div>

                 <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Playlist Name</label>
                       <input 
                         type="text" 
                         value={newName} 
                         onChange={e => {
                           setNewName(e.target.value);
                           if (createType === 'manual') {
                             setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
                           }
                         }}
                         placeholder="e.g., My Favorite Sports"
                         className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                       />
                    </div>

                    {createType === 'manual' ? (
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Slug Identifier</label>
                          <input 
                            type="text" 
                            value={newSlug} 
                            onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                            placeholder="my-sports"
                            className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                          />
                       </div>
                    ) : (
                       <>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Website URL</label>
                            <input 
                              type="url" 
                              value={newUrl} 
                              onChange={e => setNewUrl(e.target.value)}
                              placeholder="https://colatv48.live/"
                              className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                            />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Scanner Engine</label>
                            <select 
                              value={newScanner}
                              onChange={e => setNewScanner(e.target.value)}
                              className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none"
                            >
                               {scannerTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                         </div>
                       </>
                    )}
                 </div>

                 <button 
                   onClick={handleCreate}
                   disabled={creating || !newName || (createType === 'manual' && !newSlug) || (createType === 'dynamic' && !newUrl)}
                   className="w-full mt-10 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white h-16 rounded-[1.5rem] font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3"
                 >
                    {creating ? <Loader2 className="animate-spin" /> : <Plus size={20} />}
                    {creating ? 'Creating...' : 'Launch Playlist'}
                 </button>
              </div>
           </motion.div>
        </div>
      )}
    </div>
  );
};
