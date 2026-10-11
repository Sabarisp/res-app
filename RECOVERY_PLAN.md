# Recovery Plan: from current repo state to a working product

Current state (reviewed 2026-10-04): the opening assessment below was from an older repo snapshot. Menu, tables, orders, kitchen, waiter and cashier routes/services/screens now exist; their live end-to-end flows still need verification. The current schema already has DiningTable, Payment, Coupon, inventory, and the order snapshot fields. Do not run Step 1's destructive schema replacement or migration deletion: AGENTS.md locks the schema and `schema.v2.prisma` is absent. The workspace has no `.git` directory, so Step 0's git cleanup/branch steps cannot run here. Step 2's remaining money inputs were changed to decimal strings in this review; typecheck, lint and API tests pass.

Rules for this plan:
- Run steps IN ORDER. One prompt at a time. Branch, test, review, commit, tag after each (see WORK_PLAN.md).
- Files to have ready in the repo: `AGENTS.md` (with the UI rules from UI_DESIGN_PROMPTS.md Section A added) and `apps/api/prisma/schema.v2.prisma` (provided).
- Do not start step N+1 until step N's "Done when" passes.

---

## STEP 0: Clean the repo (you do this, no Codex)

1. Make sure no real secrets are in any `.env` file. If any real key was ever shared in a zip, rotate it.
2. Add to `.gitignore`: `.env`, `.env.local`, `dist/`, `.next/`, `node_modules/`, `*.tsbuildinfo`
3. Remove already-tracked build output: `git rm -r --cached apps/api/dist packages/shared/dist` (then commit)
4. Create the Neon database, put `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) in `apps/api/.env`
5. Copy `AGENTS.md` and `schema.v2.prisma` into the repo, commit on a branch `chore/recovery`

---

## STEP 1: Restore the agreed schema (Codex)

```text
Read AGENTS.md first and follow it strictly.

TASK: Replace the current Prisma schema with the agreed schema and update all dependent code. Do not add features.

1. Replace apps/api/prisma/schema.prisma with the exact contents of apps/api/prisma/schema.v2.prisma, then delete schema.v2.prisma. Do not rename any model, enum or field in it.
2. The old schema is being replaced entirely. Key differences you must adapt the code to:
   - Model Table is now DiningTable (field number, qrToken, status, capacity)
   - Payment is now its own model (method, amount, status, razorpayOrderId, razorpayPaymentId); payment fields no longer live on Order
   - Enum PaymentMode is now PaymentMethod
   - Order has type (OrderType: DINE_IN, TAKEAWAY, DELIVERY), orderNumber, subtotal, taxAmount, discount, total, couponId, idempotencyKey
   - OrderStatus now includes RECEIVED; OrderItem now has status (ItemStatus), station (Station enum), unitPrice and taxPercent snapshots
   - MenuItem now has station, taxPercent, prepTimeMin; Addon replaces MenuItemAddon; Coupon model added
   - Ingredient uses stockQty and reorderLevel; Recipe uses qtyUsed
3. Update packages/shared enums and Zod schemas to match the new schema exactly (Role, OrderType, OrderStatus, ItemStatus, TableStatus, PaymentMethod, PaymentStatus, Station).
4. Update every API file that touched renamed or removed models/fields: authService, staffService, inventoryService, reportService, paymentService, paymentController, seed.ts, and tests. Reports and payments must now read from and write to the Payment model.
5. Update web pages only where a type or field name from shared changed (inventory, staff, reports, order page). No visual changes.
6. Add DIRECT_URL to .env.example and the datasource block is already set up for it in the new schema.
7. Delete apps/api/prisma/migrations if it exists. Run: npx prisma migrate dev --name init, then npx prisma generate.
8. Update seed.ts so it runs against the new schema: one user per role, 8 categories, ~30 realistic menu items (name, description, price, isVeg, station, taxPercent, prepTimeMin), 10 DiningTables with unique qrTokens, 15 ingredients. Print the demo logins and the first table's QR URL at the end.

DONE WHEN: `npm run typecheck`, `npm run lint` and `npm test` pass, `npx prisma migrate dev` succeeds on Neon, `npx prisma db seed` runs, and Prisma Studio shows the new tables with seeded data. List every file you changed.
```

Done when (you check): tables in Prisma Studio match schema.v2; you can still log in as each seeded role.

---

## STEP 2: Money as Decimal (Codex)

```text
Read AGENTS.md. TASK: Remove floating point from all money handling.

1. Use Prisma.Decimal (decimal.js) for every money calculation on the server: order pricing, tax, discount, bill totals, payment amounts, reports, GST summary.
2. Rewrite apps/api/src/services/orderPricing.ts so it takes decimal strings and returns decimal strings, rounds tax per line item to 2 decimal places using ROUND_HALF_UP, and totals are the sum of rounded lines.
3. API responses send money as strings (e.g. "348.60"). Update packages/shared types and the web code that formats money (use the Price component later; for now a single formatMoney(string) helper).
4. Razorpay amounts are converted to integer paise from the Decimal total at the boundary only.
5. Rewrite tests/orderPricing.test.ts with exact cases: multiple items, add-ons, 5 / 12 / 18 percent GST, a case where float math would be wrong (e.g. 0.1 + 0.2 style totals), discount capped at subtotal, and rounding at the half-paisa.

