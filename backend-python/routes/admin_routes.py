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
    return jsonify(res.data)

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@require_auth
@require_admin
def delete_user(user_id):
    supabase = get_db()
    supabase.table('users').eq('id', user_id).delete()
    return jsonify({'message': 'Usuário removido.'})

# --- COMPANIES MANAGEMENT ---

@admin_bp.route('/companies', methods=['GET'])
@require_auth
def get_companies():
    supabase = get_db()
    res = supabase.table('companies').select('*').order('name').execute()
    return jsonify(res.data)

@admin_bp.route('/companies', methods=['POST'])
@require_auth
@require_admin
def add_company():
    data = request.json
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Nome é obrigatório.'}), 400
        
    supabase = get_db()
    res = supabase.table('companies').insert({'name': name})
    return jsonify(res.data[0] if res.data else {}), 201

# --- LOGS & STATS ---

@admin_bp.route('/stats', methods=['GET'])
@require_auth
@require_admin
def get_stats():
    supabase = get_db()
    
    # Simple counts via len() of the data
    users = supabase.table('users').select('id').execute()
    freights = supabase.table('freights').select('id').execute()
    active = supabase.table('freights').select('id').eq('status', 'active').execute()
    
    return jsonify({
        'total_users': users.count,
        'total_freights': freights.count,
        'active_freights': active.count
    })

@admin_bp.route('/telemetry/recent', methods=['GET'])
@require_auth
@require_admin
def get_recent_telemetry():
    supabase = get_db()
    # Note: Join simplificado para o motor REST customizado
    res = supabase.table('telemetry_logs').select('*').order('timestamp', desc=True).limit(50).execute()
    return jsonify(res.data)
