"""Backend tests for the To-Order (order-list) feature - iteration 15."""
import os
import pytest
import requests
from pathlib import Path

def _load_env():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return
    envf = Path("/app/frontend/.env")
    if envf.exists():
        for line in envf.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@eurasia.com"
ADMIN_PASSWORD = "admin123"
STAFF_PIN = "1234"

DR_PEPPER_PRODUCT_ID = "889085d8-42ec-4a65-a3b0-6dfb9de23c86"
DR_PEPPER_PACK_ID = "7777208d-e811-4310-b124-e0ba2f29a02f"
DR_PEPPER_IMAGE_ID = None  # discovered dynamically


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{API}/auth/staff-login", json={"pin": STAFF_PIN})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def h(token):
    return {"Authorization": f"Bearer {token}"}


created_ids = []


def test_cpis_image_public_no_auth():
    # Get pack image id from packs endpoint
    global DR_PEPPER_IMAGE_ID
    # need auth for packs -- use admin
    tok_r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    tok = tok_r.json()["access_token"]
    r = requests.get(f"{API}/cpis/products/{DR_PEPPER_PRODUCT_ID}/packs", headers=h(tok))
    assert r.status_code == 200, r.text
    packs = r.json().get("packs", [])
    pack = next((p for p in packs if p.get("packId") == DR_PEPPER_PACK_ID), None)
    assert pack, f"Pack not found: {packs}"
    DR_PEPPER_IMAGE_ID = pack.get("imageId")
    assert DR_PEPPER_IMAGE_ID, f"imageId not returned in pack: {pack}"

    # Public no-auth image fetch
    r = requests.get(f"{API}/cpis/images/{DR_PEPPER_IMAGE_ID}")
    assert r.status_code == 200
    assert r.headers.get("Content-Type", "").startswith("image/")
    assert len(r.content) > 100


def test_order_list_get_initially(admin_token):
    r = requests.get(f"{API}/order-list", headers=h(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_staff_can_add_order_item(staff_token):
    payload = {
        "productId": DR_PEPPER_PRODUCT_ID,
        "sku": "TEST_DR",
        "productName": "TEST DR PEPPER",
        "packId": DR_PEPPER_PACK_ID,
        "packName": "Case",
        "packShortCode": "CS",
        "unitQuantity": 24,
        "baseUnit": "ea",
        "imageId": DR_PEPPER_IMAGE_ID,
    }
    r = requests.post(f"{API}/order-list", json=payload, headers=h(staff_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "pending"
    assert data["productId"] == DR_PEPPER_PRODUCT_ID
    assert data["imageId"] == DR_PEPPER_IMAGE_ID
    assert "_id" not in data
    created_ids.append(data["id"])


def test_staff_can_update_physical_stock(staff_token):
    assert created_ids
    iid = created_ids[0]
    r = requests.put(f"{API}/order-list/{iid}", json={"physicalStock": 5.5}, headers=h(staff_token))
    assert r.status_code == 200, r.text
    assert r.json()["physicalStock"] == 5.5

    # verify persistence via GET
    r = requests.get(f"{API}/order-list", headers=h(staff_token))
    item = next((x for x in r.json() if x["id"] == iid), None)
    assert item and item["physicalStock"] == 5.5


def test_staff_cannot_mark_ordered(staff_token):
    r = requests.post(
        f"{API}/order-list/mark-ordered",
        json={"ids": created_ids, "estimatedDelivery": "2026-02-01"},
        headers=h(staff_token),
    )
    assert r.status_code == 403


def test_staff_cannot_delete(staff_token):
    assert created_ids
    r = requests.delete(f"{API}/order-list/{created_ids[0]}", headers=h(staff_token))
    assert r.status_code == 403


def test_admin_can_add_and_mark_ordered_single(admin_token):
    payload = {
        "productId": DR_PEPPER_PRODUCT_ID,
        "productName": "TEST DR2",
        "packId": DR_PEPPER_PACK_ID,
        "packName": "Case",
        "unitQuantity": 24,
        "imageId": DR_PEPPER_IMAGE_ID,
    }
    r = requests.post(f"{API}/order-list", json=payload, headers=h(admin_token))
    assert r.status_code == 200
    iid = r.json()["id"]
    created_ids.append(iid)

    r = requests.post(
        f"{API}/order-list/mark-ordered",
        json={"ids": [iid], "estimatedDelivery": "2026-02-15"},
        headers=h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["updated"] == 1

    r = requests.get(f"{API}/order-list", headers=h(admin_token))
    item = next((x for x in r.json() if x["id"] == iid), None)
    assert item["status"] == "ordered"
    assert item["estimatedDelivery"] == "2026-02-15"


def test_admin_bulk_mark_ordered(admin_token):
    # Create two more
    ids = []
    for i in range(2):
        payload = {
            "productId": DR_PEPPER_PRODUCT_ID,
            "productName": f"TEST BULK {i}",
            "packId": DR_PEPPER_PACK_ID,
            "packName": "Case",
            "unitQuantity": 24,
        }
        r = requests.post(f"{API}/order-list", json=payload, headers=h(admin_token))
        assert r.status_code == 200
        ids.append(r.json()["id"])
        created_ids.append(r.json()["id"])

    r = requests.post(
        f"{API}/order-list/mark-ordered",
        json={"ids": ids, "estimatedDelivery": "2026-03-01"},
        headers=h(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["updated"] == 2

    r = requests.get(f"{API}/order-list", headers=h(admin_token))
    items = {x["id"]: x for x in r.json()}
    for iid in ids:
        assert items[iid]["status"] == "ordered"
        assert items[iid]["estimatedDelivery"] == "2026-03-01"


def test_mark_ordered_empty_ids_400(admin_token):
    r = requests.post(f"{API}/order-list/mark-ordered", json={"ids": []}, headers=h(admin_token))
    assert r.status_code == 400


def test_zz_cleanup_admin_delete(admin_token):
    for iid in created_ids:
        r = requests.delete(f"{API}/order-list/{iid}", headers=h(admin_token))
        assert r.status_code == 200
    # verify empty of our test items
    r = requests.get(f"{API}/order-list", headers=h(admin_token))
    remaining = [x for x in r.json() if x["id"] in created_ids]
    assert remaining == []
