import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, User, Key, ArrowRight, AlertTriangle, Info, Check } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: { username: string; role: string }) => void;
  forceLocal?: boolean;
}

export const LoginPage: React.FC<LoginProps> = ({ onLoginSuccess, forceLocal }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{ use_sso: boolean; sso_reachable: boolean; emergency_mode: boolean } | null>(null);

  useEffect(() => {
    // Fetch Auth Configuration (SSO status, etc.)
    const isEmergency = new URLSearchParams(window.location.search).get('emergency') === 'true' || forceLocal;
    fetch(`/api/auth/config?force_local=${isEmergency}`)
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        // Automatic SSO Redirect if enabled, reachable, and NOT in emergency mode
        if (data.use_sso && data.sso_reachable && !isEmergency) {
           window.location.href = '/auth-center/login';
        }
      })
      .catch(err => console.error("Failed to load auth config:", err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember })
      });

      const data = await response.json();
      if (response.ok) {
        onLoginSuccess(data.user);
      } else {
        setError(data.error || 'Identity verification failed');
      }
    } catch (err) {
      setError('Network error. Database unreachable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#1e293b,#020617)] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="glass p-10 md:p-12 rounded-[2.5rem] relative overflow-hidden shadow-2xl"
        >
          {/* Decorative Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 blur-[100px] pointer-events-none" />

          {/* Flash Messages / Errors */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-4 text-xs font-bold"
              >
                <AlertTriangle size={18} className="shrink-0" />
                {error}
              </motion.div>
            )}
            {config?.use_sso && !config.sso_reachable && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-4 text-xs font-bold"
              >
                <Info size={18} className="shrink-0" />
                SSO Unavailable. Local fallback active.
              </motion.div>
            )}
          </AnimatePresence>

          <header className="text-center mb-12 relative z-10">
            {config?.emergency_mode ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-500/20 border border-rose-500/30 rounded-full mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                </span>
                <span className="text-[10px] font-black text-rose-100 uppercase tracking-widest">Emergency Access</span>
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_0_30px_rgba(59,130,246,0.3)] mb-8">
                <Shield className="text-white" size={32} />
              </div>
            )}
            <h2 className="text-7xl font-black tracking-tighter uppercase bg-[linear-gradient(to_right,rgba(255,255,255,0.2)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-[size:4px_4px] [background-color:#4f46e5] bg-clip-text text-transparent mb-6 drop-shadow-2xl">IPTV</h2>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">Integrated Management Environment</p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Identity</label>
              <div className="relative group">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
                  <User size={18} />
                </span>
                <input 
                  type="text" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-14 pr-6 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all placeholder:text-slate-600" 
                  placeholder="Username" required 
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Security Key</label>
              <div className="relative group">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
                  <Key size={18} />
                </span>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-14 pr-6 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all placeholder:text-slate-600" 
                  placeholder="••••••••" required 
                />
              </div>
            </div>

            <div className="flex items-center justify-between pb-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div 
                  onClick={() => setRemember(!remember)}
                  className={`w-6 h-6 rounded-lg border-2 border-white/10 flex items-center justify-center transition-all ${remember ? 'bg-blue-600 border-blue-600' : 'bg-white/5'}`}
                >
                  {remember && <Check size={14} className="text-white" />}
                </div>
                <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-400 transition-colors">Persist Session</span>
              </label>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
            >
              {loading ? "Authenticating..." : (
                <>Initialize Workspace <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <footer className="text-center mt-12 pt-8 border-t border-white/5 relative z-10">
            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-2">Authenticated Management Environment</p>
            <div className="flex items-center justify-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-blue-500/60 tracking-widest uppercase">Ecosystem V3 Deployment</span>
            </div>
          </footer>
        </motion.div>
      </div>
    </div>
  );
};
