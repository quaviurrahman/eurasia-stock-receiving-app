from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import base64
import logging
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
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
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
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
    result = put_object(path, raw, content_type)
    return result["path"]


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
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
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginInput(BaseModel):
    email: str
    password: str


class NamedInput(BaseModel):
    name: str


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


class ReceivalCreate(BaseModel):
    supplierId: Optional[str] = None
    statusId: Optional[str] = None
    deliveryDate: Optional[str] = None
    observation: str = ""
    dispute: bool = False
    palletCount: Optional[int] = 0
    pin: str
    items: List[ReceivalItem] = []
    base64Images: List[str] = []
    base64Signatures: List[str] = []
    signedByNames: List[str] = []


class ReceivalUpdate(BaseModel):
    supplierId: Optional[str] = None
    statusId: Optional[str] = None
    deliveryDate: Optional[str] = None
    observation: Optional[str] = None
    dispute: Optional[bool] = None
    palletCount: Optional[int] = None
    recordedInSystem: Optional[bool] = None
    invoiceReceived: Optional[bool] = None
    priceChecked: Optional[bool] = None
    items: Optional[List[ReceivalItem]] = None


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"])
    return {
        "access_token": token,
        "user": {"id": user["id"], "email": user["email"], "name": user.get("name"), "role": user.get("role")},
    }


@api_router.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return current


# ---------------------------------------------------------------------------
# Staff (PIN identity)
# ---------------------------------------------------------------------------
@api_router.get("/staff")
async def list_staff(current=Depends(get_current_user)):
    return await db.staff.find({}, {"_id": 0, "pin": 0}).to_list(1000)


@api_router.post("/staff")
async def add_staff(data: StaffInput, current=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": data.name, "pin": data.pin}
    await db.staff.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"]}


@api_router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, current=Depends(get_current_user)):
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
async def add_supplier(data: NamedInput, current=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": data.name}
    await db.suppliers.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"]}


@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, data: NamedInput, current=Depends(get_current_user)):
    await db.suppliers.update_one({"id": supplier_id}, {"$set": {"name": data.name}})
    return {"ok": True}


@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, current=Depends(get_current_user)):
    await db.suppliers.delete_one({"id": supplier_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Statuses
# ---------------------------------------------------------------------------
@api_router.get("/statuses")
async def list_statuses():
    return await db.statuses.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/statuses")
async def add_status(data: NamedInput, current=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": data.name}
    await db.statuses.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"]}


@api_router.delete("/statuses/{status_id}")
async def delete_status(status_id: str, current=Depends(get_current_user)):
    await db.statuses.delete_one({"id": status_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Receivals (order receival confirmations)
# ---------------------------------------------------------------------------
async def _enrich(rec: dict) -> dict:
    supplier = await db.suppliers.find_one({"id": rec.get("supplierId")}, {"_id": 0}) if rec.get("supplierId") else None
    status = await db.statuses.find_one({"id": rec.get("statusId")}, {"_id": 0}) if rec.get("statusId") else None
    rec["supplier"] = supplier
    rec["status"] = status
    return rec


@api_router.get("/receivals")
async def list_receivals(current=Depends(get_current_user)):
    recs = await db.receivals.find({}, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    return [await _enrich(r) for r in recs]


@api_router.get("/receivals/{rec_id}")
async def get_receival(rec_id: str, current=Depends(get_current_user)):
    rec = await db.receivals.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    return await _enrich(rec)


@api_router.post("/receivals")
async def create_receival(data: ReceivalCreate):
    staff = await db.staff.find_one({"pin": data.pin})
    if not staff:
        raise HTTPException(status_code=401, detail="Invalid PIN")

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

    doc = {
        "id": str(uuid.uuid4()),
        "supplierId": data.supplierId,
        "statusId": data.statusId,
        "deliveryDate": data.deliveryDate,
        "observation": data.observation,
        "dispute": data.dispute,
        "palletCount": data.palletCount or 0,
        "receivedBy": staff["name"],
        "recordedInSystem": False,
        "invoiceReceived": False,
        "priceChecked": False,
        "items": [i.model_dump() for i in data.items],
        "images": image_paths,
        "signatures": signatures,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.receivals.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich(doc)


@api_router.put("/receivals/{rec_id}")
async def update_receival(rec_id: str, data: ReceivalUpdate, current=Depends(get_current_user)):
    rec = await db.receivals.find_one({"id": rec_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    update = data.model_dump(exclude_unset=True)
    if update:
        await db.receivals.update_one({"id": rec_id}, {"$set": update})
    rec = await db.receivals.find_one({"id": rec_id}, {"_id": 0})
    return await _enrich(rec)


@api_router.delete("/receivals/{rec_id}")
async def delete_receival(rec_id: str, current=Depends(get_current_user)):
    await db.receivals.delete_one({"id": rec_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Archive (records older than 3 months)
# ---------------------------------------------------------------------------
def _cutoff_iso() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()


@api_router.get("/archive/preview")
async def archive_preview(current=Depends(get_current_user)):
    cutoff = _cutoff_iso()
    recs = await db.receivals.find({"createdAt": {"$lt": cutoff}}, {"_id": 0}).to_list(5000)
    return {"count": len(recs), "cutoff": cutoff, "records": [await _enrich(r) for r in recs]}


@api_router.delete("/archive")
async def archive_delete(current=Depends(get_current_user)):
    cutoff = _cutoff_iso()
    result = await db.receivals.delete_many({"createdAt": {"$lt": cutoff}})
    return {"deleted": result.deleted_count}


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
