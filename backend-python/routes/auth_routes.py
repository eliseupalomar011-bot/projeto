from flask import Blueprint, request, jsonify
import bcrypt
import jwt
import datetime
from config import config
from database.db import get_db
from middlewares.auth import require_auth

auth_bp = Blueprint('auth', __name__)
health_bp = Blueprint('health', __name__)

@health_bp.route('/')
def health():
    return jsonify({"status": "healthy", "service": "auth"})

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.json
    name = data.get('name')
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not all([name, username, email, password]):
        return jsonify({'error': 'Campos obrigatórios ausentes.'}), 400
        
    supabase = get_db()
    
    # Check if user exists
    check = supabase.table('users').select('id').or_(f"username.eq.{username},email.eq.{email}").execute()
    if check.count > 0:
        return jsonify({'error': 'Usuário ou email já cadastrado.'}), 400
        
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
    
    try:
        res = supabase.table('users').insert({
            'name': name,
            'username': username,
            'email': email,
            'password_hash': hashed_password,
            'role': 'user'
        })
        
        return jsonify({'message': 'Usuário registrado com sucesso!', 'user': res.data[0] if res.data else {}}), 201
    except Exception as e:
        return jsonify({'error': f'Erro ao registrar: {str(e)}'}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    login_id = data.get('username')
    password = data.get('password')
    
    if not login_id or not password:
        return jsonify({'error': 'Credenciais ausentes.'}), 400
        
    supabase = get_db()
    res = supabase.table('users').select('*').or_(f"username.eq.{login_id},email.eq.{login_id}").execute()
    
    if res.count == 0:
        return jsonify({'error': 'Usuário não encontrado.'}), 404
        
    user = res.data[0]
    
    if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        token = jwt.encode({
            'sub': str(user['id']),
            'role': user['role'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, config.JWT_SECRET, algorithm='HS256')
        
        return jsonify({
            'token': token,
            'user': {
                'id': user['id'],
                'name': user['name'],
                'username': user['username'],
                'role': user['role']
            }
        })
        
    return jsonify({'error': 'Senha incorreta.'}), 401

@auth_bp.route('/me', methods=['GET'])
@require_auth
def get_me():
    supabase = get_db()
    res = supabase.table('users').select('id, name, username, role').eq('id', request.user['id']).execute()
    if res.count == 0:
        return jsonify({'error': 'Usuário não encontrado.'}), 404
    return jsonify({'user': res.data[0]})
