from flask import Flask, jsonify
from flask_cors import CORS
import os
from config import config
from database.db import init_db, get_db
from websocket.socket_hub import socketio

# Import Blueprints
from routes.auth_routes import auth_bp, health_bp
from routes.freight_routes import freight_bp
from routes.admin_routes import admin_bp
from routes.telemetry_routes import telemetry_bp

def create_app():
    app = Flask(__name__)
    
    # Configure CORS
    CORS(app, resources={r"/*": {"origins": "*"}})
        
    # Register Blueprints
    app.register_blueprint(health_bp, url_prefix='/health')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(freight_bp, url_prefix='/api/freights')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(telemetry_bp, url_prefix='/api/telemetry')
    
    # Root route for API confirmation
    @app.route('/')
    def api_root():
        db_status = "offline"
        error_msg = None
        try:
            supabase = get_db()
            # Teste real: Tenta ler 1 ID da tabela users
            supabase.table('users').select('id').limit(1).execute()
            db_status = "online"
        except Exception as e:
            db_status = "offline"
            error_msg = str(e)
            
        return jsonify({
            'name': 'ETS2 Freight Cloud API',
            'version': '1.1.0',
            'api_status': 'online',
            'database_status': db_status,
            'db_error': error_msg
        })

    # Initialize DB (Garante o Admin)
    with app.app_context():
        init_db()

    # Initialize SocketIO
    socketio.init_app(app, cors_allowed_origins="*", async_mode='threading')

    return app

app = create_app()

if __name__ == '__main__':
    socketio.run(app, host=config.HOST, port=config.PORT, debug=True)
