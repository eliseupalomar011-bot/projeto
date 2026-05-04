from flask import Blueprint, request, jsonify
from database.db import get_db
from middlewares.auth import require_auth, require_admin
from websocket.socket_hub import socketio

freight_bp = Blueprint('freights', __name__)

@freight_bp.route('/', methods=['GET'])
@require_auth
def get_freights():
    supabase = get_db()
    # If admin, see all. If user, see only theirs.
    query = supabase.table('freights').select('*, users(name)')
    
    if request.user['role'] != 'admin':
        query = query.eq('user_id', request.user['id'])
        
    res = query.order('created_at', desc=True).execute()
    return jsonify(res.data)

@freight_bp.route('/', methods=['POST'])
@require_auth
@require_admin
def create_freight():
    data = request.json
    user_id = data.get('user_id')
    origin = data.get('origin')
    destination = data.get('destination')
    cargo = data.get('cargo')
    weight = data.get('weight')
    value = data.get('value')
    
    if not all([user_id, origin, destination, cargo]):
        return jsonify({'error': 'Campos obrigatórios ausentes.'}), 400
        
    supabase = get_db()
    
    res = supabase.table('freights').insert({
        'user_id': user_id,
        'origin': origin,
        'destination': destination,
        'cargo': cargo,
        'weight': weight,
        'value': value,
        'status': 'pending'
    }).execute()
    
    new_freight = res.data[0]
    
    # Notify via Socket.IO
    socketio.emit('new_freight', new_freight, room=str(user_id))
    
    return jsonify(new_freight), 201

@freight_bp.route('/<int:freight_id>/status', methods=['PATCH'])
@require_auth
def update_status(freight_id):
    data = request.json
    status = data.get('status') # 'active', 'completed', 'cancelled'
    
    if status not in ['pending', 'active', 'completed', 'cancelled']:
        return jsonify({'error': 'Status inválido.'}), 400
        
    supabase = get_db()
    
    # Update
    res = supabase.table('freights').update({'status': status}).eq('id', freight_id).execute()
    
    if len(res.data) == 0:
        return jsonify({'error': 'Frete não encontrado.'}), 404
        
    return jsonify(res.data[0])
