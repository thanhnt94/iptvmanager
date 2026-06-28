import React, { useState, useEffect } from 'react';
import { 
  Link, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Play,
  Zap,
  Save,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScanResult {
  url: string;
  source: string;
  type: string;
}

interface Playlist {
  id: number | string;
  name: string;
}

export const MediaScanner: React.FC = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

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

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResults([]);
    
    try {
      const response = await fetch('/api/channels/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to extract links');
      
      const mapped = data.urls.map((u: string) => ({
        url: u,
        source: 'Media Sniffer',
        type: u.includes('.mp4') ? 'VOD' : 'LIVE (m3u8)'
      }));
      setResults(mapped);
      if (mapped.length === 0) {
        setError("No media links found in the HTML source of the target URL.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze link.");
    } finally {
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

  const handleAddDirectlyToChannels = async (streamUrl: string, index: number) => {
    const name = prompt("Enter Channel Name:", `Extracted Stream ${index + 1}`);
    if (!name) return;

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          stream_url: streamUrl,
          group_name: 'Extracted',
          status: 'unknown'
        })
      });
      if (res.ok) {
        alert("Successfully added to TV Channels registry!");
      } else {
        const errData = await res.json();
        alert(`Failed: ${errData.detail || 'API error'}`);
      }
    } catch (err) {
      alert("Failed to add channel");
    }
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
      if (data.status === 'success' || data.status === 'ok') {
        alert(`Successfully saved ${savingResults.length} channels!`);
        setIsSaveModalOpen(false);
      } else {
        alert(data.message || 'Failed to save');
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
          </h1>
          <p className="text-slate-400 font-medium max-w-2xl text-sm md:text-base">
            Universal media extraction engine. Sniff streaming URLs (.m3u8, .mp4, .ts) instantly from target web pages.
          </p>
        </div>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/5 rounded-[3rem] p-8 md:p-12 shadow-2xl space-y-10 overflow-hidden relative">
        <form onSubmit={handleScan} className="flex flex-col md:flex-row gap-4 relative z-10">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
              <Link size={20} />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste website URL here (e.g., https://example.com/stream)"
              className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-5 pl-16 pr-8 text-white placeholder:text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all font-medium text-lg"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url}
            className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-4 whitespace-nowrap group"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Zap className="group-hover:animate-pulse" size={20} />}
            {loading ? 'Sniffing...' : 'Extract Stream'}
          </button>
        </form>
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
        {results.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between px-6">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Extracted Streams <span className="text-indigo-500">({results.length})</span></h2>
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
                        title="Copy URL"
                      >
                         {copiedIndex === `res-${i}` ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                      </button>
                      <button 
                         onClick={() => openSaveModal([{ name: `Extracted Stream ${i+1}`, stream_url: res.url }])}
                         className="p-3 rounded-xl bg-slate-800 text-slate-500 hover:text-emerald-400 transition-all"
                         title="Save to Playlist"
                      >
                         <Save size={18} />
                      </button>
                      <button 
                         onClick={() => handleAddDirectlyToChannels(res.url, i)}
                         className="p-3 rounded-xl bg-slate-800 text-slate-500 hover:text-indigo-400 transition-all"
                         title="Add Directly to TV Channels"
                      >
                         <Plus size={18} />
                      </button>
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
                    {isSaving ? 'Saving...' : 'Confirm Save'}
                 </button>
              </div>
           </motion.div>
        </div>
      )}

      {loading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-40 gap-8">
           <div className="relative">
              <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                 <Zap className="text-indigo-500 animate-pulse" size={24} />
              </div>
           </div>
           <div className="text-center space-y-2">
              <p className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] animate-pulse">Sniffing Web Page...</p>
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Parsing HTML response code</p>
           </div>
        </div>
      )}
    </div>
  );
};
