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
- Use the UI/UX rules below for all web work. Every screen needs loading, empty and error states with a clear next action.
- Write small, reviewable changes. Do only the task requested; do not refactor unrelated code or add unrequested features.
- After each task: run typecheck and lint, and tell me how to test it manually.

## Out of scope until told otherwise

Multi-restaurant support, WhatsApp, AI features, inventory reports, delivery tracking.

## UI/UX rules (locked)

### Product and surfaces

- Product name: **Tavola**. Keep the name and tagline in one constant at `apps/web/src/lib/brand.ts` so they can be changed in one place.
- Design for three distinct surfaces:
  1. **Customer:** phone-first, light theme, appetising and image-led, designed for one-thumb use.
  2. **Staff tools:** waiter, cashier and admin; light theme, dense and scannable on tablet and desktop, keyboard friendly.
  3. **Kitchen display:** dark theme, high contrast, oversized text and actions readable from across the room.
- Responsive layouts must work at 360px and 1280px widths.

### Visual system

- Use a calm, cool neutral palette with deep pine as the brand colour. Food imagery and semantic status colours should carry visual emphasis.
- Define colours as CSS variables in `apps/web/src/app/globals.css` and map them in Tailwind. Components must use semantic tokens, never hard-coded hex colours or arbitrary pixel values.
- Light theme tokens: `--bg: #F6F7F5`, `--surface: #FFFFFF`, `--ink: #14201C`, `--ink-muted: #5B6B65`, `--line: #E3E8E5`, `--brand: #0F5C4D`, `--brand-ink: #FFFFFF`, `--accent: #F2A93B`.
- Status tokens (use only to communicate status): `--st-new: #2563EB`, `--st-preparing: #F59E0B`, `--st-ready: #16A34A`, `--st-late: #DC2626`, `--st-served: #64748B`.
- Kitchen theme tokens under `[data-theme="kds"]`: `--kds-bg: #0E1512`, `--kds-surface: #17211D`.
- Use the radius scale 8px (controls), 12px (cards), and 20px (sheets and modals). Cards use a 1px line border; reserve shadows for floating layers such as sheets, dialogs and toasts.
- Load Bricolage Grotesque for headings and prominent numbers, and Instrument Sans for body and UI text, using `next/font/google`. Expose them as `--font-display` and `--font-body`.
- Use the type scale 12, 14, 16, 20, 24, 32 and 48px. Kitchen ticket numbers may use 48–72px. Prices, timers and table numbers use tabular numerals. Always show prices with the ₹ symbol.

### Components and states

- Use shadcn/ui primitives for Button, Dialog, Sheet, Tabs, Table, Input, Select, Toast, Badge and Skeleton. Extend and theme these primitives instead of building competing custom versions.
- Shared UI components belong in `apps/web/src/components/ui-kit/`. Reuse them across routes for consistent status, price, empty/error state, page header, elapsed timer and quantity controls.
- Status must include a text label or other non-colour cue; colour alone never communicates meaning.
- Every screen must provide loading, empty and error states. Empty states explain the next useful action; error states say what failed and how to recover.
- Use sentence case and plain action labels such as “Place order” and “Mark ready”. Do not use filler or lorem ipsum.
- Customer and waiter controls have at least 44px touch targets. Keep keyboard focus visible, maintain at least 4.5:1 text contrast, and respect `prefers-reduced-motion`.
- Use motion only in response to an action or status change; do not add decorative entrance animations.
- Use fixed-size square food images via `next/image` to prevent layout shifts. When an item has no image, show a neutral tile with its first letter rather than a broken image.

### UI review

- Before completing a UI task, review the affected screens at 360px (customer) and 1280px (staff).
- Check that brand, ink, line and semantic status tokens are used consistently, lists have empty states, fetches have loading/error states, action labels describe what they do, and keyboard use remains practical.
- Feature work must follow these UI/UX rules, use the shared UI kit and design tokens, and include loading, empty and error states.

## Project truth (do not contradict)
- Single restaurant. No restaurantId, no multi-tenancy.
- Auth is STAFF-ONLY: login with email or phone + password. Roles: ADMIN, MANAGER, CASHIER, WAITER, CHEF (CUSTOMER exists only as a role value; customers never log in).
- Customers use the QR link /t/<qrToken> with no account. Seeded tokens: tbl-01 to tbl-10.
- Order statuses (do not rename): PENDING, RECEIVED, PREPARING, READY, SERVED, COMPLETED, CANCELLED.
- Money is Prisma Decimal on the server and strings over the API. The server is authoritative for prices, tax, discounts and totals.
- The Prisma schema is the source of truth for field names (for example stockQty, reorderLevel, qtyUsed). Frontend and shared types must match it. Never rename schema fields to match the UI; fix the UI.
- Socket rooms: kitchen, waiters, admin, table:<id>, order:<id>. Staff rooms require a valid login.

## Scope guard
- Allowed per task: only the files needed for that task's fixes.
- FORBIDDEN unless I explicitly say so: schema changes or new models, renaming statuses/fields, new auth methods (registration, OTP, social), multi-restaurant support, replacing libraries, rewriting working files, changing the visual design system, deleting features.
- If a fix seems to need a forbidden change: STOP, explain in 5 lines, and ask me. Do not proceed.
- Out-of-scope ideas go into BACKLOG.md as one line each. Do not implement them.
- Never replace real API data with mock data, empty arrays or fake success responses.