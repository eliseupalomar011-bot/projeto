import requests
import bcrypt
from config import config

class SupabaseClient:
    def __init__(self, url, key):
        self.url = f"{url}/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    def table(self, table_name):
        return SupabaseQuery(self.url, self.headers, table_name)

class SupabaseQuery:
    def __init__(self, url, headers, table_name):
        self.base_url = f"{url}/{table_name}"
        self.headers = headers
        self.params = {}

    def select(self, query="*", count=None):
        self.params["select"] = query
        return self

    def eq(self, column, value):
        self.params[column] = f"eq.{value}"
        return self

    def or_(self, filter_str):
        self.params["or"] = f"({filter_str})"
        return self

    def order(self, column, desc=False):
        self.params["order"] = f"{column}.{'desc' if desc else 'asc'}"
        return self

    def limit(self, size):
        self.params["limit"] = size
        return self

    def insert(self, data):
        response = requests.post(self.base_url, headers=self.headers, json=data)
        return SupabaseResponse(response)

    def update(self, data):
        response = requests.patch(self.base_url, headers=self.headers, json=data, params=self.params)
        return SupabaseResponse(response)

    def upsert(self, data):
        headers = self.headers.copy()
        headers["Prefer"] = "resolution=merge-duplicates,return=representation"
        response = requests.post(self.base_url, headers=headers, json=data)
        return SupabaseResponse(response)

    def delete(self):
        response = requests.delete(self.base_url, headers=self.headers, params=self.params)
        return SupabaseResponse(response)

    def execute(self):
        response = requests.get(self.base_url, headers=self.headers, params=self.params)
        return SupabaseResponse(response)

class SupabaseResponse:
    def __init__(self, response):
        self.status_code = response.status_code
        try:
            self.data = response.json()
        except:
            self.data = []
        
        # Simula o atributo .count do supabase-py
        self.count = len(self.data) if isinstance(self.data, list) else 0
        
        if not (200 <= self.status_code < 300):
            raise Exception(f"Supabase Error {self.status_code}: {self.data}")

# Singleton
_client = None

def get_db():
    global _client
    if _client is None:
        _client = SupabaseClient(config.SUPABASE_URL, config.SUPABASE_KEY)
    return _client

def init_db():
    try:
        supabase = get_db()
        _ensure_default_admin(supabase)
        print("[DB SUCCESS] Motor REST Supabase pronto!")
    except Exception as e:
        print(f"[DB ERROR] Erro no motor REST: {e}")

def _ensure_default_admin(supabase):
    res = supabase.table('users').select('id').or_(f"username.eq.{config.ADMIN_USERNAME},email.eq.{config.ADMIN_EMAIL}").execute()
    if res.count > 0:
        return
    
    hashed_password = bcrypt.hashpw(config.ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
    supabase.table('users').insert({
        'name': config.ADMIN_NAME,
        'username': config.ADMIN_USERNAME,
        'email': config.ADMIN_EMAIL,
        'password_hash': hashed_password,
        'role': 'admin'
    })
