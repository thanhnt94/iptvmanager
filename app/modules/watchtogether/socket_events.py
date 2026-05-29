import logging
import json
import socketio
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.core.database import SessionFactory
from app.modules.auth.models import User
from app.modules.watchtogether.models import WTRoom, WTChatMessage, WTVideoHistory, WTMembership

logger = logging.getLogger('iptv')

# Create Async Socket.IO Server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# In-memory store for room presence
ROOM_PRESENCE = {}
# In-memory store for last known playback state per room (avoids extra DB writes)
# { room_id: { 'time': float, 'is_playing': bool, 'video_id': str, 'updated_at': datetime } }
ROOM_PLAYBACK_STATE = {}

class DBSession:
    def __enter__(self) -> Session:
        self.db = SessionFactory()
        return self.db
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.db.close()

async def broadcast_presence(room_id):
    users = ROOM_PRESENCE.get(room_id, {})
    total = len(users)
    members = sum(1 for u in users.values() if u.get('is_member'))
    guests = total - members
    await sio.emit('presence_update', {'total': total, 'members': members, 'guests': guests}, room=room_id, namespace='/watchtogether')

@sio.on('connect', namespace='/watchtogether')
async def on_connect(sid, environ):
    logger.info(f"SocketConnected: {sid}")

@sio.on('disconnect', namespace='/watchtogether')
async def on_disconnect(sid):
    logger.info(f"SocketDisconnected: {sid}")
    target_room = None
    was_host = False
    for room_id, users in list(ROOM_PRESENCE.items()):
        if sid in users:
            was_host = users[sid].get('is_host', False)
            del users[sid]
            target_room = room_id
            break
    if target_room:
        # If host disconnected, flush last known playback state to DB
        if was_host and target_room in ROOM_PLAYBACK_STATE:
            state = ROOM_PLAYBACK_STATE[target_room]
            with DBSession() as db:
                room = db.query(WTRoom).filter_by(id=target_room).first()
                if room:
                    room.current_time = int(state.get('time', 0))
                    room.is_playing = state.get('is_playing', False)
                    room.last_updated = datetime.now(timezone.utc)
                    try:
                        db.commit()
                        logger.info(f"Host disconnected from {target_room}: saved time={room.current_time}")
                    except Exception as e:
                        db.rollback()
                        logger.error(f"Error saving host disconnect state: {e}")
        await broadcast_presence(target_room)

@sio.on('join', namespace='/watchtogether')
async def on_join(sid, data):
    room_id = data.get('room_id')
    username = data.get('username')
    user_id = data.get('user_id')
    
    if not room_id or not username:
        return
        
    await sio.enter_room(sid, room_id, namespace='/watchtogether')
    await sio.emit('system_message', {'msg': f'{username} đã tham gia phòng.'}, room=room_id, namespace='/watchtogether')
    await sio.emit('request_sync_from_host', {}, room=room_id, skip_sid=sid, namespace='/watchtogether')
    
    with DBSession() as db:
        try:
            chat_history = db.query(WTChatMessage).filter_by(room_id=room_id).order_by(WTChatMessage.created_at.desc()).limit(50).all()
            chat_data = [{
                'id': msg.id,
                'username': msg.username, 
                'message': msg.message, 
                'video_id': msg.video_id, 
                'timestamp': msg.timestamp,
                'reactions': msg.reactions or '{}',
                'created_at': msg.created_at.isoformat() + 'Z' if msg.created_at else None
            } for msg in reversed(chat_history)]
            await sio.emit('chat_history', chat_data, to=sid, namespace='/watchtogether')
            
            video_history = db.query(WTVideoHistory).filter_by(room_id=room_id).order_by(WTVideoHistory.added_at.desc()).limit(10).all()
            video_data = [{'video_id': v.video_id, 'added_at': v.added_at.strftime('%H:%M')} for v in video_history]
            await sio.emit('video_history', video_data, to=sid, namespace='/watchtogether')
        except Exception as e:
            logger.error(f"Error loading room history: {e}")
        
        # Track membership if authenticated
        if user_id:
            existing = db.query(WTMembership).filter_by(user_id=user_id, room_id=room_id).first()
            if not existing:
                try:
                    mem = WTMembership(user_id=user_id, room_id=room_id)
                    db.add(mem)
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.error(f"Error saving membership: {e}")

    # Track online presence
    if room_id not in ROOM_PRESENCE:
        ROOM_PRESENCE[room_id] = {}
    
    # Check if this user is the host
    is_host_user = False
    if user_id:
        with DBSession() as db:
            room = db.query(WTRoom).filter_by(id=room_id).first()
            if room and room.host_id == user_id:
                is_host_user = True
    
    ROOM_PRESENCE[room_id][sid] = {
        'username': username,
        'is_member': user_id is not None,
        'is_host': is_host_user,
        'user_id': user_id
    }
    await broadcast_presence(room_id)

@sio.on('watch_heartbeat', namespace='/watchtogether')
async def on_watch_heartbeat(sid, data):
    # Optional watch time stats
    pass