DONE WHEN: no `number` type is used for money in services; all tests pass; typecheck and lint pass.
```

---

## STEP 3: UI foundation (the design you did not apply yet)

Run this BEFORE building more screens so every new feature starts in the new design.

### U0. Design foundation (Codex)

```text
Read AGENTS.md including the UI/UX rules. TASK: build the design foundation. No business logic changes.

First AUDIT the existing web app (globals.css, tailwind.config.ts, components/app-shell.tsx, layout.tsx) and reuse or replace what exists; do not create duplicates.

1. Design tokens as CSS variables in apps/web/src/app/globals.css (light on :root, kitchen theme under [data-theme="kds"]), mapped in tailwind.config.ts so I can write bg-surface, text-ink, bg-brand, text-st-late, etc.:
   bg #F6F7F5, surface #FFFFFF, ink #14201C, ink-muted #5B6B65, line #E3E8E5, brand #0F5C4D (text on brand #FFFFFF), accent #F2A93B,
   st-new #2563EB, st-preparing #F59E0B, st-ready #16A34A, st-late #DC2626, st-served #64748B,
   kds-bg #0E1512, kds-surface #17211D. Radius scale 8 / 12 / 20.
2. Fonts via next/font/google: Bricolage Grotesque (headings, weights 600 and 700, --font-display) and Instrument Sans (body, 400 to 600, --font-body). Add a .tabular utility (tabular-nums).
3. Initialise shadcn/ui and add Button, Input, Label, Select, Dialog, Sheet, Tabs, Table, Badge, Skeleton, sonner (toasts), DropdownMenu, Separator. Restyle with our tokens (brand primary button, 8px radius, focus ring in brand).
4. Build components/ui-kit/: StatusBadge (status to colour + label + dot; colour never the only signal), Price (INR from a decimal string, tabular), EmptyState, ErrorState (what failed + retry), PageHeader, ElapsedTimer (mm:ss from a timestamp, amber and red thresholds in minutes), QuantityStepper (44px targets).
5. lib/brand.ts exports product name "Tavola" and tagline.
6. Dev-only page /design (hidden in production) that renders every token and component in all states.
7. Remove all hard-coded hex colours and orange/slate utility styling from apps/web/src/components and app/globals; use tokens.

DONE WHEN: /design renders correctly; typecheck and lint pass; grep finds no hard-coded hex colour in components. List files changed.
```

### U1. Restyle existing screens (Codex, after U0)

```text
Read AGENTS.md. TASK: Apply the new design system to every existing page. Keep current behaviour (real API calls stay real, mock data stays mock for now). Use ui-kit components and tokens only.

1. AppShell: staff left sidebar (collapses to icons on tablet), role-based nav, top bar with page title, user menu, and a connection indicator ("Live" green / "Reconnecting" amber) bound to the socket state. Customer pages use a slim top bar with restaurant name and a "Table N" chip.
2. Customer menu /t/[qrToken]: sticky horizontally scrollable category tabs, search, veg/non-veg toggle, item rows with 88px square image on the right, one-line description, price, Add button that becomes a QuantityStepper; sticky bottom cart bar (count, total, "View order") opening a Sheet. Replace the generated SVG letter tiles with a neutral placeholder tile (item initial) used only when imageUrl is empty. Remove invented badges ("Chef special", "Popular") unless a real field backs them.
3. Order tracking /order/[orderId]: vertical status timeline (Received, Preparing, Ready, Served), Call waiter and Request bill action row, pay-online button.
4. Kitchen /kitchen: data-theme="kds", station filter pills, three columns (New, Preparing, Ready), tickets with 48px+ order number and table, 20px+ items, highlighted notes, ElapsedTimer, 64px action buttons.
5. Waiter /waiter: responsive table grid with StatusBadge, right-side Sheet for the selected table.
6. Cashier /cashier: left list of open bills, right bill panel with GST split, discount field, large total, payment method selector and primary Take payment button.
7. Admin pages (menu, tables, staff, inventory, reports, dashboard): PageHeader + Table with search/filter row, dialogs for create/edit, KPI tiles on the dashboard, charts restyled with token colours.
8. Landing and login: simple, honest copy, logo mark, centred login card with inline error.
9. Every page gets loading (Skeleton), empty and error states using ui-kit.

