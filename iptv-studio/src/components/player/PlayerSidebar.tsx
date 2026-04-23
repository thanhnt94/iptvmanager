import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  Library, 
  ChevronRight, 
  Tv, 
  Zap, 
  WifiOff, 
  HelpCircle,
  Loader2,
  Filter,
  Layers,
  SearchX,
  Settings2,
  CalendarCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLogoUrl } from '../../utils';

// Custom hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface Playlist {
  id: number | string;
  name: string;
}

interface Channel {
  id: number;
  name: string;
  logo_url: string | null;
  group: string;
  status: 'live' | 'die' | 'unknown';
  quality: string;
  resolution: string;
  play_url: string;
  stream_format: string;
  epg_id?: string | null;
}

interface PlayerSidebarProps {
  onSelectChannel: (channel: Channel) => void;
  activeChannelId: number | null;
  className?: string;
  onEditChannel?: (id: number) => void;
}

export const PlayerSidebar: React.FC<PlayerSidebarProps> = ({ 
  onSelectChannel, 
  activeChannelId,
  className = "",
  onEditChannel
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<number | string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState('');
  const [hideDie, setHideDie] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch initial playlists
  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      if (loading) setLoading(false);
    }, 5000); // 5s absolute fail-safe

    fetch('/api/playlists')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        clearTimeout(timeout);
        if (Array.isArray(data)) {
          setPlaylists(data);
          if (data.length > 0) {
            setSelectedPlaylist(data[0].id);
          } else {
            setLoading(false);
          }
        } else {
          throw new Error("Invalid format");
        }
      })
      .catch(err => {
        clearTimeout(timeout);
        console.error("Playlists fetch error:", err);
        setError("Source catalog unreachable");
        setLoading(false);
      });
  }, []);

  // Fetch categories when playlist changes
  useEffect(() => {
    if (selectedPlaylist === null) return;
    fetch(`/api/playlists/groups/${selectedPlaylist}`)
      .then(res => res.json())
      .then(data => {
        const cats = data.categories || data.groups || [];
        setCategories(Array.isArray(cats) ? cats : []);
      })
      .catch(err => console.error("Categories fetch error:", err));
  }, [selectedPlaylist]);

  const fetchChannels = useCallback(async (reset = false) => {
    if (selectedPlaylist === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const currentPage = reset ? 1 : page;
    const params = new URLSearchParams({
      page: currentPage.toString(),
      group: selectedCategory,
      q: debouncedSearch,
      hide_die: hideDie.toString(),
      limit: '100'
    });

    try {
      const res = await fetch(`/api/playlists/entries/${selectedPlaylist}?${params.toString()}`);
      const contentType = res.headers.get("content-type");
      if (!res.ok || !contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response received:", text.substring(0, 200));
        throw new Error(`Invalid response: ${res.status} ${contentType}`);
      }

      const data = await res.json();
      
      const enhancedChannels = (data.channels || []).map((ch: any) => {
        // Backend now returns play_links. We preserve them and add VLC/PotPlayer
        const playLinks = ch.play_links || { 'smart': ch.play_url };
        const smartUrl = playLinks.smart || ch.play_url || '';
        const cleanUrl = smartUrl.replace(/^https?:\/\//, '');
        
        return {
          ...ch,
          play_links: {
            ...playLinks,
            'vlc': smartUrl ? `vlc://${cleanUrl}` : '',
            'potplayer': smartUrl ? `potplayer://${cleanUrl}` : ''
          }
        };
      });

      if (reset) {
        setChannels(enhancedChannels);
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
      } else {
        setChannels(prev => [...prev, ...enhancedChannels]);
      }
      setHasMore(data.has_more);
      setPage(currentPage + 1);
    } catch (err) {
      console.error("Fetch channels failed:", err);
      setError("Failed to load channel data. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [selectedPlaylist, selectedCategory, debouncedSearch, page, hideDie]);

  // Trigger fetch on filter change
  useEffect(() => {
    fetchChannels(true);
  }, [selectedPlaylist, selectedCategory, debouncedSearch, hideDie, fetchChannels]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'live': return <Zap size={10} />;
      case 'die': return <WifiOff size={10} />;
      default: return <HelpCircle size={10} />;
    }
  };

  return (
    <div className={`w-full lg:w-80 flex-1 lg:flex-none lg:h-full flex flex-col bg-slate-950/80 backdrop-blur-3xl border-t lg:border-t-0 lg:border-r border-white/5 overflow-hidden animate-in fade-in lg:slide-in-from-left duration-500 shadow-2xl z-20 ${className}`}>
      {/* Search & Select */}
      <div className="p-4 lg:p-6 space-y-3 lg:space-y-5 bg-white/[0.02] border-b border-white/5 shadow-inner">
         <div className="flex items-center justify-between">
            <h5 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
              <Library size={12} className="text-indigo-400" />
              Library Explorer
            </h5>
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`} />
         </div>
         
         <div className="space-y-2 lg:space-y-3">
            {/* Quick Filters Row */}
            <div className="grid grid-cols-2 gap-2">
              {/* Playlist Selector */}
              <div className="relative group">
                <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={12} />
                <select 
                  value={selectedPlaylist ?? ''} 
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedPlaylist(isNaN(Number(val)) ? val : Number(val));
                  }}
                  className="w-full bg-slate-900/60 border border-white/5 rounded-xl pl-8 pr-2 py-2 text-[10px] text-white font-black focus:outline-none focus:ring-1 focus:ring-indigo-500/20 appearance-none hover:bg-slate-900 transition-all cursor-pointer truncate"
                >
                   {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 rotate-90" size={12} />
              </div>

              {/* Category Dropdown */}
              <div className="relative group">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={12} />
                <select 
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full bg-slate-900/60 border border-white/5 rounded-xl pl-8 pr-2 py-2 text-[10px] text-white font-black focus:outline-none focus:ring-1 focus:ring-indigo-500/20 appearance-none hover:bg-slate-900 transition-all cursor-pointer truncate"
                >
                   <option value="">ALL</option>
                   {categories.map((cat: any) => {
                     const catName = typeof cat === 'string' ? cat : (cat?.name || 'Ungrouped');
                     return (
                       <option key={typeof cat === 'string' ? cat : cat?.id} value={catName}>
                         {String(catName).toUpperCase()}
                       </option>
                     );
                   })}
                </select>
                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 rotate-90" size={12} />
              </div>
            </div>

            {/* Search Input & Toolbelt */}
            <div className="flex gap-2">
               <div className="relative flex-1 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                  <input 
                    type="text" 
                    placeholder="Quick Search..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/20 placeholder:text-white/10 hover:bg-slate-950 transition-all font-bold"
                  />
                  {loading && search && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin" size={14} />
                  )}
               </div>

               <button 
                onClick={() => setHideDie(!hideDie)}
                title={hideDie ? "Showing Live Only" : "Exclude Offline"}
                className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-all ${
                  hideDie 
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]' 
                  : 'bg-white/5 border-white/5 text-white/20 hover:bg-white/10'
                }`}
               >
                 {hideDie ? <WifiOff size={16} /> : <Zap size={16} />}
               </button>
            </div>
         </div>
      </div>

      {/* Channel List */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1 relative"
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          // Robust check (2px buffer)
          if (scrollHeight - scrollTop <= clientHeight + 2 && hasMore && !loading) {
            fetchChannels();
          }
        }}
      >
        <AnimatePresence mode="popLayout">
          {channels.length > 0 ? (
            channels.map((ch) => (
              <motion.button
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                key={ch.id}
                onClick={() => onSelectChannel(ch)}
                className={`w-full group flex items-center gap-4 p-3 rounded-2xl transition-all border ${
                  activeChannelId === ch.id 
                  ? 'bg-indigo-600/20 border-indigo-500/40 shadow-lg shadow-indigo-500/10' 
                  : 'bg-transparent border-transparent hover:bg-white/5'
                }`}
              >
                 <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center p-1.5 shrink-0 shadow-lg group-hover:scale-105 transition-transform overflow-hidden">
                    {ch.logo_url ? (
                      <img 
                        src={getLogoUrl(ch.logo_url)} 
                        className="w-full h-full object-contain" 
                        alt="" 
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                             const fallback = parent.querySelector('.logo-fallback');
                             if (fallback) (fallback as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div className={`logo-fallback items-center justify-center w-full h-full ${ch.logo_url ? 'hidden' : 'flex'}`}>
                       <Tv className="text-slate-800" size={20} />
                    </div>
                 </div>
                 <div className="flex-1 min-w-0 text-left">
                    <div className={`text-[11px] font-black truncate leading-tight transition-colors flex items-center gap-2 ${activeChannelId === ch.id ? 'text-white' : 'text-slate-200'}`}>
                       {ch.name}
                       {ch.epg_id && (
                          <CalendarCheck size={11} className="text-indigo-400 shrink-0" />
                       )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                       <div className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest ${
                         ch.status === 'live' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                         ch.status === 'die' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                         'bg-white/5 border-white/5 text-white/30'
                       }`}>
                          {getStatusIcon(ch.status)}
                          {ch.status}
                       </div>
                       <span className="text-[8px] font-bold text-white/20 uppercase tracking-[0.2em]">{ch.resolution || 'SD'}</span>
                    </div>
                 </div>
                 <div className="flex items-center gap-2">
                    {onEditChannel && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditChannel(ch.id);
                          }}
                          className={`p-1.5 rounded-lg transition-all ${
                            activeChannelId === ch.id 
                            ? 'bg-white/10 text-white hover:bg-white/20' 
                            : 'text-slate-500 hover:text-white hover:bg-white/5 shadow-sm'
                          }`}
                          title="Edit Channel"
                        >
                           <Settings2 size={12} />
                        </button>
                    )}
                    {activeChannelId === ch.id && (
                       <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                    )}
                 </div>
              </motion.button>
            ))
          ) : !loading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 flex flex-col items-center justify-center text-center px-6"
            >
              <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-white/10 mb-4 border border-white/5 shadow-2xl">
                <SearchX size={32} />
              </div>
              <h6 className="text-xs font-black text-white uppercase tracking-widest">No Signals Found</h6>
              <p className="text-[9px] text-white/20 uppercase tracking-[0.2em] mt-2 leading-relaxed">Adjust your filters or try a different search query</p>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && (
          <div className="py-12 text-center">
             <Loader2 className="animate-spin text-indigo-500/40 mx-auto" size={24} />
          </div>
        )}

        {!loading && error && (
          <div className="py-12 text-center px-4">
            <p className="text-[10px] text-rose-400 font-black uppercase tracking-widest mb-2">{error}</p>
            <p className="text-[8px] text-white/20 uppercase tracking-[0.2em] leading-relaxed">Please check your connection or console for details</p>
          </div>
        )}
      </div>
    </div>
  );
};
