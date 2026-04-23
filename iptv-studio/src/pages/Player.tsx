import React, { useState } from 'react';
import { PlayerSidebar } from '../components/player/PlayerSidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { Tv } from 'lucide-react';
import { PlayerHeader } from '../components/player/PlayerHeader';
import { UnifiedPlayer } from '../components/player/UnifiedPlayer';
import { ChannelForm } from '../components/forms/ChannelForm';

export const Player: React.FC<{ user: { username: string, role: string } }> = ({ user }) => {
   const [activeChannel, setActiveChannel] = useState<any>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden z-[100] animate-in fade-in duration-700">
       {/* Global Header - Explicit Height & Z-Index */}
       <div className="shrink-0 z-[120]">
          <PlayerHeader user={user} />
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
                      initialMode="TRACKING"
                    />
                  </div>
                )}
              </AnimatePresence>
          </div>

           <PlayerSidebar 
            onSelectChannel={setActiveChannel} 
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
