import React from 'react';
import { motion } from 'framer-motion';
import { X, Activity } from 'lucide-react';
import { UnifiedPlayer } from '../player/UnifiedPlayer';

interface PreviewModalProps {
  channel: {
    id: number;
    name: string;
    stream_url: string;
    stream_type?: string;
    stream_format?: string;
    play_links?: {
      smart: string;
      direct: string;
      tracking: string;
      hls: string;
      ts: string;
    };
  } | null;
  onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ channel, onClose }) => {
  if (!channel) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-950/90 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-900 w-full max-w-4xl rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl flex flex-col relative"
      >
        {/* Header - Simplified as HUD handles internal info */}
        <div className="px-6 md:px-8 py-6 flex items-center justify-between bg-white/[0.02] border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400">
              <Activity size={20} />
            </div>
            <div>
              <h3 className="text-white font-black text-sm uppercase tracking-tight">{channel.name}</h3>
              <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-0.5">Real-time Stream Inspection</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-rose-400 transition-all border border-white/5 z-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Unified Player Core */}
        <div className="flex-grow">
          <UnifiedPlayer 
            channel={channel} 
            layout="compact" 
          />
        </div>
      </motion.div>
    </div>
  );
};
