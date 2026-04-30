import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/auth/Login';
import { Shell } from './components/layout/Shell';
import { Dashboard } from './pages/Dashboard';
import { Playlists } from './pages/Playlists';
import { Channels } from './pages/Channels';
import { Streams } from './pages/Streams';
import { EPG } from './pages/EPG';
import { Player } from './pages/Player';
import { Import } from './pages/Import';
import { Diagnostics } from './pages/Diagnostics';
import { AdminPortal } from './pages/AdminPortal';
import { MediaScanner } from './pages/MediaScanner';
import { GroupManager } from './pages/GroupManager';
import { PlaylistEditor } from './pages/PlaylistEditor';
import { ProfilePage } from './pages/Profile';

const App: React.FC = () => {
  const [user, setUser] = useState<{username: string, role: string} | null | undefined>(undefined);

  const fetchUser = () => {
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Unauthenticated');
      })
      .then(u => setUser(u))
      .catch(() => setUser(null));
  };

  const handleLoginSuccess = (u: { username: string; role: string }) => {
    setUser(u);
    // Hard refresh if exiting admin portal back to home 
    // to clear any local-auth specific session flags if needed.
    if (window.location.pathname.startsWith('/admin')) {
      window.location.href = '/';
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  if (user === undefined) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500 animate-pulse text-xs font-black uppercase tracking-widest">Identifying Session...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" replace /> : <LoginPage onLoginSuccess={handleLoginSuccess} forceLocal={window.location.pathname.startsWith('/admin')} />
        } />
        
        {/* Protected Routes */}
        <Route path="*" element={
          user ? (
             <Shell user={user}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/playlists" element={<Playlists />} />
                  <Route path="/playlists/:id" element={<PlaylistEditor />} />
                  <Route path="/channels" element={<Channels />} />
                  <Route path="/streams" element={<Streams />} />
                  <Route path="/epg" element={<EPG />} />
                  <Route path="/player" element={<Player user={user} />} />
                  <Route path="/import" element={<Import />} />
                  <Route path="/diagnostics" element={<Diagnostics />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  
                  <Route 
                    path="/scanner" 
                    element={(user.role === 'admin' || user.role === 'vip') ? <MediaScanner /> : <Navigate to="/" replace />} 
                  />

                  <Route 
                    path="/groups" 
                    element={user.role === 'admin' ? <GroupManager /> : <Navigate to="/" replace />} 
                  />
                  
                  {/* Admin Only Routes */}
                  <Route 
                    path="/settings" 
                    element={user.role === 'admin' ? <AdminPortal /> : <Navigate to="/" replace />} 
                  />
                  <Route 
                    path="/admin" 
                    element={user.role === 'admin' ? <AdminPortal /> : <Navigate to="/" replace />} 
                  />
                  
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Shell>
          ) : (
            // Failsafe Local Login for /admin
            window.location.pathname.startsWith('/admin')
              ? <LoginPage onLoginSuccess={handleLoginSuccess} forceLocal={true} />
              : <Navigate to="/login" replace />
          )
        } />
      </Routes>
    </Router>
  );
};

export default App;
