from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import time
import base64
import logging
import re
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@eurasia.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

APP_NAME = "eurasia-receivals"
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

CPIS_BASE_URL = (os.environ.get("CPIS_BASE_URL") or "").rstrip("/")
CPIS_API_KEY = os.environ.get("CPIS_API_KEY")
CPIS_SOURCE_SYSTEM = os.environ.get("CPIS_SOURCE_SYSTEM", "EURASIA_INTAKE")
CPIS_SITE_ID = os.environ.get("CPIS_SITE_ID", "MAIN-WAREHOUSE")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Object storage helpers
# ---------------------------------------------------------------------------
storage_key = None


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    last = None
    for attempt in range(3):
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
        if resp.status_code == 404:
            key = init_storage(force=True)
            continue
        if resp.status_code in (500, 502, 503):
            last = resp
            time.sleep(0.6 * (attempt + 1))
            continue
        resp.raise_for_status()
        return resp.json()
    if last is not None:
        last.raise_for_status()
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def save_base64_image(base64_data: str, prefix: str = "img") -> Optional[str]:
    """Decode a data-URL image and upload to object storage. Returns storage path."""
    if not base64_data or "," not in base64_data:
        return None
    header, b64 = base64_data.split(",", 1)
    content_type = "image/png"
    if "image/jpeg" in header or "image/jpg" in header:
        content_type = "image/jpeg"
    ext = "jpg" if content_type == "image/jpeg" else "png"
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return None
    path = f"{APP_NAME}/{prefix}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, raw, content_type)
    except requests.HTTPError:
        raise HTTPException(status_code=502, detail="Object storage unavailable — could not save image. Please try again shortly.")
    return result["path"]


# ---------------------------------------------------------------------------
# CPIS (product-core) client
# ---------------------------------------------------------------------------
def cpis_headers(extra: dict = None) -> dict:
    h = {"X-API-Key": CPIS_API_KEY, "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def cpis_get(path: str, params: dict = None):
    resp = requests.get(f"{CPIS_BASE_URL}{path}", headers=cpis_headers(), params=params or {}, timeout=60)
    resp.raise_for_status()
    return resp.json()


def cpis_post(path: str, payload: dict, extra_headers: dict = None):
    resp = requests.post(
        f"{CPIS_BASE_URL}{path}", headers=cpis_headers(extra_headers), json=payload, timeout=60
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, role: str, name: str, email: str = None) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "name": name,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        role = payload.get("role", "admin")
        if role == "staff":
            staff = await db.staff.find_one({"id": payload["sub"]}, {"_id": 0, "pin": 0})
            if not staff:
                raise HTTPException(status_code=401, detail="Staff not found")
            return {"id": staff["id"], "name": staff.get("name"), "role": "staff"}
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["role"] = user.get("role", "admin")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(current=Depends(get_current_user)) -> dict:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current


async def require_system_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> bool:
    if not x_api_key or x_api_key != CPIS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")
    return True


def _log(user: dict, action: str, changes: dict = None) -> dict:
    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "by": user.get("name"),
        "role": user.get("role"),
        "action": action,
    }
    if changes:
        entry["changes"] = changes
    return entry


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginInput(BaseModel):
    email: str
    password: str


class NamedInput(BaseModel):
    name: str


class ConfigInput(BaseModel):
    defaultStatusId: Optional[str] = None
    checklistCompleteStatusId: Optional[str] = None


class StatusInput(BaseModel):
    name: str
    color: Optional[str] = None


class StaffInput(BaseModel):
    name: str
    pin: str


class PinInput(BaseModel):
    pin: str


class ReceivalItem(BaseModel):
    description: str = ""
    qty: Optional[float] = None
    caseQty: Optional[float] = None
    qop: Optional[float] = None


class Slip(BaseModel):
    label: str = ""
    entries: List[float] = []


class ReceivalCreate(BaseModel):
    supplierId: Optional[str] = None
    statusId: Optional[str] = None
    locationId: Optional[str] = None
    deliveryDate: Optional[str] = None
    observation: str = ""
    palletCount: Optional[int] = 0
    pin: Optional[str] = None
    items: List[ReceivalItem] = []
    slips: List[Slip] = []
    base64Images: List[str] = []
    base64Signatures: List[str] = []
    signedByNames: List[str] = []


class ReceivalUpdate(BaseModel):
    supplierId: Optional[str] = None
    statusId: Optional[str] = None
    locationId: Optional[str] = None
    deliveryDate: Optional[str] = None
    observation: Optional[str] = None
    palletCount: Optional[int] = None
    invoiceNumber: Optional[str] = None
    recordedInSystem: Optional[bool] = None
    invoiceReceived: Optional[bool] = None
    priceChecked: Optional[bool] = None
    items: Optional[List[ReceivalItem]] = None
    slips: Optional[List[Slip]] = None


class MediaUpdate(BaseModel):
    addImages: List[str] = []
    removeImagePaths: List[str] = []
    addSignatures: List[str] = []
    addSignedByNames: List[str] = []
    removeSignaturePaths: List[str] = []


class SupplierPackConfigInput(BaseModel):
    supplierId: str
    productId: str
    packId: str
    packName: Optional[str] = None
    packShortCode: Optional[str] = None
    unitQuantity: float = 1
    baseUnit: Optional[str] = None
    unitsPerLayer: Optional[float] = None
    unitsPerPallet: Optional[float] = None
    packPrice: Optional[float] = None


