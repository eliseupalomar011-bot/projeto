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
    supabase.table('users').delete().eq('id', user_id).execute()
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
    res = supabase.table('companies').insert({'name': name}).execute()
    return jsonify(res.data[0]), 201

# --- LOGS & STATS ---

@admin_bp.route('/stats', methods=['GET'])
@require_auth
@require_admin
def get_stats():
    supabase = get_db()
    
    # Counts using Supabase
    users_count = supabase.table('users').select('id', count='exact').execute().count
    freights_count = supabase.table('freights').select('id', count='exact').execute().count
    active_freights = supabase.table('freights').select('id', count='exact').eq('status', 'active').execute().count
    
    return jsonify({
        'total_users': users_count,
        'total_freights': freights_count,
        'active_freights': active_freights
    })

@admin_bp.route('/telemetry/recent', methods=['GET'])
@require_auth
@require_admin
def get_recent_telemetry():
    supabase = get_db()
    # Join logic in Supabase is done via select('*, users(name)')
    res = supabase.table('telemetry_logs').select('*, users(name, username)').order('timestamp', desc=True).limit(50).execute()
    return jsonify(res.data)
