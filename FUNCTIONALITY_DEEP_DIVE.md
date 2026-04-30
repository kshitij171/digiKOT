# KOT System Functional Deep Dive

## Purpose of this document
This document explains the full functional behavior of the current system in business terms:
- what each part of the product does
- which screen/area handles it
- how data moves across roles and workflows
- how permissions and lifecycle events behave

This intentionally avoids low-level implementation details and focuses on operational behavior.

---

## 1) System overview

The application is a role-based restaurant operations system with four active staff roles:
- waiter
- captain
- kitchen supervisor
- manager

It supports:
- table-based ordering and KOT flow
- kitchen execution and out-of-stock handling
- cancellation request/approval cycle
- billing and table clearing
- manager-level staff administration
- manager-only PIN reset and staff activation control
- audit and notification visibility

---

## 2) Role model and responsibilities

### Waiter
- Handles table selection and order entry.
- Builds cart items for a table.
- Sends selected items to kitchen as KOT.
- Raises cancellation requests for sent items.
- Generates and prints bill.
- Clears table after closure.

### Captain
- Uses the same operational UI as waiter.
- Functional behavior is currently the same as waiter.
- Role is still stored separately so future permissions can differ.

### Kitchen Supervisor
- Processes live KOTs.
- Marks items as done or out of stock.
- Reviews and approves/rejects cancellation requests.
- Maintains out-of-stock list and item availability.

### Manager
- Manages staff lifecycle (create, list, deactivate/reactivate).
- Resets staff PIN using phone + role.
- Oversees audit activity.
- Can record post-preparation bill adjustment entries.

---

## 3) Login and access behavior

## Single login experience
- One login screen serves all roles.
- User chooses role tab, enters staff code and PIN.
- Login validates role, code, active status, and PIN.

## Role-based destination after login
- waiter -> waiter operations UI
- captain -> waiter operations UI
- kitchen supervisor -> kitchen operations UI
- manager -> manager UI

## Access assumptions
- Users are expected to be active.
- Inactive users are blocked from login.
- PIN reset is manager-controlled workflow only.

---

## 4) Staff identity model

Each staff member is represented with:
- unique staff code
- role
- name
- phone number
- PIN hash
- active/inactive status
- timestamps for creation/update

Phone values are normalized before usage to avoid duplicate identities caused by formatting differences (for example with spaces/dashes).

---

## 5) Staff lifecycle (manager-driven)

## Staff creation
Manager can register new staff using:
- name
- phone
- role
- PIN + confirm PIN

System behavior:
- validates PIN format and match
- normalizes phone
- generates role-specific staff code automatically
- creates active staff account
- records audit entry for staff creation
- returns generated code for operational use at login

## Staff listing
Manager UI shows staff directory with:
- role
- name
- phone
- code
- active/inactive status

## Staff deactivation/reactivation
Instead of deleting users, manager can:
- deactivate user (blocks login)
- reactivate user (restores login eligibility)

This preserves historical references in KOTs, bills, and audit trails.

## Manager PIN reset (staff)
Manager can reset PIN by:
- phone
- role
- new PIN + confirm PIN

System behavior:
- validates manager authority
- validates PIN format/match
- normalizes phone and resolves user identity
- updates PIN hash
- records audit entry

---

## 6) Waiter/Captain ordering flow

## Table selection
- Tables are shown with live availability state.
- User opens a specific table and continues order workflow.

## Menu and cart
- Menu items are shown by category.
- User adds items to a cart.
- Cart is table-scoped and supports quantity updates and item selection.

## Partial KOT sending
- User can select only specific cart items and send those.
- Sent items become kitchen workload.
- Remaining cart items stay available for later send.

## Special instructions
- Optional instructions can be attached when sending a KOT.

## Billing view
- Consumed items are compiled from resolved KOT data.
- Bill computation includes subtotal, service charge, tax, and total.
- Print action records bill and triggers print output.

