import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

class Config:
    PORT = int(os.getenv('PORT', 5000))
    HOST = os.getenv('HOST', '0.0.0.0')
    DEBUG = os.getenv('DEBUG', 'True') == 'True'
    
    # Supabase Config
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
    
    # JWT
    JWT_SECRET = os.getenv('JWT_SECRET', 'dev-secret-key')
    
    # Default Admin
    ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')
    ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@example.com')
    ADMIN_NAME = os.getenv('ADMIN_NAME', 'Administrator')

config = Config()
