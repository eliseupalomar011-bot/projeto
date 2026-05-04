from flask import Blueprint, jsonify, request
import json
import math
import datetime
from config import config
from database.db import get_db
from middlewares.auth import require_auth
from routes.auth_routes import log_activity
from routes.freight_routes import serialize_freight, FREIGHT_SELECT, broadcast_freight_update
from flask import current_app

telemetry_bp = Blueprint('telemetry', __name__)

def first_number(*values):
    for val in values:
        if val is not None:
            try:
                num = float(val)
                if math.isfinite(num):
                    return num
            except (ValueError, TypeError):
                continue
    return None

def get_path(obj, path):
    parts = path.split('.')
    current = obj
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current

def normalize_telemetry(raw):
    raw = raw or {}
    speed_raw = first_number(
        get_path(raw, "truck.speed"),
        get_path(raw, "truck.speedKmh"),
        get_path(raw, "truck.speedKph"),
        raw.get("speed"),
        raw.get("speedKmh"),
        raw.get("speedKph")
    )
    speed_kmh = None
    if speed_raw is not None:
        speed_kmh = abs(speed_raw) * 3.6 if abs(speed_raw) <= 80 else abs(speed_raw)

    lat = first_number(
        get_path(raw, "truck.position.latitude"),
        get_path(raw, "truck.placement.y"),
        get_path(raw, "truck.position.z"),
        get_path(raw, "navigation.position.lat"),
        raw.get("lat")
    )
    lng = first_number(
        get_path(raw, "truck.position.longitude"),
        get_path(raw, "truck.placement.x"),
        get_path(raw, "truck.position.x"),
        get_path(raw, "navigation.position.lng"),
        raw.get("lng")
    )
    distance_meters = first_number(
        get_path(raw, "navigation.estimatedDistance"),
        get_path(raw, "navigation.distance"),
        get_path(raw, "job.remainingDistance"),
        raw.get("distance"),
        raw.get("distanceMeters")
    )

    trailer_attached_val = (
        get_path(raw, "trailer.attached") or
        get_path(raw, "job.trailerAttached") or
        raw.get("trailerAttached")
    )
    trailer_attached = None if trailer_attached_val is None else bool(trailer_attached_val)
    
    delivered = bool(
        get_path(raw, "job.delivered") or
        get_path(raw, "delivery.delivered") or
        raw.get("delivered")
    )

    return {
        'speedKmh': speed_kmh,
        'lat': lat,
        'lng': lng,
        'distanceMeters': distance_meters,
        'trailerAttached': trailer_attached,
        'delivered': delivered
    }

def distance_between_meters(a_lat, a_lng, b_lat, b_lng):
    if any(not math.isfinite(float(v)) for v in [a_lat, a_lng, b_lat, b_lng]):
        return None
    looks_like_geo = (abs(float(a_lat)) <= 90 and abs(float(b_lat)) <= 90 and
                      abs(float(a_lng)) <= 180 and abs(float(b_lng)) <= 180)
    
    if not looks_like_geo:
        dx = float(a_lng) - float(b_lng)
        dy = float(a_lat) - float(b_lat)
        return math.sqrt(dx*dx + dy*dy)
        
    earth_radius = 6371000
    to_rad = lambda v: (float(v) * math.pi) / 180.0
    
    d_lat = to_rad(b_lat - a_lat)
    d_lng = to_rad(b_lng - a_lng)
    lat1 = to_rad(a_lat)
    lat2 = to_rad(b_lat)
    
    a = (math.sin(d_lat/2) * math.sin(d_lat/2) +
         math.cos(lat1) * math.cos(lat2) * math.sin(d_lng/2) * math.sin(d_lng/2))
    return earth_radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def fail_freight(conn, user_id, freight_id, reason, metadata):
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE freights SET status = 'falha', failure_reason = %s, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (reason, freight_id))
    log_activity(conn, user_id, user_id, "freight.failed", f"Frete #{freight_id} falhou: {reason}.")
    cursor.execute(f"{FREIGHT_SELECT} WHERE f.id = %s", (freight_id,))
    res = serialize_freight(cursor.fetchone())
    cursor.close()
    return res