@sio.on('change_video', namespace='/watchtogether')
async def on_change_video(sid, data):
    room_id = data.get('room_id')
    new_video_id = data.get('video_id')
    start_time = data.get('start_time', 0)
    is_host = data.get('is_host', False)
    
    if not room_id or not new_video_id:
        return
        
    with DBSession() as db:
        room = db.query(WTRoom).filter_by(id=room_id).first()
        if room and (is_host or room.allow_guest_control):
            room.current_video_id = new_video_id
            room.current_time = start_time
            room.is_playing = True
            
            hist = WTVideoHistory(room_id=room_id, video_id=new_video_id)
            db.add(hist)
            
            try:
                db.commit()
                await sio.emit('video_changed', {'video_id': new_video_id, 'start_time': start_time}, room=room_id, namespace='/watchtogether')
                await sio.emit('system_message', {'msg': 'Danh sách đã chuyển sang Video mới!'}, room=room_id, namespace='/watchtogether')
            except Exception as e:
                db.rollback()
                logger.error(f"Error changing video: {e}")

@sio.on('sync_state', namespace='/watchtogether')
async def on_sync_state(sid, data):
    room_id = data.get('room_id')
    state = data.get('state') 
    time = data.get('time')
    video_id = data.get('video_id')
    is_host = data.get('is_host', False)
    
    if not room_id:
        return

    with DBSession() as db:
        room = db.query(WTRoom).filter_by(id=room_id).first()
        if not room:
            return
        
        can_control = is_host or room.allow_guest_control
        
        if can_control:
            # Update in-memory playback state (fast, no DB write)
            ROOM_PLAYBACK_STATE[room_id] = {
                'time': float(time) if time is not None else 0,
                'is_playing': (state == 'playing') if state else True,
                'video_id': video_id,
                'updated_at': datetime.now(timezone.utc)
            }
            
            # Write to DB less frequently — only on sync_state (every 15s from frontend)
            if video_id: 
                room.current_video_id = video_id
            if state: 
                room.is_playing = (state == 'playing')
            if time is not None: 
                room.current_time = int(float(time))
            room.last_updated = datetime.now(timezone.utc)
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error syncing room state db: {e}")
                
            await sio.emit('receive_state', data, room=room_id, skip_sid=sid, namespace='/watchtogether')

@sio.on('host_seek', namespace='/watchtogether')
async def on_host_seek(sid, data):
    """Instant seek broadcast — no DB write for low-latency response."""
    room_id = data.get('room_id')
    time = data.get('time')
    is_host = data.get('is_host', False)
    
    if not room_id or time is None:
        return

    with DBSession() as db:
        room = db.query(WTRoom).filter_by(id=room_id).first()
        if not room:
            return
        can_control = is_host or room.allow_guest_control
        if can_control:
            await sio.emit('receive_seek', {'time': time}, room=room_id, skip_sid=sid, namespace='/watchtogether')

@sio.on('chat_message', namespace='/watchtogether')
async def on_chat_message(sid, data):
    room_id = data.get('room_id')
    username = data.get('username', 'Khách')
    message = data.get('message', '')
    video_id = data.get('video_id')
    timestamp = data.get('timestamp')
    if room_id and message:
        with DBSession() as db:
            try:
                msg = WTChatMessage(room_id=room_id, username=username, message=message, video_id=video_id, timestamp=timestamp)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                
                await sio.emit('chat_message', {
                    'id': msg.id,
                    'username': username, 
                    'message': message,
                    'video_id': video_id,
                    'timestamp': timestamp,
                    'reactions': '{}',
                    'created_at': msg.created_at.isoformat() + 'Z' if msg.created_at else None
                }, room=room_id, namespace='/watchtogether')
            except Exception as e:
                db.rollback()
                logger.error(f"Error saving chat: {e}")

@sio.on('add_reaction', namespace='/watchtogether')
async def on_add_reaction(sid, data):
    room_id = data.get('room_id')
    message_id = data.get('message_id')
    emoji = data.get('emoji')
    username = data.get('username')
    
    if not all([room_id, message_id, emoji, username]):
        return
        
    with DBSession() as db:
        msg = db.query(WTChatMessage).filter_by(id=message_id, room_id=room_id).first()
        if msg:
            try:
                reactions = json.loads(msg.reactions) if msg.reactions else {}
            except Exception:
                reactions = {}
                
            if emoji not in reactions:
                reactions[emoji] = []
                
            if username in reactions[emoji]:
                reactions[emoji].remove(username)
                if not reactions[emoji]:
                    del reactions[emoji]
            else:
                for e, users in list(reactions.items()):
                    if username in users:
                        users.remove(username)
                reactions = {k: v for k, v in reactions.items() if v}
                
                if emoji not in reactions:
                    reactions[emoji] = []
                reactions[emoji].append(username)
                
            new_rx = json.dumps(reactions)
            msg.reactions = new_rx
            try:
                db.commit()
                await sio.emit('reaction_updated', {'message_id': message_id, 'reactions': new_rx}, room=room_id, namespace='/watchtogether')
            except Exception as e:
                db.rollback()
                logger.error(f"Error updating reactions: {e}")
