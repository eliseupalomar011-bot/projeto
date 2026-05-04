from app import app, socketio
from config import config

if __name__ == '__main__':
    print(f"ETS2 Freight backend (Python/Flask) running at http://{config.HOST}:{config.PORT}")
    print(f"WebSocket (SocketIO) polling enabled.")
    # Use socketio.run instead of app.run to ensure SocketIO hooks are active
    socketio.run(app, host=config.HOST, port=config.PORT, debug=True)