class POLine(BaseModel):
    productId: str
    sku: Optional[str] = None
    productName: Optional[str] = None
    packId: str
    packName: Optional[str] = None
    packShortCode: Optional[str] = None
    unitQuantity: float = 1
    baseUnit: Optional[str] = None
    quantityPacks: float = 0
    receivedPacks: Optional[float] = None
    packPrice: Optional[float] = None
    perUnitPrice: Optional[float] = None
    unitsPerLayer: Optional[float] = None
    unitsPerPallet: Optional[float] = None


class PurchaseOrderInput(BaseModel):
    supplierId: Optional[str] = None
    notes: str = ""
    lines: List[POLine] = []


class PurchaseOrderClose(BaseModel):
    invoiceNumber: str
    linkedReceivalId: Optional[str] = None


class OrderListItemInput(BaseModel):
    productId: str
    sku: Optional[str] = None
    productName: Optional[str] = None
    packId: str
    packName: Optional[str] = None
    packShortCode: Optional[str] = None
    unitQuantity: float = 1
    baseUnit: Optional[str] = None
    imageId: Optional[str] = None
    cpisStock: Optional[float] = None
    physicalStock: Optional[float] = None
    notes: str = ""


class PhysicalStockInput(BaseModel):
    physicalStock: Optional[float] = None


class MarkOrderedInput(BaseModel):
    ids: List[str] = []
    estimatedDelivery: Optional[str] = None


class PackResolveInput(BaseModel):
    shortCodes: List[str] = []


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user.get("role", "admin"), user.get("name"), user["email"])
    return {
        "access_token": token,
        "user": {"id": user["id"], "email": user["email"], "name": user.get("name"), "role": user.get("role", "admin")},
    }


@api_router.post("/auth/staff-login")
async def staff_login(data: PinInput):
    staff = await db.staff.find_one({"pin": data.pin})
    if not staff:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    token = create_access_token(staff["id"], "staff", staff.get("name"))
    return {
        "access_token": token,
        "user": {"id": staff["id"], "name": staff.get("name"), "role": "staff"},
    }


@api_router.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return current


# ---------------------------------------------------------------------------
# Staff (PIN identity)
# ---------------------------------------------------------------------------
@api_router.get("/staff")
async def list_staff(current=Depends(require_admin)):
    return await db.staff.find({}, {"_id": 0, "pin": 0}).to_list(1000)


@api_router.post("/staff")
async def add_staff(data: StaffInput, current=Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), "name": data.name, "pin": data.pin}
    await db.staff.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"]}


@api_router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, current=Depends(require_admin)):
    await db.staff.delete_one({"id": staff_id})
    return {"ok": True}


@api_router.post("/verify-pin")
async def verify_pin(data: PinInput):
    staff = await db.staff.find_one({"pin": data.pin})
    if not staff:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    return {"name": staff["name"]}


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------
@api_router.get("/suppliers")
async def list_suppliers():
    return await db.suppliers.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/suppliers")
async def add_supplier(data: NamedInput, current=Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), "name": data.name}
    await db.suppliers.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"]}


@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, data: NamedInput, current=Depends(require_admin)):
    await db.suppliers.update_one({"id": supplier_id}, {"$set": {"name": data.name}})
    return {"ok": True}


@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, current=Depends(require_admin)):
    await db.suppliers.delete_one({"id": supplier_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Storage locations
# ---------------------------------------------------------------------------
@api_router.get("/locations")
async def list_locations():
    return await db.locations.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/locations")
async def add_location(data: NamedInput, current=Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), "name": data.name}
    await db.locations.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"]}


@api_router.put("/locations/{location_id}")
async def update_location(location_id: str, data: NamedInput, current=Depends(require_admin)):
    await db.locations.update_one({"id": location_id}, {"$set": {"name": data.name}})
    return {"ok": True}


@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str, current=Depends(require_admin)):
    await db.locations.delete_one({"id": location_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Statuses
# ---------------------------------------------------------------------------
@api_router.get("/statuses")
async def list_statuses():
    return await db.statuses.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/statuses")
async def add_status(data: StatusInput, current=Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), "name": data.name, "color": data.color}
    await db.statuses.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "color": doc["color"]}


@api_router.put("/statuses/{status_id}")
async def update_status(status_id: str, data: StatusInput, current=Depends(require_admin)):
    await db.statuses.update_one({"id": status_id}, {"$set": {"name": data.name, "color": data.color}})
    return {"ok": True}


