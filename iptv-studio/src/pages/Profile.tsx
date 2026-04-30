import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Mail, 
  Lock, 
  Key, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  Save,
  Shield,
  Fingerprint,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showApiToken, setShowApiToken] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      setUser(data);
      setProfileForm({ 
        full_name: data.full_name || '', 
        email: data.email || '' 
      });
    } catch (err) {
      console.error("Failed to load profile", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('success', 'Profile updated successfully');
        fetchProfile();
      } else {
        showMsg('error', data.message || 'Update failed');
      }
    } catch (err) {
      showMsg('error', 'Network error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showMsg('error', 'Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: passwordForm.old_password,
          new_password: passwordForm.new_password
        })
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('success', 'Password changed successfully');
        setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      } else {
        showMsg('error', data.message || 'Password change failed');
      }
    } catch (err) {
      showMsg('error', 'Network error');
    } finally {
      setSavingPassword(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showMsg('success', 'Copied to clipboard');
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="animate-spin text-indigo-500" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Loading Identity Data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 animate-in fade-in duration-700">
      <header className="mb-12">
        <h2 className="text-4xl font-black tracking-tighter text-white uppercase italic flex items-center gap-4">
          Account <span className="text-indigo-500">Settings</span>
        </h2>
        <p className="text-slate-400 text-sm mt-2 uppercase tracking-widest font-bold opacity-60">Manage your digital identity & secure credentials</p>
      </header>

      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed top-8 right-8 z-[200] px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 border backdrop-blur-2xl ${
              message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="text-xs font-black uppercase tracking-widest">{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: User Card & API Token */}
        <div className="lg:col-span-1 space-y-8">
           <section className="glass-card rounded-[3rem] p-8 border border-white/5 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="relative flex flex-col items-center text-center">
                 <div className="w-24 h-24 rounded-[2rem] bg-slate-800 border-4 border-indigo-500/20 flex items-center justify-center text-4xl font-black text-white shadow-2xl mb-6 ring-8 ring-white/[0.02]">
                    {user?.avatar_initial}
                 </div>
                 <h3 className="text-xl font-black text-white tracking-tight">{user?.full_name || user?.username}</h3>
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">{user?.role} ACCOUNT</p>
                 
                 <div className="mt-8 w-full pt-8 border-t border-white/5 space-y-4 text-left">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                       <span>Member Since</span>
                       <span className="text-white">2026-04-30</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                       <span>Security Status</span>
                       <span className="text-emerald-400 flex items-center gap-1.5">
                          <Shield size={10} /> Verified
                       </span>
                    </div>
                 </div>
              </div>
           </section>

           <section className="glass-card rounded-[3rem] p-8 border border-white/5 shadow-2xl bg-indigo-600/5 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-6">
                 <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Key size={18} />
                 </div>
                 <h4 className="text-sm font-black text-white uppercase italic">API Access</h4>
              </div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-relaxed mb-6">
                 Use this token to connect external players and smart TV applications.
              </p>
              
              <div className="relative group">
                 <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000" />
                 <div className="relative bg-slate-950 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
                    <Fingerprint size={20} className="text-indigo-500/40 shrink-0" />
                    <div className="flex-1 font-mono text-[11px] text-white/80 overflow-hidden truncate">
                       {showApiToken ? user?.api_token : '••••••••••••••••••••••••••••'}
                    </div>
                    <button 
                      onClick={() => setShowApiToken(!showApiToken)}
                      className="p-1.5 text-slate-500 hover:text-white"
                    >
                       {showApiToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                 </div>
              </div>
              
              <button 
                onClick={() => copyToClipboard(user?.api_token)}
                className="w-full mt-4 py-3 rounded-2xl bg-white/5 border border-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                 <Copy size={14} />
                 Copy API Key
              </button>
           </section>
        </div>

        {/* Right: Forms */}
        <div className="lg:col-span-2 space-y-8">
           
           {/* Profile Edit */}
           <section className="glass-card rounded-[3rem] p-10 border border-white/5 shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-4 mb-10">
                 <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                    <User size={24} />
                 </div>
                 <div>
                    <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Identity Profile</h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Manage your public information</p>
                 </div>
              </div>

              <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Full Name</label>
                    <div className="relative">
                       <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                       <input 
                         type="text"
                         value={profileForm.full_name}
                         onChange={e => setProfileForm({...profileForm, full_name: e.target.value})}
                         className="w-full bg-white/5 border border-white/5 rounded-2xl pl-12 pr-6 py-3.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-semibold"
                         placeholder="John Doe"
                       />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Email Address</label>
                    <div className="relative">
                       <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                       <input 
                         type="email"
                         value={profileForm.email}
                         onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                         className="w-full bg-white/5 border border-white/5 rounded-2xl pl-12 pr-6 py-3.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-semibold"
                         placeholder="john@example.com"
                       />
                    </div>
                 </div>
                 
                 <div className="md:col-span-2 pt-4">
                    <button 
                      type="submit"
                      disabled={savingProfile}
                      className="px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-600/20 flex items-center gap-3 disabled:opacity-50"
                    >
                       {savingProfile ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                       Synchronize Profile
                    </button>
                 </div>
              </form>
           </section>

           {/* Security / Password */}
           <section className="glass-card rounded-[3rem] p-10 border border-white/5 shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-4 mb-10">
                 <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400 border border-rose-500/20">
                    <Lock size={24} />
                 </div>
                 <div>
                    <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Security Gateway</h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Update your authentication credentials</p>
                 </div>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                       <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Current Password</label>
                       <input 
                         type="password"
                         value={passwordForm.old_password}
                         onChange={e => setPasswordForm({...passwordForm, old_password: e.target.value})}
                         className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-3.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rose-500/50 transition-all"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">New Password</label>
                       <input 
                         type="password"
                         value={passwordForm.new_password}
                         onChange={e => setPasswordForm({...passwordForm, new_password: e.target.value})}
                         className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-3.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rose-500/50 transition-all"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Confirm New</label>
                       <input 
                         type="password"
                         value={passwordForm.confirm_password}
                         onChange={e => setPasswordForm({...passwordForm, confirm_password: e.target.value})}
                         className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-3.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rose-500/50 transition-all"
                       />
                    </div>
                 </div>
                 
                 <div className="pt-4">
                    <button 
                      type="submit"
                      disabled={savingPassword}
                      className="px-8 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 disabled:opacity-50"
                    >
                       {savingPassword ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                       Update Security Key
                    </button>
                 </div>
              </form>
           </section>

        </div>
      </div>
    </div>
  );
};
