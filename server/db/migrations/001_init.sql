-- digiKOT SQLite schema (money stored as INTEGER paise; timestamps as ISO TEXT)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('waiter', 'kitchen_supervisor', 'manager')),
  code TEXT NOT NULL UNIQUE,
  username TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pin_hash_active ON users (pin_hash) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, active);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS waiter_sessions (
  id TEXT PRIMARY KEY,
  waiter_id TEXT NOT NULL REFERENCES users(id),
  logged_in_at TEXT NOT NULL,
  logged_out_at TEXT,
  device_identifier TEXT
);

CREATE INDEX IF NOT EXISTS idx_waiter_sessions_waiter ON waiter_sessions (waiter_id, logged_in_at DESC);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY,
  table_number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('available', 'occupied')),
  current_session_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id TEXT PRIMARY KEY,
  table_number INTEGER NOT NULL,
  opened_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  opened_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  price_paise INTEGER NOT NULL,
  description TEXT,
  image_url TEXT,
  is_vegetarian INTEGER NOT NULL DEFAULT 0,
  out_of_stock INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category_out_of_stock ON menu_items (category, out_of_stock);

CREATE TABLE IF NOT EXISTS kots (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES table_sessions(id),
  table_number INTEGER NOT NULL,
  waiter_user_id TEXT REFERENCES users(id),
  waiter_username TEXT,
  special_instructions TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'cleared', 'cancelled')),
  created_at TEXT NOT NULL,
  cleared_at TEXT,
  updated_at TEXT NOT NULL,
  indent_received_at TEXT,
  indent_received_by TEXT REFERENCES users(id),
  cancelled_by TEXT REFERENCES users(id),
  cancelled_at TEXT,
  cancel_reason TEXT,
  supervisor_id TEXT REFERENCES users(id),
  supervisor_name TEXT,
  assigned_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_kots_table_status_created_at ON kots (table_number, status, created_at);
CREATE INDEX IF NOT EXISTS idx_kots_supervisor ON kots (supervisor_id) WHERE supervisor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS kot_items (
  id TEXT PRIMARY KEY,
  kot_id TEXT NOT NULL REFERENCES kots(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  item_name_snapshot TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price_snapshot_paise INTEGER NOT NULL,
  image_url TEXT,
  removed_qty INTEGER,
  final_qty INTEGER,
  status TEXT NOT NULL CHECK (
    status IN (
      'pending', 'done', 'out_of_stock', 'cancelled',
      'removed', 'partially_removed', 'removed_entirely'
    )
  ),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kot_items_kot_status ON kot_items (kot_id, status);

CREATE TABLE IF NOT EXISTS kot_actions (
  id TEXT PRIMARY KEY,
  kot_id TEXT NOT NULL REFERENCES kots(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'modified', 'cancelled')),
  performed_by_waiter_id TEXT REFERENCES users(id),
  performed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kot_actions_kot_id ON kot_actions (kot_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS cancel_requests (
  id TEXT PRIMARY KEY,
  kot_id TEXT,
  kot_item_id TEXT NOT NULL,
  table_number INTEGER NOT NULL,
  waiter_user_id TEXT REFERENCES users(id),
  item_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending_approval', 'approved', 'rejected')),
  requested_at TEXT NOT NULL,
  reviewed_by_user_id TEXT REFERENCES users(id),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cancel_requests_table_status_requested
  ON cancel_requests (table_number, status, requested_at);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES table_sessions(id),
  table_number INTEGER NOT NULL,
  waiter_user_id TEXT REFERENCES users(id),
  waiter_username TEXT,
  subtotal_paise INTEGER NOT NULL,
  service_charge_paise INTEGER NOT NULL,
  tax_paise INTEGER NOT NULL,
  total_paise INTEGER NOT NULL,
  printed INTEGER NOT NULL DEFAULT 0,
  bill_status TEXT NOT NULL DEFAULT 'open' CHECK (bill_status IN ('open', 'printed', 'void', 'resettled')),
  voided_by TEXT REFERENCES users(id),
  voided_at TEXT,
  void_reason TEXT,
  resettled_by TEXT REFERENCES users(id),
  resettled_at TEXT,
  original_payment_method TEXT,
  new_payment_method TEXT,
  discount_percent_bps INTEGER,
  discount_applied_by TEXT REFERENCES users(id),
  discount_applied_at TEXT,
  cleared_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bills_table_cleared ON bills (table_number, cleared_at DESC) WHERE cleared_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS bill_items (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  kot_item_id TEXT,
  item_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  line_total_paise INTEGER NOT NULL,
  include_in_bill INTEGER NOT NULL DEFAULT 1,
  exclusion_reason TEXT,
  removed_qty INTEGER,
  original_qty INTEGER
);

CREATE TABLE IF NOT EXISTS bill_modification_requests (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id),
  waiter_id TEXT REFERENCES users(id),
  waiter_username TEXT,
  waiter_name TEXT,
  table_number INTEGER,
  items_to_remove TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TEXT NOT NULL,
  reviewed_by_manager_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  rejection_reason TEXT,
  rejected_at TEXT,
  rejected_by TEXT,
  rejected_by_display_name TEXT,
  approved_at TEXT,
  approved_by TEXT,
  approved_reason TEXT,
  approved_by_display_name TEXT,
  approval_note TEXT,
  removal_qty INTEGER,
  remaining_qty INTEGER,
  item_name TEXT,
  original_qty INTEGER,
  final_qty INTEGER,
  removed_qty INTEGER,
  kot_id TEXT,
  item_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_bill_mod_requests_status ON bill_modification_requests (status, requested_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT REFERENCES table_sessions(id),
  table_number INTEGER,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL,
  mqtt_published_at TEXT,
  mqtt_publish_status TEXT NOT NULL DEFAULT 'pending',
  mqtt_attempt_count INTEGER NOT NULL DEFAULT 0,
  mqtt_last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_target_created ON notifications (target_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_mqtt_pending ON notifications (mqtt_publish_status) WHERE mqtt_publish_status = 'pending';

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  remarks TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);

CREATE TABLE IF NOT EXISTS postprep_adjustments (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES table_sessions(id),
  table_number INTEGER NOT NULL,
  kot_item_id TEXT NOT NULL,
  requested_by_waiter_id TEXT NOT NULL REFERENCES users(id),
  approved_by_manager_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pager_devices (
  device_code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  mac_address TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  provision_state TEXT NOT NULL DEFAULT 'offline',
  last_ip TEXT,
  last_seen_at TEXT,
  firmware_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (provision_state IN (
    'on_root', 'push_pending', 'on_restaurant_wifi', 'mqtt_ok', 'wifi_failed', 'offline'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pager_devices_mac_address ON pager_devices (mac_address);
CREATE INDEX IF NOT EXISTS idx_pager_devices_provision_state ON pager_devices (provision_state);

CREATE TABLE IF NOT EXISTS pager_assignments (
  id TEXT PRIMARY KEY,
  pager_device_id TEXT NOT NULL REFERENCES pager_devices (device_code),
  waiter_user_id TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  released_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pager_assignments_waiter_released ON pager_assignments (waiter_user_id, released_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pager_assignments_one_active_per_pager
  ON pager_assignments (pager_device_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pager_assignments_one_active_per_waiter
  ON pager_assignments (waiter_user_id) WHERE released_at IS NULL;