@api_router.delete("/statuses/{status_id}")
async def delete_status(status_id: str, current=Depends(require_admin)):
    await db.statuses.delete_one({"id": status_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# App config (admin-configurable defaults)
# ---------------------------------------------------------------------------
@api_router.get("/config")
async def get_config(current=Depends(get_current_user)):
    cfg = await db.config.find_one({"key": "app"}, {"_id": 0})
    return cfg or {"key": "app", "defaultStatusId": None, "checklistCompleteStatusId": None}


@api_router.put("/config")
async def set_config(data: ConfigInput, current=Depends(require_admin)):
    update = data.model_dump(exclude_unset=True)
    await db.config.update_one({"key": "app"}, {"$set": update}, upsert=True)
    cfg = await db.config.find_one({"key": "app"}, {"_id": 0})
    return cfg


# ---------------------------------------------------------------------------
# Analytics dashboard
# ---------------------------------------------------------------------------
@api_router.get("/analytics")
async def analytics(current=Depends(require_admin)):
    from collections import defaultdict

    recs = await db.receivals.find(
        {}, {"_id": 0, "createdAt": 1, "supplierId": 1, "statusId": 1, "palletCount": 1, "invoiceReceived": 1}
    ).to_list(20000)
    statuses = await db.statuses.find({}, {"_id": 0}).to_list(1000)
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(1000)
    sname = {s["id"]: s["name"] for s in statuses}
    supname = {s["id"]: s["name"] for s in suppliers}

    status_counts = defaultdict(int)
    supplier_dates = defaultdict(list)
    daily, weekly, monthly = defaultdict(int), defaultdict(int), defaultdict(int)
    pallets_total = 0
    invoices_pending = 0

    for r in recs:
        status_counts[sname.get(r.get("statusId"), "No status")] += 1
        pallets_total += r.get("palletCount") or 0
        if not r.get("invoiceReceived"):
            invoices_pending += 1
        created = r.get("createdAt")
        if created:
            try:
                d = datetime.fromisoformat(created)
            except Exception:
                continue
            supplier_dates[r.get("supplierId")].append(d)
            daily[d.date().isoformat()] += 1
            iso = d.isocalendar()
            weekly[f"{iso[0]}-W{iso[1]:02d}"] += 1
            monthly[f"{d.year}-{d.month:02d}"] += 1

    supplier_freq = []
    for sid, dates in supplier_dates.items():
        dates.sort()
        count = len(dates)
        avg_interval = None
        if count >= 2:
            gaps = [(dates[i] - dates[i - 1]).total_seconds() / 86400 for i in range(1, count)]
            avg_interval = round(sum(gaps) / len(gaps), 1)
        supplier_freq.append(
            {"supplier": supname.get(sid, "Unassigned"), "count": count, "avgIntervalDays": avg_interval}
        )
    supplier_freq.sort(key=lambda x: -x["count"])

    def series(d, n):
        return [{"label": k, "count": d[k]} for k in sorted(d.keys())][-n:]

    return {
        "total": len(recs),
        "palletsTotal": pallets_total,
        "invoicesPending": invoices_pending,
        "suppliersCount": len(suppliers),
        "statusCounts": [{"status": k, "count": v} for k, v in status_counts.items()],
        "supplierFrequency": supplier_freq,
        "daily": series(daily, 30),
        "weekly": series(weekly, 12),
        "monthly": series(monthly, 12),
    }


# ---------------------------------------------------------------------------
# Receivals (order receival confirmations)
# ---------------------------------------------------------------------------
async def _enrich(rec: dict) -> dict:
    supplier = await db.suppliers.find_one({"id": rec.get("supplierId")}, {"_id": 0}) if rec.get("supplierId") else None
    status = await db.statuses.find_one({"id": rec.get("statusId")}, {"_id": 0}) if rec.get("statusId") else None
    location = await db.locations.find_one({"id": rec.get("locationId")}, {"_id": 0}) if rec.get("locationId") else None
    rec["supplier"] = supplier
    rec["status"] = status
    rec["location"] = location
    return rec


@api_router.get("/receivals")
async def list_receivals(
    current=Depends(get_current_user),
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    supplierId: Optional[str] = None,
    statusId: Optional[str] = None,
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
    recorded: Optional[str] = None,
    invoice: Optional[str] = None,
    price: Optional[str] = None,
):
    query = {}
    if supplierId:
        query["supplierId"] = supplierId
    if statusId:
        query["statusId"] = statusId

    def bool_q(field, val):
        if val == "true":
            query[field] = True
        elif val == "false":
            query[field] = {"$ne": True}

    bool_q("recordedInSystem", recorded)
    bool_q("invoiceReceived", invoice)
    bool_q("priceChecked", price)

    created = {}
    if dateFrom:
        created["$gte"] = dateFrom
    if dateTo:
        try:
            end = (datetime.fromisoformat(dateTo) + timedelta(days=1)).date().isoformat()
            created["$lt"] = end
        except Exception:
            pass
    if created:
        query["createdAt"] = created

    if search and search.strip():
        rx = {"$regex": re.escape(search.strip()), "$options": "i"}
        matched = await db.suppliers.find({"name": rx}, {"_id": 0, "id": 1}).to_list(1000)
        sup_ids = [s["id"] for s in matched]
        or_clauses = [{"receivedBy": rx}, {"observation": rx}, {"invoiceNumber": rx}]
        if sup_ids:
            or_clauses.append({"supplierId": {"$in": sup_ids}})
        query["$or"] = or_clauses

    page = max(1, page)
    limit = max(1, min(limit, 100))
    total = await db.receivals.count_documents(query)
    recs = (
        await db.receivals.find(query, {"_id": 0})
        .sort("createdAt", -1)
        .skip((page - 1) * limit)
        .limit(limit)
        .to_list(limit)
    )

    suppliers = {s["id"]: s for s in await db.suppliers.find({}, {"_id": 0}).to_list(1000)}
    statuses = {s["id"]: s for s in await db.statuses.find({}, {"_id": 0}).to_list(1000)}
    locations = {l["id"]: l for l in await db.locations.find({}, {"_id": 0}).to_list(1000)}
    for r in recs:
        r["supplier"] = suppliers.get(r.get("supplierId"))
        r["status"] = statuses.get(r.get("statusId"))
        r["location"] = locations.get(r.get("locationId"))

    return {"items": recs, "total": total, "page": page, "limit": limit}


@api_router.get("/receivals/{rec_id}")
async def get_receival(rec_id: str, current=Depends(get_current_user)):
    rec = await db.receivals.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    return await _enrich(rec)


@api_router.post("/receivals")
async def create_receival(data: ReceivalCreate, current=Depends(get_current_user)):
    image_paths = []
    for b64 in data.base64Images:
        p = save_base64_image(b64, "photos")
        if p:
            image_paths.append(p)

    signatures = []
    for i, b64 in enumerate(data.base64Signatures):
        p = save_base64_image(b64, "signatures")
        if p:
            signer = data.signedByNames[i] if i < len(data.signedByNames) else "Unknown"
            signatures.append({"signedBy": signer or "Unknown", "path": p})

    status_id = data.statusId
    if not status_id:
        cfg = await db.config.find_one({"key": "app"})
        status_id = cfg.get("defaultStatusId") if cfg else None

    doc = {
        "id": str(uuid.uuid4()),
        "supplierId": data.supplierId,
        "statusId": status_id,
        "locationId": data.locationId,
        "deliveryDate": data.deliveryDate,
        "observation": data.observation,
        "palletCount": data.palletCount or 0,
        "receivedBy": current.get("name"),
        "invoiceNumber": None,
        "recordedInSystem": False,
        "invoiceReceived": False,
        "priceChecked": False,
        "items": [i.model_dump() for i in data.items],
        "slips": [s.model_dump() for s in data.slips],
        "images": image_paths,
        "signatures": signatures,
        "changeLog": [_log(current, "Created receival record")],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.receivals.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich(doc)


# Fields staff are allowed to edit; admins may edit everything.
STAFF_EDITABLE = {"palletCount", "items", "observation", "slips"}
FIELD_LABELS = {
    "palletCount": "pallet count",
    "items": "items",
    "slips": "slips",
    "observation": "observation",
    "supplierId": "supplier",
    "statusId": "status",
    "locationId": "storage location",
    "deliveryDate": "delivery date",
    "invoiceNumber": "invoice number",
    "recordedInSystem": "recorded",
    "invoiceReceived": "invoice received",
    "priceChecked": "price checked",
}


@api_router.put("/receivals/{rec_id}")
async def update_receival(rec_id: str, data: ReceivalUpdate, current=Depends(get_current_user)):
    rec = await db.receivals.find_one({"id": rec_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    update = data.model_dump(exclude_unset=True)

    if current.get("role") != "admin":
        forbidden = set(update) - STAFF_EDITABLE
        if forbidden:
            raise HTTPException(status_code=403, detail="Staff may not edit: " + ", ".join(forbidden))

    # Auto-tick "Invoice received" when an invoice number is entered; un-tick when cleared.
    if "invoiceNumber" in update:
        update["invoiceReceived"] = bool(update["invoiceNumber"])

    # Auto status transition based on checklist completion (skip if status set explicitly).
    if "statusId" not in update:
        merged = {**rec, **update}
        all_done = (
            bool(merged.get("recordedInSystem"))
            and bool(merged.get("invoiceReceived"))
            and bool(merged.get("priceChecked"))
        )
        cfg = await db.config.find_one({"key": "app"}) or {}
        complete_status = cfg.get("checklistCompleteStatusId")
        default_status = cfg.get("defaultStatusId")
        current_status = merged.get("statusId")
        if complete_status:
            if all_done and current_status != complete_status:
                update["statusId"] = complete_status
            elif not all_done and current_status == complete_status:
                update["statusId"] = default_status

    changes = {}
    for k, v in update.items():
        old = rec.get(k)
        if k in ("items", "slips"):
            if old != v:
                changes[FIELD_LABELS.get(k, k)] = f"updated {FIELD_LABELS.get(k, k)}"
        elif old != v:
            changes[FIELD_LABELS.get(k, k)] = {"from": old, "to": v}

    if update:
        ops = {"$set": update}
        if changes:
            ops["$push"] = {"changeLog": _log(current, "Edited record", changes)}
        await db.receivals.update_one({"id": rec_id}, ops)
    rec = await db.receivals.find_one({"id": rec_id}, {"_id": 0})
    return await _enrich(rec)


@api_router.post("/receivals/{rec_id}/media")
async def update_media(rec_id: str, data: MediaUpdate, current=Depends(get_current_user)):
    rec = await db.receivals.find_one({"id": rec_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")

    images = list(rec.get("images", []))
    signatures = list(rec.get("signatures", []))
    log_actions = []

    added_imgs = 0
    for b64 in data.addImages:
        p = save_base64_image(b64, "photos")
        if p:
            images.append(p)
            added_imgs += 1
    if added_imgs:
        log_actions.append(f"added {added_imgs} photo(s)")

    if data.removeImagePaths:
        before = len(images)
        images = [p for p in images if p not in data.removeImagePaths]
        removed = before - len(images)
        if removed:
            log_actions.append(f"removed {removed} photo(s)")

    added_sigs = 0
    for i, b64 in enumerate(data.addSignatures):
        p = save_base64_image(b64, "signatures")
        if p:
            signer = data.addSignedByNames[i] if i < len(data.addSignedByNames) else "Unknown"
            signatures.append({"signedBy": signer or "Unknown", "path": p})
            added_sigs += 1
    if added_sigs:
        log_actions.append(f"added {added_sigs} signature(s)")

    if data.removeSignaturePaths:
        before = len(signatures)
        signatures = [s for s in signatures if s.get("path") not in data.removeSignaturePaths]
        removed = before - len(signatures)
        if removed:
            log_actions.append(f"removed {removed} signature(s)")

    ops = {"$set": {"images": images, "signatures": signatures}}
    if log_actions:
        ops["$push"] = {"changeLog": _log(current, "Updated media: " + ", ".join(log_actions))}
    await db.receivals.update_one({"id": rec_id}, ops)
    rec = await db.receivals.find_one({"id": rec_id}, {"_id": 0})
    return await _enrich(rec)


@api_router.delete("/receivals/{rec_id}")
async def delete_receival(rec_id: str, current=Depends(require_admin)):
    await db.receivals.delete_one({"id": rec_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Archive (records older than 3 months)
# ---------------------------------------------------------------------------
def _cutoff_iso() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()


@api_router.get("/archive/preview")
async def archive_preview(current=Depends(require_admin)):
    cutoff = _cutoff_iso()
    recs = await db.receivals.find({"createdAt": {"$lt": cutoff}}, {"_id": 0}).to_list(5000)
    return {"count": len(recs), "cutoff": cutoff, "records": [await _enrich(r) for r in recs]}


@api_router.delete("/archive")
async def archive_delete(current=Depends(require_admin)):
    cutoff = _cutoff_iso()
    result = await db.receivals.delete_many({"createdAt": {"$lt": cutoff}})
    return {"deleted": result.deleted_count}


# ---------------------------------------------------------------------------
# CPIS product sync & search
# ---------------------------------------------------------------------------
@api_router.post("/cpis/sync")
async def cpis_sync(current=Depends(require_admin)):
    if not CPIS_API_KEY or not CPIS_BASE_URL:
        raise HTTPException(status_code=400, detail="CPIS not configured")
    synced = 0
    offset = 0
    limit = 100
    total = None
    now = datetime.now(timezone.utc).isoformat()
    try:
        while True:
            data = cpis_get("/products", {"limit": limit, "offset": offset})
            items = data.get("items", [])
            total = data.get("total", 0)
            for p in items:
                doc = {
                    "productId": p.get("product_id"),
                    "sku": p.get("sku"),
                    "name": p.get("name"),
                    "brandName": p.get("brand_name") or (p.get("brand") or {}).get("name"),
                    "baseUnit": p.get("base_unit"),
                    "storageType": p.get("storage_type"),
                    "status": p.get("status"),
                    "packCount": p.get("pack_count"),
                    "totalStock": p.get("total_stock"),
                    "syncedAt": now,
                }
                await db.cpis_products.update_one(
                    {"productId": doc["productId"]}, {"$set": doc}, upsert=True
                )
                synced += 1
            offset += limit
            if not items or offset >= (total or 0):
                break
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CPIS sync failed: {e}")
    await db.config.update_one({"key": "app"}, {"$set": {"cpisLastSync": now, "cpisProductCount": synced}}, upsert=True)
    return {"synced": synced, "total": total, "lastSync": now}


@api_router.post("/cpis/packs/resolve")
async def cpis_resolve_packs(data: PackResolveInput, current=Depends(get_current_user)):
    codes = [c for c in (data.shortCodes or []) if c and c.strip()]
    if not codes:
        return {"items": []}
    try:
        res = cpis_post("/packs/resolve", {"short_codes": codes})
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CPIS resolve failed: {e}")
    items = []
    for it in res.get("items", []):
        p = it.get("product") or {}
        pk = it.get("pack") or {}
        items.append(
            {
                "shortCode": it.get("short_code"),
                "found": bool(it.get("found")),
                "productId": p.get("product_id"),
                "sku": p.get("sku"),
                "productName": p.get("name"),
                "baseUnit": p.get("base_unit"),
                "packId": pk.get("pack_id"),
                "packName": pk.get("name"),
                "packShortCode": pk.get("short_code"),
                "unitQuantity": pk.get("unit_quantity"),
            }
        )
    return {"items": items}


@api_router.get("/cpis/status")
async def cpis_status(current=Depends(require_admin)):
    cfg = await db.config.find_one({"key": "app"}, {"_id": 0}) or {}
    count = await db.cpis_products.count_documents({})
    return {"lastSync": cfg.get("cpisLastSync"), "productCount": count, "configured": bool(CPIS_API_KEY)}


@api_router.get("/cpis/products")
async def cpis_products(query: str = "", limit: int = 25, current=Depends(get_current_user)):
    q = {}
    if query and query.strip():
        rx = {"$regex": re.escape(query.strip()), "$options": "i"}
        q = {"$or": [{"name": rx}, {"sku": rx}, {"brandName": rx}]}
    limit = max(1, min(limit, 100))
    items = await db.cpis_products.find(q, {"_id": 0}).limit(limit).to_list(limit)
    total = await db.cpis_products.count_documents(q)
    return {"items": items, "total": total}


@api_router.get("/cpis/products/{product_id}/packs")
async def cpis_product_packs(product_id: str, current=Depends(get_current_user)):
    try:
        data = cpis_get(f"/products/{product_id}")
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CPIS fetch failed: {e}")
    packs = [
        {
            "packId": p.get("pack_id"),
            "name": p.get("name"),
            "shortCode": p.get("short_code"),
            "unitQuantity": p.get("unit_quantity"),
            "unitOfMeasure": p.get("unit_of_measure"),
            "imageId": (p.get("images") or [{}])[0].get("image_id") if p.get("images") else None,
        }
        for p in data.get("packs", [])
    ]
    return {"productId": product_id, "baseUnit": data.get("base_unit"), "packs": packs}


@api_router.get("/cpis/images/{image_id}")
async def cpis_image(image_id: str):
    try:
        resp = requests.get(
            f"{CPIS_BASE_URL}/images/{image_id}/content", headers=cpis_headers(), timeout=30
        )
        resp.raise_for_status()
    except requests.HTTPError:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        content=resp.content,
        media_type=resp.headers.get("Content-Type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@api_router.get("/cpis/products/{product_id}/stock")
async def cpis_product_stock(product_id: str, current=Depends(get_current_user)):
    try:
        data = cpis_get(f"/stock/products/{product_id}", {"site_id": CPIS_SITE_ID})
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CPIS stock fetch failed: {e}")
    return data


@api_router.get("/cpis/products/{product_id}/sales")
async def cpis_product_sales(
    product_id: str, granularity: str = "weekly", periods: int = 6, current=Depends(require_admin)
):
    try:
        data = cpis_get(
            f"/analytics/products/{product_id}/sales",
            {"granularity": granularity, "periods": periods},
        )
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CPIS sales fetch failed: {e}")
    return data


# ---------------------------------------------------------------------------
# Supplier-wise pack configuration & pricing
# ---------------------------------------------------------------------------
def _per_unit_price(pack_price, unit_quantity):
    if pack_price is None:
        return None
    try:
        uq = float(unit_quantity or 1) or 1
        return round(float(pack_price) / uq, 4)
    except Exception:
        return None


@api_router.get("/supplier-pack-configs")
async def list_supplier_pack_configs(
    supplierId: Optional[str] = None, productId: Optional[str] = None, current=Depends(require_admin)
):
    q = {}
    if supplierId:
        q["supplierId"] = supplierId
    if productId:
        q["productId"] = productId
    return await db.supplier_pack_configs.find(q, {"_id": 0}).to_list(2000)


@api_router.post("/supplier-pack-configs")
async def save_supplier_pack_config(data: SupplierPackConfigInput, current=Depends(require_admin)):
    per_unit = _per_unit_price(data.packPrice, data.unitQuantity)
    doc = data.model_dump()
    doc["perUnitPrice"] = per_unit
    doc["id"] = str(uuid.uuid4())
    doc["updatedAt"] = datetime.now(timezone.utc).isoformat()
    existing = await db.supplier_pack_configs.find_one({"supplierId": data.supplierId, "packId": data.packId})
    if existing:
        doc["id"] = existing["id"]
        await db.supplier_pack_configs.update_one(
            {"supplierId": data.supplierId, "packId": data.packId}, {"$set": doc}
        )
    else:
        await db.supplier_pack_configs.insert_one(doc)

    # Also persist the derived per-unit price against this product's 1-unit ("each") pack.
    if per_unit is not None:
        try:
            packs = cpis_get(f"/products/{data.productId}").get("packs", [])
        except Exception:
            packs = []
        unit_pack = next((p for p in packs if float(p.get("unit_quantity") or 0) == 1), None)
        if unit_pack and unit_pack.get("pack_id") != data.packId:
            each_doc = {
                "supplierId": data.supplierId,
                "productId": data.productId,
                "packId": unit_pack.get("pack_id"),
                "packName": unit_pack.get("name"),
                "packShortCode": unit_pack.get("short_code"),
                "unitQuantity": 1,
                "baseUnit": data.baseUnit,
                "unitsPerLayer": None,
                "unitsPerPallet": None,
                "packPrice": per_unit,
                "perUnitPrice": per_unit,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "derivedFromPackId": data.packId,
            }
            ex = await db.supplier_pack_configs.find_one(
                {"supplierId": data.supplierId, "packId": unit_pack.get("pack_id")}
            )
            if ex:
                each_doc["id"] = ex["id"]
                await db.supplier_pack_configs.update_one(
                    {"supplierId": data.supplierId, "packId": unit_pack.get("pack_id")}, {"$set": each_doc}
                )
            else:
                each_doc["id"] = str(uuid.uuid4())
                await db.supplier_pack_configs.insert_one(each_doc)

    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Purchase Orders
# ---------------------------------------------------------------------------
async def _next_po_number() -> str:
    cfg = await db.config.find_one_and_update(
        {"key": "po_counter"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    seq = (cfg or {}).get("seq", 1)
    return f"PO-{seq:04d}"


async def _enrich_po(po: dict) -> dict:
    supplier = await db.suppliers.find_one({"id": po.get("supplierId")}, {"_id": 0}) if po.get("supplierId") else None
    po["supplier"] = supplier
    for ln in po.get("lines", []):
        ln["lineTotal"] = round((ln.get("packPrice") or 0) * (ln.get("quantityPacks") or 0), 2)
    po["total"] = round(sum(l.get("lineTotal", 0) for l in po.get("lines", [])), 2)
    return po


@api_router.get("/purchase-orders")
async def list_purchase_orders(current=Depends(require_admin)):
    pos = await db.purchase_orders.find({}, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    return [await _enrich_po(p) for p in pos]


@api_router.get("/purchase-orders/{po_id}")
async def get_purchase_order(po_id: str, current=Depends(require_admin)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Not found")
    return await _enrich_po(po)


@api_router.post("/purchase-orders")
async def create_purchase_order(data: PurchaseOrderInput, current=Depends(require_admin)):
    lines = []
    for ln in data.lines:
        d = ln.model_dump()
        d["perUnitPrice"] = _per_unit_price(d.get("packPrice"), d.get("unitQuantity"))
        lines.append(d)
    doc = {
        "id": str(uuid.uuid4()),
        "poNumber": await _next_po_number(),
        "supplierId": data.supplierId,
        "notes": data.notes,
        "lines": lines,
        "status": "open",
        "invoiceNumber": None,
        "linkedReceivalId": None,
        "cpisReceipts": [],
        "createdBy": current.get("name"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.purchase_orders.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_po(doc)


@api_router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, data: PurchaseOrderInput, current=Depends(require_admin)):
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="Not found")
    if po.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Closed purchase orders cannot be edited")
    lines = []
    for ln in data.lines:
        d = ln.model_dump()
        d["perUnitPrice"] = _per_unit_price(d.get("packPrice"), d.get("unitQuantity"))
        lines.append(d)
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"supplierId": data.supplierId, "notes": data.notes, "lines": lines}},
    )
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    return await _enrich_po(po)


@api_router.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str, current=Depends(require_admin)):
    await db.purchase_orders.delete_one({"id": po_id})
    return {"ok": True}


@api_router.post("/purchase-orders/{po_id}/close")
async def close_purchase_order(po_id: str, data: PurchaseOrderClose, current=Depends(require_admin)):
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="Not found")
    if po.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Already closed")
    if not data.invoiceNumber or not data.invoiceNumber.strip():
        raise HTTPException(status_code=400, detail="Invoice number is required")

    # Link a receival confirmation and auto-populate its invoice number.
    if data.linkedReceivalId:
        rec = await db.receivals.find_one({"id": data.linkedReceivalId})
        if not rec:
            raise HTTPException(status_code=404, detail="Receival to link not found")
        await db.receivals.update_one(
            {"id": data.linkedReceivalId},
            {
                "$set": {"invoiceNumber": data.invoiceNumber, "invoiceReceived": True},
                "$push": {"changeLog": _log(current, f"Linked to purchase order {po.get('poNumber')}, invoice #{data.invoiceNumber}")},
            },
        )

    # Post a positive goods-receipt to CPIS for each line (idempotent per line).
    # Received quantity is used when provided, else the ordered quantity.
    receipts = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for idx, ln in enumerate(po.get("lines", [])):
        ordered = ln.get("quantityPacks") or 0
        received = ln.get("receivedPacks")
        qty = received if received is not None else ordered
        # Record a purchasing-price history point (based on price, independent of receipt qty).
        if ln.get("packId") and ln.get("packPrice") is not None:
            await db.price_history.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "supplierId": po.get("supplierId"),
                    "productId": ln.get("productId"),
                    "sku": ln.get("sku"),
                    "productName": ln.get("productName"),
                    "packId": ln.get("packId"),
                    "packName": ln.get("packName"),
                    "packShortCode": ln.get("packShortCode"),
                    "unitQuantity": ln.get("unitQuantity"),
                    "baseUnit": ln.get("baseUnit"),
                    "packPrice": ln.get("packPrice"),
                    "perUnitPrice": ln.get("perUnitPrice"),
                    "poId": po_id,
                    "poNumber": po.get("poNumber"),
                    "recordedAt": now_iso,
                }
            )
        if not ln.get("packId") or not qty:
            continue
        idem = f"{po_id}:{ln['packId']}:{idx}"
        payload = {
            "pack_id": ln["packId"],
            "quantity": str(qty),
            "reference": {"type": "purchase_order", "id": po.get("poNumber")},
        }
        try:
            res = cpis_post(
                "/stock/receipts",
                payload,
                {"Idempotency-Key": idem, "X-Source-System": CPIS_SOURCE_SYSTEM},
            )
            receipts.append({"packId": ln["packId"], "quantity": qty, "accepted": True, "result": res})
        except requests.HTTPError as e:
            body = e.response.text if e.response is not None else str(e)
            receipts.append({"packId": ln["packId"], "quantity": qty, "accepted": False, "error": body})

    await db.purchase_orders.update_one(
        {"id": po_id},
        {
            "$set": {
                "status": "closed",
                "invoiceNumber": data.invoiceNumber,
                "linkedReceivalId": data.linkedReceivalId,
                "cpisReceipts": receipts,
                "closedBy": current.get("name"),
                "closedAt": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    failed = [r for r in receipts if not r.get("accepted")]
    result = await _enrich_po(po)
    result["receiptsFailed"] = len(failed)
    return result


# ---------------------------------------------------------------------------
# Purchasing price history & pricing API (system-to-system via X-API-Key)
# ---------------------------------------------------------------------------
async def _pack_pricing_summary(pack_id: str) -> dict:
    hist = (
        await db.price_history.find({"packId": pack_id}, {"_id": 0})
        .sort("recordedAt", -1)
        .to_list(1000)
    )
    if not hist:
        return {
            "packId": pack_id,
            "found": False,
            "latestPrice": None,
            "latestPerUnitPrice": None,
            "averageLast3": None,
            "averageLast3PerUnit": None,
            "previousPrice": None,
            "count": 0,
            "latestRecordedAt": None,
        }
    latest = hist[0]
    last3 = [h["packPrice"] for h in hist[:3] if h.get("packPrice") is not None]
    last3u = [h["perUnitPrice"] for h in hist[:3] if h.get("perUnitPrice") is not None]
    meta = latest
    return {
        "packId": pack_id,
        "found": True,
        "productId": meta.get("productId"),
        "sku": meta.get("sku"),
        "productName": meta.get("productName"),
        "packName": meta.get("packName"),
        "packShortCode": meta.get("packShortCode"),
        "unitQuantity": meta.get("unitQuantity"),
        "baseUnit": meta.get("baseUnit"),
        "latestPrice": latest.get("packPrice"),
        "latestPerUnitPrice": latest.get("perUnitPrice"),
        "previousPrice": hist[1].get("packPrice") if len(hist) > 1 else None,
        "previousPerUnitPrice": hist[1].get("perUnitPrice") if len(hist) > 1 else None,
        "averageLast3": round(sum(last3) / len(last3), 4) if last3 else None,
        "averageLast3PerUnit": round(sum(last3u) / len(last3u), 4) if last3u else None,
        "count": len(hist),
        "latestRecordedAt": latest.get("recordedAt"),
    }


@api_router.get("/pricing/history")
async def pricing_history(
    packId: Optional[str] = None,
    productId: Optional[str] = None,
    supplierId: Optional[str] = None,
    limit: int = 200,
    current=Depends(require_admin),
):
    q = {}
    if packId:
        q["packId"] = packId
    if productId:
        q["productId"] = productId
    if supplierId:
        q["supplierId"] = supplierId
    limit = max(1, min(limit, 1000))
    items = await db.price_history.find(q, {"_id": 0}).sort("recordedAt", -1).limit(limit).to_list(limit)
    summary = await _pack_pricing_summary(packId) if packId else None
    return {"items": items, "summary": summary}


# --- Exposed to other systems (X-API-Key auth, reuses the CPIS system key) ---
@api_router.get("/pricing/packs/{pack_id}")
async def pricing_pack(pack_id: str, _auth=Depends(require_system_key)):
    return await _pack_pricing_summary(pack_id)


class PricingBatchInput(BaseModel):
    packIds: List[str] = []


@api_router.post("/pricing/batch")
async def pricing_batch(data: PricingBatchInput, _auth=Depends(require_system_key)):
    items = [await _pack_pricing_summary(pid) for pid in data.packIds]
    return {"items": items}


# ---------------------------------------------------------------------------
# To-order list (staff add items to order; admin marks ordered)
# ---------------------------------------------------------------------------
@api_router.get("/order-list")
async def list_order_list(current=Depends(get_current_user)):
    items = await db.order_list.find({}, {"_id": 0}).sort("addedAt", -1).to_list(2000)
    # pending first, then ordered
    items.sort(key=lambda x: (x.get("status") == "ordered", x.get("addedAt") or ""))
    return items


@api_router.post("/order-list")
async def add_order_list(data: OrderListItemInput, current=Depends(get_current_user)):
    doc = data.model_dump()
    diff = None
    if doc.get("physicalStock") is not None and doc.get("cpisStock") is not None:
        diff = doc["physicalStock"] - doc["cpisStock"]
    doc.update(
        {
            "id": str(uuid.uuid4()),
            "status": "pending",
            "estimatedDelivery": None,
            "stockDifference": diff,
            "addedBy": current.get("name"),
            "addedAt": datetime.now(timezone.utc).isoformat(),
            "orderedBy": None,
            "orderedAt": None,
        }
    )
    await db.order_list.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/order-list/{item_id}")
async def update_order_list(item_id: str, data: PhysicalStockInput, current=Depends(get_current_user)):
    item = await db.order_list.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    diff = None
    if data.physicalStock is not None and item.get("cpisStock") is not None:
        diff = data.physicalStock - item["cpisStock"]
    await db.order_list.update_one(
        {"id": item_id}, {"$set": {"physicalStock": data.physicalStock, "stockDifference": diff}}
    )
    item = await db.order_list.find_one({"id": item_id}, {"_id": 0})
    return item


@api_router.post("/order-list/mark-ordered")
async def mark_ordered(data: MarkOrderedInput, current=Depends(require_admin)):
    if not data.ids:
        raise HTTPException(status_code=400, detail="No items selected")
    now = datetime.now(timezone.utc).isoformat()
    result = await db.order_list.update_many(
        {"id": {"$in": data.ids}},
        {
            "$set": {
                "status": "ordered",
                "estimatedDelivery": data.estimatedDelivery,
                "orderedBy": current.get("name"),
                "orderedAt": now,
            }
        },
    )
    return {"updated": result.modified_count}


@api_router.delete("/order-list/{item_id}")
async def delete_order_list(item_id: str, current=Depends(require_admin)):
    await db.order_list.delete_one({"id": item_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# File serving (public read through backend)
# ---------------------------------------------------------------------------
@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=content_type)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")

    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL.lower(),
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user")
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one({"email": ADMIN_EMAIL.lower()}, {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}})

    # Seed sample suppliers, statuses, staff on first run
    if await db.suppliers.count_documents({}) == 0:
        for n in ["Fresh Foods Ltd", "Baltic Distributors", "Eurasia Wholesale", "Global Produce Co"]:
            await db.suppliers.insert_one({"id": str(uuid.uuid4()), "name": n})
    if await db.statuses.count_documents({}) == 0:
        for n in ["Pending", "In Transit", "Delivered", "Disputed"]:
            await db.statuses.insert_one({"id": str(uuid.uuid4()), "name": n})
    if await db.staff.count_documents({}) == 0:
        await db.staff.insert_one({"id": str(uuid.uuid4()), "name": "Warehouse Staff", "pin": "1234"})
    if await db.locations.count_documents({}) == 0:
        for n in ["Cold Store A", "Cold Store B", "Dry Store", "Freezer", "Receiving Bay"]:
            await db.locations.insert_one({"id": str(uuid.uuid4()), "name": n})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
