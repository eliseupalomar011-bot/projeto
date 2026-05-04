from flask import Blueprint, request, jsonify
from database.db import get_db
from middlewares.auth import require_auth, require_admin

admin_bp = Blueprint('admin', __name__)

# --- USERS MANAGEMENT ---

@admin_bp.route('/users', methods=['GET'])
@require_auth
@require_admin
def get_users():
    supabase = get_db()
    res = supabase.table('users').select('*').order('created_at', desc=True).execute()
    # O painel espera um objeto com a chave "users"
    return jsonify({'users': res.data})

@admin_bp.route('/users/<int:user_id>/truck-lock', methods=['POST'])
@require_auth
@require_admin
def toggle_truck_lock(user_id):
    data = request.json
    locked = 1 if data.get('locked') else 0
    
    supabase = get_db()
    res = supabase.table('users').eq('id', user_id).update({'truck_locked': locked})
    
    # Log da atividade
    supabase.table('activity_logs').insert({
        'actor_user_id': request.user['id'],
        'target_user_id': user_id,
        'type': 'SECURITY',
        'message': f"Caminhão {'bloqueado' if locked else 'liberado'} pelo administrador."
    })
    
    return jsonify({'message': 'Status do caminhão atualizado.', 'locked': bool(locked)})

# --- FREIGHTS MANAGEMENT ---

@admin_bp.route('/freights', methods=['GET'])
@require_auth
@require_admin
def get_all_freights():
    supabase = get_db()
    # O painel espera o nome do motorista também
    res = supabase.table('freights').select('*').order('created_at', desc=True).execute()
    
    # Adicionando nomes dos usuários (como o motor REST é simples, fazemos um map se necessário)
    # Por agora, retornamos os dados crus. O ideal seria o join, mas vamos manter simples.
    return jsonify({'freights': res.data})

@admin_bp.route('/freights', methods=['POST'])
@require_auth
@require_admin
def create_freight():
    data = request.json
    user_id = data.get('userId') # O painel envia como userId
    origin = data.get('origin')
    destination = data.get('destination')
    cargo = data.get('cargo')
    value = data.get('value', 0)
    
    if not all([user_id, origin, destination, cargo]):
        return jsonify({'error': 'Dados do frete incompletos.'}), 400
        
    supabase = get_db()
    res = supabase.table('freights').insert({
        'user_id': user_id,
        'origin': origin,
        'destination': destination,
        'cargo': cargo,
        'value': value,
        'status': 'criado'
    })
    
    # Log
    supabase.table('activity_logs').insert({
        'actor_user_id': request.user['id'],
        'target_user_id': user_id,
        'type': 'FREIGHT',
        'message': f"Novo frete enviado: {origin} -> {destination}"
    })
    
    return jsonify(res.data[0] if res.data else {}), 201

@admin_bp.route('/freights/<int:id>/cancel', methods=['POST'])
@require_auth
@require_admin
def cancel_freight(id):
    supabase = get_db()
    res = supabase.table('freights').eq('id', id).update({'status': 'cancelado'})
    return jsonify({'message': 'Frete cancelado.'})

# --- LOGS ---

@admin_bp.route('/logs', methods=['GET'])
@require_auth
@require_admin
def get_logs():
    limit = request.args.get('limit', 50)
    supabase = get_db()
    res = supabase.table('activity_logs').select('*').order('created_at', desc=True).limit(int(limit)).execute()
    return jsonify({'logs': res.data})
