import jwt
from functools import wraps
from flask import request, jsonify
from config import config

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        parts = auth_header.split(' ')
        
        if len(parts) != 2 or parts[0] != 'Bearer':
            return jsonify({'error': 'Token ausente.'}), 401
            
        token = parts[1]
        
        try:
            decoded = jwt.decode(token, config.JWT_SECRET, algorithms=['HS256'])
            # We attach user data to request context
            request.user = {
                'id': int(decoded.get('sub')),
                'role': decoded.get('role')
            }
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token invalido ou expirado.'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token invalido ou expirado.'}), 401
            
        return f(*args, **kwargs)
    return decorated_function

def require_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = getattr(request, 'user', None)
        if not user or user.get('role') != 'admin':
            return jsonify({'error': 'Acesso restrito ao admin.'}), 403
            
        return f(*args, **kwargs)
    return decorated_function
