# API contract matrix (repository → server endpoint)

Auth uses **HTTP-only cookie** (`digikot_session`). Socket.IO verifies the same cookie on connect.

## Auth

| Client | Server endpoint |
|--------|-----------------|
| `authService.loginWithPinHash` | `POST /api/auth/login` `{ pinHash }` |
| `AuthContext.logoutUser` | `POST /api/auth/logout` |
| — | `GET /api/auth/me` |

## Generic CRUD (via `dbAdapter` → `apiClient`)

| dbAdapter method | Server endpoint |
|------------------|-----------------|
| `select(table, options)` | `POST /api/data/select` |
| `insert(table, payload)` | `POST /api/data/insert` |
| `update(table, payload, filters)` | `POST /api/data/update` |
| `delete(table, filters)` | `POST /api/data/delete` |

All require authenticated session except login/health/setup.

## Complex queries (`apiClient.query`)

| Repository method | Query name |
|-------------------|------------|
| `billingRepository.listClearedBills` | `billing.listClearedBills` |
| `billingRepository.getLatestDraftBillForTable` | `billing.getLatestDraftBillForTable` |
| `billingRepository.getLatestClearedBillForTable` | `billing.getLatestClearedBillForTable` |
| `billingRepository.listVoidBills` | `billing.listVoidBills` |
| `billingRepository.listResettledBills` | `billing.listResettledBills` |
| `billingRepository.listHighDiscountBills` | `billing.listHighDiscountBills` |
| `userRepository.listUsers` | `users.listUsers` |
| `userRepository.findByUsernameAdmin` | `users.findByUsernameAdmin` |
| `userRepository.updatePinByUserId` | `users.updatePinByUserId` |
| `userRepository.codeExists` | `users.codeExists` |
| `userRepository.listAllPinHashes` | `users.listAllPinHashes` |
| `kotRepository.listClearedBySupervisor` | `kots.listClearedBySupervisor` |
| `kotRepository.listCancelled` | `kots.listCancelled` |
| `kotRepository.assignSupervisor` | `kots.assignSupervisor` |
| `billModificationRepository.listForManager` | `billMod.listForManager` |

## Realtime

| Before (Supabase) | After (Socket.IO) |
|-------------------|-------------------|
| `supabaseRealtimeAdapter` | `socketIoRealtimeAdapter` |
| `postgres_changes` on tables | Domain events + resync on connect |
| Fallback | `VITE_REALTIME_MODE=polling` |

## MQTT / pager

| Before | After |
|--------|-------|
| Mosquitto Docker :1883 | aedes embedded in Node |
| `pager-bridge` poll → publish | `notifications.mqtt_publish_status` worker |
| Topics | `kot/pager/{code}/notify` / `status` (unchanged) |

## Setup (still via Vite plugin in dev)

| Endpoint | Notes |
|----------|-------|
| `/api/setup/*` | Vite plugin; uses `pagerProvisionDb.js` → SQLite |

Future: merge setup routes into Fastify.
