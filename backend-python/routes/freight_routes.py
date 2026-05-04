from flask import Blueprint, jsonify, request
import json
import datetime
from database.db import get_db
from middlewares.auth import require_auth
from routes.auth_routes import log_activity
from flask import current_app

freight_bp = Blueprint('freights', __name__)

FREIGHT_SELECT = """
  SELECT f.*, u.name AS user_name, u.username, u.email AS user_email, c.name AS company_name
  FROM freights f
  JOIN users u ON u.id = f.user_id
  LEFT JOIN companies c ON c.id = f.company_id
"""

def serialize_freight(row):
    if not row:
        return None
    return {
        'id': row['id'],
        'origin': row['origin'],
        'destination': row['destination'],
        'cargo': row['cargo'],
        'value': row['value'],
        'status': row['status'],
        'destinationLat': row['destination_lat'],
        'destinationLng': row['destination_lng'],
        'acceptedAt': row['accepted_at'].isoformat() if hasattr(row['accepted_at'], 'isoformat') else row['accepted_at'],
        'completedAt': row['completed_at'].isoformat() if hasattr(row['completed_at'], 'isoformat') else row['completed_at'],
        'failureReason': row['failure_reason'],
        'createdAt': row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else row['created_at'],
        'updatedAt': row['updated_at'].isoformat() if hasattr(row['updated_at'], 'isoformat') else row['updated_at'],
        'userId': row['user_id'],
        'userName': row['user_name'],
        'userUsername': row['username'],
        'userEmail': row['user_email'],
        'companyId': row['company_id'],
        'companyName': row['company_name']
    }

def broadcast_freight_update(freight):
    try:
        socketio = current_app.extensions['socketio']
        socketio.emit('freight:update', freight, room=str(freight['userId']), namespace='/')
        socketio.emit('freight:update', freight, room='admins', namespace='/')
    except Exception as e:
        print(f"Error broadcasting: {e}")

@freight_bp.route('', methods=['GET'])
@freight_bp.route('/', methods=['GET'])
@require_auth
def list_freights():
    conn = get_db()
    cursor = conn.cursor()
    try:
        user = request.user
        if user['role'] == 'admin':
            cursor.execute(f"{FREIGHT_SELECT} ORDER BY f.id DESC")
        else:
            cursor.execute(f"{FREIGHT_SELECT} WHERE f.user_id = %s ORDER BY f.id DESC", (user['id'],))
            
        rows = cursor.fetchall()
        return jsonify({'freights': [serialize_freight(row) for row in rows]})
    finally:
        cursor.close()
        conn.close()

@freight_bp.route('/<int:freight_id>/accept', methods=['POST'])
@require_auth
def accept_freight(freight_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        user_id = request.user['id']
        cursor.execute("SELECT * FROM freights WHERE id = %s AND user_id = %s", (freight_id, user_id))
        current = cursor.fetchone()
        
        if not current:
            return jsonify({'error': 'Frete nao encontrado.'}), 404
            
        if current['status'] != 'criado':
            return jsonify({'error': 'Apenas fretes criados podem ser aceitos.'}), 409
            
        cursor.execute("""
            UPDATE freights SET status = 'ativo', accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (freight_id,))
        
        cursor.execute(f"{FREIGHT_SELECT} WHERE f.id = %s", (freight_id,))
        updated = serialize_freight(cursor.fetchone())
        
        log_activity(conn, user_id, user_id, "freight.accepted", f"Frete #{freight_id} aceito.")
        conn.commit()
        
        broadcast_freight_update(updated)
        return jsonify({'freight': updated})
    finally:
        cursor.close()
        conn.close()

@freight_bp.route('/<int:freight_id>/delivery-note', methods=['GET'])
@require_auth
def get_delivery_note(freight_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM delivery_notes WHERE freight_id = %s", (freight_id,))
        row = cursor.fetchone()
        
        if not row:
            return jsonify({'error': {'message': 'Nota nao encontrada.', 'status': 404}}), 404
            
        if request.user['role'] != 'admin' and row['user_id'] != request.user['id']:
            return jsonify({'error': {'message': 'Acesso negado.', 'status': 403}}), 403
            
        note = {
            'id': row['id'],
            'freightId': row['freight_id'],
            'userId': row['user_id'],
            'note': json.loads(row['note_json']),
            'createdAt': row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else row['created_at']
        }
        return jsonify({'deliveryNote': note})
    finally:
        cursor.close()
        conn.close()

def get_freight_by_id(freight_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(f"{FREIGHT_SELECT} WHERE f.id = %s", (freight_id,))
        return serialize_freight(cursor.fetchone())
    finally:
        cursor.close()
        conn.close()
