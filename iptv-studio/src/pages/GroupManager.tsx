import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FolderTree, 
  Search, 
  Edit2, 
  Trash2, 
  Hash, 
  Loader2,
  AlertTriangle,
  Check,
  Combine,
  ArrowRight
} from 'lucide-react';

interface GroupData {
  name: string;
  count: number;
}

export const GroupManager: React.FC = () => {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingGroup, setEditingGroup] = useState<GroupData | null>(null);
  const [newName, setNewName] = useState('');
  const [deletingGroup, setDeletingGroup] = useState<GroupData | null>(null);
  const [processing, setProcessing] = useState(false);
  
  // Batch Selection state
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = () => {
    setLoading(true);
    fetch('/api/channels/groups/manage')
      .then(res => res.json())
      .then(data => {
        setGroups(data);
        setLoading(false);
        setSelectedGroups([]);
      })
      .catch(err => console.error("Error fetching groups:", err));
  };

  const handleRename = async () => {
    if (!editingGroup || !newName || newName === editingGroup.name) {
      setEditingGroup(null);
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch('/api/channels/groups/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: editingGroup.name, new_name: newName })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        fetchGroups();
        setEditingGroup(null);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;

    setProcessing(true);
    try {
      const res = await fetch('/api/channels/groups/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deletingGroup.name })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        fetchGroups();
        setDeletingGroup(null);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedGroups.length === 0) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/channels/groups/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: selectedGroups })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        fetchGroups();
        setIsBatchDeleting(false);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setProcessing(false);
    }
  };

  const handleMerge = async () => {
    if (selectedGroups.length === 0 || !mergeTarget) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/channels/groups/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_names: selectedGroups, target_name: mergeTarget })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        fetchGroups();
        setIsMerging(false);
        setMergeTarget('');
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelect = (name: string) => {
    setSelectedGroups(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const selectAll = () => {
    if (selectedGroups.length === filtered.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(filtered.map(g => g.name));
    }
  };

  const filtered = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  const totalChannelsAffected = groups.filter(g => selectedGroups.includes(g.name)).reduce((acc, curr) => acc + curr.count, 0);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-indigo-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white uppercase flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center">
                <FolderTree size={20} />
             </div>
             Group <span className="text-indigo-500">Manager</span>
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Global namespace management and category reorganization.</p>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/40 p-3 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-4 w-full md:w-auto">
           <div className="relative w-full md:w-96 group">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
             <input 
               type="text" 
               placeholder="Search groups..." 
               value={search}
               onChange={e => setSearch(e.target.value)}
               className="w-full bg-slate-950/50 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600"
             />
           </div>
           <button 
             onClick={selectAll}
             className="px-4 py-3 bg-slate-950/50 hover:bg-indigo-500/10 border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-400 rounded-xl transition-all whitespace-nowrap"
           >
              {selectedGroups.length === filtered.length ? 'Deselect All' : 'Select All View'}
           </button>
        </div>
        <div className="px-4 py-2 bg-slate-950/50 rounded-xl border border-white/5 flex items-center gap-2">
            <Hash className="text-indigo-500" size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Groups:</span>
            <span className="text-sm font-black text-white">{groups.length}</span>
        </div>
      </div>

      {/* Groups List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filtered.map((group, i) => (
            <motion.div 
              key={group.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: i * 0.02 }}
              onClick={() => toggleSelect(group.name)}
              className={`bg-slate-900/40 border rounded-2xl p-5 group/item transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden cursor-pointer ${selectedGroups.includes(group.name) ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/5 hover:border-indigo-500/30'}`}
            >
               <div className="absolute top-0 right-0 p-4 flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedGroups.includes(group.name) ? 'bg-indigo-500 border-indigo-400 text-white' : 'border-white/20 bg-slate-950/50 text-transparent group-hover/item:border-indigo-500/50'}`}>
                     <Check size={12} strokeWidth={4} />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity ml-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingGroup(group); setNewName(group.name); }}
                      className="p-2 bg-slate-950/80 hover:bg-indigo-500 text-slate-400 hover:text-white rounded-lg transition-all"
                    >
                       <Edit2 size={12} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setDeletingGroup(group); }}
                      className="p-2 bg-slate-950/80 hover:bg-rose-500 text-slate-400 hover:text-white rounded-lg transition-all"
                    >
                       <Trash2 size={12} />
                    </button>
                  </div>
               </div>

               <div className="flex items-start gap-4 pr-16">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${selectedGroups.includes(group.name) ? 'bg-indigo-500 text-white' : 'bg-slate-950/50 text-slate-500 group-hover/item:text-indigo-400 group-hover/item:bg-indigo-500/10'}`}>
                     <FolderTree size={20} />
                  </div>
                  <div>
                     <h3 className="text-white font-black tracking-tight group-hover/item:text-indigo-400 transition-colors text-lg truncate">{group.name}</h3>
                     <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover/item:text-slate-400 transition-colors">Namespace Activity</span>
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-950/50 rounded-full border border-white/5">
                           <Hash size={8} className="text-indigo-500" />
                           <span className="text-[10px] font-black text-white">{group.count}</span>
                        </div>
                     </div>
                  </div>
               </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
         <div className="p-20 text-center glass rounded-[3rem]">
            <FolderTree className="text-slate-800 mx-auto mb-4" size={48} />
            <h3 className="text-xl font-bold text-slate-400 uppercase tracking-widest">Empty Namespace</h3>
            <p className="text-slate-600 text-sm mt-1">No groups match your current filter.</p>
         </div>
      )}

      {/* Batch Actions Floating Bar */}
      <AnimatePresence>
        {selectedGroups.length > 0 && (
           <motion.div 
             initial={{ y: 100, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             exit={{ y: 100, opacity: 0 }}
             className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[150] w-full max-w-2xl px-6"
           >
              <div className="bg-slate-900/90 backdrop-blur-2xl border border-indigo-500/20 rounded-3xl p-4 flex items-center justify-between shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
                 <div className="flex items-center gap-4 pl-4">
                    <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-indigo-600/20">
                       {selectedGroups.length}
                    </div>
                    <div>
                       <p className="text-xs font-black text-white uppercase tracking-widest">Selected Groups</p>
                       <p className="text-[10px] text-slate-500 uppercase font-medium">{totalChannelsAffected} Channels affected</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-3 pr-2">
                    <button 
                      onClick={() => setSelectedGroups([])}
                      className="px-6 py-3 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest"
                    >
                       Cancel
                    </button>
                    <button 
                      onClick={() => setIsMerging(true)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-indigo-600/10 transition-all active:scale-95"
                    >
                       <Combine size={14} /> Merge Selected
                    </button>
                    <button 
                      onClick={() => setIsBatchDeleting(true)}
                      className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-rose-600/10 transition-all active:scale-95"
                    >
                       <Trash2 size={14} /> Mass Delete
                    </button>
                 </div>
              </div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Merge Modal */}
      {isMerging && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsMerging(false)} />
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="relative w-full max-w-md bg-slate-900 border border-indigo-500/20 rounded-[2.5rem] p-8 shadow-2xl"
            >
               <h3 className="text-xl font-black text-white mb-2 uppercase">Merge Operations</h3>
               <p className="text-slate-500 text-xs mb-8 uppercase tracking-widest">Consolidating {selectedGroups.length} categories</p>
               
               <div className="space-y-6">
                  <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5 space-y-4">
                     <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                        {selectedGroups.map(name => (
                           <span key={name} className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black text-indigo-400 rounded-lg uppercase">{name}</span>
                        ))}
                     </div>
                     <div className="flex items-center justify-center text-slate-600"><ArrowRight size={16} /></div>
                     <div className="relative">
                        <input 
                           type="text" 
                           placeholder="Target group name (existing or new)..."
                           value={mergeTarget}
                           onChange={e => setMergeTarget(e.target.value)}
                           className="w-full bg-slate-900 border border-indigo-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                        />
                        {mergeTarget && groups.some(g => g.name.toLowerCase() === mergeTarget.toLowerCase() && !selectedGroups.includes(g.name)) && (
                           <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-emerald-400 uppercase tracking-widest">Existing Group</div>
                        )}

                        {/* Suggestions Dropdown */}
                        {mergeTarget && !groups.some(g => g.name === mergeTarget) && (
                           <div className="absolute z-[300] left-0 right-0 mt-2 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                              {groups
                                .filter(g => g.name.toLowerCase().includes(mergeTarget.toLowerCase()) && !selectedGroups.includes(g.name))
                                .map(g => (
                                   <button 
                                      key={g.name}
                                      onClick={() => setMergeTarget(g.name)}
                                      className="w-full px-4 py-3 text-left hover:bg-indigo-500/20 text-xs font-black text-slate-400 hover:text-white uppercase tracking-widest border-b border-white/5 last:border-0 transition-colors flex items-center justify-between"
                                   >
                                      {g.name}
                                      <span className="text-[8px] opacity-40">{g.count} CH</span>
                                   </button>
                                ))
                              }
                           </div>
                        )}
                     </div>
                  </div>

                  <div className="bg-indigo-500/10 p-5 rounded-[1.5rem] border border-indigo-500/20">
                     <div className="flex items-start gap-3">
                        <Combine className="text-indigo-400 flex-shrink-0 mt-1" size={20} />
                        <div>
                           <p className="text-[10px] font-black text-white uppercase tracking-widest">Structural Consolidation</p>
                           <p className="text-[10px] text-slate-500 uppercase mt-1 leading-relaxed">
                              Moving <span className="text-white">{totalChannelsAffected} channels</span> to the new namespace. Source categories will be retired.
                           </p>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="mt-8 flex gap-3">
                  <button onClick={() => setIsMerging(false)} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
                  <button 
                    onClick={handleMerge}
                    disabled={processing || !mergeTarget}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2"
                  >
                     {processing ? <Loader2 size={14} className="animate-spin" /> : <Combine size={14} />}
                     Execute Merge
                  </button>
               </div>
            </motion.div>
         </div>
      )}

      {/* Rename Modal */}
      {editingGroup && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setEditingGroup(null)} />
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl"
            >
               <h3 className="text-xl font-black text-white mb-6 uppercase flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg"><Edit2 size={16} /></div>
                  Rename Group
               </h3>
               
               <div className="space-y-4">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-slate-500 ml-1">New Name for "{editingGroup.name}"</label>
                     <input 
                        type="text" 
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-xl px-5 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        autoFocus
                     />
                  </div>
                  <div className="bg-indigo-500/5 p-4 rounded-xl border border-indigo-500/10 flex items-start gap-3">
                     <AlertTriangle className="text-indigo-400 flex-shrink-0" size={16} />
                     <p className="text-[10px] text-slate-400 leading-relaxed uppercase tracking-tight">
                        This will update <span className="font-black text-white">{editingGroup.count}</span> channels globally. Proceed with caution.
                     </p>
                  </div>
               </div>

               <div className="mt-8 flex gap-3">
                  <button onClick={() => setEditingGroup(null)} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
                  <button 
                    onClick={handleRename}
                    disabled={processing || !newName}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2"
                  >
                     {processing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                     Execute Update
                  </button>
               </div>
            </motion.div>
         </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingGroup && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setDeletingGroup(null)} />
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="relative w-full max-w-sm bg-slate-900 border border-rose-500/20 rounded-[2rem] p-8 shadow-[0_30px_70px_rgba(225,29,72,0.1)]"
            >
               <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle size={32} />
               </div>
               <h3 className="text-xl font-black text-white text-center mb-2 uppercase">Destructive Action</h3>
               <p className="text-slate-400 text-sm text-center mb-8">
                  Are you sure you want to delete the group <span className="text-white font-bold">"{deletingGroup.name}"</span>? 
                  The <span className="text-white font-bold">{deletingGroup.count}</span> associated channels will be moved to <span className="text-indigo-400 font-bold">Ungrouped</span>.
               </p>

               <div className="flex gap-3">
                  <button onClick={() => setDeletingGroup(null)} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
                  <button 
                    onClick={handleDelete}
                    disabled={processing}
                    className="flex-[2] bg-rose-600 hover:bg-rose-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-rose-600/20 flex items-center justify-center gap-2"
                  >
                     {processing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                     Confirm Delete
                  </button>
               </div>
            </motion.div>
         </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {isBatchDeleting && (
         <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl" onClick={() => setIsBatchDeleting(false)} />
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="relative w-full max-w-sm bg-slate-950 border border-rose-500/40 rounded-[2.5rem] p-10 shadow-[0_0_100px_rgba(225,29,72,0.2)]"
            >
               <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse">
                  <AlertTriangle size={40} />
               </div>
               <h3 className="text-2xl font-black text-white text-center mb-4 uppercase tracking-tighter">Mass Destructive Action</h3>
               <p className="text-slate-400 text-center mb-10 leading-relaxed uppercase text-[10px] font-bold tracking-widest px-4">
                  You are about to remove <span className="text-white">{selectedGroups.length} groups</span>. 
                  This will affect <span className="text-rose-400">{totalChannelsAffected} channels</span> globally. They will all become <span className="text-indigo-400">Ungrouped</span>.
               </p>

               <div className="flex flex-col gap-3">
                  <button 
                    disabled={processing}
                    onClick={handleBatchDelete} 
                    className="w-full bg-rose-600 hover:bg-rose-500 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl shadow-rose-600/20 flex items-center justify-center gap-3 transition-all active:scale-95"
                  >
                     {processing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                     Yes, Remove Globally
                  </button>
                  <button onClick={() => setIsBatchDeleting(false)} className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel Action</button>
               </div>
            </motion.div>
         </div>
      )}
    </div>
  );
};
