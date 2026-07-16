import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, nowIso } from './sqlite.js';
import { migrate } from './migrate.js';
import { toPaise } from '../lib/money.js';
import { buildHaveliMenu } from '../../scripts/build-haveli-menu-seed.mjs';

const USERS = [
  ['u_waiter_1', 'waiter', 'W001', 'waiter1', 'Waiter One', '9876543201', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'],
  ['u_waiter_2', 'waiter', 'W002', 'waiter2', 'Waiter Two', '9876543205', 'f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75'],
  ['u_kitchen_supervisor_1', 'kitchen_supervisor', 'K001', 'ksup1', 'Kitchen Supervisor One', '9876543203', '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05'],
  ['u_manager_1', 'manager', 'M001', 'mgr1', 'Manager One', '9876543204', 'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3'],
  // Owner PIN 1357 — same /manager UI as manager; can create manager accounts.
  ['u_owner_1', 'owner', 'O001', 'owner1', 'Owner One', '9876543200', 'f3e055913a0b1eb0f07317896f9a1bc466b9a50db85a7f882f3ffde9ffb23aca'],
];

export function seedDemo() {
  migrate();
  const db = getDb();
  const now = nowIso();

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, role, code, username, name, phone, pin_hash, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  for (const u of USERS) {
    insertUser.run(...u, now, now);
  }

  const insertTable = db.prepare(`
    INSERT OR IGNORE INTO restaurant_tables (id, table_number, status, current_session_id, updated_at)
    VALUES (?, ?, 'available', NULL, ?)
  `);
  for (let n = 1; n <= 20; n++) {
    insertTable.run(`T${n}`, n, now);
  }

  const { categories, items } = buildHaveliMenu();
  const insertCat = db.prepare(
    'INSERT OR IGNORE INTO categories (id, name, display_order, icon) VALUES (?, ?, ?, ?)'
  );
  for (const c of categories) insertCat.run(c.id, c.name, c.displayOrder, '');

  const insertMenu = db.prepare(`
    INSERT OR IGNORE INTO menu_items
    (id, name, category, category_id, price_paise, description, image_url, is_vegetarian, out_of_stock, updated_at)
    VALUES (?, ?, ?, ?, ?, '', ?, 1, 0, ?)
  `);
  for (const item of items) {
    insertMenu.run(
      item.id,
      item.name,
      item.category,
      item.categoryId,
      toPaise(item.price),
      item.image,
      now
    );
  }

  console.log(
    `Seeded demo users, 20 tables, ${categories.length} categories, ${items.length} menu items.`
  );
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  seedDemo();
}
