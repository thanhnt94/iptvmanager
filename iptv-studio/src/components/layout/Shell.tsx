import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Radio, 
  ListVideo, 
  Activity, 
  LogOut,
  PlayCircle,
  ShieldCheck,
  Calendar,
  Monitor,
  CloudDownload,
  Menu,
  X,
  Search
} from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface ShellProps {
  children: React.ReactNode;
  user: { username: string, role: string };
}

export const Shell: React.FC<ShellProps> = ({ children, user }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  const menuItems = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/' },
    { icon: <PlayCircle size={20} />, label: 'Live Player', path: '/player' },
    { icon: <Radio size={20} />, label: 'Channels', path: '/channels' },
    { icon: <ListVideo size={20} />, label: 'Playlists', path: '/playlists' },
    { icon: <Monitor size={20} />, label: 'Monitoring', path: '/streams' },
    { icon: <Calendar size={20} />, label: 'EPG Registry', path: '/epg' },
    { icon: <CloudDownload size={20} />, label: 'Ingestion', path: '/import' },
    { icon: <Activity size={20} />, label: 'Diagnostics', path: '/diagnostics' },
  ];

  if (user.role === 'admin' || user.role === 'vip') {
    menuItems.push(
      { icon: <Search size={20} />, label: 'Media Scanner', path: '/scanner' }
    );
  }

  if (user.role === 'admin') {
    menuItems.push(
      { icon: <ShieldCheck size={20} />, label: 'Admin Portal', path: '/admin' }
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row">
      {/* Mobile Top Bar */}
      <div className="lg:hidden h-16 bg-slate-900/50 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Radio className="text-white" size={18} />
          </div>
          <h1 className="text-lg font-black text-white tracking-tighter uppercase italic">IPTV<span className="text-indigo-500">Manager</span></h1>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 text-slate-400 hover:text-white transition-colors"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Backdrop for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar / Drawer */}
      <aside className={`
        fixed inset-y-0 left-0 z-[60] w-72 bg-slate-900 border-r border-white/5 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 lg:w-64 lg:bg-slate-900/50 lg:backdrop-blur-xl
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-8 flex items-center justify-between">
           <div className="flex items-center gap-3 px-2 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
               <Radio className="text-white" size={24} />
            </div>
            <div>
               <h1 className="text-xl font-black text-white tracking-tighter uppercase italic leading-none">IPTV<span className="text-indigo-500">Manager</span></h1>
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mt-1">Advanced Control</p>
            </div>
          </div>
           <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-500 hover:text-white"
           >
             <X size={24} />
           </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {menuItems.map(item => (
            <NavLink 
              key={item.path} 
              to={item.path}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                isActive ? 'bg-indigo-500/10 text-indigo-400 font-bold' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="text-sm font-semibold tracking-wide">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-6 border-t border-white/5">
           <div className="flex items-center gap-3 px-2 py-3 text-slate-400">
             <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-black uppercase border border-white/5">
               {user.username[0]}
             </div>
             <div className="flex-1 overflow-hidden">
                <p className="text-sm font-black text-white truncate leading-none mb-1">{user.username}</p>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{user.role}</p>
             </div>
             <button onClick={() => window.location.href = '/logout'} className="p-2.5 hover:bg-white/5 rounded-xl hover:text-rose-400 transition-colors">
               <LogOut size={18} />
             </button>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="p-4 md:p-8 lg:p-10 w-full max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};
