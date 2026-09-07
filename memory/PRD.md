# Eurasia Goods Receival — PRD

## Original Problem Statement
Port of the private GitHub app `quaviurrahman/eurasia-purchase-order` to a web app on the Emergent stack.
Requirements: (1) camera capture must work on iOS/Android phones, (2) add a dropdown of pre-defined
suppliers that can be assigned/re-assigned to each order receival confirmation record from the receival
list, (3) analyze the whole repo and provide a development plan before building.

## Chosen Scope (user confirmed)
Middle ground: Order Receival Confirmations (create + list + supplier reassign dropdown + camera photos
+ signature) + a simple list/dashboard view. NO CSV upload. Manual record creation. JWT admin login +
staff PIN identity for "received by". Cloud object storage for photos. Admin manages suppliers. Plus an
Archive tool to download + remove records older than 3 months.

## Architecture
- Frontend: React (CRA + craco), Tailwind + shadcn/ui, lucide-react icons. Fonts: Outfit + IBM Plex Sans.
  Auth via Bearer JWT in localStorage ("eurasia_token"). API base = REACT_APP_BACKEND_URL + /api.
- Backend: FastAPI, all routes under /api. Motor/MongoDB.
- Storage: Emergent object storage (EMERGENT_LLM_KEY). Images stored as storage paths in DB; served
  through GET /api/files/{path}.
- Auth: JWT (bcrypt) admin login; staff PIN verification for confirmations.

## Data Model (MongoDB)
- users (admin): id, email, password_hash, name, role
- staff: id, name, pin  (PIN identity for "received by")
- suppliers: id, name
- statuses: id, name
- receivals: id, supplierId, statusId, deliveryDate, observation, dispute, palletCount, receivedBy,
  recordedInSystem, invoiceReceived, priceChecked, items[], images[] (paths), signatures[{signedBy,path}], createdAt

## Implemented (2026-06)
- JWT admin login + ProtectedRoute; admin seeded from .env; test_credentials.md written.
- Staff PIN verify endpoint + admin CRUD for staff PINs.
- Suppliers & statuses CRUD (admin).
- Receival create flow: supplier select, status, delivery date, dispute toggle, pallet count,
  observations, optional items, camera capture, signature pad, PIN confirm.
- Mobile-robust camera: getUserMedia (rear cam, user-gesture start, playsInline) + native
  file-input fallback (capture="environment") for iOS/in-app browsers.
- Receival list: per-row supplier assign/re-assign dropdown, inline checklist toggles (recorded/
  invoice/price) with optimistic persist, search + supplier filter, view/delete.
- Receival details: info, photo gallery, signatures, print delivery note (@media print).
- Archive tool: preview count of >90-day records, download JSON, bulk remove.
- Object storage integration verified end-to-end (upload + serve).
- Testing: 16/16 backend pytest + full frontend E2E, 100% pass, no bugs.

## Implemented (2026-06 update)
- Automated checklist status transition: admin sets a "Checklist-complete status" (Settings → Statuses).
  When a receival's 3 checklist toggles (recordedInSystem + invoiceReceived + priceChecked) are all ticked,
  status auto-changes to that status; un-ticking any reverts to the default status. Applies to Admin & Staff
  edits. Skipped when statusId is set explicitly in the same update. Config key: checklistCompleteStatusId.
- Server-side pagination on GET /api/receivals (page/limit, default 20/page) with server-side search +
  all filters. Search runs across the whole dataset (supplier name, receivedBy, observation, invoiceNumber),
  not limited to a page. Response shape { items, total, page, limit }; list has Previous/Next controls.

## Implemented (2026-09 update) — Purchase Orders + CPIS integration
- New admin-only Purchase Orders module (nav "Orders"). Talks to external CPIS product-core API
  (base https://product-core-5.emergent.host/api, header X-API-Key). Env: CPIS_BASE_URL, CPIS_API_KEY,
  CPIS_SOURCE_SYSTEM (backend/.env).
- CPIS product sync: POST /api/cpis/sync pulls all products into db.cpis_products (manual "Sync CPIS
  products" button). GET /api/cpis/status (count + lastSync). GET /api/cpis/products?query= local search
  (name/sku/brand). GET /api/cpis/products/{id}/packs live-fetches packs from CPIS.
- Supplier-wise pack config & pricing (db.supplier_pack_configs, keyed supplierId+packId):
  unitsPerLayer, unitsPerPallet, packPrice. Per-unit price = packPrice / pack.unit_quantity auto-computed
  and ALSO stored against the product's 1-unit "each" pack (derivedFromPackId).
- Purchase Orders (db.purchase_orders): auto PO number PO-000X (counter in config), supplier, lines
  (product+pack+qty+price+pallet cfg), totals computed server-side. CRUD GET/POST/PUT/DELETE
  /api/purchase-orders. Saving a PO also upserts supplier-pack-configs for its lines.
- Close PO: POST /api/purchase-orders/{id}/close { invoiceNumber (required), linkedReceivalId? }.
  Sets status=closed, optionally links a receival (auto-fills that receival's invoiceNumber +
  invoiceReceived=true), and posts a POSITIVE goods receipt to CPIS (POST /stock/receipts) per line with
  headers X-API-Key, Idempotency-Key (per line), X-Source-System. Closed POs are read-only.
- Testing: 15/15 backend pytest + full frontend E2E, 100% pass (iteration_12.json). No functional bugs.

## Implemented (2026-09 update) — Receiving progress, PO print, pricing history & CPIS insights
- Receiving progress: each PO line has a "Received (packs)" input; SHORT badge when received < ordered.
  On close, CPIS goods-receipt posts the RECEIVED qty (falls back to ordered qty when blank).
- PO Print: "Print" button opens a formatted, emailable PO sheet (new window → print/PDF).
- Purchasing price history (db.price_history): a point is recorded per line each time a PO is closed
  (supplier, pack, packPrice, perUnitPrice, poNumber, date). New admin "Pricing" page (search product →
  pack) shows latest vs previous price with higher/lower highlight, average of last 3, trend bar chart +
  history table.
- Pricing API for other systems (X-API-Key = the CPIS system key): GET /api/pricing/packs/{packId} and
  POST /api/pricing/batch { packIds:[] } → latest/previous price, averageLast3, per-unit variants, count.
  Documented on in-app API Guide page (/pricing/api-guide) linked from Pricing.
- CPIS insights per PO line: "Trend & stock" button shows live per-pack stock (GET
  /api/cpis/products/{id}/stock) and a weekly/monthly sales bar chart (GET /api/cpis/products/{id}/sales).
- Testing: 12/12 backend pytest + full frontend E2E, 100% pass (iteration_13.json). All CPIS side-effects
  reversed. Fixed post-test: bar-chart px heights + null-input React warnings.

## Backlog / Remaining (not requested / future)
- P1: Security hardening — hash staff PINs, require JWT (not just PIN) on POST /receivals, rate-limit
  /verify-pin, set explicit CORS origin.
- P2: Pagination on /api/receivals for scale; date-range filters on list; weekly calendar view.
- P2: Migrate deprecated FastAPI on_event startup/shutdown to lifespan.
- P2: Archive should also bundle image files (currently JSON metadata + URLs).

## Test Credentials
Admin: admin@eurasia.com / admin123 · Staff PIN: 1234
