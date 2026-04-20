import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileUp, 
  Link, 
  CloudDownload, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Database,
  Eye,
  Settings
} from 'lucide-react';
import { PreviewModal } from '../components/channels/PreviewModal';
import { getLogoUrl } from '../utils';

interface Candidate {
  name: string;
  logo_url: string | null;
  group_name: string;
  epg_id: string;
  stream_url: string;
  selected?: boolean;
}

export const Import: React.FC = () => {
  const [sourceType, setSourceType] = useState<'url' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [previewChannel, setPreviewChannel] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [totalToImport, setTotalToImport] = useState(0);
  const [visibility, setVisibility] = useState('private');
  const [result, setResult] = useState<{ imported: number, skipped: number } | null>(null);

  const handleParse = async () => {
    if (sourceType === 'url' && !url) return;
    setParsing(true);
    setResult(null);

    try {
      const res = await fetch('/api/ingestion/parse-m3u8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: url, is_url: true })
      });
      const data = await res.json();
      if (data.channels) {
        setCandidates(data.channels.map((c: any) => ({ ...c, selected: true })));
      }
    } catch (err) {
      alert('Parse failed');
    } finally {
      setParsing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        const res = await fetch('/api/ingestion/parse-m3u8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: content, is_url: false })
        });
        const data = await res.json();
        if (data.channels) {
          setCandidates(data.channels.map((c: any) => ({ ...c, selected: true })));
        }
      } catch (err) {
        alert('File parse failed');
      } finally {
        setParsing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleCommit = async () => {
    const selected = candidates.filter(c => c.selected);
    if (selected.length === 0) return;

    setImporting(true);
    setImportProgress(0);
    setTotalToImport(selected.length);
    
    let totalImported = 0;
    let totalSkipped = 0;

    try {
      // BATCH PROCESSING: 500 channels per request to avoid timeouts
      const CHUNK_SIZE = 500;
      for (let i = 0; i < selected.length; i += CHUNK_SIZE) {
        const chunk = selected.slice(i, i + CHUNK_SIZE);
        
        const res = await fetch('/api/ingestion/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channels: chunk, visibility })
        });
        
        if (!res.ok) throw new Error('Batch failed');
        
        const data = await res.json();
        totalImported += data.imported;
        totalSkipped += data.skipped;
        
        setImportProgress(Math.min(i + CHUNK_SIZE, selected.length));
      }

      setResult({ imported: totalImported, skipped: totalSkipped });
      setCandidates([]);
    } catch (err) {
      alert('Import failed during processing. Some channels might have been imported.');
      console.error(err);
    } finally {
      setImporting(false);
      setImportProgress(0);
      setTotalToImport(0);
    }
  };

  const toggleSelectAll = (val: boolean) => {
    setCandidates(prev => prev.map(c => ({ ...c, selected: val })));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Heavy Processing Overlay */}
      <AnimatePresence>
        {(parsing || importing) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8"
          >
            <div className="relative">
               <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full animate-pulse" />
               <Loader2 className="animate-spin text-indigo-500 relative z-10" size={64} />
            </div>
            
            <h3 className="text-2xl font-black text-white mt-8 uppercase tracking-tighter">
              {parsing ? 'Parsing Streams...' : 'Committing Registry...'}
            </h3>
            
            {importing && (
              <div className="w-full max-w-md mt-6 space-y-3">
                 <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-indigo-400">
                    <span>Progress</span>
                    <span>{importProgress} / {totalToImport}</span>
                 </div>
                 <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(importProgress / totalToImport) * 100}%` }}
                    />
                 </div>
                 <p className="text-[9px] text-white/30 text-center uppercase font-bold tracking-[0.3em]">Processing high-volume data packets</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <header>
        <h2 className="text-3xl font-black tracking-tighter text-white">Advanced <span className="text-indigo-500">Ingestion</span></h2>
        <p className="text-slate-400 text-sm mt-1">Bulk sync streams from external M3U8 links or local files.</p>
      </header>

      {/* Input Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <div className="glass rounded-3xl p-8 space-y-6 border-white/5 shadow-2xl">
            <div className="flex items-center gap-2 bg-slate-950/50 p-1 rounded-2xl border border-white/5 w-fit">
              <button 
                onClick={() => setSourceType('url')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${sourceType === 'url' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-white'}`}
              >
                URL Sync
              </button>
              <button 
                onClick={() => setSourceType('file')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${sourceType === 'file' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-white'}`}
              >
                Local File
              </button>
            </div>

            {sourceType === 'url' ? (
              <div className="space-y-4">
                <div className="relative group">
                  <Link className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={20} />
                  <input 
                    type="text" 
                    placeholder="https://example.com/playlist.m3u8"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-4 pl-14 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-700"
                  />
                </div>
                <button 
                  onClick={handleParse}
                  disabled={parsing || !url}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-600/20"
                >
                  {parsing ? <Loader2 className="animate-spin" size={18} /> : <CloudDownload size={18} />}
                  Synchronize Remote Playlist
                </button>
              </div>
            ) : (
              <div className="relative border-2 border-dashed border-white/10 rounded-3xl p-12 text-center hover:border-indigo-500/50 transition-all group overflow-hidden">
                <input 
                  type="file" 
                  accept=".m3u,.m3u8"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mx-auto group-hover:scale-110 transition-transform">
                    <FileUp size={32} />
                  </div>
                  <div>
                    <h4 className="text-white font-bold">Drop M3U8 File</h4>
                    <p className="text-slate-500 text-xs mt-1">or click to browse local storage</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Global Settings */}
        <div className="lg:col-span-4">
           <div className="glass rounded-3xl p-8 space-y-6 border-white/5 shadow-2xl h-full">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                   <Settings size={18} />
                </div>
                <h4 className="text-white text-xs font-black uppercase tracking-widest text-shadow-glow-blue">Import Logic</h4>
              </div>

              <div className="space-y-4 pt-4">
                 <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Global Visibility</label>
                    <div className="grid grid-cols-2 gap-2">
                       <button 
                        onClick={() => setVisibility('private')}
                        className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${visibility === 'private' ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/5 text-slate-500'}`}
                       >
                          Private Only
                       </button>
                       <button 
                        onClick={() => setVisibility('public')}
                        className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${visibility === 'public' ? 'bg-emerald-600/10 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-500'}`}
                       >
                          Public Access
                       </button>
                    </div>
                 </div>

                 <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                    <div className="flex items-start gap-3">
                       <AlertCircle className="text-indigo-400 shrink-0 mt-0.5" size={16} />
                       <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                         Duplicates will be automatically skipped based on Stream URL to maintain registry integrity.
                       </p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Candidates List */}
      <AnimatePresence>
        {candidates.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-white tracking-tight">Review <span className="text-indigo-500">Candidates</span></h3>
                  <span className="px-3 py-1 rounded-full bg-indigo-600/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                    {candidates.length} Found
                  </span>
               </div>
               <div className="flex items-center gap-4">
                  <button onClick={() => toggleSelectAll(true)} className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest">Select All</button>
                  <button onClick={() => toggleSelectAll(false)} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest">Deselect All</button>
               </div>
            </div>

            <div className="glass rounded-[2rem] overflow-hidden border-white/5 shadow-2xl">
              <div className="max-h-[600px] overflow-y-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md border-b border-white/5">
                    <tr>
                      <th className="px-8 py-5 text-[10px] font-black text-white/30 uppercase tracking-widest">Selection</th>
                      <th className="px-8 py-5 text-[10px] font-black text-white/30 uppercase tracking-widest">Channel Name</th>
                      <th className="px-8 py-5 text-[10px] font-black text-white/30 uppercase tracking-widest">Category</th>
                      <th className="px-8 py-5 text-[10px] font-black text-white/30 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c, i) => (
                      <tr key={i} className={`border-b border-white/5 hover:bg-white/[0.01] transition-colors group ${!c.selected ? 'opacity-40' : ''}`}>
                        <td className="px-8 py-4">
                          <input 
                            type="checkbox" 
                            checked={c.selected} 
                            onChange={() => setCandidates(prev => prev.map((item, idx) => idx === i ? { ...item, selected: !item.selected } : item))}
                            className="w-5 h-5 rounded-lg bg-slate-950 border-white/10 text-indigo-500 focus:ring-indigo-500/20"
                          />
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-white/5 overflow-hidden flex items-center justify-center">
                               {c.logo_url ? <img src={getLogoUrl(c.logo_url)} className="w-full h-full object-contain p-1" alt="" /> : <Eye className="text-slate-800" size={16} />}
                            </div>
                            <span className="text-sm font-bold text-white tracking-tight">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                           <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{c.group_name || 'Uncategorized'}</span>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <button 
                            onClick={() => setPreviewChannel({ ...c, id: 0 })}
                            className="p-2 text-slate-600 hover:text-indigo-400 transition-all rounded-lg hover:bg-indigo-500/10"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button 
                onClick={handleCommit}
                disabled={importing || candidates.filter(c => c.selected).length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 px-10 py-5 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] text-white flex items-center gap-3 transition-all shadow-2xl shadow-emerald-500/20 active:scale-95"
              >
                {importing ? <Loader2 className="animate-spin" size={20} /> : <Database size={20} />}
                Commit {candidates.filter(c => c.selected).length} Streams to Database
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Result */}
      <AnimatePresence>
        {result && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass rounded-[3rem] p-12 text-center space-y-6 border-emerald-500/20 bg-emerald-500/5"
          >
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto border border-emerald-500/20">
              <CheckCircle2 size={40} />
            </div>
            <div>
              <h3 className="text-3xl font-black text-white tracking-tighter">Ingestion Successful</h3>
              <p className="text-slate-400 mt-2">Database state has been synchronized.</p>
            </div>
            <div className="flex items-center justify-center gap-8 pt-4">
               <div className="text-center">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Imported</p>
                  <p className="text-3xl font-black text-emerald-400">{result.imported}</p>
               </div>
               <div className="w-px h-10 bg-white/5"></div>
               <div className="text-center">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Skipped (Dupes)</p>
                  <p className="text-3xl font-black text-slate-200">{result.skipped}</p>
               </div>
            </div>
            <div className="pt-8">
               <button 
                onClick={() => setResult(null)}
                className="px-10 py-4 rounded-2xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all border border-white/5"
               >
                 Dismiss and New Import
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PreviewModal 
        channel={previewChannel} 
        onClose={() => setPreviewChannel(null)} 
      />
    </div>
  );
};
