import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ToggleLeft, 
  ToggleRight, 
  Shield, 
  Activity, 
  Clock, 
  Save, 
  RefreshCcw,
  Cpu,
  Database,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface SystemSetting {
  key: string;
  value: string;
  description: string;
  type: 'string' | 'bool' | 'int';
}

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/all'); 
      const data = await response.json();
      setSettings(data);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleToggle = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue;
    try {
      const res = await fetch('/api/settings/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: newValue })
      });
      
      if (!res.ok) throw new Error('API Error');

      // Robust Update: Upsert into list
      setSettings(prev => {
        const exists = prev.find(s => s.key === key);
        if (exists) {
          return prev.map(s => s.key === key ? { ...s, value: newValue.toString() } : s);
        } else {
          return [...prev, { key, value: newValue.toString(), type: 'bool', description: '' }];
        }
      });

      showMsg('success', `${key} updated successfully`);
    } catch (err) {
      showMsg('error', `Failed to update ${key}`);
    }
  };

  const handleSaveInt = async (key: string, value: number) => {
    // Optimistic Update
    setSettings(prev => {
      const exists = prev.find(s => s.key === key);
      if (exists) {
        return prev.map(s => s.key === key ? { ...s, value: value.toString() } : s);
      } else {
        return [...prev, { key, value: value.toString(), type: 'int', description: '' }];
      }
    });
  };

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-indigo-500" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Syncing System Configuration...</p>
      </div>
    );
  }

  const getSettingValue = (key: string) => {
    const s = settings.find(x => x.key === key);
    if (!s) return null;
    if (s.type === 'bool') return s.value.toLowerCase() === 'true';
    if (s.type === 'int') return parseInt(s.value);
    return s.value;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter text-white uppercase italic flex items-center gap-4">
            System <span className="text-indigo-500">Core</span>
            <div className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] not-italic font-black text-indigo-400 tracking-widest translate-y-1">V3.0.4</div>
          </h2>
          <p className="text-slate-400 text-sm mt-2 uppercase tracking-widest font-bold opacity-60">Global Environment Parameters & Security Matrix</p>
        </div>

        <button 
          onClick={fetchSettings}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest"
        >
          <RefreshCcw size={14} />
          Reload Profile
        </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Diagnostics & CPU Control */}
        <div className="lg:col-span-12 space-y-8">
          <section className="glass-card rounded-[3rem] p-10 relative overflow-hidden border border-white/5 shadow-2xl">
             <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
             
             <div className="flex items-center gap-4 mb-10">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
                   <Activity size={24} />
                </div>
                <div>
                   <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Diagnostic Engine</h3>
                   <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Health verification & background scan tuning</p>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                {/* Master Signal Check */}
                <div className="flex items-start justify-between gap-6 p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                   <div className="space-y-2">
                      <h4 className="text-xs font-black text-white uppercase tracking-widest">Master Diagnostics</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-black uppercase opacity-60">Global switch for all health verification processes. If OFF, CPU usage drops to 0%.</p>
                   </div>
                   <button 
                    onClick={() => handleToggle('ENABLE_HEALTH_SYSTEM', getSettingValue('ENABLE_HEALTH_SYSTEM') as boolean)}
                    className={`shrink-0 transition-all ${getSettingValue('ENABLE_HEALTH_SYSTEM') ? 'text-indigo-500' : 'text-slate-700'}`}
                   >
                      {getSettingValue('ENABLE_HEALTH_SYSTEM') ? <ToggleRight size={44} /> : <ToggleLeft size={44} />}
                   </button>
                </div>

                {/* Passive Monitoring */}
                <div className="flex items-start justify-between gap-6 p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                   <div className="space-y-2">
                      <h4 className="text-xs font-black text-white uppercase tracking-widest">Passive Feedback</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-black uppercase opacity-60">Trigger a quick health check whenever a channel is accessed via link or player.</p>
                   </div>
                   <button 
                    onClick={() => handleToggle('ENABLE_PASSIVE_CHECK', getSettingValue('ENABLE_PASSIVE_CHECK') as boolean)}
                    className={`shrink-0 transition-all ${getSettingValue('ENABLE_PASSIVE_CHECK') ? 'text-indigo-500' : 'text-slate-700'}`}
                   >
                      {getSettingValue('ENABLE_PASSIVE_CHECK') ? <ToggleRight size={44} /> : <ToggleLeft size={44} />}
                   </button>
                </div>

                {/* FFprobe Deep Analysis */}
                <div className="flex items-start justify-between gap-6 p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                   <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Deep Stream Analysis</h4>
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[8px] font-black uppercase tracking-widest">High CPU</span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-black uppercase opacity-60">Use FFprobe to extract resolution, bitrate, and codecs. Disable to save VPS resources.</p>
                   </div>
                   <button 
                    onClick={() => handleToggle('ENABLE_FFPROBE_DETAIL', getSettingValue('ENABLE_FFPROBE_DETAIL') as boolean)}
                    className={`shrink-0 transition-all ${getSettingValue('ENABLE_FFPROBE_DETAIL') ? 'text-indigo-500' : 'text-slate-700'}`}
                   >
                      {getSettingValue('ENABLE_FFPROBE_DETAIL') ? <ToggleRight size={44} /> : <ToggleLeft size={44} />}
                   </button>
                </div>

                {/* TTL Slider */}
                <div className="space-y-4 p-6 rounded-[2rem] bg-indigo-500/[0.03] border border-indigo-500/10">
                    <div className="flex items-center justify-between">
                       <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                          <Clock size={14} className="text-indigo-400" />
                          Health TTL
                       </h4>
                       <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                          {getSettingValue('HEARTBEAT_TTL_MINUTES')}m INTERVAL
                       </span>
                    </div>
                    <input 
                      type="range" min="1" max="1440" step="1" 
                      value={getSettingValue('HEARTBEAT_TTL_MINUTES') as number} 
                      onChange={(e) => handleSaveInt('HEARTBEAT_TTL_MINUTES', parseInt(e.target.value))}
                      onMouseUp={async () => {
                        // Persist on release
                        const val = getSettingValue('HEARTBEAT_TTL_MINUTES');
                        await fetch('/api/settings/save_val', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ key: 'HEARTBEAT_TTL_MINUTES', value: val, type: 'int' })
                        });
                        showMsg('success', 'TTL Interval saved');
                      }}
                      className="w-full accent-indigo-500 bg-white/5 rounded-lg h-2"
                    />
                    <div className="flex justify-between text-[8px] font-black text-slate-600 uppercase tracking-widest">
                       <span>Frequence (1m)</span>
                       <span>24 Hours Max</span>
                    </div>
                </div>
             </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <div className="glass-card p-10 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
                <div className="flex items-center gap-4">
                  <Database size={20} className="text-emerald-400" />
                  <h4 className="text-sm font-black text-white uppercase italic">Data Lifecycle</h4>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-relaxed">
                      Manage database integrity, backups, and cleanup routines.
                   </p>
                </div>
                <div className="flex flex-col gap-2 pt-4">
                   <button 
                    onClick={() => window.location.href='/api/settings/backup/export'}
                    className="w-full py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black uppercase text-[10px] tracking-widest hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
                   >
                      <Save size={14} />
                      Export Signal Matrix
                   </button>
                </div>
             </div>

             <div className="glass-card p-10 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
                <div className="flex items-center gap-4">
                  <Cpu size={20} className="text-orange-400" />
                  <h4 className="text-sm font-black text-white uppercase italic">Compute Engine</h4>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-relaxed">
                      FFmpeg paths & hardware acceleration parameters.
                   </p>
                </div>
                <div className="pt-4 space-y-3">
                   <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-[9px] font-mono text-white/40 break-all">
                      {getSettingValue('FFPROBE_PATH') || 'System Default'}
                   </div>
                </div>
             </div>

             <div className="glass-card p-10 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
                <div className="flex items-center gap-4">
                  <Shield size={20} className="text-indigo-400" />
                  <h4 className="text-sm font-black text-white uppercase italic">Access Control</h4>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-relaxed">
                      API tokens, SSO authentication and security tokens.
                   </p>
                </div>
                <div className="pt-4">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                     <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Central SSO</span>
                     <div className={`w-2 h-2 rounded-full ${getSettingValue('USE_CENTRAL_AUTH') ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />
                  </div>
                </div>
             </div>
          </section>
        </div>
      </div>
    </div>
  );
};
