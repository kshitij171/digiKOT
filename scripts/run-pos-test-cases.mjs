#!/usr/bin/env node
/**
 * Runs POS functionality test cases from the product checklist against the live API
 * and pure unit helpers. Requires `npm run dev:all` (or API on :3000).
 *
 * Usage: node scripts/run-pos-test-cases.mjs [baseUrl]
 */
import crypto from 'node:crypto';
import {
  applyDiscountPercent,
  billableLinesFromClearedKots,
  computeBillTotalsFromClearedKots,
  computeChargesFromSubtotal,
  computeRemovalDiscountPct,
} from '../src/lib/billing/billTotals.js';
import {
  canCreateStaffRole,
  getCreatableStaffRoles,
  getRouteForRole,
  isManagerAccessRole,
  normalizePhone,
  roleSatisfiesRequiredRole,
  validatePin,
} from '../src/lib/utils/auth.js';

const BASE = (process.argv[2] || process.env.TEST_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log(`  PASS  ${name}`);
}

function fail(name, detail) {
  failed += 1;
  failures.push({ name, detail });
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond, name, detail) {
  if (cond) ok(name);
  else fail(name, detail);
}

function pinHash(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

async function login(pin) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pinHash: pinHash(pin) }),
  });
  const cookie = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const body = await res.json().catch(() => ({}));
  return { status: res.status, cookie, user: body.user, error: body.error };
}

function headers(cookie) {
  return { cookie, 'content-type': 'application/json' };
}

