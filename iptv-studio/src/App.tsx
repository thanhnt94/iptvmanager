import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { LoginPage } from './pages/auth/Login';
import { Dashboard } from './pages/Dashboard';
import { Playlists } from './pages/Playlists';
import { Channels } from './pages/Channels';
import { Streams } from './pages/Streams';
import { EPG } from './pages/EPG';
import { Player } from './pages/Player';
import { Import } from './pages/Import';
import { Diagnostics } from './pages/Diagnostics';

const App: React.FC = () => {
  const [user, setUser] = useState<{username: string, role: string} | null | undefined>(undefined);

  const fetchUser = () => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) throw new Error('Not logged in');
        return res.json();
      })
      .then(data => {
        if (!data.error) setUser(data);
        else setUser(null);
      })
      .catch(() => {
        setUser(null);
      });
  };

  useEffect(() => {
    fetchUser();
  }, []);

  if (user === undefined) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500 animate-pulse text-xs font-black uppercase tracking-widest">Identifying Session...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" replace /> : <LoginPage onLoginSuccess={(u) => setUser(u)} />
        } />
        
        {/* Protected Routes */}
        <Route path="*" element={
          user ? (
             <Shell user={user}>
               <Routes>
                 <Route path="/" element={<Dashboard />} />
                 <Route path="/playlists" element={<Playlists />} />
                 <Route path="/channels" element={<Channels />} />
                 <Route path="/streams" element={<Streams />} />
                 <Route path="/epg" element={<EPG />} />
                 <Route path="/player" element={<Player user={user} />} />
                 <Route path="/import" element={<Import />} />
                 <Route path="/diagnostics" element={<Diagnostics />} />
                 
                 <Route path="*" element={<Navigate to="/" replace />} />
               </Routes>
             </Shell>
          ) : (
            <Navigate to="/login" replace />
          )
        } />
      </Routes>
    </Router>
  );
};

export default App;
