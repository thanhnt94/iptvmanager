import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Settings as SettingsIcon, 
  ShieldCheck, 
  Database,
  UserPlus,
  Trash2,
  Lock,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Activity,
  Code,
  HardDrive
} from 'lucide-react';

interface Setting {
  key: string;
  value: string;
  description: string;
  type: string;
}

interface UserRecord {
  id: number;
  username: string;
  email: string;
  role: string;
  playlists: number[];
}

export const AdminPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'system' | 'security' | 'maintenance'>('users');
  const [settings, setSettings] = useState<Setting[]>([]);
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'free' });

  useEffect(() => {
    fetchInitialData();
  }, [activeTab]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const res = await fetch('/api/auth/users');
        if (res.ok) setUsersList(await res.json());
      } else {
        const res = await fetch('/api/settings/all');
        if (res.ok) setSettings(await res.json());
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const getSettingValue = (key: string) => {
    const s = settings.find(x => x.key === key);
    if (!s) return null;
    if (s.type === 'bool') return s.value.toLowerCase() === 'true';
    if (s.type === 'int') return parseInt(s.value);
    return s.value;
  };

  const handleToggle = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue;
    try {
      const res = await fetch('/api/settings/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: newValue })
      });
      if (res.ok) {
        setSettings(prev => {
          const exists = prev.find(s => s.key === key);
          if (exists) return prev.map(s => s.key === key ? { ...s, value: newValue.toString() } : s);
          return [...prev, { key, value: newValue.toString(), type: 'bool', description: '' }];
        });
        showMsg('success', `${key} updated`);
      }
    } catch (err) {
      showMsg('error', 'Update failed');
    }
  };

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      const res = await fetch(`/api/auth/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
        showMsg('success', 'Role updated successfully');
      } else {
        showMsg('error', 'Failed to update role');
      }
    } catch (err) {
      showMsg('error', 'Network error');
    }
  };

  const handleSaveSetting = async (key: string, value: string) => {
    try {
      const res = await fetch('/api/settings/save_val', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      if (res.ok) {
        setSettings(prev => {
          const exists = prev.find(s => s.key === key);
          if (exists) return prev.map(s => s.key === key ? { ...s, value } : s);
          return [...prev, { key, value, type: 'string', description: '' }];
        });
        showMsg('success', 'Setting saved');
      } else {
        showMsg('error', 'Save failed');
      }
    } catch (err) {
      showMsg('error', 'Network error');
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) {
      showMsg('error', 'Username and Password required');
      return;
    }
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('success', 'User created successfully');
        setIsUserModalOpen(false);
        setNewUser({ username: '', email: '', password: '', role: 'free' });
        fetchInitialData(); // Refresh list
      } else {
        showMsg('error', data.message || 'Creation failed');
      }
    } catch (err) {
      showMsg('error', 'Network error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">Admin <span className="text-indigo-500 italic">Portal</span></h1>
          <p className="text-slate-400 font-medium">Unified management hub for system and participants</p>
        </div>
        
        {/* Tab Switcher */}
        <div className="flex bg-slate-900/50 backdrop-blur-md p-1.5 rounded-2xl border border-white/5 self-start">
          {[
            { id: 'users', label: 'Users', icon: <Users size={16} /> },
            { id: 'system', label: 'System', icon: <SettingsIcon size={16} /> },
            { id: 'security', label: 'Security', icon: <ShieldCheck size={16} /> },
            { id: 'maintenance', label: 'Maintenance', icon: <Database size={16} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Persistence Message */}
      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 font-bold text-sm ${
              message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-8">
        {/* Content Area */}
        <div className="glass rounded-[2rem] p-8 md:p-10 min-h-[500px]">
          {loading ? (
             <div className="h-full flex flex-col items-center justify-center space-y-4">
                <RefreshCw className="text-indigo-500 animate-spin" size={48} />
                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Synchronizing Data...</p>
             </div>
          ) : (
            <>
              {activeTab === 'users' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-white tracking-tight">Identity Management</h2>
                      <p className="text-sm text-slate-400">Control system access and playlist permissions</p>
                    </div>
                    <button onClick={() => setIsUserModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                      <UserPlus size={16} /> New User
                    </button>
                  </div>

                  <div className="overflow-hidden border border-white/5 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <th className="px-6 py-4">User</th>
                          <th className="px-6 py-4">Role</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {usersList.map(u => (
                          <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-white border border-white/5">
                                  {u.username[0].toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-white">{u.username}</div>
                                  <div className="text-[10px] text-slate-500">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <select 
                                value={u.role}
                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                className={`bg-transparent border-none text-[9px] font-black uppercase tracking-wider cursor-pointer focus:ring-0 ${
                                  u.role === 'admin' ? 'text-indigo-400' : 
                                  u.role === 'vip' ? 'text-amber-400' : 'text-slate-400'
                                }`}
                                disabled={u.username === 'admin'}
                              >
                                <option value="admin" className="bg-slate-900 text-indigo-400">Admin</option>
                                <option value="vip" className="bg-slate-900 text-amber-400">VIP User</option>
                                <option value="free" className="bg-slate-900 text-slate-400">Free User</option>
                              </select>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-2 text-emerald-500">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[10px] font-bold uppercase">Active</span>
                              </div>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-2 text-slate-500 hover:text-white transition-colors" title="Edit Permissions"><Lock size={16} /></button>
                                <button className="p-2 text-slate-500 hover:text-rose-500 transition-colors" title="Terminate Identity"><Trash2 size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

               {activeTab === 'system' && (
                 <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">System Configuration</h2>
                        <p className="text-sm text-slate-400">Advanced tuning for diagnostics, scanning, and proxy performance</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Health & Diagnostics Group */}
                      <div className="space-y-6">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 ml-1">Health & Diagnostics</h3>
                        <div className="glass-light p-6 rounded-[2rem] border border-white/5 space-y-6">
                          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-3">
                              <Activity size={18} className="text-indigo-400" />
                              <div>
                                <p className="text-xs font-bold text-white">Diagnostics Master Switch</p>
                                <p className="text-[9px] text-slate-500">Enable/Disable all health services</p>
                              </div>
                            </div>
                            <button onClick={() => handleToggle('ENABLE_HEALTH_SYSTEM', getSettingValue('ENABLE_HEALTH_SYSTEM') as boolean)} className={`transition-all ${getSettingValue('ENABLE_HEALTH_SYSTEM') ? 'text-indigo-500' : 'text-slate-700'}`}>
                              {getSettingValue('ENABLE_HEALTH_SYSTEM') ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ShieldCheck size={14} className="text-emerald-400" />
                                <span className="text-[10px] font-bold text-slate-300">Passive Check</span>
                              </div>
                              <button onClick={() => handleToggle('ENABLE_PASSIVE_CHECK', getSettingValue('ENABLE_PASSIVE_CHECK') as boolean)} className={`transition-all ${getSettingValue('ENABLE_PASSIVE_CHECK') ? 'text-emerald-500' : 'text-slate-700'}`}>
                                {getSettingValue('ENABLE_PASSIVE_CHECK') ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                              </button>
                            </div>
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Code size={14} className="text-blue-400" />
                                <span className="text-[10px] font-bold text-slate-300">FFprobe Details</span>
                              </div>
                              <button onClick={() => handleToggle('ENABLE_FFPROBE_DETAIL', getSettingValue('ENABLE_FFPROBE_DETAIL') as boolean)} className={`transition-all ${getSettingValue('ENABLE_FFPROBE_DETAIL') ? 'text-blue-500' : 'text-slate-700'}`}>
                                {getSettingValue('ENABLE_FFPROBE_DETAIL') ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Heartbeat TTL (Minutes)</label>
                            <input 
                              type="number" 
                              defaultValue={getSettingValue('HEARTBEAT_TTL_MINUTES') as number || 5}
                              onBlur={(e) => handleSaveSetting('HEARTBEAT_TTL_MINUTES', e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50" 
                            />
                          </div>
                        </div>
                      </div>

                      {/* Automation & Scheduling Group */}
                      <div className="space-y-6">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 ml-1">Automation & Scheduling</h3>
                        <div className="glass-light p-6 rounded-[2rem] border border-white/5 space-y-6">
                          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-3">
                              <RefreshCw size={18} className="text-blue-400" />
                              <div>
                                <p className="text-xs font-bold text-white">Automated Background Scan</p>
                                <p className="text-[9px] text-slate-500">Periodic cluster health verification</p>
                              </div>
                            </div>
                            <button onClick={() => handleToggle('ENABLE_AUTO_SCAN', getSettingValue('ENABLE_AUTO_SCAN') as boolean)} className={`transition-all ${getSettingValue('ENABLE_AUTO_SCAN') ? 'text-blue-500' : 'text-slate-700'}`}>
                              {getSettingValue('ENABLE_AUTO_SCAN') ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Interval (Min)</label>
                              <input 
                                type="number" 
                                defaultValue={getSettingValue('AUTO_SCAN_INTERVAL') as number || 60}
                                onBlur={(e) => handleSaveSetting('AUTO_SCAN_INTERVAL', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50" 
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Scan Delay (Sec)</label>
                              <input 
                                type="number" 
                                defaultValue={getSettingValue('SCAN_DELAY_SECONDS') as number || 2}
                                onBlur={(e) => handleSaveSetting('SCAN_DELAY_SECONDS', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50" 
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Proxy Performance Group */}
                      <div className="space-y-6 lg:col-span-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">Proxy & Performance Tuning</h3>
                        <div className="glass-light p-8 rounded-[2rem] border border-white/5">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                            <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">TS Buffer (KB)</label>
                              <input 
                                type="number" 
                                defaultValue={getSettingValue('TS_BUFFER_SIZE') as number || 1024}
                                onBlur={(e) => handleSaveSetting('TS_BUFFER_SIZE', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50" 
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">HLS Cache (Sec)</label>
                              <input 
                                type="number" 
                                defaultValue={getSettingValue('HLS_CACHE_TTL') as number || 10}
                                onBlur={(e) => handleSaveSetting('HLS_CACHE_TTL', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50" 
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Max Segments</label>
                              <input 
                                type="number" 
                                defaultValue={getSettingValue('HLS_MAX_SEGMENTS') as number || 5}
                                onBlur={(e) => handleSaveSetting('HLS_MAX_SEGMENTS', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50" 
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Global User-Agent Override</label>
                            <input 
                              type="text" 
                              defaultValue={getSettingValue('CUSTOM_USER_AGENT') as string || ''}
                              onBlur={(e) => handleSaveSetting('CUSTOM_USER_AGENT', e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-mono" 
                              placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                 </div>
               )}

              {activeTab === 'security' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Security & SSO</h2>
                    <p className="text-sm text-slate-400">Configure authentication gateways and identity providers</p>
                  </div>

                  <div className="max-w-2xl space-y-6">
                    <div className="glass-light p-8 rounded-[2rem] border border-white/5">
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400">
                            <Globe size={24} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white">CentralAuth Integration</h3>
                            <p className="text-xs text-slate-500 font-medium italic">Ecosystem-wide identity synchronization</p>
                          </div>
                        </div>
                        <button 
                             onClick={() => handleToggle('USE_CENTRAL_AUTH', getSettingValue('USE_CENTRAL_AUTH') as boolean)}
                             className={`transition-all ${getSettingValue('USE_CENTRAL_AUTH') ? 'text-indigo-500' : 'text-slate-700'}`}
                        >
                           {getSettingValue('USE_CENTRAL_AUTH') ? <ToggleRight size={48} /> : <ToggleLeft size={48} />}
                        </button>
                      </div>

                      {/* Config Fields */}
                      <div className="space-y-6 mb-8 pt-6 border-t border-white/5">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">CentralAuth Server URL</label>
                          <input 
                            type="text" 
                            defaultValue={getSettingValue('CENTRAL_AUTH_URL') as string || ''}
                            onBlur={(e) => handleSaveSetting('CENTRAL_AUTH_URL', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-700" 
                            placeholder="https://auth.your-ecosystem.com"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Client ID</label>
                            <input 
                              type="text" 
                              defaultValue={getSettingValue('CENTRAL_AUTH_CLIENT_ID') as string || ''}
                              onBlur={(e) => handleSaveSetting('CENTRAL_AUTH_CLIENT_ID', e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all" 
                              placeholder="iptv-manager-v3"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Client Secret</label>
                            <input 
                              type="password" 
                              defaultValue={getSettingValue('CENTRAL_AUTH_CLIENT_SECRET') as string || ''}
                              onBlur={(e) => handleSaveSetting('CENTRAL_AUTH_CLIENT_SECRET', e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono" 
                              placeholder="••••••••••••••••"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3 text-amber-500">
                          <AlertCircle size={16} />
                          <p className="text-[10px] font-black uppercase tracking-widest">Admin Notice</p>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed font-semibold">
                          When CentralAuth is active, all users will be redirected to the ecosystem login gateway.
                          The <code className="text-indigo-400 bg-indigo-500/10 px-1 rounded">/admin</code> portal remains local as a failsafe.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'maintenance' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 text-center py-20">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 text-indigo-400 mb-8 border border-white/5 shadow-2xl">
                      <HardDrive size={40} />
                    </div>
                    <h2 className="text-3xl font-black text-white tracking-tighter mb-4">Core Lifecycle Controls</h2>
                    <p className="text-slate-400 max-w-md mx-auto mb-12">Export consistent snapshots or reconstruct the entire cluster database from backup archives.</p>
                    
                    <div className="flex flex-wrap items-center justify-center gap-4">
                      <button className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
                        Dump Backup (JSON)
                      </button>
                      <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20">
                        Restore Registry
                      </button>
                    </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* New User Modal */}
      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUserModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
               <h3 className="text-xl font-black text-white tracking-tight mb-6">Create <span className="text-indigo-400">User</span></h3>
               <div className="space-y-4">
                  <div>
                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Username</label>
                     <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full bg-slate-950/50 border border-white/5 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium mt-1" />
                  </div>
                  <div>
                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Email</label>
                     <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full bg-slate-950/50 border border-white/5 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium mt-1" />
                  </div>
                  <div>
                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Password</label>
                     <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full bg-slate-950/50 border border-white/5 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium mt-1" />
                  </div>
                  <div>
                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Role</label>
                     <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="w-full bg-slate-950/50 border border-white/5 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium mt-1 appearance-none cursor-pointer">
                        <option value="free">Free User</option>
                        <option value="vip">VIP User</option>
                        <option value="admin">Admin</option>
                     </select>
                  </div>
                  <div className="pt-4 flex gap-3">
                     <button onClick={() => setIsUserModalOpen(false)} className="flex-1 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/5 transition-all">Cancel</button>
                     <button onClick={handleCreateUser} className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20">Create</button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
