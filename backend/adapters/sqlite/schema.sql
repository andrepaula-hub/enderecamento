-- Schema principal do banco SQLite do Endereçamento
-- Criado na Fase 3 — Persistência e Jobs

CREATE TABLE IF NOT EXISTS workflow_sheets (
  store_id TEXT PRIMARY KEY,
  target_sheet_id TEXT NOT NULL,
  master_sheet_id TEXT,
  mix_sheet_id TEXT,
  connected_at TEXT NOT NULL,
  last_verified_at TEXT
);

CREATE TABLE IF NOT EXISTS active_workflow (
  singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  store_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  service TEXT PRIMARY KEY,
  token_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
