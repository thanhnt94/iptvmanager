import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Lock, 
  Unlock, 
  Plus, 
  Tv, 
  Loader2, 
  ShieldAlert, 
  ArrowRight,
  Eye,
  KeyRound,
  Trash2
} from 'lucide-react';

interface Room {
  id: string;
  name: string;
  host_id: number;
  host_username: string;
  current_video_id: string | null;
  is_playing: boolean;
  current_time: number;
  allow_guest_control: boolean;
  is_public: boolean;
  has_password: boolean;
}

export const WatchTogether: React.FC = () => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<{ public_rooms: Room[]; my_rooms: Room[] }>({
    public_rooms: [],
    my_rooms: []
  });
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Create Room Form State
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [allowGuest, setAllowGuest] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password Entry State
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [entryPassword, setEntryPassword] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);

  const fetchRooms = () => {
    fetch('/api/watchtogether/rooms')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        setRooms(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching rooms:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/watchtogether/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName || undefined,
          is_public: isPublic,
          password: password || undefined,
          allow_guest_control: allowGuest
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowCreateModal(false);
        navigate(`/watch/${data.room_id}`);
      } else {
        setError(data.detail || 'Lỗi khi tạo phòng');
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = (room: Room) => {
    if (room.has_password) {
      setSelectedRoom(room);
      setEntryPassword('');
      setEntryError(null);
    } else {
      navigate(`/watch/${room.id}`);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;
    setEntryError(null);

    try {
      const res = await fetch(`/api/watchtogether/rooms/${selectedRoom.id}?pw=${encodeURIComponent(entryPassword)}`);
      if (res.ok) {
        setSelectedRoom(null);
        navigate(`/watch/${selectedRoom.id}?pw=${encodeURIComponent(entryPassword)}`);
      } else {
        setEntryError('Mật khẩu không chính xác');
      }
    } catch (err) {
      setEntryError('Lỗi xác thực mật khẩu');
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa phòng này không?")) return;
    try {
      const res = await fetch(`/api/watchtogether/rooms/${roomId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchRooms();
      } else {
        alert("Lỗi khi xóa phòng");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-indigo-500" size={40} />
        <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Loading Watch Rooms...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-white flex items-center gap-3">
            Watch <span className="text-indigo-500">Together</span>
            <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] uppercase font-bold text-indigo-400">Beta</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">Tạo phòng xem chung với bạn bè, đồng bộ IPTV Live Stream và Phim ảnh.</p>
        </div>
        <button
          onClick={() => {
            setRoomName('');
            setPassword('');
            setIsPublic(true);
            setAllowGuest(false);
            setError(null);
            setShowCreateModal(true);
          }}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider transition-all duration-300 shadow-lg shadow-indigo-600/20 hover:scale-[1.02]"
        >
          <Plus size={16} /> Tạo phòng mới
        </button>
      </header>

      {/* Lobby content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left/Middle: Rooms Lists */}
        <div className="lg:col-span-2 space-y-8">
          {/* My Rooms */}
          {rooms.my_rooms.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Phòng của tôi ({rooms.my_rooms.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rooms.my_rooms.map(room => (
                  <RoomCard key={room.id} room={room} onJoin={handleJoinRoom} isOwner={true} onDelete={handleDeleteRoom} />
                ))}
              </div>
            </div>
          )}

          {/* Public Rooms */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Phòng đang hoạt động ({rooms.public_rooms.length})</h3>
            {rooms.public_rooms.length === 0 ? (
              <div className="glass p-12 rounded-[2rem] text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                  <Users size={28} />
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm uppercase tracking-wider">Chưa có phòng nào</h4>
                  <p className="text-slate-500 text-xs mt-1">Hãy tạo một phòng xem chung và bắt đầu phát sóng ngay thôi!</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rooms.public_rooms.map(room => (
                  <RoomCard key={room.id} room={room} onJoin={handleJoinRoom} isOwner={false} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Explanations & Quick Guides */}
        <div className="glass p-8 rounded-[2rem] space-y-6 h-fit border border-white/5">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Cách hoạt động</h3>
          <div className="space-y-4 text-xs">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0 font-bold">1</div>
              <div>
                <h4 className="font-bold text-white uppercase tracking-wider">Tạo phòng xem</h4>
                <p className="text-slate-400 mt-1">Đặt tên phòng, thiết lập quyền điều khiển và mật khẩu (nếu cần).</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0 font-bold">2</div>
              <div>
                <h4 className="font-bold text-white uppercase tracking-wider">Chia sẻ liên kết</h4>
                <p className="text-slate-400 mt-1">Copy URL phòng gửi cho bạn bè để cùng tham gia phòng trực tuyến.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0 font-bold">3</div>
              <div>
                <h4 className="font-bold text-white uppercase tracking-wider">Đồng bộ phát sóng</h4>
                <p className="text-slate-400 mt-1">Khi Host chọn kênh, tạm dừng hoặc tua phim, mọi người xem khác sẽ cập nhật tức thì.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create Room */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 space-y-6"
            >
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Tạo phòng xem chung</h3>
                <p className="text-slate-400 text-xs mt-1">Thiết lập cấu hình phòng xem trực tiếp của bạn.</p>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-2 items-center">
                  <ShieldAlert size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleCreateRoom} className="space-y-4 text-xs font-semibold">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tên phòng</label>
                  <input
                    type="text"
                    required
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Ví dụ: Rạp Phim Của Tôi"
                    className="w-full bg-slate-950 border border-white/5 focus:border-indigo-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-xl border border-white/5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="rounded accent-indigo-600 w-4 h-4"
                    />
                    <span>Công khai sảnh</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={allowGuest}
                      onChange={(e) => setAllowGuest(e.target.checked)}
                      className="rounded accent-indigo-600 w-4 h-4"
                    />
                    <span>Khách được tua</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mật khẩu phòng (Tuỳ chọn)</label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Không nhập nếu muốn tự do tham gia"
                    className="w-full bg-slate-950 border border-white/5 focus:border-indigo-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold uppercase tracking-wider transition-colors text-center border border-white/5"
                  >
                    Huỷ
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl font-bold uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2"
                  >
                    {creating ? <Loader2 size={14} className="animate-spin" /> : 'Bắt đầu'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Room Password Entry */}
      <AnimatePresence>
        {selectedRoom && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRoom(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 space-y-6"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <KeyRound size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Yêu cầu mật khẩu</h3>
                  <p className="text-slate-400 text-xs">Phòng "{selectedRoom.name}" là phòng riêng tư.</p>
                </div>
              </div>

              {entryError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {entryError}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs font-semibold">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mật khẩu</label>
                  <input
                    type="password"
                    required
                    autoFocus
                    value={entryPassword}
                    onChange={(e) => setEntryPassword(e.target.value)}
                    placeholder="Nhập mật khẩu để truy cập..."
                    className="w-full bg-slate-950 border border-white/5 focus:border-indigo-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRoom(null)}
                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold uppercase tracking-wider transition-colors text-center"
                  >
                    Huỷ
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-wider transition-all"
                  >
                    Vào phòng
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RoomCard: React.FC<{ room: Room; onJoin: (r: Room) => void; isOwner: boolean; onDelete?: (id: string) => void }> = ({ room, onJoin, isOwner, onDelete }) => {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="glass-card p-6 rounded-3xl relative overflow-hidden group flex flex-col justify-between border border-white/5 hover:border-white/10"
    >
      <div className="absolute -right-4 -top-4 w-32 h-32 bg-indigo-500/5 blur-[50px] group-hover:bg-indigo-500/10 transition-all" />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Chủ phòng: {room.host_username}</span>
          {room.has_password ? (
            <span className="flex items-center gap-1 text-amber-400 text-[9px] font-black uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              <Lock size={10} /> Private
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <Unlock size={10} /> Open
            </span>
          )}
        </div>

        <div>
          <h4 className="text-base font-black text-white truncate">{room.name}</h4>
          {room.current_video_id ? (
            <div className="flex items-center gap-2 mt-2 text-[10px] text-indigo-400 font-bold truncate">
              <Tv size={12} className="shrink-0" />
              <span>Đang phát: {room.current_video_id.substring(0, 35)}{room.current_video_id.length > 35 && '...'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500 font-medium">
              <Eye size={12} className="shrink-0" />
              <span>Đang chờ chọn kênh...</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-slate-500 font-semibold">{isOwner ? 'Phòng của bạn' : 'Phòng công khai'}</span>
        <div className="flex items-center gap-3">
          {isOwner && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(room.id); }}
              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 transition-all"
              title="Xóa phòng"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={() => onJoin(room)}
            className="text-xs font-black text-indigo-400 flex items-center gap-1 hover:text-indigo-300 transition-colors uppercase tracking-widest"
          >
            Tham gia <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
