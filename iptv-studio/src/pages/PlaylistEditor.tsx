import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  GripVertical, 
  FolderEdit, 
  Trash2, 
  Save, 
  Loader2, 
  Plus,
  Tv,
  Layout,
  Pencil,
  Eye,
  Copy,
  Zap,
  RefreshCw,
  Check,
  XSquare
} from 'lucide-react';
import { ChannelForm } from '../components/forms/ChannelForm';
import { PreviewModal } from '../components/channels/PreviewModal';
import { getLogoUrl } from '../utils';

interface PlaylistInfo {
  id: number;
  name: string;
  slug: string;
  is_system: boolean;
}

interface Entry {
  id: number;
  channel_id: number;
  name: string;
  group_name: string;
  logo_url: string;
  status: string;
  stream_url?: string;
  play_links?: {
    smart: string;
    direct: string;
    tracking: string;
    hls: string;
    ts: string;
  };
}

export const PlaylistEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [groups, setGroups] = useState<{id: number, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Group Edit State
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  
  // Playlist Info Edit State
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');

  // Quick Channel Edit State
  const [editingChannelId, setEditingChannelId] = useState<number | null>(null);

  // Selection & Action States
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [previewChannel, setPreviewChannel] = useState<any>(null);
  const [checkingStatusId, setCheckingStatusId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    if (id) {
      fetchPlaylistData();
    }
  }, [id]);

  const fetchPlaylistData = async () => {
    setLoading(true);
    try {
      const [pRes, eRes, gRes] = await Promise.all([
        fetch(`/api/playlists`).then(res => res.json()),
        fetch(`/api/playlists/entries/${id}?limit=500`).then(res => res.json()),
        fetch(`/api/playlists/groups/${id}`).then(res => res.json())
      ]);
      
      const pInfo = pRes.find((p: any) => p.id.toString() === id);
      setPlaylist(pInfo);
      if (pInfo) {
        setEditName(pInfo.name);
        setEditSlug(pInfo.slug);
      }
      
      const mapped = eRes.channels.map((ch: any) => ({
        id: ch.id, 
        channel_id: ch.channel_id,
        name: ch.name,
        group_name: ch.group || 'Ungrouped',
        logo_url: ch.logo_url,
        status: ch.status,
        stream_url: ch.play_links?.original || ''
      }));
      setEntries(mapped);
      if (gRes && gRes.groups) {
        setGroups(gRes.groups);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      const entryIds = entries.map(e => e.id);
      await fetch(`/api/playlists/reorder/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: entryIds })
      });
      alert("Order saved successfully!");
    } catch (err) {
      alert("Error saving order");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateInfo = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/playlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, slug: editSlug })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setPlaylist(prev => prev ? { ...prev, name: data.playlist.name, slug: data.playlist.slug } : null);
        setIsInfoModalOpen(false);
      } else {
        alert(data.message || "Error updating info");
      }
    } catch (err) {
      alert("Error updating info");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteEntry = async (entryId: number) => {
    if (!confirm("Remove this channel from playlist?")) return;
    try {
      await fetch(`/api/playlists/entries/${entryId}`, { method: 'DELETE' });
      setEntries(prev => prev.filter(e => e.id !== entryId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    } catch (err) {
      alert("Error removing entry");
    }
  };

  const handleCheckStatus = async (item: Entry) => {
    setCheckingStatusId(item.id);
    try {
      const res = await fetch('/api/health/check-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: item.channel_id })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setEntries(prev => prev.map(e => e.id === item.id ? { ...e, status: data.data.status } : e));
      }
    } catch (err) {
      console.error("Health check error:", err);
    } finally {
      setCheckingStatusId(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Remove ${selectedIds.size} channels from this playlist?`)) return;
    setProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      for (const entryId of ids) {
        await fetch(`/api/playlists/entries/${entryId}`, { method: 'DELETE' });
      }
      setEntries(prev => prev.filter(e => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
    } catch (err) {
      alert("Error during bulk delete");
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkCheck = async () => {
    setProcessing(true);
    const itemsToCheck = entries.filter(e => selectedIds.has(e.id));
    
    try {
      // Check in sequence to avoid overloading
      for (const item of itemsToCheck) {
        const res = await fetch('/api/health/check-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id: item.channel_id })
        });
        const data = await res.json();
        if (data.status === 'ok') {
          setEntries(prev => prev.map(e => e.id === item.id ? { ...e, status: data.data.status } : e));
        }
      }
    } catch (err) {
      console.error("Bulk check error:", err);
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkGroup = () => {
    if (selectedIds.size === 0) return;
    // Use first selected as template for modal
    const firstId = Array.from(selectedIds)[0];
    const item = entries.find(e => e.id === firstId);
    if (item) {
      setEditingEntry(item);
      setIsGroupModalOpen(true);
    }
  };

  // Override handleUpdateGroup to support bulk
  const handleUpdateGroupBulk = async (groupId: number | null, customName?: string) => {
    setProcessing(true);
    try {
      let finalGroupId = groupId;
      if (!finalGroupId && customName) {
        const res = await fetch(`/api/playlists/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlist_id: id, name: customName })
        });
        const data = await res.json();
        if (data.status === 'ok') finalGroupId = data.group_id;
      }

      const ids = Array.from(selectedIds.size > 0 ? selectedIds : new Set(editingEntry ? [editingEntry.id] : []));
      for (const entryId of ids) {
        await fetch(`/api/playlists/update-entry-group/${entryId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_id: finalGroupId })
        });
      }
      
      fetchPlaylistData();
      setIsGroupModalOpen(false);
      setEditingEntry(null);
      setSelectedIds(new Set());
    } catch (err) {
       alert("Error updating groups");
    } finally {
      setProcessing(false);
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
           <button 
            onClick={() => navigate('/playlists')}
            className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
           >
              <ArrowLeft size={20} />
           </button>
           <div className="flex items-center gap-4">
             <div>
                <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white uppercase flex items-center gap-3">
                  Edit <span className="text-indigo-500">{playlist?.name}</span>
                </h2>
                <p className="text-slate-400 text-xs md:text-sm mt-1">/{playlist?.slug} • {entries.length} items in sequence</p>
             </div>
             {!playlist?.is_system && (
                <button 
                  onClick={() => setIsInfoModalOpen(true)}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all"
                  title="Edit Playlist Name/Slug"
                >
                  <FolderEdit size={16} />
                </button>
             )}
           </div>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={handleSaveOrder}
             disabled={saving}
             className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-8 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
           >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={18} />}
              Save Sequence
           </button>
        </div>
      </header>

      {/* Editor Surface */}
      <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-6 backdrop-blur-xl">
         <div className="flex items-center justify-between px-6 mb-6">
            <div className="flex items-center gap-4">
               <button 
                 onClick={toggleSelectAll}
                 className={`w-6 h-6 rounded-lg border transition-all flex items-center justify-center ${selectedIds.size === entries.length && entries.length > 0 ? 'bg-indigo-500 border-indigo-400' : 'bg-slate-950/50 border-white/5 hover:border-indigo-500/30'}`}
               >
                  {selectedIds.size === entries.length && entries.length > 0 && <Check size={14} className="text-white" />}
               </button>
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Resource Sequence ({selectedIds.size} selected)</span>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Interactive Draggable</span>
               </div>
            </div>
         </div>

         <Reorder.Group 
            axis="y" 
            values={entries} 
            onReorder={setEntries}
            className="space-y-2"
         >
            {entries.map((item) => (
               <Reorder.Item 
                 key={item.id} 
                 value={item}
                 className="group"
               >
                  <div className={`border rounded-2xl p-4 flex items-center justify-between transition-all cursor-grab active:cursor-grabbing ${selectedIds.has(item.id) ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-950/40 border-white/5 hover:border-indigo-500/20'}`}>
                     <div className="flex items-center gap-4">
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                          className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center ${selectedIds.has(item.id) ? 'bg-indigo-500 border-indigo-400' : 'bg-slate-900 border-white/10 group-hover:border-indigo-500/30'}`}
                        >
                           {selectedIds.has(item.id) && <Check size={12} className="text-white" />}
                        </button>
                        <div className="text-slate-600 group-hover:text-indigo-500 transition-colors">
                           <GripVertical size={20} />
                        </div>
                        <div className="w-12 h-12 bg-slate-900 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-white/5">
                           {item.logo_url ? (
                              <img src={getLogoUrl(item.logo_url)} alt="" className="w-full h-full object-contain p-2" />
                           ) : (
                              <Tv className="text-slate-700" size={24} />
                           )}
                        </div>
                        <div>
                           <h4 className="text-white font-black text-sm tracking-tight">{item.name}</h4>
                           <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                 <Layout size={10} className="text-indigo-500/50" />
                                 {item.group_name}
                              </span>
                              <div className={`w-1.5 h-1.5 rounded-full ${item.status === 'live' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : item.status === 'die' ? 'bg-rose-500' : 'bg-slate-600'}`} />
                              {item.status !== 'unknown' && <span className={`text-[9px] font-bold uppercase tracking-tighter ${item.status === 'live' ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>{item.status}</span>}
                           </div>
                        </div>
                     </div>

                     <div className="flex items-center gap-1.5">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setPreviewChannel({ id: item.channel_id, name: item.name, stream_url: item.stream_url, play_links: item.play_links }); }}
                          className="p-2 bg-slate-900 hover:bg-emerald-500 text-slate-500 hover:text-white rounded-xl transition-all"
                          title="Preview"
                        >
                           <Eye size={14} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCheckStatus(item); }}
                          disabled={checkingStatusId === item.id}
                          className="p-2 bg-slate-900 hover:bg-indigo-500 text-slate-500 hover:text-white rounded-xl transition-all disabled:opacity-50"
                          title="Refresh Status"
                        >
                           {checkingStatusId === item.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            navigator.clipboard.writeText(item.stream_url || ''); 
                            setCopiedId(item.id); 
                            setTimeout(() => setCopiedId(null), 2000); 
                          }}
                          className="p-2 bg-slate-900 hover:bg-indigo-500 text-slate-500 hover:text-white rounded-xl transition-all"
                          title="Copy Original Link"
                        >
                           {copiedId === item.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                        <div className="w-px h-6 bg-white/5 mx-1" />
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingChannelId(item.channel_id); }}
                          className="p-2 bg-slate-900 hover:bg-indigo-500 text-slate-500 hover:text-white rounded-xl transition-all"
                          title="Master Edit"
                        >
                           <Pencil size={14} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingEntry(item); setIsGroupModalOpen(true); }}
                          className="p-2 bg-slate-900 hover:bg-indigo-500 text-slate-500 hover:text-white rounded-xl transition-all"
                          title="Move to Group"
                        >
                           <FolderEdit size={14} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteEntry(item.id); }}
                          className="p-2 bg-slate-900 hover:bg-rose-500 text-slate-500 hover:text-white rounded-xl transition-all"
                          title="Remove from Playlist"
                        >
                           <Trash2 size={14} />
                        </button>
                     </div>
                  </div>
               </Reorder.Item>
            ))}
         </Reorder.Group>

         {entries.length === 0 && (
            <div className="p-20 text-center">
               <Tv className="text-slate-800 mx-auto mb-4" size={48} />
               <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Empty Registry</h3>
               <p className="text-slate-600 text-sm mt-1">Add channels to this profile from the Channels page.</p>
            </div>
         )}
      </div>

      {/* Group Assignment Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsGroupModalOpen(false)} />
           <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl"
           >
              <h3 className="text-xl font-black text-white mb-2 uppercase">Custom Grouping</h3>
              <p className="text-slate-500 text-xs mb-8">Override group assignment for <span className="text-white font-bold">{editingEntry?.name}</span></p>
              
              <div className="space-y-6">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Existing Groups</label>
                    <div className="grid grid-cols-2 gap-2">
                       <button 
                          onClick={() => handleUpdateGroupBulk(null)}
                          className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${!editingEntry?.group_name || editingEntry.group_name === 'Ungrouped' ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-slate-950/50 border-white/5 text-slate-400 hover:border-indigo-500/30'}`}
                        >
                           None / Main
                        </button>
                        {groups.map(g => (
                           <button 
                              key={g.id}
                              onClick={() => handleUpdateGroupBulk(g.id)}
                              className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${editingEntry?.group_name === g.name ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-slate-950/50 border-white/5 text-slate-400 hover:border-indigo-500/30'}`}
                           >
                              {g.name}
                           </button>
                        ))}
                    </div>
                 </div>

                 <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                    <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest"><span className="bg-slate-900 px-4 text-slate-600">Or New Group</span></div>
                 </div>

                 <div className="space-y-2">
                    <input 
                       type="text" 
                       placeholder="Enter new group name..."
                       value={newGroupName}
                       onChange={e => setNewGroupName(e.target.value)}
                       className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                    />
                    <button 
                       disabled={!newGroupName || processing}
                       onClick={() => handleUpdateGroupBulk(null, newGroupName)}
                       className="w-full bg-white/5 hover:bg-white/10 text-indigo-400 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                     >
                        {processing ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        Create & Assign
                     </button>
                 </div>
              </div>

              <div className="mt-8 flex justify-end">
                 <button onClick={() => setIsGroupModalOpen(false)} className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Close</button>
              </div>
           </motion.div>
        </div>
      )}

      {/* Playlist Info Modal */}
      {isInfoModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsInfoModalOpen(false)} />
           <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl"
           >
              <h3 className="text-xl font-black text-white mb-2 uppercase">Rename Registry</h3>
              <p className="text-slate-500 text-xs mb-8">Update the metadata for this playlist profile.</p>
              
              <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Display Name</label>
                    <input 
                       type="text" 
                       value={editName}
                       onChange={e => setEditName(e.target.value)}
                       className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Friendly Slug (URL)</label>
                    <input 
                       type="text" 
                       value={editSlug}
                       onChange={e => setEditSlug(e.target.value)}
                       className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-mono"
                    />
                 </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-4">
                 <button onClick={() => setIsInfoModalOpen(false)} className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
                 <button 
                    onClick={handleUpdateInfo}
                    disabled={processing}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-8 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
                 >
                    {processing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Apply Changes
                 </button>
              </div>
           </motion.div>
        </div>
      )}
      {/* Full-Featured Channel Edit Form */}
      {editingChannelId && (
        <ChannelForm 
          channelId={editingChannelId}
          onClose={() => setEditingChannelId(null)}
          onSuccess={() => { setEditingChannelId(null); fetchPlaylistData(); }}
        />
      )}

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-3 shadow-2xl flex items-center gap-4 min-w-[400px]"
          >
            <div className="bg-indigo-600 text-white px-4 py-2 rounded-2xl flex items-center gap-3">
               <span className="text-xs font-black uppercase tracking-widest">{selectedIds.size} Selected</span>
               <button onClick={() => setSelectedIds(new Set())} className="hover:text-white/70"><XSquare size={14} /></button>
            </div>
            
            <div className="flex items-center gap-1">
               <button 
                 onClick={handleBulkCheck}
                 disabled={processing}
                 className="p-3 text-slate-400 hover:text-indigo-400 hover:bg-white/5 rounded-2xl transition-all flex flex-col items-center gap-1 min-w-[70px]"
                 title="Check Status"
               >
                 {processing ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                 <span className="text-[8px] font-black uppercase tracking-tighter">Status</span>
               </button>
               <button 
                 onClick={handleBulkGroup}
                 className="p-3 text-slate-400 hover:text-indigo-400 hover:bg-white/5 rounded-2xl transition-all flex flex-col items-center gap-1 min-w-[70px]"
                 title="Change Group"
               >
                 <FolderEdit size={18} />
                 <span className="text-[8px] font-black uppercase tracking-tighter">Group</span>
               </button>
               <button 
                 onClick={handleBulkDelete}
                 disabled={processing}
                 className="p-3 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-2xl transition-all flex flex-col items-center gap-1 min-w-[70px]"
                 title="Remove"
               >
                 <Trash2 size={18} />
                 <span className="text-[8px] font-black uppercase tracking-tighter">Remove</span>
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      {previewChannel && (
        <PreviewModal 
          channel={previewChannel}
          onClose={() => setPreviewChannel(null)}
        />
      )}
    </div>
  );
};
;
