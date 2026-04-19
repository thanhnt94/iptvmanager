import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  Home, 
  Settings, 
  Radio,
  User
} from 'lucide-react';

interface PlayerHeaderProps {
  user: { username: string, role: string };
}

export const PlayerHeader: React.FC<PlayerHeaderProps> = ({ user }) => {
  const navigate = useNavigate();

  return (
    <header className="h-14 lg:h-16 bg-slate-950/80 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-4 lg:px-8 z-[120] shrink-0">
      <div className="flex items-center gap-3 lg:gap-6">
        {/* Back Button */}
        <button 
          onClick={() => navigate('/')}
          className="group flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all"
        >
          <ChevronLeft size={18} className="text-slate-400 group-hover:text-white transition-colors" />
          <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">Exit Player</span>
        </button>

        <div className="h-6 w-px bg-white/5 hidden md:block" />

        {/* Breadcrumbs */}
        <div className="hidden md:flex items-center gap-2">
           <Home size={14} className="text-indigo-500" />
           <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Studio</span>
           <span className="text-[10px] font-black uppercase tracking-widest text-white/10">/</span>
           <span className="text-[10px] font-black uppercase tracking-widest text-white">Live Center</span>
        </div>
      </div>

      {/* Center Logo */}
      <div className="flex items-center gap-2 lg:gap-3 absolute left-1/2 -translate-x-1/2">
         <div className="w-7 h-7 lg:w-9 lg:h-9 bg-indigo-600 rounded-lg lg:rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Radio className="text-white" size={window.innerWidth < 1024 ? 14 : 20} />
         </div>
         <h1 className="text-sm lg:text-lg font-black text-white tracking-tighter uppercase italic">IPTV<span className="text-indigo-500">Studio</span></h1>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 lg:gap-4">
         <div className="hidden sm:flex flex-col items-end mr-2">
            <p className="text-[10px] font-black text-white leading-none mb-1">{user.username}</p>
            <p className="text-[8px] font-black uppercase tracking-widest text-indigo-500/60 uppercase">{user.role}</p>
         </div>
         <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-indigo-400">
            <User size={window.innerWidth < 1024 ? 16 : 20} />
         </div>
         <button className="p-2 text-slate-500 hover:text-white transition-colors hidden lg:block">
            <Settings size={20} />
         </button>
      </div>
    </header>
  );
};
