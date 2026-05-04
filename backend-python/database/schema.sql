-- SCHEMA PARA POSTGRESQL (SUPABASE)

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  balance INTEGER NOT NULL DEFAULT 0,
  truck_locked INTEGER NOT NULL DEFAULT 0,
  company_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS freights (
  id SERIAL PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  cargo TEXT NOT NULL,
  value INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  company_id INTEGER,
  status TEXT NOT NULL DEFAULT 'criado' CHECK (status IN ('criado', 'ativo', 'entregue', 'falha', 'cancelado')),
  destination_lat REAL,
  destination_lng REAL,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_freight_company FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS delivery_notes (
  id SERIAL PRIMARY KEY,
  freight_id INTEGER NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  note_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_freight FOREIGN KEY (freight_id) REFERENCES freights(id),
  CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  freight_id INTEGER,
  speed_kmh REAL,
  distance_meters REAL,
  trailer_attached INTEGER,
  raw_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_telemetry_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_telemetry_freight FOREIGN KEY (freight_id) REFERENCES freights(id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER,
  target_user_id INTEGER,
  freight_id INTEGER,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT fk_target FOREIGN KEY (target_user_id) REFERENCES users(id),
  CONSTRAINT fk_log_freight FOREIGN KEY (freight_id) REFERENCES freights(id)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_freights_user_status ON freights(user_id, status);
CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_user ON telemetry_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_user ON delivery_notes(user_id);