## Table clearing
- After settlement, table clear action removes resolved operational records and resets table/session state.

---

## 7) Kitchen supervisor flow

## Live order board
- Kitchen sees active KOTs and items pending action.
- KOT freshness and item progress indicators are visible.

## Item execution states
Kitchen can mark item outcomes:
- done
- out of stock

Resolved states are reflected back to waiter-facing views and billing logic.

## Out-of-stock propagation
- Kitchen-level out-of-stock updates affect menu availability.
- Waiter side reflects these changes to prevent unavailable ordering.

## Cancellation request review
- Kitchen receives cancellation requests raised by waiter/captain.
- Request includes item and reason context.
- Kitchen can approve or reject.

Approval effects:
- item state is updated to cancelled
- billing eligibility updates accordingly
- related notifications/audit entries are generated

---

## 8) Cancellation workflow

## Request creation (waiter/captain)
When cancelling a sent item:
- user must provide a reason
- request is submitted for kitchen review

## Review (kitchen supervisor)
- kitchen can approve/reject
- request status transitions accordingly

## Functional outcome
- approved cancellations are excluded from payable outcome
- reason and review path remain traceable

---

## 9) Billing and adjustment behavior

## Standard bill generation
- Bill is generated from eligible consumed items.
- Exclusion scenarios (such as out-of-stock/cancelled) are respected.
- Bill records retain source context for transparency.

## Post-preparation bill adjustment entry
- Manager can record exceptional adjustment cases.
- This is for rare policy/operational overrides after preparation.
- Mandatory reason enforces accountability.
- Entry becomes part of audit visibility.

---

## 10) Notifications

Notification functionality provides role-targeted event visibility, including kitchen-driven outcomes and review decisions.

Current behavior supports operational notification flow and testing visibility, with architecture allowing future expansion (for example external device alerts).

---

## 11) Audit and traceability

Audit log records sensitive and business-critical actions, including:
- staff created
- staff PIN reset
- staff deactivated
- staff reactivated
- additional operational exception events

Each record links action, actor, target, and timestamp context for managerial review.

---

## 12) Data consistency and safety conventions

## Identity safety
- staff code uniqueness
- phone uniqueness
- role-controlled login

## Credential safety
- PIN rules enforced at input level (4-6 digits, confirm match where required)
- PIN stored as hash rather than plain value

## Operational continuity
- users are deactivated/reactivated, not deleted
- history remains intact for compliance and analysis

---

## 13) Performance behavior

The app uses realtime-first update flow for responsiveness:
- initial data load
- realtime-triggered refresh
- fallback polling only during unhealthy realtime connection
- reconnect recovery refresh to avoid stale UI

This design balances speed with resilience in restaurant environments.

---

## 14) Current manager UI functional blocks

Manager interface currently contains:
- Staff Management section
  - Add Staff
  - Staff List
  - Reset PIN
  - Deactivate/Reactivate controls
- Post-Preparation Bill Adjustment entry section
- Audit feed section for activity review

---

## 15) Typical day-in-operation sequence

1. Manager creates/maintains staff accounts.
2. Waiter/Captain logs in and starts table service.
3. Items are sent in one or multiple KOT batches.
4. Kitchen processes items and updates readiness/out-of-stock.
5. Waiter/captain handles guest communication and any cancel requests.
6. Kitchen reviews cancellations.
7. Waiter/captain generates final bill.
8. Table is cleared.
9. Manager reviews audit trail for exceptions and staff actions.

---

## 16) What is intentionally restricted

- PIN reset is not available on public/home login flow.
- Staff lifecycle operations are manager-only.
- Staff history is preserved by status toggling rather than deletion.

---

## 17) Future-ready areas (functional perspective)

The current design keeps room for:
- differentiated captain permissions
- stronger verification for PIN reset (for example OTP)
- richer manager analytics/reporting
- expanded notification channels
- policy-level role refinement without changing core workflows

