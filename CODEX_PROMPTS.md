# Codex Prompt Pack: Restaurant System

How to use:
1. Put `AGENTS.md` (Section A) in the repo root. Codex reads it on every task, so the plan never drifts.
2. Run the Phase 0 prompt (Section B) once to scaffold the layout.
3. Run Feature prompts (Section C) ONE AT A TIME, in order. Review, test and commit after each before starting the next.
4. Never paste two feature prompts together.

---

## A. AGENTS.md (the locked plan: copy into repo root)

```md
# Restaurant Management System: Locked Project Rules

## Fixed decisions (DO NOT change or suggest alternatives)
- Monorepo with npm workspaces: apps/web, apps/api, packages/shared
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Node.js + Express + TypeScript (separate API on port 4000)
- Real-time: Socket.IO on the Express server
- Database: PostgreSQL (Neon) with Prisma ORM. Schema is in apps/api/prisma/schema.prisma. Do not rename models or fields; only add what a feature needs, via a migration.
- Validation: Zod schemas live in packages/shared and are used by BOTH web and api
- Auth: JWT in httpOnly cookie, role-based access (CUSTOMER, WAITER, CHEF, CASHIER, MANAGER, ADMIN)
- Payments: Razorpay (test mode), verified and idempotent webhooks
- State/data fetching on web: TanStack Query + Zustand (cart only)
- Currency INR. Money is Prisma Decimal on the server and sent as strings; never use floats for money.

## Business rules
- The server calculates all prices, tax and totals. The client never sends prices.
- Order creation, order items and stock deduction happen in ONE Prisma transaction.
- OrderItem stores price and tax snapshots at order time.
- Table QR URL format: /t/[qrToken]
- Socket rooms: "kitchen", "waiters", "table:<tableId>", "order:<orderId>", "admin"
- Socket events: order:new, order:status_changed, item:status_changed, waiter:called, bill:requested, menu:availability_changed

## Folder conventions
- apps/api/src/{routes,controllers,services,middleware,sockets,lib,utils}
- apps/web/src/{app,components,features,hooks,lib,store}
- Group web code by feature (features/menu, features/orders, features/kitchen, ...)
- Routes -> controllers -> services -> Prisma. No Prisma calls inside route files.

## Code rules
- TypeScript strict mode. No `any`.
- Every API input validated with a Zod schema from packages/shared.
- Consistent API response: { success: boolean, data?: T, error?: { code, message } }
- Environment variables only via a validated env module. Never hard-code secrets.
- Mobile-first UI. Loading, empty and error states on every screen.
- Write small, reviewable changes. Do only the task requested; do not refactor unrelated code or add unrequested features.
- After each task: run typecheck and lint, and tell me how to test it manually.

## Out of scope until told otherwise
Multi-restaurant support, WhatsApp, AI features, inventory reports, delivery tracking.
```

---

## B. Phase 0: Scaffold prompt (run once)

```text
Read AGENTS.md first and follow it strictly.

TASK: Create the basic project layout only. No business features yet.

1. Create the npm-workspaces monorepo: apps/web (Next.js App Router, TypeScript, Tailwind, shadcn/ui initialised), apps/api (Express + TypeScript + Socket.IO + Prisma), packages/shared (Zod + shared types, built with tsc).
2. Use the existing Prisma schema at apps/api/prisma/schema.prisma unchanged.
3. API: create the folder structure from AGENTS.md. Add src/server.ts (Express + helmet + cors + cookie-parser + JSON body + Socket.IO), src/app.ts, a validated env module, a global error handler, a standard response helper, and GET /health. Add Socket.IO room-join handling (join/leave events) in src/sockets/.
4. Web: create route skeletons with placeholder pages and a shared layout:
   - /                      landing page
   - /login                 staff login
   - /t/[qrToken]           customer menu (table QR entry)
   - /order/[orderId]       customer live order tracking
   - /waiter                waiter POS
   - /kitchen               kitchen display
   - /cashier               billing
   - /admin                 dashboard (with sub-routes: /admin/menu, /admin/tables, /admin/staff, /admin/reports)
   Add a role-aware app shell (sidebar for staff, simple header for customer). No real data yet.
5. Add apps/web/src/lib/api.ts (fetch wrapper using NEXT_PUBLIC_API_URL, credentials included) and apps/web/src/lib/socket.ts (socket.io-client singleton).
6. Add .env.example files for api and web, root .gitignore, root scripts (dev:web, dev:api, build:shared, typecheck, lint), and a README with setup steps.
7. Do NOT implement auth, menu, orders, or payments yet.

DONE WHEN: `npm run build:shared`, `npm run dev:api`, `npm run dev:web` all run, /health returns { success: true }, every route above renders a placeholder page, and typecheck passes. List the files you created and how I verify it.
```