DONE WHEN: every route renders in the new design at 360px and 1280px; no orange/slate/hard-coded colours remain; typecheck and lint pass.
```

Then: you send screenshots of the customer menu, kitchen and waiter pages for a design review before continuing.

---

## STEP 4: Build the missing order loop, in this order

Use the F prompts in CODEX_PROMPTS.md, with the changes below for this repo. Add this suffix to every one: `UI: follow the UI/UX rules in AGENTS.md, use only ui-kit components and design tokens, include loading, empty and error states. Replace any mock data for this feature with real API data and delete the mock.`

| Order | Feature | Repo-specific changes |
|---|---|---|
| 4.1 | **F2 Menu management** | New menuRoutes/controller/service. Public `GET /menu` (categories + available items + add-ons). Admin CRUD, availability toggle emitting `menu:availability_changed`, audit log on price change. Build `/admin/menu` for real (currently a placeholder). Add image URL field. |
| 4.2 | **F3 Tables + QR** | tableRoutes. Public `GET /tables/by-token/:qrToken`. Build `/admin/tables` (placeholder today): CRUD, QR per table encoding `{WEB_URL}/t/{qrToken}`, download, printable sheet. |
| 4.3 | **F4 Customer menu + cart** | Delete the hardcoded `menuItems` array in `t/[qrToken]/page.tsx`; load `GET /menu` and resolve the table by token with a friendly invalid-token screen. Zustand cart persisted per token. |
| 4.4 | **F5 Place order + tracking** (deep review) | orderRoutes. `POST /orders` in ONE transaction: validate, recompute prices and tax from DB with Decimal, create Order + items + add-ons, set table OCCUPIED, honour `idempotencyKey`, emit `order:new`. `GET /orders/:id`. Tracking page live via socket room `order:<id>` with refetch on reconnect. Authenticate sockets; only staff roles may join `kitchen`, `waiters`, `admin`. |
| 4.5 | **F6 Kitchen display** | Replace the fake A-101..A-104 tickets. Status transition endpoints with allowed-transition checks, CHEF/MANAGER/ADMIN only. Timers, sound alert, refetch on reconnect. |
| 4.6 | **F7 Waiter POS** | Replace the fixed table array. Add items to an open order, walk-in orders, `waiter:called` and `bill:requested`, mark items served. Wire customer Call waiter / Request bill buttons. |
| 4.7 | **F8 Billing + invoice** (deep review) | Replace cashier mock. Bill calculation with coupon validation, split payments as `Payment` rows, close order and free table in one transaction, invoice PDF with GST breakup. |

Review gates: deep review after 4.4 and 4.7. After 4.5, run the full live test: phone order, kitchen screen updates, tracking updates, Wi-Fi off/on re-sync.

---

## STEP 5: Reconnect and verify the code that already exists

Codex built these early; verify them against real orders instead of rebuilding.

| Order | Item | Check |
|---|---|---|
| 5.1 | **F9 Razorpay** | Payment now writes a `Payment` row; webhook idempotent via unique `razorpayPaymentId`; forged webhook rejected; client success callback is never trusted. Remove any `mock` shortcut from production paths. |
| 5.2 | **F10 Inventory** | Add stock deduction inside the order transaction (4.4); stock cannot go negative with two simultaneous orders; low-stock alert to `admin` room; optional auto-unavailable at zero. |
| 5.3 | **F11 Reports** | Compare each report against a manual total of test orders; verify date ranges, GST summary and CSV export. |
| 5.4 | **F12 Staff** | Deactivated user cannot log in; only ADMIN manages ADMIN/MANAGER accounts; audit log entries for key actions. |

---

## STEP 6: Hardening, tests, deploy (F13)

- Tests (Jest + Supertest) for: login and role blocking, order creation (transaction, price recompute, idempotency, unavailable item rejected), payment webhook idempotency and forged signature, double-close of a bill, stock never negative.
- One Playwright end-to-end test: customer places an order, kitchen marks ready, tracking page shows ready.
- Security pass: cookie flags in production, no default secrets (app refuses to start without real `JWT_SECRET`), socket authentication, CORS allow-list from env.
- Deploy: web on Vercel, API on Render or Railway (always-on or documented cold start), DB on Neon. Run CI on every push.
- Seed a clean demo dataset on the live DB with demo logins for each role.

---

## STEP 7: Portfolio and freelancing packaging

1. Real food photos for all seeded items (same aspect ratio), 25 to 30 realistic descriptions.
2. README: architecture diagram (mermaid), feature list, screenshots or GIFs, tech decisions, demo logins, how to run locally.
3. 2-minute demo video: phone order, kitchen screen, waiter alert, payment, report.
4. Resume bullet and LinkedIn project entry.
5. Freelance one-pager: offer tiers (QR menu, ordering, full POS + inventory), sample screenshots, contact.
6. Offer one real local restaurant a free pilot for a testimonial.

---

## Backlog (only after Step 6)

Multi-restaurant (SaaS), WhatsApp notifications, delivery tracking, image upload, feedback and ratings, AI sales forecast and upsell suggestions, offline POS queue.

---

## Progress tracker

- [ ] Step 0 repo cleaned, Neon ready
- [ ] Step 1 schema restored and migrated
- [x] Step 2 money is Decimal
- [ ] Step 3 U0 design foundation, U1 screens restyled, design review done
- [ ] 4.1 Menu management
- [ ] 4.2 Tables + QR
- [ ] 4.3 Customer menu + cart
- [ ] 4.4 Place order + tracking (deep review)
- [ ] 4.5 Kitchen display
- [ ] 4.6 Waiter POS
- [ ] 4.7 Billing + invoice (deep review)
- [ ] 5.1 to 5.4 existing code reconnected and verified
- [ ] Step 6 hardening, tests, deploy
- [ ] Step 7 packaging
