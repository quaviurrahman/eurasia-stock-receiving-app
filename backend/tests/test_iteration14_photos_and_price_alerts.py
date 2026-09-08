"""Iteration 14: verify photo-upload bug fix (create receival + media) and
price-alert history flow used by PurchaseOrderEditPage.

Uses admin JWT for everything except one staff-login sanity check.
Cleans up all created resources (receivals, POs, price_history, CPIS reversal).
"""
import io
import os
import base64
import uuid
import time
import pytest
import requests
from PIL import Image
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
ADMIN_EMAIL = "admin@eurasia.com"
ADMIN_PASSWORD = "admin123"
STAFF_PIN = "1234"
CPIS_KEY = "cpis_live_b816c49c3d904926ab099562e275cc2cae5e007e"
CPIS_MOVE_URL = "https://product-core-5.emergent.host/api/stock/movements"

PRODUCT_ID = "3ff78b8b-8292-433d-b2a3-91eeb8432bdf"
PACK_ID = "a1021b15-be3c-4262-988a-bc2cfc072e44"

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{BASE}/auth/staff-login", json={"pin": STAFF_PIN})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _make_image_b64(size=(1200, 1200), color=(120, 160, 200)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(scope="module")
def state():
    return {"receivals": [], "pos": [], "cpis_reversals": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(state, admin_token):
    yield
    # Delete receivals
    for rid in state["receivals"]:
        try:
            requests.delete(f"{BASE}/receivals/{rid}", headers=_auth(admin_token))
        except Exception:
            pass
    # Delete POs (best effort) and reverse CPIS receipts
    for po in state["pos"]:
        try:
            requests.delete(f"{BASE}/purchase-orders/{po}", headers=_auth(admin_token))
        except Exception:
            pass
    for qty in state["cpis_reversals"]:
        try:
            requests.post(
                CPIS_MOVE_URL,
                headers={
                    "X-API-Key": CPIS_KEY,
                    "X-Source-System": "EURASIA_INTAKE",
                    "Idempotency-Key": str(uuid.uuid4()),
                    "Content-Type": "application/json",
                },
                json={
                    "pack_id": PACK_ID,
                    "quantity": f"-{qty}",
                    "bucket": "SELLABLE",
                    "reason": "DISPATCH",
                    "reference": {"type": "test_cleanup", "id": "iter14"},
                },
                timeout=15,
            )
        except Exception:
            pass
    # Clean price_history rows created via test POs
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        # Delete only price_history rows created by our POs (poNumber tracked)
        po_numbers = state.get("po_numbers", [])
        if po_numbers:
            db.price_history.delete_many({"poNumber": {"$in": po_numbers}})
        client.close()
    except Exception:
        pass


# ---------- Photo bug fix tests ----------
class TestPhotoBugFix:
    def test_staff_login_ok(self, staff_token):
        assert staff_token

    def test_create_receival_no_photos(self, admin_token, state):
        r = requests.post(
            f"{BASE}/receivals",
            headers=_auth(admin_token),
            json={
                "supplierId": None, "statusId": None, "locationId": None,
                "deliveryDate": "2026-01-15", "observation": "TEST_no_photos",
                "palletCount": 1, "items": [], "slips": [],
                "base64Images": [], "base64Signatures": [], "signedByNames": [],
            },
        )
        assert r.status_code == 200, r.text
        rec = r.json()
        state["receivals"].append(rec["id"])
        assert rec["images"] == []

    def test_create_receival_then_upload_media_as_staff(self, staff_token, state):
        # Simulates new frontend flow: create empty, then add media one-by-one.
        r = requests.post(
            f"{BASE}/receivals",
            headers=_auth(staff_token),
            json={
                "supplierId": None, "statusId": None, "locationId": None,
                "deliveryDate": "2026-01-15", "observation": "TEST_staff_media",
                "palletCount": 0, "items": [], "slips": [],
                "base64Images": [], "base64Signatures": [], "signedByNames": [],
            },
        )
        assert r.status_code == 200, r.text
        rec = r.json()
        rid = rec["id"]
        state["receivals"].append(rid)

        # Upload 2 photos sequentially via media endpoint (as staff)
        img1 = _make_image_b64(color=(200, 50, 50))
        img2 = _make_image_b64(color=(50, 200, 100))
        for img in (img1, img2):
            m = requests.post(
                f"{BASE}/receivals/{rid}/media",
                headers=_auth(staff_token),
                json={"addImages": [img]},
            )
            assert m.status_code == 200, m.text

        g = requests.get(f"{BASE}/receivals/{rid}", headers=_auth(staff_token))
        assert g.status_code == 200
        data = g.json()
        assert len(data["images"]) == 2, data
        # And each image path is retrievable via /files/{path}
        for path in data["images"]:
            f = requests.get(f"{BASE}/files/{path}")
            assert f.status_code == 200
            assert f.headers.get("content-type", "").startswith("image/")

    def test_create_receival_admin_photo_flow(self, admin_token, state):
        r = requests.post(
            f"{BASE}/receivals",
            headers=_auth(admin_token),
            json={
                "supplierId": None, "statusId": None, "locationId": None,
                "deliveryDate": "2026-01-15", "observation": "TEST_admin_media",
                "palletCount": 0, "items": [], "slips": [],
                "base64Images": [], "base64Signatures": [], "signedByNames": [],
            },
        )
        assert r.status_code == 200
        rid = r.json()["id"]
        state["receivals"].append(rid)
        m = requests.post(
            f"{BASE}/receivals/{rid}/media",
            headers=_auth(admin_token),
            json={"addImages": [_make_image_b64()]},
        )
        assert m.status_code == 200
        assert len(m.json()["images"]) == 1


# ---------- Price alert history flow ----------
class TestPriceAlertHistory:
    def test_history_then_alert_data(self, admin_token, state):
        # Pick first available supplier
        sup = requests.get(f"{BASE}/suppliers", headers=_auth(admin_token)).json()
        assert sup, "no suppliers"
        supplier_id = sup[0]["id"]

        # Create PO 1 with line at 100
        po_payload = {
            "supplierId": supplier_id, "notes": "TEST_iter14_hist",
            "lines": [{
                "productId": PRODUCT_ID, "sku": "freveg20", "productName": "Test Product",
                "packId": PACK_ID, "packName": "1kg", "packShortCode": "",
                "unitQuantity": 1, "baseUnit": "kg",
                "quantityPacks": 1, "receivedPacks": 1, "packPrice": 100,
                "unitsPerLayer": None, "unitsPerPallet": None,
            }],
        }
        r = requests.post(f"{BASE}/purchase-orders", headers=_auth(admin_token), json=po_payload)
        assert r.status_code == 200, r.text
        po1 = r.json()
        state["pos"].append(po1["id"])
        state.setdefault("po_numbers", []).append(po1["poNumber"])

        # Close PO1 -> records price_history at 100 and posts CPIS receipt (1 pack)
        c = requests.post(
            f"{BASE}/purchase-orders/{po1['id']}/close",
            headers=_auth(admin_token),
            json={"invoiceNumber": "TEST-INV-14A", "linkedReceivalId": None},
        )
        assert c.status_code == 200, c.text
        state["cpis_reversals"].append(1)  # 1 pack unit_quantity 1 => 1 base unit

        # Small wait; price_history is written synchronously but no harm
        time.sleep(0.5)

        # Verify /pricing/history returns items and last=100
        h = requests.get(
            f"{BASE}/pricing/history",
            headers=_auth(admin_token),
            params={"packId": PACK_ID, "supplierId": supplier_id, "limit": 50},
        )
        assert h.status_code == 200, h.text
        items = h.json().get("items", [])
        assert len(items) >= 1
        # Newest first per code (sort -1 recordedAt)
        assert items[0]["packPrice"] == 100
        # Summary present
        summary = h.json().get("summary")
        assert summary and summary.get("latestPrice") == 100

    def test_no_history_returns_empty(self, admin_token):
        random_pack = str(uuid.uuid4())
        h = requests.get(
            f"{BASE}/pricing/history",
            headers=_auth(admin_token),
            params={"packId": random_pack, "limit": 10},
        )
        assert h.status_code == 200
        assert h.json()["items"] == []