---

## C. Feature prompts (one at a time, in this order)

### F1. Seed + Auth + Roles
```text
Read AGENTS.md. TASK: Implement authentication and role-based access.
- prisma/seed.ts: 1 user per role (ADMIN, MANAGER, CASHIER, WAITER, CHEF, demo CUSTOMER) with documented demo passwords, 8 categories with ~30 menu items (with veg flag, station, GST, prep time), 10 tables with unique qrTokens, 3 ingredients per item optional skip.
- API: POST /auth/login (phone or email + password), POST /auth/logout, GET /auth/me. bcrypt, JWT in httpOnly cookie, requireAuth and requireRole(...roles) middleware, rate limit on login.
- Zod schemas in packages/shared.
- Web: /login page, auth context/hook, route guards redirecting by role (WAITER -> /waiter, CHEF -> /kitchen, CASHIER -> /cashier, MANAGER/ADMIN -> /admin).
DONE WHEN: I can log in as each seeded role and land on the right page; unauthorized access to another role's page is blocked on both web and API.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F2. Menu management (admin)
```text
Read AGENTS.md. TASK: Menu and category management for ADMIN/MANAGER.
- Add menuRoutes, controller and service. API CRUD: /categories, /menu-items, /menu-items/:id/addons, plus PATCH /menu-items/:id/availability that emits menu:availability_changed. Public GET /menu returns active categories, available items and add-ons.
- Add image URL field only (no upload yet).
- Build /admin/menu for real (currently a placeholder): table, search, filters, create/edit dialogs, availability toggle, add-on editor, optimistic updates and inline validation errors.
- Write an audit log entry on price changes.
DONE WHEN: I can add, edit and delete items, toggle availability, and the change is visible from GET /menu.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F3. Tables + QR codes
```text
Read AGENTS.md. TASK: Table management and QR codes.
- Add tableRoutes. API CRUD for tables (ADMIN/MANAGER), GET /tables/by-token/:qrToken (public) returning table number and status.
- Build /admin/tables (currently a placeholder): table grid, add/edit/delete, a QR code per table encoding {WEB_URL}/t/{qrToken}, "Download QR" and a printable page with all QR codes.
DONE WHEN: scanning or opening a table's URL resolves to that table.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F4. Customer menu + cart
```text
Read AGENTS.md. TASK: Customer-facing menu at /t/[qrToken].
- Delete any hardcoded menuItems array; load GET /menu and resolve the table using GET /tables/by-token/:qrToken (show a friendly invalid-token screen).
- Mobile-first menu: sticky category tabs, search, veg/non-veg filter, item cards with image/price/veg badge, unavailable items greyed out, add-on selection sheet, notes.
- Zustand cart persisted separately per table token, cart drawer with quantity edit, subtotal estimate (display only; server recalculates).
DONE WHEN: I can browse, filter, customise items and manage a cart on a phone-sized screen.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F5. Place order + live tracking
```text
Read AGENTS.md. TASK: Order placement and customer tracking. Deep review this flow.
- Add orderRoutes. API POST /orders (public for dine-in via qrToken): validate with Zod, recompute prices and tax from DB using Prisma Decimal, create Order + items + add-ons, deduct stock and set table OCCUPIED in ONE transaction. Honour idempotencyKey and emit order:new to "kitchen", "waiters", "admin". GET /orders/:id for tracking.
- Web: place-order button, redirect to /order/[orderId] showing live status via Socket.IO (room order:<id>) with a step progress UI; on reconnect, refetch the order.
- Prevent double submit with idempotencyKey and server-side checking. Authenticate sockets; only staff roles may join "kitchen", "waiters" and "admin".
DONE WHEN: placing an order from the customer page creates the DB rows and the tracking page loads with status PENDING.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F6. Kitchen Display System
```text
Read AGENTS.md. TASK: Kitchen display at /kitchen (CHEF, MANAGER, ADMIN).
- Replace fake A-101..A-104 tickets with real API orders. Add status transition endpoints with allowed-transition checks, CHEF/MANAGER/ADMIN only.
- Live columns: New, Preparing, Ready. Station filter. Each ticket shows order number, table, items with add-ons and notes, and an age timer that turns amber then red.
- Actions: acknowledge, mark item PREPARING/READY, mark order READY. PATCH endpoints emit order:status_changed / item:status_changed to relevant rooms (kitchen, waiters, order:<id>, table:<id>).
- Sound alert on order:new. On socket reconnect, refetch open orders.
DONE WHEN: a new customer order appears on the kitchen screen without refresh and status changes show instantly on the customer tracking page. After this feature, run the full live test: phone order, kitchen screen updates, tracking updates, Wi-Fi off/on re-sync.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F7. Waiter POS
```text
Read AGENTS.md. TASK: Waiter POS at /waiter.
- Replace the fixed table array with real API data. Table map with status colours (FREE, OCCUPIED, BILL_REQUESTED). Open a table to see its orders, add items to an existing order or create a walk-in order.
- Receive waiter:called and bill:requested alerts; mark items SERVED; wire the customer "Call waiter" and "Request bill" buttons.
DONE WHEN: waiter can take an order, receive calls, and mark items served in real time.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F8. Billing + invoice
```text
Read AGENTS.md. TASK: Cashier billing at /cashier. Deep review billing.
- Replace cashier mock data. Bill view per table/order: items, GST split, discount via server-validated coupon code, total. Support split payments as Payment rows (cash/UPI/card). Close the order and free the table in one transaction.
- Invoice PDF generation endpoint with restaurant details and GST breakdown.
DONE WHEN: I can bill a table, apply a coupon, take a cash payment and download an invoice PDF.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F9. Razorpay online payments
```text
Read AGENTS.md. TASK: Razorpay (test mode) online payment for customers.
- Verify payment writes a Payment row; webhook is idempotent via unique razorpayPaymentId; forged webhooks are rejected; never trust the client success callback. Remove mock shortcuts from production paths.
- API: create Razorpay order, verify signature, webhook endpoint with signature verification, idempotent via unique razorpayPaymentId. On PAID, mark order paid/completed and emit events.
- Web: "Pay online" in the customer tracking page using Razorpay checkout.
DONE WHEN: a test payment succeeds, repeated webhook calls do not duplicate payments.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F10. Inventory
```text
Read AGENTS.md. TASK: Inventory.
- Verify stock deduction inside the F5 order transaction and ensure stock cannot go negative with simultaneous orders. Add ingredient CRUD, recipe editor per menu item, low-stock alerts to "admin" room, optional auto-mark items unavailable when an ingredient hits zero.
DONE WHEN: ordering an item reduces ingredient stock, and low stock shows an alert in /admin.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F11. Reports + dashboard
```text
Read AGENTS.md. TASK: Admin dashboard and reports.
- Compare each report against manual totals from test orders. Endpoints: sales by day/range, top items, peak hours, payment-mode split and GST summary.
- Web: /admin with KPI cards and charts (use recharts), date-range filter and CSV export. Verify date ranges, GST summary and CSV export.
DONE WHEN: reports match a manual total of test orders.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F12. Staff management + audit log
```text
Read AGENTS.md. TASK: /admin/staff. Verify deactivated users cannot log in. Create/deactivate staff, change roles, reset password; view audit log with filters. Only ADMIN can manage ADMIN/MANAGER accounts. Check audit log entries for key actions.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

### F13. Hardening + tests + deploy
```text
Read AGENTS.md. TASK: Production hardening.
- Rate limiting, helmet, CORS allow-list from env, centralised error logging, input sanitisation review, production cookie flags, no default secrets (refuse startup without a real JWT_SECRET), socket authentication.
- Tests: Jest + Supertest for login and role blocking, order creation (transaction, price recompute, idempotency, unavailable item rejection), payment webhook idempotency and forged signature rejection, double-close of a bill, stock never negative.
- One Playwright end-to-end test: customer places order, kitchen marks ready, tracking shows ready.
- Dockerfile for the API, GitHub Actions CI (typecheck, lint, test), deployment guide: web on Vercel, API on Render/Railway, Neon DB.
- Final README with architecture diagram (mermaid), screenshots or GIFs, demo logins for each role and features list. Seed a clean demo dataset on the live DB. Run CI on every push.
UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.
```

---

## D. Rules for yourself while building
- One feature = one branch = one commit/PR. Merge only after you've tested it manually.
- If Codex suggests changing the stack or schema, reply: "Follow AGENTS.md. Do not change fixed decisions."
- If a feature needs a schema change, ask Codex for a Prisma migration only for that feature.
- Keep AGENTS.md updated ONLY when you deliberately change the plan.
