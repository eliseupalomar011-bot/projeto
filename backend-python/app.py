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
    
    # Error Handler
    @app.errorhandler(Exception)
    def handle_exception(e):
        print(f"Error: {e}")
        status_code = 500
        message = "Erro interno do servidor."
        
        if hasattr(e, 'code'):
            status_code = e.code
            
        return jsonify({
            'error': {
                'message': str(e) if status_code < 500 else message,
                'status': status_code
            }
        }), status_code

    # Root route for API confirmation
    @app.route('/')
    def api_root():
        db_status = "offline"
        try:
            conn = get_db()
            conn.close()
            db_status = "online"
        except:
            db_status = "offline"
            
        return jsonify({
            'name': 'ETS2 Freight Cloud API',
            'version': '1.1.0',
            'api_status': 'online',
            'database_status': db_status
        })

    # Initialize DB schema
    with app.app_context():
        try:
            init_db()
        except Exception as db_err:
            print(f"[DB ERROR] Erro ao inicializar Supabase: {db_err}")

    # Initialize SocketIO
    socketio.init_app(app, cors_allowed_origins="*", async_mode='threading')

    return app

app = create_app()

if __name__ == '__main__':
    socketio.run(app, host=config.HOST, port=config.PORT, debug=True)
