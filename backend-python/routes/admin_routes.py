from flask import Blueprint, jsonify, request
import bcrypt
import json
from database.db import get_db
from middlewares.auth import require_auth, require_admin
from routes.freight_routes import serialize_freight, FREIGHT_SELECT, broadcast_freight_update
from routes.auth_routes import public_user, log_activity, normalize_username, validate_username
from flask import current_app

admin_bp = Blueprint('admin', __name__)

@admin_bp.before_request
@require_auth
@require_admin
def before_request():
    pass

def broadcast_admins(event, data):
    try:
        socketio = current_app.extensions['socketio']
        socketio.emit(event, data, room='admins', namespace='/')
    except Exception:
        pass

def broadcast_to_user(user_id, event, data):
    try:
        socketio = current_app.extensions['socketio']
        socketio.emit(event, data, room=str(user_id), namespace='/')
    except Exception:
        pass

@admin_bp.route('/users', methods=['GET'])
def get_users():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users ORDER BY id DESC")
        users = cursor.fetchall()
        return jsonify({'users': [public_user(u) for u in users]})
    finally:
        cursor.close()
        conn.close()

@admin_bp.route('/users', methods=['POST'])
def create_user():
    data = request.json or {}
    name = data.get('name')
    username = data.get('username')
    email = data.get('email', f"{username}@ets2.local")
    password = data.get('password')
    role = data.get('role', 'user')
    company_name = data.get('companyName')
    
    if not name or not username or not password:
        return jsonify({'error': 'Preencha todos os campos obrigatórios.'}), 400
        
    normalized = normalize_username(username)
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id FROM users WHERE username = %s OR email = %s", (normalized, email))
        if cursor.fetchone():
            return jsonify({'error': 'Usuario ou email ja cadastrado.'}), 409
            
        company_id = None
        if company_name:
            company_name = company_name.strip()
            cursor.execute("INSERT INTO companies (name) VALUES (%s) ON CONFLICT (name) DO NOTHING", (company_name,))
            cursor.execute("SELECT id FROM companies WHERE name = %s", (company_name,))
            company_row = cursor.fetchone()
            if company_row:
                company_id = company_row['id']
                
        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
        
        cursor.execute("""
            INSERT INTO users (name, username, email, password_hash, role, company_id)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (name.strip(), normalized, email.strip(), hashed, role, company_id))
        
        user_id = cursor.fetchone()['id']
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        log_activity(conn, request.user['id'], user_id, "admin.user.created", f"Admin criou o usuario {user['username']}.")
        conn.commit()
        
        return jsonify({'user': public_user(user)}), 201
    finally:
        cursor.close()
        conn.close()

@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    data = request.json or {}
    name = data.get('name')
    role = data.get('role')
    balance = data.get('balance')
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'Usuario nao encontrado.'}), 404
            
        updates = []
        params = []
        
        if name is not None:
            updates.append("name = %s")
            params.append(name.strip())
        if role in ['admin', 'user']:
            updates.append("role = %s")
            params.append(role)
        if balance is not None:
            updates.append("balance = %s")
            params.append(int(balance))
            
        if not updates:
            return jsonify({'user': public_user(user)})
            
        params.append(user_id)
        query = f"UPDATE users SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
        
        cursor.execute(query, tuple(params))
        
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        updated_user = cursor.fetchone()
        
        log_activity(conn, request.user['id'], user_id, "admin.user.updated", f"Admin atualizou usuario {user['username']}.")
        conn.commit()
        
        return jsonify({'user': public_user(updated_user)})
    finally:
        cursor.close()
        conn.close()

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    if user_id == request.user['id']:
        return jsonify({'error': 'Nao pode deletar a si mesmo.'}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'Usuario nao encontrado.'}), 404
            
        cursor.execute("DELETE FROM freights WHERE user_id = %s", (user_id,))
        cursor.execute("DELETE FROM activity_logs WHERE actor_user_id = %s OR target_user_id = %s", (user_id, user_id))
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        
        log_activity(conn, request.user['id'], None, "admin.user.deleted", f"Admin deletou usuario {user['username']}.")
        conn.commit()
        
        return jsonify({'success': True})
    finally:
        cursor.close()
        conn.close()

@admin_bp.route('/users/<int:user_id>/truck-lock', methods=['POST'])
def toggle_truck_lock(user_id):
    data = request.json or {}
    locked = 1 if data.get('locked') else 0
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'Usuario nao encontrado.'}), 404
            
        cursor.execute("UPDATE users SET truck_locked = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (locked, user_id))
        
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        updated_user = cursor.fetchone()
        
        log_activity(conn, request.user['id'], user_id, "admin.user.truck_lock", f"Admin {'bloqueou' if locked else 'desbloqueou'} o caminhao de {user['username']}.")
        conn.commit()
        
        broadcast_to_user(user_id, "truck:lock", {'locked': bool(locked)})
        broadcast_admins("truck:lock", {'userId': user_id, 'locked': bool(locked)})
        
        return jsonify({'user': public_user(updated_user)})
    finally:
        cursor.close()
        conn.close()

@admin_bp.route('/freights', methods=['GET'])
def get_freights():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(f"{FREIGHT_SELECT} ORDER BY f.id DESC")
        rows = cursor.fetchall()
        return jsonify({'freights': [serialize_freight(row) for row in rows]})
    finally:
        cursor.close()
        conn.close()

@admin_bp.route('/freights', methods=['POST'])
def create_freight():
    data = request.json or {}
    origin = data.get('origin')
    destination = data.get('destination')
    cargo = data.get('cargo')
    value = data.get('value')
    target_user_id = data.get('userId')
    dest_lat = data.get('destinationLat')
    dest_lng = data.get('destinationLng')
    
    if not origin or not destination or not cargo or value is None or not target_user_id:
        return jsonify({'error': 'Origem, destino, carga, valor e usuario sao obrigatorios.'}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, company_id FROM users WHERE id = %s", (target_user_id,))
        target_user = cursor.fetchone()
        if not target_user:
            return jsonify({'error': 'Usuario nao encontrado.'}), 404
            
        d_lat = float(dest_lat) if dest_lat not in [None, ""] else None
        d_lng = float(dest_lng) if dest_lng not in [None, ""] else None
        
        cursor.execute("""
            INSERT INTO freights (origin, destination, cargo, value, user_id, company_id, destination_lat, destination_lng)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (origin.strip(), destination.strip(), cargo.strip(), float(value), int(target_user_id), target_user['company_id'], d_lat, d_lng))
        
        freight_id = cursor.fetchone()['id']
        
        cursor.execute(f"{FREIGHT_SELECT} WHERE f.id = %s", (freight_id,))
        freight = serialize_freight(cursor.fetchone())
        
        log_activity(conn, request.user['id'], target_user_id, "freight.created", f"Frete #{freight_id} criado para {freight['userUsername']}.")
        conn.commit()
        
        broadcast_to_user(target_user_id, "freight:new", freight)
        broadcast_admins("freight:new", freight)
        
        return jsonify({'freight': freight}), 201
    finally:
        cursor.close()
        conn.close()

@admin_bp.route('/logs', methods=['GET'])
def get_logs():
    limit = int(request.args.get('limit', 100))
    conn = get_db()
    cursor = conn.cursor()
    try:
        query = """
            SELECT l.*, a.username as actor_username, t.username as target_username
            FROM activity_logs l
            LEFT JOIN users a ON a.id = l.actor_user_id
            LEFT JOIN users t ON t.id = l.target_user_id
            ORDER BY l.id DESC LIMIT %s
        """
        cursor.execute(query, (limit,))
        rows = cursor.fetchall()
        
        logs = []
        for row in rows:
            logs.append({
                'id': row['id'],
                'actorUserId': row['actor_user_id'],
                'targetUserId': row['target_user_id'],
                'actorUsername': row['actor_username'],
                'targetUsername': row['target_username'],
                'freightId': row['freight_id'],
                'type': row['type'],
                'message': row['message'],
                'metadata': json.loads(row['metadata_json']) if row['metadata_json'] else None,
                'createdAt': row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else row['created_at']
            })
        return jsonify({'logs': logs})
    finally:
        cursor.close()
        conn.close()
