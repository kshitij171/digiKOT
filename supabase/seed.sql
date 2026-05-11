-- =============================================================================
-- KOT System — seed data for local development
-- Applied automatically when running: npx supabase db reset
-- =============================================================================
-- Demo users: each has a UNIQUE 4-digit PIN (required by the new unique index).
--   waiter1  → PIN 1234  (hash: 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4)
--   waiter2  → PIN 5678  (hash: f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75)
--   ksup1    → PIN 9999  (hash: 888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05)
--   mgr1     → PIN 4321  (hash: fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------
insert into users (id, role, code, username, name, phone, pin_hash, active)
values
  ('u_waiter_1',            'waiter',             'W001', 'waiter1', 'Waiter One',             '9876543201', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('u_waiter_2',            'waiter',             'W002', 'waiter2', 'Waiter Two',             '9876543205', 'f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75', true),
  ('u_kitchen_supervisor_1','kitchen_supervisor', 'K001', 'ksup1',   'Kitchen Supervisor One', '9876543203', '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05', true),
  ('u_manager_1',           'manager',            'M001', 'mgr1',    'Manager One',            '9876543204', 'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RESTAURANT TABLES (20 tables)
-- ---------------------------------------------------------------------------
insert into restaurant_tables (id, table_number, status, current_session_id)
select 'T' || g::text, g, 'available', null
from generate_series(1, 20) g
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- MENU ITEMS (matches src/data/menu.js exactly so the frontend is consistent)
-- ---------------------------------------------------------------------------
insert into menu_items (id, name, category, price, description, image_url, out_of_stock)
values
  ('s1', 'Paneer Tikka',          'Starters',    250.00, 'Grilled cottage cheese cubes marinated in spices.',    '/placeholder.svg', false),
  ('s2', 'Chicken 65',            'Starters',    300.00, 'Spicy, deep-fried chicken bites.',                     '/placeholder.svg', false),
  ('s3', 'Spring Rolls',          'Starters',    180.00, 'Crispy rolls stuffed with seasoned vegetables.',       '/placeholder.svg', false),
  ('s4', 'Mushroom Salt & Pepper','Starters',    220.00, 'Crispy fried mushrooms tossed with salt and pepper.',  '/placeholder.svg', false),
  ('m1', 'Butter Chicken',        'Main Course', 450.00, 'Tender chicken simmered in a creamy tomato gravy.',    '/placeholder.svg', false),
  ('m2', 'Dal Makhani',           'Main Course', 350.00, 'Slow-cooked black lentils with butter and cream.',     '/placeholder.svg', false),
  ('m3', 'Mutton Biryani',        'Main Course', 550.00, 'Aromatic basmati rice cooked with tender mutton.',     '/placeholder.svg', false),
  ('m4', 'Palak Paneer',          'Main Course', 380.00, 'Cottage cheese in thick spinach gravy.',               '/placeholder.svg', false),
  ('d1', 'Mango Lassi',           'Drinks',      120.00, 'Refreshing yogurt-based mango drink.',                 '/placeholder.svg', false),
  ('d2', 'Cold Coffee',           'Drinks',      150.00, 'Chilled coffee blended with vanilla ice cream.',       '/placeholder.svg', false),
  ('d3', 'Fresh Lime Soda',       'Drinks',       90.00, 'Sparkling water with fresh lime juice.',               '/placeholder.svg', false),
  ('d4', 'Masala Chai',           'Drinks',       60.00, 'Spiced Indian tea brewed with milk.',                  '/placeholder.svg', false)
on conflict (id) do nothing;
