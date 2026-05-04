from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request
import jwt
from config import config
import datetime

# We will initialize this in app.py
socketio = SocketIO()

@socketio.on('connect')
def handle_connect(auth):
    # Depending on client, token might be in auth dict or query string
    # Try query string first
    token = request.args.get('token')
    
    if not token and auth and isinstance(auth, dict):
        token = auth.get('token')
        
    if not token:
        return False # Reject connection
        
    try:
        decoded = jwt.decode(token, config.JWT_SECRET, algorithms=['HS256'])
        user_id = int(decoded.get('sub'))
        role = decoded.get('role')
        
        # Save user to connection session if needed
        # Join a room specific to the user for direct messages
        join_room(str(user_id))
        
        if role == 'admin':
            join_room('admins')
            
        emit('connected', {'userId': user_id, 'role': role})
    except Exception:
        return False # Reject connection

@socketio.on('disconnect')
def handle_disconnect():
    # Rooms are left automatically upon disconnect in Socket.IO
    pass

@socketio.on('message')
def handle_message(msg):
    if msg == 'ping':
        emit('pong', {'at': int(datetime.datetime.utcnow().timestamp() * 1000)})
