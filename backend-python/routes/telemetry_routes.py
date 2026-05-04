from flask import Blueprint, request, jsonify
from database.db import get_db
from middlewares.auth import require_auth
from websocket.socket_hub import socketio

telemetry_bp = Blueprint('telemetry', __name__)

@telemetry_bp.route('/update', methods=['POST'])
@require_auth
def update_telemetry():
    data = request.json
    user_id = request.user['id']
    
    # Extract data
    speed = data.get('speed', 0)
    fuel = data.get('fuel', 0)
    location = data.get('location', 'Unknown')
    
    supabase = get_db()
    
    # 1. Update/Insert current status (UPSERT)
    try:
        supabase.table('truck_status').upsert({
            'user_id': user_id,
            'speed': speed,
            'fuel': fuel,
            'location': location
        })
        
        # 2. Add to history log (telemetry_events no schema)
        supabase.table('telemetry_events').insert({
            'user_id': user_id,
            'speed_kmh': speed,
            'raw_json': str(data)
        })
        
        # 3. Emit to admin
        socketio.emit('telemetry_update', {
            'user_id': user_id,
            'data': data
        })
        
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@telemetry_bp.route('/status/<int:user_id>', methods=['GET'])
@require_auth
def get_truck_status(user_id):
    supabase = get_db()
    res = supabase.table('truck_status').select('*').eq('user_id', user_id).execute()
    
    if res.count == 0:
        return jsonify({'error': 'Sem dados.'}), 404
        
    return jsonify(res.data[0])
