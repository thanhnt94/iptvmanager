import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Save, 
  Tv, 
  List, 
  Shield, 
  Link, 
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Play,
  Globe,
  Lock as LockIcon
} from 'lucide-react';
import { getLogoUrl } from '../../utils';
import { UnifiedPlayer } from '../player/UnifiedPlayer';

interface Playlist {
  id: number;
  name: string;
}

interface ChannelFormProps {
  channelId?: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ChannelForm: React.FC<ChannelFormProps> = ({ channelId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!channelId);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    stream_url: '',
    logo_url: '',
    group_name: '',
    epg_id: '',
    proxy_type: 'none',
    is_original: false,
    is_public: false,
    selected_playlists: [] as number[]
  });
  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [epgHints, setEpgHints] = useState<string[]>([]);

  useEffect(() => {
    // Load available playlists
    fetch('/api/playlists')
      .then(res => res.json())
      .then(data => setPlaylists(data))
      .catch(err => console.error(err));

    // Load existing groups for autocomplete
    fetch('/api/channels/filters')
      .then(res => res.json())
      .then(data => {
        if (data.groups) setExistingGroups(data.groups);
      })
      .catch(err => console.error(err));

    // Load EPG Hints
    fetch('/api/epg/hints')
      .then(res => res.json())
      .then(data => setEpgHints(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));

    // If editing, load channel data
    if (channelId) {
      fetch(`/api/channels/${channelId}/info`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'ok') {
            const ch = data.channel;
            setFormData({
              name: ch.name || '',
              stream_url: ch.stream_url || '',
              logo_url: ch.logo_url || '',
              group_name: ch.group_name || '',
              epg_id: ch.epg_id || '',
              proxy_type: ch.proxy_type || 'none',
              is_original: !!ch.is_original,
              is_public: !!ch.is_public,
              selected_playlists: data.memberships || []
            });
          }
          setInitialLoading(false);
        })
        .catch(() => setInitialLoading(false));
    }
  }, [channelId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = channelId ? `/api/channels/${channelId}` : '/api/channels/add';
    const method = channelId ? 'PATCH' : 'POST';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setError(data.error || 'Failed to save channel');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const togglePlaylist = (id: number) => {
    setFormData(prev => ({
      ...prev,
      selected_playlists: prev.selected_playlists.includes(id)
        ? prev.selected_playlists.filter(p => p !== id)
        : [...prev.selected_playlists, id]
    }));
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="glass w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-[2.5rem] shadow-2xl border border-white/10"
      >
        <header className="p-8 border-b border-white/5 flex items-center justify-between">
           <div>
              <h3 className="text-xl font-black text-white tracking-tight">
                {channelId ? 'Refine Registry Entry' : 'New Ecosystem Stream'}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-widest">
                {channelId ? `Modifying ID: ${channelId}` : 'Onboarding a new media source'}
              </p>
           </div>
           <button onClick={onClose} className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-all active:scale-90">
              <X size={20} />
           </button>
        </header>

        {initialLoading ? (
           <div className="p-20 text-center">
              <Loader2 className="animate-spin text-indigo-500 mx-auto" size={40} />
           </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
            {error && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-4 text-xs font-bold animate-in zoom-in duration-300">
                <AlertCircle size={18} /> {error}
              </div>
            )}

            {/* LIVE PREVIEW SECTION */}
            <AnimatePresence>
              {showPreview && formData.stream_url && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mb-8 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-1">Live Preview Inspection</label>
                      <button 
                        type="button"
                        onClick={() => setShowPreview(false)}
                        className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest"
                      >
                        Close Preview
                      </button>
                    </div>
                    <UnifiedPlayer 
                      channel={{
                        id: channelId || 0,
                        name: formData.name || 'Draft Preview',
                        logo_url: formData.logo_url,
                        group_name: formData.group_name,
                        stream_url: formData.stream_url,
                        proxy_type: formData.proxy_type,
                        play_links: {
                          smart: `/api/channels/play/preview?url=${encodeURIComponent(formData.stream_url)}&proxy=${formData.proxy_type}&token=${localStorage.getItem('api_token')}`,
                          tracking: `/api/channels/play/preview?url=${encodeURIComponent(formData.stream_url)}&proxy=${formData.proxy_type}&token=${localStorage.getItem('api_token')}`,
                          original: formData.stream_url
                        }
                      }}
                      initialMode="original"
                      layout="compact"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Stream Name</label>
                    <div className="relative">
                       <Tv className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                       <input 
                        type="text" 
                        required
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="e.g. Discovery HQ"
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Logo Provider URL</label>
                     <div className="flex gap-4">
                        <div className="relative flex-1">
                           <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                           <input 
                            type="text" 
                            value={formData.logo_url}
                            onChange={e => setFormData({...formData, logo_url: e.target.value})}
                            className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="https://icon.server/logo.png"
                           />
                        </div>
                        {formData.logo_url && (
                          <div className="w-14 h-14 bg-white rounded-xl p-1 shrink-0 border border-white/10 overflow-hidden shadow-xl animate-in zoom-in duration-300">
                             <img src={getLogoUrl(formData.logo_url)} className="w-full h-full object-contain" alt="" />
                          </div>
                        )}
                     </div>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Target Group</label>
                     <div className="relative">
                       <input 
                        type="text" 
                        value={formData.group_name}
                        onChange={e => setFormData({...formData, group_name: e.target.value})}
                        list="existing-groups"
                        className="w-full bg-slate-950/50 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="e.g. Science, Sports"
                       />
                       <datalist id="existing-groups">
                         {existingGroups.map(g => <option key={g} value={g} />)}
                       </datalist>
                    </div>
                 </div>

                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">EPG Identifier</label>
                     <div className="relative">
                        <input 
                         type="text" 
                         value={formData.epg_id}
                         onChange={e => setFormData({...formData, epg_id: e.target.value})}
                         list="epg-hints"
                         className="w-full bg-slate-950/50 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                         placeholder="discovery.us"
                        />
                        <datalist id="epg-hints">
                           {epgHints.map(hint => <option key={hint} value={hint} />)}
                        </datalist>
                     </div>
                  </div>
              </div>
            </div>

            <div className="space-y-2">
               <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Primary Source (Direct or Scrape)</label>
                {formData.stream_url && !showPreview && (
                  <button 
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <Play size={12} fill="currentColor" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Test Link</span>
                  </button>
                )}
              </div>
               <div className="relative">
                  <Link className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <textarea 
                    required
                    value={formData.stream_url}
                    onChange={e => setFormData({...formData, stream_url: e.target.value})}
                    className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 min-h-[100px]"
                    placeholder="http://server.com/stream.m3u8"
                  />
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4 px-2">
               <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-4">Proxy Configuration</h4>
                  <div className="grid grid-cols-2 gap-2">
                     {['none', 'tracking', 'hls', 'ts'].map(mode => (
                       <button 
                        key={mode}
                        type="button"
                        onClick={() => setFormData({...formData, proxy_type: mode})}
                        className={`px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                          formData.proxy_type === mode 
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                          : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'
                        }`}
                       >
                          {mode}
                       </button>
                     ))}
                  </div>
               </div>

               <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-4">Identity Protection</h4>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, is_original: !formData.is_original})}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      formData.is_original 
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                      : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                       <Shield size={20} />
                       <div className="text-left">
                          <p className="text-xs font-black uppercase tracking-widest">Mark as Protected</p>
                          <p className="text-[9px] font-medium opacity-60">Prevents automatic cleanup if link dies</p>
                       </div>
                    </div>
                    <div className={`w-10 h-6 rounded-full relative transition-colors ${formData.is_original ? 'bg-indigo-500' : 'bg-slate-800'}`}>
                       <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.is_original ? 'left-5' : 'left-1'}`} />
                    </div>
                  </button>
               </div>

               <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-4">Public Accessibility</h4>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, is_public: !formData.is_public})}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      formData.is_public 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                      : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                       {formData.is_public ? <Globe size={20} /> : <LockIcon size={20} />}
                       <div className="text-left">
                          <p className="text-xs font-black uppercase tracking-widest">Share to Community</p>
                          <p className="text-[9px] font-medium opacity-60">Visible in dynamic shared playlist</p>
                       </div>
                    </div>
                    <div className={`w-10 h-6 rounded-full relative transition-colors ${formData.is_public ? 'bg-emerald-500' : 'bg-slate-800'}`}>
                       <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.is_public ? 'left-5' : 'left-1'}`} />
                    </div>
                  </button>
               </div>
            </div>

            <div className="space-y-4 pt-4">
               <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest">Ecosystem Distribution</h4>
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{formData.selected_playlists.length} selected</span>
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {playlists.map(p => (
                    <button 
                      key={p.id}
                      type="button"
                      onClick={() => togglePlaylist(p.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        formData.selected_playlists.includes(p.id)
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                        : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'
                      }`}
                    >
                       <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                         formData.selected_playlists.includes(p.id) ? 'bg-emerald-500 border-emerald-500' : 'border-white/10'
                       }`}>
                          {formData.selected_playlists.includes(p.id) && <List size={10} className="text-slate-950" />}
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest truncate">{p.name}</span>
                    </button>
                  ))}
               </div>
            </div>
          </form>
        )}

        <footer className="p-8 border-t border-white/5 bg-white/[0.01] flex items-center justify-end gap-4">
           <button 
            type="button" 
            onClick={onClose} 
            className="px-6 py-3.5 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
           >
              Discard
           </button>
           <button 
            onClick={handleSubmit}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20 disabled:opacity-50"
           >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Commit Registry</>}
           </button>
        </footer>
      </motion.div>
    </motion.div>
  );
};
