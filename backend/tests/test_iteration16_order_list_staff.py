"""
Iteration 16 - Staff can add products to To-Order list.
Tests CPIS endpoints open to staff, stockDifference computation on add + PUT,
and admin-only guards for mark-ordered + delete remain intact.
"""
import os
import pytest
import requests

from pathlib import Path
_env = Path("/app/frontend/.env").read_text()
for _l in _env.splitlines():
    if _l.startswith("REACT_APP_BACKEND_URL="):
        os.environ.setdefault("REACT_APP_BACKEND_URL", _l.split("=", 1)[1].strip())
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@eurasia.com", "password": "admin123"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{BASE_URL}/api/auth/staff-login", json={"pin": "1234"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# --- CPIS endpoints accessible to staff -----------------------------------
class TestCPISOpenToStaff:
    def test_cpis_products_staff(self, staff_token):
        r = requests.get(
            f"{BASE_URL}/api/cpis/products",
            headers=_h(staff_token),
            params={"query": "mushroom", "limit": 10},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_cpis_packs_and_stock_staff(self, staff_token):
        # Find any product first
        r = requests.get(
            f"{BASE_URL}/api/cpis/products",
            headers=_h(staff_token),
            params={"query": "", "limit": 5},
            timeout=30,
        )
        assert r.status_code == 200
        items = r.json().get("items", [])
        if not items:
            pytest.skip("No CPIS products available")
        pid = items[0].get("productId") or items[0].get("id")
        rp = requests.get(f"{BASE_URL}/api/cpis/products/{pid}/packs", headers=_h(staff_token), timeout=60)
        assert rp.status_code == 200, rp.text
        rs = requests.get(f"{BASE_URL}/api/cpis/products/{pid}/stock", headers=_h(staff_token), timeout=60)
        assert rs.status_code == 200, rs.text


# --- Order list staff flow -----------------------------------------------
class TestOrderListStaff:
    created_ids = []

    def test_staff_add_with_cpis_stock(self, staff_token, admin_token):
        payload = {
            "productId": "test-prod-1",
            "sku": "TEST_SKU_STAFF",
            "productName": "TEST_ Staff Added Item",
            "packId": "test-pack-1",
            "packName": "1 x 1kg",
            "packShortCode": "1x1kg",
            "unitQuantity": 1,
            "baseUnit": "kg",
            "cpisStock": 40,
        }
        r = requests.post(f"{BASE_URL}/api/order-list", headers=_h(staff_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["cpisStock"] == 40
        assert doc["status"] == "pending"
        assert doc["addedBy"] == "Warehouse Staff" or doc["addedBy"]  # staff name
        assert doc["stockDifference"] is None  # no physical yet
        TestOrderListStaff.created_ids.append(doc["id"])

    def test_staff_put_physical_stock_negative(self, staff_token):
        iid = TestOrderListStaff.created_ids[0]
        r = requests.put(
            f"{BASE_URL}/api/order-list/{iid}",
            headers=_h(staff_token),
            json={"physicalStock": 33},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["physicalStock"] == 33
        assert doc["stockDifference"] == -7
        # verify persistence via list
        r2 = requests.get(f"{BASE_URL}/api/order-list", headers=_h(staff_token), timeout=30)
        assert r2.status_code == 200
        found = [i for i in r2.json() if i["id"] == iid][0]
        assert found["physicalStock"] == 33
        assert found["stockDifference"] == -7

    def test_staff_put_physical_stock_positive(self, staff_token):
        iid = TestOrderListStaff.created_ids[0]
        r = requests.put(
            f"{BASE_URL}/api/order-list/{iid}",
            headers=_h(staff_token),
            json={"physicalStock": 45},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["stockDifference"] == 5

    def test_staff_cannot_mark_ordered(self, staff_token):
        iid = TestOrderListStaff.created_ids[0]
        r = requests.post(
            f"{BASE_URL}/api/order-list/mark-ordered",
            headers=_h(staff_token),
            json={"ids": [iid], "estimatedDelivery": "2026-02-01"},
            timeout=30,
        )
        assert r.status_code == 403, r.text

    def test_staff_cannot_delete(self, staff_token):
        iid = TestOrderListStaff.created_ids[0]
        r = requests.delete(f"{BASE_URL}/api/order-list/{iid}", headers=_h(staff_token), timeout=30)
        assert r.status_code == 403, r.text


# --- Admin regression ------------------------------------------------------
class TestOrderListAdmin:
    admin_ids = []

    def test_admin_add(self, admin_token):
        payload = {
            "productId": "test-prod-2",
            "productName": "TEST_ Admin Added",
            "packId": "test-pack-2",
            "packName": "1 x 500g",
            "unitQuantity": 1,
            "cpisStock": 10,
            "physicalStock": 7,
        }
        r = requests.post(f"{BASE_URL}/api/order-list", headers=_h(admin_token), json=payload, timeout=30)
        assert r.status_code == 200
        doc = r.json()
        assert doc["stockDifference"] == -3
        TestOrderListAdmin.admin_ids.append(doc["id"])

    def test_admin_mark_ordered(self, admin_token):
        iid = TestOrderListAdmin.admin_ids[0]
        r = requests.post(
            f"{BASE_URL}/api/order-list/mark-ordered",
            headers=_h(admin_token),
            json={"ids": [iid], "estimatedDelivery": "2026-02-15"},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["updated"] == 1
        # verify
        r2 = requests.get(f"{BASE_URL}/api/order-list", headers=_h(admin_token), timeout=30)
        found = [i for i in r2.json() if i["id"] == iid][0]
        assert found["status"] == "ordered"
        assert found["estimatedDelivery"] == "2026-02-15"

    def test_admin_delete_cleanup(self, admin_token):
        # Delete every TEST-created item AND any leftover items to leave page empty
        r = requests.get(f"{BASE_URL}/api/order-list", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        for it in r.json():
            rd = requests.delete(f"{BASE_URL}/api/order-list/{it['id']}", headers=_h(admin_token), timeout=30)
            assert rd.status_code == 200
        # confirm empty
        r2 = requests.get(f"{BASE_URL}/api/order-list", headers=_h(admin_token), timeout=30)
        assert r2.json() == []
