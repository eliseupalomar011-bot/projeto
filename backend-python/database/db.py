from supabase import create_client, Client
import bcrypt
from config import config

# Singleton para o cliente Supabase
_supabase: Client = None

def get_db() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
    return _supabase

def init_db():
    """
    No modo HTTP, não rodamos o schema.sql via código (pois exige permissões de superuser).
    O usuário deve rodar o schema.sql manualmente no SQL Editor do Supabase.
    Esta função apenas garante que o Admin padrão existe.
    """
    try:
        supabase = get_db()
        _ensure_default_admin(supabase)
        print("[DB SUCCESS] Conexão HTTP com Supabase estabelecida e Admin verificado.")
    except Exception as e:
        print(f"[DB ERROR] Erro ao verificar banco via HTTP: {e}")

def _ensure_default_admin(supabase: Client):
    # Verifica se o admin já existe
    response = supabase.table('users').select('id').or_(f"username.eq.{config.ADMIN_USERNAME},email.eq.{config.ADMIN_EMAIL}").execute()
    
    if len(response.data) > 0:
        # Atualiza se necessário
        user_id = response.data[0]['id']
        supabase.table('users').update({
            'username': config.ADMIN_USERNAME,
            'email': config.ADMIN_EMAIL
        }).eq('id', user_id).execute()
        return

    # Cria o admin se não existir
    hashed_password = bcrypt.hashpw(config.ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
    supabase.table('users').insert({
        'name': config.ADMIN_NAME,
        'username': config.ADMIN_USERNAME,
        'email': config.ADMIN_EMAIL,
        'password_hash': hashed_password,
        'role': 'admin'
    }).execute()