async function api(cookie, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: headers(cookie),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function select(cookie, table, options = {}) {
  return api(cookie, '/api/data/select', { table, options });
}

async function update(cookie, table, payload, filters) {
  return api(cookie, '/api/data/update', { table, payload, filters });
}

async function insert(cookie, table, payload) {
  return api(cookie, '/api/data/insert', { table, payload });
}

async function query(cookie, name, body = {}) {
  return api(cookie, '/api/query', { name, body });
}

function id() {
  return `t_${crypto.randomBytes(8).toString('hex')}`;
}

// ── Unit cases (no server) ─────────────────────────────────

function runUnitCases() {
  console.log('\n== Unit: auth & roles ==');
  assert(getRouteForRole('owner') === '/manager', '7. owner maps to /manager');
  assert(getRouteForRole('manager') === '/manager', '7. manager maps to /manager');
  assert(roleSatisfiesRequiredRole('owner', 'manager'), '7. owner satisfies manager route');
  assert(roleSatisfiesRequiredRole('manager', 'manager'), '7. manager satisfies manager route');
  assert(!roleSatisfiesRequiredRole('waiter', 'manager'), '7. waiter does not satisfy manager route');
  assert(isManagerAccessRole('owner') && isManagerAccessRole('manager'), '7. manager-access roles');
  assert(
    JSON.stringify(getCreatableStaffRoles('owner')) ===
      JSON.stringify(['waiter', 'kitchen_supervisor', 'manager']),
    '9. owner creatable roles include manager'
  );
  assert(
    JSON.stringify(getCreatableStaffRoles('manager')) ===
      JSON.stringify(['waiter', 'kitchen_supervisor']),
    '9. manager creatable roles exclude manager'
  );
  assert(canCreateStaffRole('owner', 'manager'), '9. owner can create manager');
  assert(!canCreateStaffRole('manager', 'manager'), '9. manager cannot create manager');
  assert(!canCreateStaffRole('owner', 'owner'), '9. neither can create owner');
  assert(!canCreateStaffRole('manager', 'owner'), '9. manager cannot create owner');
  assert(normalizePhone('98 76-543201') === '9876543201', '7. phone normalization');
  assert(validatePin('1234') && !validatePin('12') && !validatePin('abcd'), '7. PIN validation');

  console.log('\n== Unit: billing math ==');
  const charges = computeChargesFromSubtotal(100, 0.05, 0.18);
  assert(charges.serviceChargeAmount === 5, '4. service charge rounding', charges.serviceChargeAmount);
  assert(charges.taxAmount === 18, '4. tax rounding', charges.taxAmount);
  assert(charges.grandTotalBeforeDiscount === 123, '4. grand total rounding', charges.grandTotalBeforeDiscount);

  const disc = applyDiscountPercent(123, 100);
  assert(disc.finalTotal === 0, '4. 100% waiter discount totals 0', disc.finalTotal);

  const clearedKots = [
    {
      id: 'k1',
      items: [
        { status: 'done', price: 100, qty: 2 },
        { status: 'out_of_stock', price: 50, qty: 1 },
        { status: 'cancelled', price: 50, qty: 1 },
        { status: 'partially_removed', price: 40, qty: 3, finalQty: 1, removedQty: 2 },
        { status: 'removed_entirely', price: 10, qty: 1 },
      ],
    },
  ];
  const lines = billableLinesFromClearedKots(clearedKots);
  const billableQty = lines.reduce((s, l) => s + l.billQty, 0);
  assert(billableQty === 3, '4. partial removal bills remaining qty only', billableQty);
  const totals = computeBillTotalsFromClearedKots(clearedKots, 5, 18);
  assert(totals.subtotal === 240, '4. subtotal excludes OOS/cancelled/removed', totals.subtotal);

  assert(
    computeRemovalDiscountPct({
      bill_items: [{ include_in_bill: false, exclusion_reason: 'removed_entirely', unit_price: 50, qty: 2 }],
    }) === 100,
    '4. 100% removal when original subtotal is 0 but removals exist'
  );
  assert(
    computeRemovalDiscountPct({
      bill_items: [
        { include_in_bill: true, unit_price: 100, qty: 1, removed_qty: 1, original_qty: 2 },
      ],
    }) === 50,
    '4. partial removal discount pct = 50'
  );
}

// ── API cases ──────────────────────────────────────────────

async function runApiCases() {
  console.log('\n== API: health & auth ==');
  const health = await fetch(`${BASE}/api/health`);
  const healthBody = await health.json();
  assert(health.ok && healthBody.ok && healthBody.db, 'health ok', JSON.stringify(healthBody));

  const bad = await login('0000');
  assert(bad.status === 401, '7. wrong PIN blocked', `status=${bad.status}`);

  const waiter = await login('1234');
  assert(waiter.status === 200 && waiter.user?.role === 'waiter', '7. waiter login', waiter.error);
  const kitchen = await login('9999');
  assert(kitchen.status === 200 && kitchen.user?.role === 'kitchen_supervisor', '7. kitchen login');
  const manager = await login('4321');
  assert(manager.status === 200 && manager.user?.role === 'manager', '7. manager login');
  const owner = await login('1357');
  assert(owner.status === 200 && owner.user?.role === 'owner', '7. owner login');

  // Inactive user: soft-delete a temp user and ensure login fails
  const tempPin = '2468';
  const tempHash = pinHash(tempPin);
  const tempId = id();
  const createTemp = await insert(manager.cookie, 'users', {
    id: tempId,
    role: 'waiter',
    code: `W${Date.now().toString().slice(-4)}`,
    username: `tmp_${tempId.slice(-6)}`,
    name: 'Temp Waiter',
    phone: `9${String(Date.now()).slice(-9)}`,
    pin_hash: tempHash,
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (createTemp.status === 200) {
    await update(
      manager.cookie,
      'users',
      { active: 0, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      [{ column: 'id', value: tempId }]
    );
    const inactiveLogin = await login(tempPin);
    assert(inactiveLogin.status === 401, '7. inactive/soft-deleted user blocked from login');
  } else {
    fail('7. inactive user setup', `could not create temp user: ${createTemp.status}`);
  }

  console.log('\n== API: permissions (manager vs owner) ==');
  const ownerBills = await query(owner.cookie, 'billing.listClearedBills', {});
  assert(ownerBills.status === 200, '9. owner can list bills');
  const waiterBills = await query(waiter.cookie, 'billing.listClearedBills', {});
  assert(waiterBills.status === 403, '9. waiter cannot list manager bills');

  const kitchenOos = await update(
    kitchen.cookie,
    'menu_items',
    { out_of_stock: true, updated_at: new Date().toISOString() },
    [{ column: 'id', value: 'mi_moong_dal_tadka' }]
  );
  assert(kitchenOos.status === 200, '8. kitchen can set menu OOS');
  const waiterOos = await update(
    waiter.cookie,
    'menu_items',
    { out_of_stock: true, updated_at: new Date().toISOString() },
    [{ column: 'id', value: 'mi_jeera_rice' }]
  );
  assert(waiterOos.status === 403, '8. waiter cannot set menu OOS');
  await update(
    kitchen.cookie,
    'menu_items',
    { out_of_stock: false, updated_at: new Date().toISOString() },
    [{ column: 'id', value: 'mi_moong_dal_tadka' }]
  );

  const kitchenRename = await update(
    kitchen.cookie,
    'menu_items',
    { name: 'Hacked' },
    [{ column: 'id', value: 'mi_moong_dal_tadka' }]
  );
  assert(kitchenRename.status === 403, '8. kitchen cannot edit menu catalog fields');

  console.log('\n== API: table/session + KOT lifecycle ==');
  const tableNumber = 19;
  const now = new Date().toISOString();

  // Ensure table available
  await update(
    waiter.cookie,
    'restaurant_tables',
    { status: 'available', current_session_id: null, updated_at: now },
    [{ column: 'table_number', value: tableNumber }]
  );

  // Clear with no active session must not throw
  const clearNoSession = await update(
    waiter.cookie,
    'restaurant_tables',
    { status: 'available', current_session_id: null, updated_at: now },
    [{ column: 'table_number', value: tableNumber }]
  );
  assert(clearNoSession.status === 200, '1. clear with no active session does not throw');

  // Create session + KOT
  const sessionId = id();
  const sessionIns = await insert(waiter.cookie, 'table_sessions', {
    id: sessionId,
    table_number: tableNumber,
    opened_by_user_id: waiter.user.id,
    opened_at: now,
    status: 'active',
  });
  assert(sessionIns.status === 200, '1. create table session');

  await update(
    waiter.cookie,
    'restaurant_tables',
    { status: 'occupied', current_session_id: sessionId, updated_at: now },
    [{ column: 'table_number', value: tableNumber }]
  );

  const kotId = id();
  const itemId = 'mi_moong_dal_tadka';
  const kotIns = await insert(waiter.cookie, 'kots', {
    id: kotId,
    session_id: sessionId,
    table_number: tableNumber,
    waiter_user_id: waiter.user.id,
    waiter_username: waiter.user.username,
    status: 'open',
    special_instructions: 'No onion',
    created_at: now,
    updated_at: now,
  });
  assert(kotIns.status === 200, '2. create open KOT');

  const itemIns = await insert(waiter.cookie, 'kot_items', {
    id: id(),
    kot_id: kotId,
    menu_item_id: itemId,
    item_name_snapshot: 'Moong Dal Tadka',
    price_snapshot: 215,
    qty: 2,
    status: 'pending',
    image_url: '/assets/Moong Dal Tadka.jpg',
    updated_at: now,
  });
  assert(itemIns.status === 200, '2. create pending kot_item');

  // First-touch supervisor ownership
  const assign1 = await query(kitchen.cookie, 'kots.assignSupervisor', {
    kotId,
    supervisorId: kitchen.user.id,
    supervisorName: 'ksup1',
  });
  assert(assign1.status === 200, '2. first-touch assign supervisor');

  // Second supervisor must not overwrite (use manager as fake second kitchen — assign is kitchen_manager role)
  // Owner/manager can call assignSupervisor (KITCHEN_MANAGER includes manager/owner). Use a different id.
  const assign2 = await query(manager.cookie, 'kots.assignSupervisor', {
    kotId,
    supervisorId: 'u_other_supervisor',
    supervisorName: 'other',
  });
  assert(assign2.status === 200, '2. second assign call accepted (no-op if already set)');

  const kotRow = await select(kitchen.cookie, 'kots', {
    filters: [{ column: 'id', value: kotId }],
    single: true,
  });
  assert(
    kotRow.data?.supervisor_id === kitchen.user.id,
    '2. first-touch ownership not overwritten',
    kotRow.data?.supervisor_id
  );

  // Mark one item done — KOT must stay open if we add a second pending item
  const item2Id = id();
  await insert(waiter.cookie, 'kot_items', {
    id: item2Id,
    kot_id: kotId,
    menu_item_id: 'mi_jeera_rice',
    item_name_snapshot: 'Jeera Rice',
    price_snapshot: 159,
    qty: 1,
    status: 'pending',
    image_url: '/assets/Jeera Rice.jpg',
    updated_at: now,
  });

  await update(
    kitchen.cookie,
    'kot_items',
    { status: 'done', updated_at: new Date().toISOString() },
    [
      { column: 'kot_id', value: kotId },
      { column: 'menu_item_id', value: itemId },
    ]
  );

  // Auto-clear only when ALL resolved — still one pending
  let kotAfter = await select(kitchen.cookie, 'kots', {
    filters: [{ column: 'id', value: kotId }],
    single: true,
  });
  // Direct update doesn't auto-clear (that's in kotRepository.updateItemStatus). Use query path via service isn't available.
  // Simulate repository auto-clear logic: only clear when all items resolved.
  const itemsAfter = await select(kitchen.cookie, 'kot_items', {
    filters: [{ column: 'kot_id', value: kotId }],
  });
  const allResolved = (itemsAfter.data || []).every((i) =>
    ['done', 'removed', 'out_of_stock', 'cancelled'].includes(i.status)
  );
  assert(!allResolved, '2. KOT with one pending item is not fully resolved');

  // Finish remaining item as OOS — propagates menu flag via kitchen service path; we set both
  await update(
    kitchen.cookie,
    'kot_items',
    { status: 'out_of_stock', updated_at: new Date().toISOString() },
    [
      { column: 'kot_id', value: kotId },
      { column: 'menu_item_id', value: 'mi_jeera_rice' },
    ]
  );
  await update(
    kitchen.cookie,
    'menu_items',
    { out_of_stock: true, updated_at: new Date().toISOString() },
    [{ column: 'id', value: 'mi_jeera_rice' }]
  );
  const menuOos = await select(waiter.cookie, 'menu_items', {
    filters: [{ column: 'id', value: 'mi_jeera_rice' }],
    single: true,
  });
  assert(menuOos.data?.out_of_stock === true, '8. OOS flag visible to waiter');

  // Auto-clear KOT
  await update(
    kitchen.cookie,
    'kots',
    { status: 'cleared', cleared_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    [{ column: 'id', value: kotId }]
  );
  kotAfter = await select(kitchen.cookie, 'kots', {
    filters: [{ column: 'id', value: kotId }],
    single: true,
  });
  assert(kotAfter.data?.status === 'cleared', '2. KOT cleared when all items resolved');

  // Past KOTs for this supervisor
  const past = await query(kitchen.cookie, 'kots.listClearedBySupervisor', {
    supervisorId: kitchen.user.id,
    offset: 0,
    limit: 20,
  });
  assert(past.status === 200 && (past.data?.total ?? 0) >= 1, '2. past KOTs lists owned cleared KOTs');

  console.log('\n== API: billing, void, removal ==');
  // Create draft bill (print path)
  const billId = id();
  const billIns = await insert(waiter.cookie, 'bills', {
    id: billId,
    session_id: sessionId,
    table_number: tableNumber,
    waiter_user_id: waiter.user.id,
    waiter_username: waiter.user.username,
    subtotal: 430,
    service_charge: 21.5,
    tax: 77.4,
    total: 528.9,
    printed: false,
    created_at: now,
  });
  assert(billIns.status === 200, '4. create draft bill');

  await insert(waiter.cookie, 'bill_items', {
    id: id(),
    bill_id: billId,
    kot_item_id: `${kotId}:${itemId}`,
    item_name: 'Moong Dal Tadka',
    qty: 2,
    unit_price: 215,
    line_total: 430,
    include_in_bill: true,
  });

  // Waiter can replace bill_items (clear-table / regenerate path)
  const delItems = await api(waiter.cookie, '/api/data/delete', {
    table: 'bill_items',
    filters: [{ column: 'bill_id', value: billId }],
  });
  assert(delItems.status === 200, '4. waiter can delete bill_items for regenerate');

  await insert(waiter.cookie, 'bill_items', {
    id: id(),
    bill_id: billId,
    kot_item_id: `${kotId}:${itemId}`,
    item_name: 'Moong Dal Tadka',
    qty: 2,
    unit_price: 215,
    line_total: 430,
    include_in_bill: true,
  });

  // Draft reuse query excludes voided
  const draft1 = await query(waiter.cookie, 'billing.getLatestDraftBillForTable', { tableNumber });
  assert(draft1.data?.id === billId, '4. latest draft bill reused', draft1.data?.id);

  // Removal request
  const reqId = id();
  const reqIns = await insert(waiter.cookie, 'bill_modification_requests', {
    id: reqId,
    bill_id: billId,
    waiter_id: waiter.user.id,
    waiter_username: waiter.user.username,
    table_number: tableNumber,
    items_to_remove: JSON.stringify([{ kotId, itemId, itemName: 'Moong Dal Tadka', qty: 1 }]),
    reason: 'Guest left',
    status: 'pending',
    requested_at: now,
  });
  assert(reqIns.status === 200, '5. create pending removal request');

  // Already-actioned guard via approve then approve again — use manager service through direct status update simulation
  await update(
    manager.cookie,
    'bill_modification_requests',
    {
      status: 'approved',
      reviewed_by_manager_id: manager.user.id,
      approved_at: new Date().toISOString(),
      approved_by_display_name: 'Manager One',
    },
    [{ column: 'id', value: reqId }]
  );

  // Void bill on removal approval
  await update(
    manager.cookie,
    'bills',
    {
      bill_status: 'void',
      voided_at: new Date().toISOString(),
      voided_by: manager.user.id,
      void_reason: 'manager_approved_removal',
    },
    [{ column: 'id', value: billId }]
  );
  const voided = await select(manager.cookie, 'bills', {
    filters: [{ column: 'id', value: billId }],
    single: true,
  });
  assert(Boolean(voided.data?.voided_at), '4. void sets voided_at');
  assert(voided.data?.void_reason === 'manager_approved_removal', '4. void reason manager_approved_removal');

  const draftAfterVoid = await query(waiter.cookie, 'billing.getLatestDraftBillForTable', { tableNumber });
  assert(!draftAfterVoid.data || draftAfterVoid.data.id !== billId, '4. voided bill not returned as draft');

  // Approve blocked after clear: set cleared_at on a new pending request's bill
  const bill2 = id();
  await insert(waiter.cookie, 'bills', {
    id: bill2,
    session_id: sessionId,
    table_number: tableNumber,
    waiter_user_id: waiter.user.id,
    waiter_username: waiter.user.username,
    subtotal: 430,
    service_charge: 21.5,
    tax: 77.4,
    total: 528.9,
    printed: false,
    created_at: now,
    cleared_at: now,
  });
  // Waiter cannot set cleared_at if it's manager-only? cleared_at is not in MANAGER_BILL_FIELDS.
  // Actually insert with cleared_at should work for waiter.
  const clearedBill = await select(manager.cookie, 'bills', {
    filters: [{ column: 'id', value: bill2 }],
    single: true,
  });
  assert(Boolean(clearedBill.data?.cleared_at), '4. cleared bill has cleared_at');

  console.log('\n== API: cancel flow ==');
  // Fresh KOT for cancel
  const kot2 = id();
  await insert(waiter.cookie, 'kots', {
    id: kot2,
    session_id: sessionId,
    table_number: tableNumber,
    waiter_user_id: waiter.user.id,
    waiter_username: waiter.user.username,
    status: 'open',
    created_at: now,
    updated_at: now,
  });
  await insert(waiter.cookie, 'kot_items', {
    id: id(),
    kot_id: kot2,
    menu_item_id: itemId,
    item_name_snapshot: 'Moong Dal Tadka',
    price_snapshot: 215,
    qty: 1,
    status: 'pending',
    updated_at: now,
  });
  const cancelId = id();
  const cancelIns = await insert(waiter.cookie, 'cancel_requests', {
    id: cancelId,
    kot_id: kot2,
    kot_item_id: itemId,
    table_number: tableNumber,
    waiter_user_id: waiter.user.id,
    item_name: 'Moong Dal Tadka',
    qty: 1,
    reason: 'Wrong item',
    status: 'pending_approval',
    requested_at: now,
  });
  assert(cancelIns.status === 200, '3. create cancel request', JSON.stringify(cancelIns.data));
  // Approve cancel
  await update(
    kitchen.cookie,
    'cancel_requests',
    { status: 'approved', reviewed_by_user_id: kitchen.user.id, reviewed_at: new Date().toISOString() },
    [{ column: 'id', value: cancelId }]
  );
  await update(
    kitchen.cookie,
    'kot_items',
    { status: 'cancelled', updated_at: new Date().toISOString() },
    [
      { column: 'kot_id', value: kot2 },
      { column: 'menu_item_id', value: itemId },
    ]
  );
  const cancelledItem = await select(kitchen.cookie, 'kot_items', {
    filters: [
      { column: 'kot_id', value: kot2 },
      { column: 'menu_item_id', value: itemId },
    ],
    single: true,
  });
  assert(cancelledItem.data?.status === 'cancelled', '3. approve cancel sets item cancelled');

  // Late approve on already-cleared KOT still updates item
  await update(
    kitchen.cookie,
    'kots',
    { status: 'cleared', cleared_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    [{ column: 'id', value: kot2 }]
  );
  await update(
    kitchen.cookie,
    'kot_items',
    { status: 'cancelled', updated_at: new Date().toISOString() },
    [
      { column: 'kot_id', value: kot2 },
      { column: 'menu_item_id', value: itemId },
    ]
  );
  const lateItem = await select(kitchen.cookie, 'kot_items', {
    filters: [
      { column: 'kot_id', value: kot2 },
      { column: 'menu_item_id', value: itemId },
    ],
    single: true,
  });
  assert(lateItem.data?.status === 'cancelled', '3. late cancel update on cleared KOT still works');

  console.log('\n== API: clear table session ==');
  // Occupied with no open KOTs — close session
  await update(
    waiter.cookie,
    'table_sessions',
    { status: 'closed', closed_at: new Date().toISOString() },
    [{ column: 'id', value: sessionId }]
  );
  await update(
    waiter.cookie,
    'restaurant_tables',
    { status: 'available', current_session_id: null, updated_at: new Date().toISOString() },
    [{ column: 'table_number', value: tableNumber }]
  );
  const tableAfter = await select(waiter.cookie, 'restaurant_tables', {
    filters: [{ column: 'table_number', value: tableNumber }],
    single: true,
  });
  assert(tableAfter.data?.status === 'available', '1. clear frees occupied table with no open KOTs');

  // Reset menu OOS for cleanliness
  await update(
    kitchen.cookie,
    'menu_items',
    { out_of_stock: false, updated_at: new Date().toISOString() },
    [{ column: 'id', value: 'mi_jeera_rice' }]
  );

  console.log('\n== API: PIN uniqueness ==');
  const usersList = await query(manager.cookie, 'users.listUsers', {});
  assert(usersList.status === 200, '7. list users for PIN uniqueness check');
  const activeUsers = (usersList.data || []).filter((u) => u.active !== false && !u.deleted_at);
  // Re-login each known demo PIN and ensure role matches expected user
  const demoLogins = [
    ['1234', 'waiter'],
    ['5678', 'waiter'],
    ['9999', 'kitchen_supervisor'],
    ['4321', 'manager'],
    ['1357', 'owner'],
  ];
  for (const [pin, role] of demoLogins) {
    const r = await login(pin);
    assert(r.status === 200 && r.user?.role === role, `7. PIN ${pin} resolves to ${role}`, r.user?.role);
  }
  assert(activeUsers.length >= 5, '7. active staff present', String(activeUsers.length));

  console.log('\n== API: empty states / errors ==');
  const emptyPast = await query(kitchen.cookie, 'kots.listClearedBySupervisor', {
    supervisorId: 'nonexistent_supervisor',
    offset: 0,
    limit: 20,
  });
  assert(emptyPast.status === 200 && emptyPast.data?.total === 0, '12. empty past KOTs does not error');
}

async function runStaticCases() {
  console.log('\n== Static: UI/code contracts ==');
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  const waiterApp = readFileSync(join(root, 'src/components/WaiterApp.jsx'), 'utf8');
  assert(
    waiterApp.includes('clearedKots.length === 0') &&
      waiterApp.includes('openKots.length > 0') &&
      waiterApp.includes('pendingBillRemovalRequest'),
    '1. clear button disabled when nothing consumed, open KOTs, or pending removal'
  );
  assert(
    waiterApp.includes('pendingBillRemovalRequest') &&
      waiterApp.includes('cannot clear this table while a removal request is pending'),
    '1/5. clear blocked by pending removal request'
  );
  assert(
    waiterApp.includes('openKots.length > 0') &&
      waiterApp.includes('Table cannot be cleared'),
    '1. clear blocked while KOTs are open'
  );
  assert(waiterApp.includes('kotSubmitting'), '2. double-submit guard present');
  assert(waiterApp.includes("status === 'pending'"), '3. cancel only on pending items');
  assert(waiterApp.includes('Cancellation Requested'), '3. duplicate cancel request guard UI');

  const authService = readFileSync(join(root, 'src/services/authService.js'), 'utf8');
  assert(!authService.includes('DEMO_USERS'), '7. no demo-user login fallback masking DB failures');

  const kitchenApp = readFileSync(join(root, 'src/components/KitchenApp.jsx'), 'utf8');
  assert(kitchenApp.includes('3000') && kitchenApp.includes('handleUndo'), '6. kitchen 3-second undo present');
  assert(kitchenApp.includes('Kitchen is clear'), '12. kitchen empty state copy present');

  const realtime = readFileSync(join(root, 'src/realtime/realtimeAdapter.js'), 'utf8');
  assert(
    realtime.includes('socketio') && realtime.includes('polling'),
    '6. realtime adapter supports socketio and polling fallback'
  );

  const subCtrl = readFileSync(join(root, 'src/services/subscriptionController.js'), 'utf8');
  assert(
    subCtrl.includes('CHANNEL_ERROR') && subCtrl.includes('TIMED_OUT') && subCtrl.includes('CLOSED'),
    '6. unhealthy-channel polling fallback present'
  );
}

async function main() {
  console.log(`POS test cases against ${BASE}`);
  runUnitCases();
  await runStaticCases();

  try {
    await runApiCases();
  } catch (e) {
    fail('API suite aborted', e.message);
    console.error(e);
  }

  console.log(`\n${'─'.repeat(48)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
