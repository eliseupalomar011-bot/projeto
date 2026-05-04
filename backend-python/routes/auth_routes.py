from flask import Blueprint, jsonify, request
import datetime
import jwt
import bcrypt
import re
from config import config
from database.db import get_db
from middlewares.auth import require_auth

auth_bp = Blueprint('auth', __name__)
health_bp = Blueprint('health', __name__)

@health_bp.route('/', methods=['GET'])
def health_check():
    return jsonify({
        'ok': True,
        'service': 'ets2-freight-backend-python',
        'at': datetime.datetime.utcnow().isoformat()
    })

def normalize_username(value):
    return str(value or "").strip().lower()

def validate_username(username):
    if not re.match(r'^[a-z0-9._-]{3,32}$', username):
        return False
    return True

def sign_token(user):
    payload = {
        'sub': user['id'],
        'role': user['role'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=config.JWT_EXPIRES_IN_DAYS)
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm='HS256')

def public_user(user):
    return {
        'id': user['id'],
        'name': user['name'],
        'username': user['username'],
        'email': user['email'],
        'role': user['role'],
        'balance': user['balance'],
        'truck_locked': user['truck_locked'],
        'company_id': user['company_id'],
        'created_at': user['created_at'].isoformat() if hasattr(user['created_at'], 'isoformat') else user['created_at']
    }

def log_activity(conn, actor_id, target_id, log_type, message):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO activity_logs (actor_user_id, target_user_id, type, message)
        VALUES (%s, %s, %s, %s)
    """, (actor_id, target_id, log_type, message))
    cursor.close()

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.json or {}
    name = data.get('name')
    username = data.get('username')
    password = data.get('password')
    company_name = data.get('companyName')
    
    if not name or not username or not password:
        return jsonify({'error': 'Nome, usuario e senha sao obrigatorios.'}), 400
        
    normalized_username = normalize_username(username)
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id FROM users WHERE username = %s", (normalized_username,))
        if cursor.fetchone():
            return jsonify({'error': 'Usuario ja cadastrado.'}), 409
            
        company_id = None
        if company_name:
            company_name = company_name.strip()
            cursor.execute("INSERT INTO companies (name) VALUES (%s) ON CONFLICT (name) DO NOTHING", (company_name,))
            cursor.execute("SELECT id FROM companies WHERE name = %s", (company_name,))
            company = cursor.fetchone()
            if company:
                company_id = company['id']
                
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
        generated_email = f"{normalized_username}@local.ets2"
        
        cursor.execute("""
            INSERT INTO users (name, username, email, password_hash, company_id)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
        """, (name.strip(), normalized_username, generated_email, hashed_password, company_id))
        
        user_id = cursor.fetchone()['id']
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        log_activity(conn, user['id'], user['id'], "user.registered", f"Usuario {user['username']} cadastrado.")
        conn.commit()
        
        return jsonify({
            'user': public_user(user),
            'token': sign_token(user)
        }), 201
    finally:
        cursor.close()
        conn.close()

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    identifier = normalize_username(data.get('username') or data.get('email'))
    password = data.get('password')
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM users WHERE username = %s OR email = %s", (identifier, identifier))
        user = cursor.fetchone()
        
        if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return jsonify({'error': 'Credenciais invalidas.'}), 401
            
        log_activity(conn, user['id'], user['id'], "auth.login", f"Login de {user['username']}.")
        conn.commit()
        
        return jsonify({
            'user': public_user(user),
            'token': sign_token(user)
        })
    finally:
        cursor.close()
        conn.close()

@auth_bp.route('/me', methods=['GET'])
@require_auth
def me():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE id = %s", (request.user['id'],))
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'Usuario nao encontrado.'}), 404
        return jsonify({'user': public_user(user)})
    finally:
        cursor.close()
        conn.close()
