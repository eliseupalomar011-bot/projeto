import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    ENV = os.getenv("FLASK_ENV", "development")
    PORT = int(os.getenv("PORT", "5000"))
    HOST = os.getenv("HOST", "0.0.0.0")
    
    JWT_SECRET = os.getenv("JWT_SECRET", "change_this_secret_before_production")
    # For PyJWT we'll handle expiration manually or use datetime, 7d = 7 days
    JWT_EXPIRES_IN_DAYS = 7
    
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@host:port/dbname")
    DATABASE_FILE = os.getenv("DATABASE_FILE", "./data/ets2.sqlite")
    
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "palomareliseuaz163")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "palomareliseuaz163@gmail.com")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "mm06042012")
    ADMIN_NAME = os.getenv("ADMIN_NAME", "Administrador")
    
    CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")
    
    MAX_SPEED_KMH = float(os.getenv("MAX_SPEED_KMH", "160"))
    FAIL_SPEED_KMH = float(os.getenv("FAIL_SPEED_KMH", "200"))
    DELIVERY_DISTANCE_METERS = float(os.getenv("DELIVERY_DISTANCE_METERS", "50"))
    TELEMETRY_STALE_SECONDS = int(os.getenv("TELEMETRY_STALE_SECONDS", "15"))

config = Config()
