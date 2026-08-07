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

## Backlog / Remaining (not requested / future)
- P1: Security hardening — hash staff PINs, require JWT (not just PIN) on POST /receivals, rate-limit
  /verify-pin, set explicit CORS origin.
- P2: Pagination on /api/receivals for scale; date-range filters on list; weekly calendar view.
- P2: Migrate deprecated FastAPI on_event startup/shutdown to lifespan.
- P2: Archive should also bundle image files (currently JSON metadata + URLs).

## Test Credentials
Admin: admin@eurasia.com / admin123 · Staff PIN: 1234
