import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayerSidebar } from '../components/player/PlayerSidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { Tv, Share2, Check } from 'lucide-react';
import { PlayerHeader } from '../components/player/PlayerHeader';
import { UnifiedPlayer } from '../components/player/UnifiedPlayer';
import { ChannelForm } from '../components/forms/ChannelForm';

export const Player: React.FC<{ user: { username: string, role: string } }> = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (id && (!activeChannel || activeChannel.id !== parseInt(id))) {
      fetch(`/api/channels/${id}`)
        .then(res => {
           if (res.ok) return res.json();
           throw new Error('Failed to load channel');
        })
        .then(data => {
           setActiveChannel(data);
        })
        .catch(err => console.error("Deeplink error:", err));
    }
  }, [id]);

  const handleSelectChannel = (ch: any) => {
    setActiveChannel(ch);
    if (ch) {
      navigate(`/player/${ch.id}`, { replace: true });
    } else {
      navigate('/player', { replace: true });
    }
  };

  const copyShareLink = () => {
    if (!activeChannel) return;
    const url = `${window.location.origin}/player/${activeChannel.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden z-[100] animate-in fade-in duration-700">
       {/* Global Header - Explicit Height & Z-Index */}
       <div className="shrink-0 z-[120] relative">
          <PlayerHeader user={user} />
          
          {/* Active Channel Share Button Overlay */}
          <AnimatePresence>
            {activeChannel && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute right-40 top-3 lg:top-4 z-[130] hidden md:block"
              >
                <button 
                  onClick={copyShareLink}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all ${copied ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20'}`}
                >
                  {copied ? <Check size={14} /> : <Share2 size={14} />}
                  <span className="text-[10px] font-black uppercase tracking-widest">{copied ? 'Copied' : 'Share Link'}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
       </div>

       <div className="flex-1 relative flex flex-col lg:flex-row overflow-hidden bg-black">
          {/* Viewport - order-1 on mobile (Top), order-2 on desktop (Right) */}
          <div className="w-full lg:flex-1 aspect-video lg:aspect-auto relative flex flex-col items-center justify-center player-container overflow-hidden shrink-0 order-1 lg:order-2">
              <AnimatePresence mode="wait">
                {!activeChannel ? (
                  <motion.div 
                    key="idle"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="text-center space-y-6"
                  >
                     <div className="w-24 h-24 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 mx-auto shadow-2xl">
                        <Tv size={48} />
                     </div>
                     <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Signal Offline</h2>
                        <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Select a stream to establish connection</p>
                     </div>
                  </motion.div>
                ) : (
                  <div className="w-full h-full relative">
                    <UnifiedPlayer 
                      key={activeChannel.id}
                      channel={activeChannel}
                      initialMode="original"
                    />
                  </div>
                )}
              </AnimatePresence>
          </div>

           <PlayerSidebar 
            onSelectChannel={handleSelectChannel} 
            activeChannelId={activeChannel?.id} 
            onEditChannel={(id) => {
                setEditingId(id);
                setIsEditOpen(true);
            }}
            className="order-2 lg:order-1 shrink-0"
          />
       </div>

       <AnimatePresence>
          {isEditOpen && editingId && (
            <ChannelForm 
              channelId={editingId} 
              onClose={() => setIsEditOpen(false)} 
              onSuccess={() => {
                setIsEditOpen(false);
              }} 
            />
          )}
       </AnimatePresence>
    </div>
  );
};
