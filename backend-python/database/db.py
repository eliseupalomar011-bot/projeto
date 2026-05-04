import psycopg2
from psycopg2.extras import RealDictCursor
import os
import bcrypt
import re
import unicodedata
from config import config

def get_db():
    try:
        # Conexão com o Supabase (PostgreSQL) com SSL exigido
        conn = psycopg2.connect(config.DATABASE_URL, cursor_factory=RealDictCursor, sslmode='require')
        return conn
    except Exception as e:
        print(f"[DB CONNECTION ERROR] Erro ao conectar ao Supabase: {e}")
        raise e

def init_db():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        with open(schema_path, 'r', encoding='utf8') as f:
            schema = f.read()
        
        # Executa o schema (no psycopg2, execute pode rodar múltiplos comandos se separados por ;)
        cursor.execute(schema)
        
        # Migrations e Garantia de Admin
        _ensure_default_admin(conn)
        
        conn.commit()
        cursor.close()
        print("[DB SUCCESS] Banco de dados inicializado com sucesso no Supabase.")
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[DB INIT ERROR] Erro na inicialização: {e}")
        raise e
    finally:
        if conn:
            conn.close()

def _username_from(value, fallback):
    base = str(value or fallback or "usuario").split('@')[0]
    base = unicodedata.normalize('NFD', base).encode('ascii', 'ignore').decode('utf-8')
    base = base.lower()
    base = re.sub(r'[^a-z0-9._-]', '', base)
    base = base[:28]
    return base or "usuario"

def _ensure_default_admin(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = %s OR email = %s", 
                   (config.ADMIN_USERNAME, config.ADMIN_EMAIL))
    existing = cursor.fetchone()
    
    if existing:
        cursor.execute("UPDATE users SET username = %s, email = %s WHERE id = %s", 
                       (config.ADMIN_USERNAME, config.ADMIN_EMAIL, existing['id']))
        return
        
    hashed_password = bcrypt.hashpw(config.ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
    cursor.execute("""
        INSERT INTO users (name, username, email, password_hash, role) 
        VALUES (%s, %s, %s, %s, 'admin')
    """, (config.ADMIN_NAME, config.ADMIN_USERNAME, config.ADMIN_EMAIL, hashed_password))
    cursor.close()
