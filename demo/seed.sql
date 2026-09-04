PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cost_center TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'analyst', 'support')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  metadata_json JSON,
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled', 'refunded')),
  total NUMERIC NOT NULL CHECK (total >= 0),
  payment_method TEXT NOT NULL,
  payment_token TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE app_events (
  id INTEGER PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warning', 'error')),
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json JSON,
  created_at TEXT NOT NULL
);

INSERT INTO teams (id, name, cost_center, created_at) VALUES
  (1, 'Plataforma', 'ENG-001', '2025-01-10 09:00:00'),
  (2, 'Produto', 'PRD-002', '2025-01-10 09:00:00'),
  (3, 'Operações', 'OPS-003', '2025-01-10 09:00:00'),
  (4, 'Financeiro', 'FIN-004', '2025-01-10 09:00:00'),
  (5, 'Atendimento', 'CS-005', '2025-01-10 09:00:00');

WITH RECURSIVE sequence(n) AS (
  VALUES (1)
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 36
)
INSERT INTO users (
  id,
  team_id,
  name,
  email,
  phone,
  password_hash,
  role,
  active,
  last_login_at,
  created_at
)
SELECT
  n,
  ((n - 1) % 5) + 1,
  'Pessoa de Teste ' || printf('%02d', n),
  'pessoa' || printf('%02d', n) || '@example.test',
  '+55 11 9' || printf('%04d', 1000 + n) || '-' || printf('%04d', 2000 + n),
  '$argon2id$demo$hash-' || printf('%02d', n),
  CASE n % 4
    WHEN 0 THEN 'admin'
    WHEN 1 THEN 'manager'
    WHEN 2 THEN 'analyst'
    ELSE 'support'
  END,
  CASE WHEN n % 9 = 0 THEN 0 ELSE 1 END,
  datetime('2026-08-31 15:00:00', '-' || (n % 14) || ' days'),
  datetime('2026-01-01 09:00:00', '+' || n || ' days')
FROM sequence;

WITH RECURSIVE sequence(n) AS (
  VALUES (1)
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 28
)
INSERT INTO products (
  id,
  sku,
  name,
  category,
  description,
  price,
  stock,
  metadata_json,
  created_at
)
SELECT
  n,
  'SKU-' || printf('%04d', n),
  CASE n % 5
    WHEN 0 THEN 'Monitor UltraWide ' || n
    WHEN 1 THEN 'Teclado Mecânico ' || n
    WHEN 2 THEN 'Mouse Ergonômico ' || n
    WHEN 3 THEN 'Headset Profissional ' || n
    ELSE 'Dock USB-C ' || n
  END,
  CASE n % 4
    WHEN 0 THEN 'Monitores'
    WHEN 1 THEN 'Periféricos'
    WHEN 2 THEN 'Acessórios'
    ELSE 'Áudio'
  END,
  'Produto demonstrativo com descrição longa para testar truncamento, largura de coluna e visualização de valores TEXT no explorador de banco do Tuiminal.',
  round(49.90 + (n * 17.35), 2),
  (n * 13) % 120,
  json_object('color', CASE WHEN n % 2 = 0 THEN 'grafite' ELSE 'branco' END, 'warranty_months', 12 + (n % 3) * 6, 'featured', n % 4 = 0),
  datetime('2026-02-01 10:00:00', '+' || n || ' days')
FROM sequence;

WITH RECURSIVE sequence(n) AS (
  VALUES (1)
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 84
)
INSERT INTO orders (
  id,
  user_id,
  status,
  total,
  payment_method,
  payment_token,
  notes,
  created_at,
  updated_at
)
SELECT
  n,
  ((n - 1) % 36) + 1,
  CASE n % 5
    WHEN 0 THEN 'pending'
    WHEN 1 THEN 'paid'
    WHEN 2 THEN 'shipped'
    WHEN 3 THEN 'cancelled'
    ELSE 'refunded'
  END,
  round(89.90 + (n * 11.73), 2),
  CASE n % 3 WHEN 0 THEN 'pix' WHEN 1 THEN 'credit_card' ELSE 'boleto' END,
  'pay_test_' || printf('%08d', n),
  CASE WHEN n % 7 = 0 THEN 'Pedido prioritário para validação do fluxo.' ELSE NULL END,
  datetime('2026-08-31 12:00:00', '-' || n || ' hours'),
  datetime('2026-08-31 12:00:00', '-' || (n - 1) || ' hours')
FROM sequence;

WITH RECURSIVE sequence(n) AS (
  VALUES (1)
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 168
)
INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
SELECT
  n,
  ((n - 1) / 2) + 1,
  ((n * 7 - 1) % 28) + 1,
  (n % 3) + 1,
  round(39.90 + (((n * 7 - 1) % 28) * 9.25), 2)
FROM sequence;

WITH RECURSIVE sequence(n) AS (
  VALUES (1)
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 12
)
INSERT INTO api_keys (id, user_id, label, token, scopes, expires_at, created_at)
SELECT
  n,
  n,
  CASE WHEN n % 2 = 0 THEN 'Integração de homologação' ELSE 'CLI local' END,
  'tk_demo_' || lower(hex(randomblob(16))),
  CASE WHEN n % 3 = 0 THEN 'read,write' ELSE 'read' END,
  datetime('2026-08-31 12:00:00', '+' || (n * 30) || ' days'),
  datetime('2026-06-01 09:00:00', '+' || n || ' days')
FROM sequence;

WITH RECURSIVE sequence(n) AS (
  VALUES (1)
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 120
)
INSERT INTO app_events (id, level, event, message, metadata_json, created_at)
SELECT
  n,
  CASE n % 10
    WHEN 0 THEN 'error'
    WHEN 1 THEN 'warning'
    WHEN 2 THEN 'debug'
    ELSE 'info'
  END,
  CASE n % 5
    WHEN 0 THEN 'order.created'
    WHEN 1 THEN 'user.login'
    WHEN 2 THEN 'payment.confirmed'
    WHEN 3 THEN 'inventory.updated'
    ELSE 'report.generated'
  END,
  'Evento demonstrativo número ' || n || ' processado pelo ambiente local.',
  json_object('request_id', 'req-' || printf('%05d', n), 'duration_ms', 15 + (n * 7) % 900, 'attempt', (n % 3) + 1),
  datetime('2026-08-31 16:00:00', '-' || (n * 5) || ' minutes')
FROM sequence;

CREATE INDEX idx_users_team ON users(team_id);
CREATE INDEX idx_users_active ON users(active);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_app_events_level_created ON app_events(level, created_at DESC);

CREATE VIEW customer_order_summary AS
SELECT
  u.id AS user_id,
  u.name,
  u.email,
  t.name AS team,
  COUNT(o.id) AS order_count,
  round(COALESCE(SUM(o.total), 0), 2) AS lifetime_value,
  MAX(o.created_at) AS last_order_at
FROM users u
JOIN teams t ON t.id = u.team_id
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name, u.email, t.name;

COMMIT;

PRAGMA optimize;