def complete_freight(conn, user_id, freight_id, value, origin, destination, cargo, note_data):
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE freights SET status = 'entregue', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (freight_id,))
        cursor.execute("UPDATE users SET balance = balance + %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (value, user_id))
        
        note = {
            'freightId': freight_id,
            'userId': user_id,
            'origin': origin,
            'destination': destination,
            'cargo': cargo,
            'value': value,
            'completedAt': datetime.datetime.utcnow().isoformat() + 'Z',
            'telemetry': note_data
        }
        
        cursor.execute("""
            INSERT INTO delivery_notes (freight_id, user_id, note_json) VALUES (%s, %s, %s)
            ON CONFLICT (freight_id) DO UPDATE SET note_json = EXCLUDED.note_json
        """, (freight_id, user_id, json.dumps(note)))
        
        log_activity(conn, user_id, user_id, "freight.delivered", f"Frete #{freight_id} entregue. Pagamento: {value}.")
        
        cursor.execute(f"{FREIGHT_SELECT} WHERE f.id = %s", (freight_id,))
        res = serialize_freight(cursor.fetchone())
        cursor.close()
        return res
    except Exception as e:
        cursor.close()
        raise e

@telemetry_bp.route('/', methods=['POST'])
@require_auth
def ingest_telemetry():
    user_id = request.user['id']
    raw_payload = request.json or {}
    normalized = normalize_telemetry(raw_payload)
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute(f"{FREIGHT_SELECT} WHERE f.user_id = %s AND f.status = 'ativo'", (user_id,))
        active_freight_row = cursor.fetchone()
        active_freight = serialize_freight(active_freight_row) if active_freight_row else None
        
        computed_distance = normalized['distanceMeters']
        if active_freight and active_freight.get('destinationLat') is not None and active_freight.get('destinationLng') is not None and normalized['lat'] is not None and normalized['lng'] is not None:
            computed_distance = distance_between_meters(normalized['lat'], normalized['lng'], active_freight['destinationLat'], active_freight['destinationLng'])
        
        trailer_int = None
        if normalized['trailerAttached'] is not None:
            trailer_int = 1 if normalized['trailerAttached'] else 0
            
        cursor.execute("""
            INSERT INTO telemetry_events (user_id, freight_id, speed_kmh, distance_meters, trailer_attached, raw_json)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (user_id, active_freight['id'] if active_freight else None, normalized['speedKmh'], computed_distance, trailer_int, json.dumps(raw_payload)))
        
        freight_update = None
        flags = []
        
        if active_freight:
            speed = normalized['speedKmh']
            if speed is not None and speed > config.MAX_SPEED_KMH:
                flags.append({'type': 'speed.warning', 'message': f"Velocidade acima do limite: {round(speed)} km/h."})
                
            if speed is not None and speed > config.FAIL_SPEED_KMH:
                freight_update = fail_freight(conn, user_id, active_freight['id'], "Velocidade absurda detectada", normalized)
            elif normalized['trailerAttached'] is False:
                freight_update = fail_freight(conn, user_id, active_freight['id'], "Trailer desconectado", normalized)
            elif normalized['delivered'] or (computed_distance is not None and computed_distance < config.DELIVERY_DISTANCE_METERS):
                note_data = {**normalized, 'distanceMeters': computed_distance}
                freight_update = complete_freight(conn, user_id, active_freight['id'], active_freight['value'], active_freight['origin'], active_freight['destination'], active_freight['cargo'], note_data)
                
        conn.commit()
        
        normalized_with_dist = {**normalized, 'distanceMeters': computed_distance}
        if freight_update:
            broadcast_freight_update(freight_update)
            
        try:
            socketio = current_app.extensions['socketio']
            socketio.emit('telemetry:update', {
                'userId': user_id,
                'activeFreightId': active_freight['id'] if active_freight else None,
                'normalized': normalized_with_dist,
                'flags': flags
            }, room='admins', namespace='/')
        except: pass
            
        return jsonify({
            'normalized': normalized_with_dist,
            'activeFreightId': active_freight['id'] if active_freight else None,
            'flags': flags,
            'freightUpdate': freight_update
        })
    finally:
        cursor.close()
        conn.close()
