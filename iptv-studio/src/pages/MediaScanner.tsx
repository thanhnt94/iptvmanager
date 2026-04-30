import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Link, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Shield, 
  Globe, 
  Activity, 
  Play,
  Zap,
  MousePointer2,
  Tv,
  Film,
  Save,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScanResult {
  url: string;
  source: string;
  type: string;
}

interface BulkResultItem {
  original_title: string;
  blv: string | null;
  page_url: string;
  media_title: string;
  links: ScanResult[];
}

interface Playlist {
  id: number | string;
  name: string;
}

export const MediaScanner: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'single' | 'site' | 'movie'>('single');
  const [url, setUrl] = useState('');
  const [deep, setDeep] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  
  // Bulk Scan specific state
  const [bulkTaskId, setBulkTaskId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, status: '', state: '' });

  // Playlist state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [savingResults, setSavingResults] = useState<any[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/playlists')
      .then(res => res.json())
      .then(data => setPlaylists(data))
      .catch(err => console.error("Playlists fetch error:", err));
  }, []);

  useEffect(() => {
    let interval: any;
    if (bulkTaskId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/channels/bulk-scan/status/${bulkTaskId}`);
          const data = await res.json();
          setBulkProgress({
            current: data.current,
            total: data.total,
            status: data.status,
            state: data.state
          });

          if (data.state === 'SUCCESS') {
            if (data.result.data) {
              // Bulk/Site scan result
              setBulkResults(data.result.data);
            } else if (data.result.links) {
              // Single/Movie scan result
              setResults(data.result.links);
              if (!data.result.success) setError(data.result.error || 'No media found');
            }
            setBulkTaskId(null);
            setLoading(false);
          } else if (data.state === 'FAILURE') {
            setError(data.status || 'Scan failed');
            setBulkTaskId(null);
            setLoading(false);
          }
        } catch (err) {
          console.error("Poll error:", err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [bulkTaskId]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setBulkResults([]);
    
    setBulkTaskId(null);
    setBulkProgress({ current: 0, total: 0, status: 'Initializing Engine...', state: 'PENDING' });
    
    try {
      const endpoint = (activeTab === 'single' || activeTab === 'movie') ? '/api/channels/scan-web' : '/api/channels/bulk-scan';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, deep })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start scan');
      setBulkTaskId(data.task_id);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const copyToClipboard = (link: string, key: string) => {
    navigator.clipboard.writeText(link);
    setCopiedIndex(key);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const openSaveModal = (items: any[]) => {
    setSavingResults(items);
    setIsSaveModalOpen(true);
  };

  const handleSaveToPlaylist = async () => {
    if (!selectedPlaylistId || savingResults.length === 0) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/playlists/${selectedPlaylistId}/channels/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: savingResults })
      });
      const data = await res.json();
      if (data.status === 'success') {
        alert(`Successfully saved ${savingResults.length} channels!`);
        setIsSaveModalOpen(false);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Failed to save channels");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase flex items-center gap-4">
            Media <span className="text-indigo-500">Scanner</span>
            <span className="text-[10px] bg-indigo-500 text-white px-3 py-1.5 rounded-full tracking-widest font-black">X-RAY</span>
          </h1>
          <p className="text-slate-400 font-medium max-w-2xl text-sm md:text-base">
            Universal media extraction engine. Discover live streams, movie payloads, and blv matches across any website.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-900/80 p-1 rounded-[1.25rem] border border-white/5 shadow-2xl">
           <button 
             onClick={() => { setActiveTab('single'); setResults([]); setBulkResults([]); setError(null); }}
             className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'single' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <MousePointer2 size={14} /> Single
           </button>
           <button 
             onClick={() => { setActiveTab('site'); setResults([]); setBulkResults([]); setError(null); }}
             className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'site' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <Globe size={14} /> Full Site
           </button>
           <button 
             onClick={() => { setActiveTab('movie'); setResults([]); setBulkResults([]); setError(null); }}
             className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'movie' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <Film size={14} /> Movies
           </button>
        </div>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/5 rounded-[3rem] p-8 md:p-12 shadow-2xl space-y-10 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-12 opacity-[0.02] pointer-events-none">
           {activeTab === 'single' ? <Search size={240} /> : activeTab === 'site' ? <Globe size={240} /> : <Film size={240} />}
        </div>

        <form onSubmit={handleScan} className="flex flex-col md:flex-row gap-4 relative z-10">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-500 transition-colors">
              <Link size={20} />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={activeTab === 'single' ? "Paste any URL to sniff..." : activeTab === 'site' ? "Site homepage (e.g. colatv48.live)" : "Movie URL (e.g. motchillui.org/...)"}
              className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-5 pl-16 pr-8 text-white placeholder:text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all font-medium text-lg"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url}
            className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-4 whitespace-nowrap group"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Zap className="group-hover:animate-pulse" size={20} />}
            {loading ? 'Analyzing...' : 'Start Extraction'}
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-6 pt-8 border-t border-white/5 relative z-10">
           <div className="flex items-center gap-4">
              <button 
                type="button"
                onClick={() => setDeep(!deep)}
                className={`flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all ${deep ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'}`}
              >
                 <Shield size={18} className={deep ? 'animate-pulse' : ''} />
                 <span className="text-[10px] font-black uppercase tracking-widest">Ultra Stealth Mode</span>
                 <div className={`w-8 h-4 rounded-full relative transition-colors ml-2 ${deep ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${deep ? 'left-4.5' : 'left-0.5'}`} />
                 </div>
              </button>
           </div>
           <div className="flex items-center gap-3 opacity-40">
              <Activity size={14} className="text-emerald-500" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Cortex-Scanner Engine v4.0.1</span>
           </div>
        </div>

        {/* Site Progress */}
        <AnimatePresence>
          {bulkTaskId && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-indigo-500/5 border border-indigo-500/10 rounded-3xl p-8"
            >
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                        <Loader2 className="animate-spin" size={18} />
                     </div>
                     <div>
                        <h4 className="font-black text-white text-xs uppercase tracking-widest">Discovery Progress</h4>
                        <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">{bulkProgress.status}</p>
                     </div>
                  </div>
                  <span className="text-2xl font-black text-white">{bulkProgress.total > 0 ? Math.round((bulkProgress.current / bulkProgress.total) * 100) : 0}%</span>
               </div>
               <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                     className="h-full bg-indigo-500" 
                     initial={{ width: '0%' }}
                     animate={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 5}%` }}
                  />
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <div className="bg-rose-500/5 border border-rose-500/10 rounded-3xl p-8 flex items-center gap-6 text-rose-400">
          <AlertTriangle size={24} />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1">Extraction Failure</p>
            <p className="font-bold">{error}</p>
          </div>
        </div>
      )}

      {/* Results Rendering */}
      <AnimatePresence mode="wait">
        {(results.length > 0) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between px-6">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Results <span className="text-indigo-500">({results.length})</span></h2>
              <button 
                onClick={() => openSaveModal(results.map(r => ({ name: r.type, stream_url: r.url })))}
                className="bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-emerald-600/20 flex items-center gap-2"
              >
                 <Save size={14} /> Save All
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {results.map((res, i) => (
                <div key={i} className="group bg-slate-900/60 border border-white/5 rounded-3xl p-6 flex items-center gap-6 transition-all hover:bg-white/5">
                   <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-indigo-500 shrink-0 group-hover:scale-110 transition-transform">
                      <Play size={24} className="fill-indigo-500/10" />
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[8px] font-black uppercase tracking-widest bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded">{res.source}</span>
                        <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">{res.type}</span>
                      </div>
                      <p className="text-slate-300 font-mono text-sm truncate">{res.url}</p>
                   </div>
                   <div className="flex items-center gap-3">
                      <button 
                        onClick={() => copyToClipboard(res.url, `res-${i}`)}
                        className={`p-3 rounded-xl transition-all ${copiedIndex === `res-${i}` ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
                      >
                         {copiedIndex === `res-${i}` ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                      </button>
                      <button 
                         onClick={() => openSaveModal([{ name: `Scan Result ${i+1}`, stream_url: res.url }])}
                         className="p-3 rounded-xl bg-slate-800 text-slate-500 hover:text-emerald-400 transition-all"
                      >
                         <Save size={18} />
                      </button>
                   </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {bulkResults.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between px-6">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Discovery <span className="text-indigo-500">Report</span></h2>
              <div className="flex items-center gap-3">
                 <button 
                   onClick={() => openSaveModal(bulkResults.flatMap(item => item.links.map(l => ({ name: item.blv ? `[${item.blv}] ${item.original_title}` : item.original_title, stream_url: l.url }))))}
                   className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl transition-all"
                 >
                    <Save size={16} /> Save All to Playlist
                 </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
               {bulkResults.map((item, idx) => (
                 <div key={idx} className="bg-slate-900/60 border border-white/5 rounded-[2.5rem] overflow-hidden group hover:border-indigo-500/20 transition-all">
                    <div className="bg-white/5 px-8 py-6 flex items-center justify-between">
                       <div className="flex items-center gap-5">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                             <Tv size={24} />
                          </div>
                          <div>
                             <h3 className="font-black text-white text-lg tracking-tight uppercase">{item.original_title}</h3>
                             <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mt-1">{item.blv ? `BLV: ${item.blv}` : 'Source: Network Auto'}</p>
                          </div>
                       </div>
                       <button 
                         onClick={() => openSaveModal(item.links.map(l => ({ name: item.blv ? `[${item.blv}] ${item.original_title}` : item.original_title, stream_url: l.url })))}
                         className="p-3 rounded-xl bg-slate-950 text-slate-500 hover:text-emerald-400 transition-all"
                       >
                          <Save size={20} />
                       </button>
                    </div>
                    <div className="p-4 space-y-2">
                       {item.links.map((link, lIdx) => (
                         <div key={lIdx} className="flex items-center justify-between bg-black/20 p-4 rounded-2xl hover:bg-white/5 transition-all group/link">
                            <div className="flex items-center gap-4">
                               <Play size={16} className="text-slate-600 group-hover/link:text-indigo-400" />
                               <span className="text-slate-400 text-xs font-mono truncate max-w-lg">{link.url}</span>
                            </div>
                            <div className="flex items-center gap-3">
                               <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{link.source}</span>
                               <button 
                                 onClick={() => copyToClipboard(link.url, `bulk-${idx}-${lIdx}`)}
                                 className={`p-2 rounded-lg transition-all ${copiedIndex === `bulk-${idx}-${lIdx}` ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-white'}`}
                               >
                                  {copiedIndex === `bulk-${idx}-${lIdx}` ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                               </button>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
               ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save to Playlist Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
           <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             onClick={() => setIsSaveModalOpen(false)}
             className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
           />
           <motion.div 
             initial={{ scale: 0.9, opacity: 0, y: 20 }}
             animate={{ scale: 1, opacity: 1, y: 0 }}
             className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[3rem] p-10 shadow-2xl overflow-hidden"
           >
              <div className="absolute top-0 right-0 p-10">
                 <button onClick={() => setIsSaveModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                    <Plus className="rotate-45" size={24} />
                 </button>
              </div>

              <div className="flex items-center gap-5 mb-10">
                 <div className="w-14 h-14 rounded-[1.25rem] bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Save size={28} />
                 </div>
                 <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Save <span className="text-emerald-500">Channels</span></h2>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Found {savingResults.length} items to persist</p>
                 </div>
              </div>

              <div className="space-y-8">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Destination Playlist</label>
                    <div className="relative">
                       <select 
                         value={selectedPlaylistId}
                         onChange={(e) => setSelectedPlaylistId(e.target.value)}
                         className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-5 text-white font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none"
                       >
                          <option value="">Select a playlist...</option>
                          {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                       <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                          <Plus size={20} />
                       </div>
                    </div>
                 </div>

                 <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {savingResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                         <span className="text-[10px] font-black text-slate-300 uppercase truncate pr-4">{r.name}</span>
                         <span className="text-[8px] font-mono text-slate-600 truncate max-w-[150px]">{r.stream_url}</span>
                      </div>
                    ))}
                 </div>

                 <button 
                   onClick={handleSaveToPlaylist}
                   disabled={!selectedPlaylistId || isSaving}
                   className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white h-16 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3"
                 >
                    {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                    {isSaving ? 'Saving...' : 'Confirm Bulk Save'}
                 </button>
              </div>
           </motion.div>
        </div>
      )}

      {loading && results.length === 0 && !bulkTaskId && (
        <div className="flex flex-col items-center justify-center py-40 gap-8">
           <div className="relative">
              <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                 <Zap className="text-indigo-500 animate-pulse" size={24} />
              </div>
           </div>
           <div className="text-center space-y-2">
              <p className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] animate-pulse">Engaging Extraction Core...</p>
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Applying neural patterns to target URL</p>
           </div>
        </div>
      )}
    </div>
  );
};
