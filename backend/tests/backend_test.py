"""Backend API tests for Eurasia Receivals app."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
# Use the frontend .env public URL
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "admin@eurasia.com"
ADMIN_PASSWORD = "admin123"
STAFF_PIN = "1234"

# 1x1 transparent PNG
TINY_PNG_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == ADMIN_EMAIL
    return data["access_token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Auth ----
def test_login_bad_password():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
    assert r.status_code == 401


def test_me(auth_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


def test_me_unauth():
    r = requests.get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 401


# ---- Verify PIN ----
def test_verify_pin_ok():
    r = requests.post(f"{BASE_URL}/api/verify-pin", json={"pin": STAFF_PIN}, timeout=30)
    assert r.status_code == 200
    assert r.json()["name"] == "Warehouse Staff"


def test_verify_pin_bad():
    r = requests.post(f"{BASE_URL}/api/verify-pin", json={"pin": "9999"}, timeout=30)
    assert r.status_code == 401


# ---- Suppliers / statuses / staff ----
def test_suppliers_public_list():
    r = requests.get(f"{BASE_URL}/api/suppliers", timeout=30)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "Fresh Foods Ltd" in names


def test_statuses_public_list():
    r = requests.get(f"{BASE_URL}/api/statuses", timeout=30)
    assert r.status_code == 200
    assert len(r.json()) >= 4


def test_supplier_crud(auth_headers):
    # create
    r = requests.post(f"{BASE_URL}/api/suppliers", json={"name": "TEST_Supplier_X"}, headers=auth_headers, timeout=30)
    assert r.status_code == 200
    sid = r.json()["id"]
    # verify persisted
    r2 = requests.get(f"{BASE_URL}/api/suppliers", timeout=30)
    assert any(s["id"] == sid for s in r2.json())
    # update
    r3 = requests.put(f"{BASE_URL}/api/suppliers/{sid}", json={"name": "TEST_Supplier_Y"}, headers=auth_headers, timeout=30)
    assert r3.status_code == 200
    r4 = requests.get(f"{BASE_URL}/api/suppliers", timeout=30)
    assert any(s["id"] == sid and s["name"] == "TEST_Supplier_Y" for s in r4.json())
    # delete
    r5 = requests.delete(f"{BASE_URL}/api/suppliers/{sid}", headers=auth_headers, timeout=30)
    assert r5.status_code == 200


def test_status_add_delete(auth_headers):
    r = requests.post(f"{BASE_URL}/api/statuses", json={"name": "TEST_Status"}, headers=auth_headers, timeout=30)
    assert r.status_code == 200
    sid = r.json()["id"]
    r2 = requests.delete(f"{BASE_URL}/api/statuses/{sid}", headers=auth_headers, timeout=30)
    assert r2.status_code == 200


def test_staff_add_delete(auth_headers):
    r = requests.post(f"{BASE_URL}/api/staff", json={"name": "TEST_Staff", "pin": "5678"}, headers=auth_headers, timeout=30)
    assert r.status_code == 200
    sid = r.json()["id"]
    # verify PIN works
    v = requests.post(f"{BASE_URL}/api/verify-pin", json={"pin": "5678"}, timeout=30)
    assert v.status_code == 200
    # cleanup
    r2 = requests.delete(f"{BASE_URL}/api/staff/{sid}", headers=auth_headers, timeout=30)
    assert r2.status_code == 200


# ---- Receivals full flow ----
@pytest.fixture(scope="session")
def created_receival(auth_headers):
    suppliers = requests.get(f"{BASE_URL}/api/suppliers", timeout=30).json()
    statuses = requests.get(f"{BASE_URL}/api/statuses", timeout=30).json()
    payload = {
        "supplierId": suppliers[0]["id"],
        "statusId": statuses[0]["id"],
        "observation": "TEST_observation",
        "dispute": False,
        "palletCount": 3,
        "pin": STAFF_PIN,
        "items": [{"description": "TEST_item", "qty": 5}],
        "base64Images": [TINY_PNG_B64],
        "base64Signatures": [TINY_PNG_B64],
        "signedByNames": ["Warehouse Staff"],
    }
    r = requests.post(f"{BASE_URL}/api/receivals", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["receivedBy"] == "Warehouse Staff"
    assert len(rec["images"]) == 1
    assert len(rec["signatures"]) == 1
    assert rec["supplier"]["id"] == suppliers[0]["id"]
    yield rec
    requests.delete(f"{BASE_URL}/api/receivals/{rec['id']}", headers=auth_headers, timeout=30)


def test_create_receival_bad_pin():
    r = requests.post(f"{BASE_URL}/api/receivals", json={"pin": "0000", "items": [], "base64Images": [], "base64Signatures": []}, timeout=30)
    assert r.status_code == 401


def test_list_receivals(auth_headers, created_receival):
    r = requests.get(f"{BASE_URL}/api/receivals", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    assert any(x["id"] == created_receival["id"] for x in r.json())


def test_update_receival_supplier(auth_headers, created_receival):
    suppliers = requests.get(f"{BASE_URL}/api/suppliers", timeout=30).json()
    new_sup = suppliers[1]["id"]
    r = requests.put(f"{BASE_URL}/api/receivals/{created_receival['id']}",
                     json={"supplierId": new_sup, "recordedInSystem": True},
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["supplierId"] == new_sup
    assert body["recordedInSystem"] is True
    # verify persisted
    r2 = requests.get(f"{BASE_URL}/api/receivals/{created_receival['id']}", headers=auth_headers, timeout=30)
    assert r2.json()["supplierId"] == new_sup
    assert r2.json()["recordedInSystem"] is True


def test_file_serve(created_receival):
    path = created_receival["images"][0]
    r = requests.get(f"{BASE_URL}/api/files/{path}", timeout=30)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/")


def test_archive_preview(auth_headers):
    r = requests.get(f"{BASE_URL}/api/archive/preview", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "count" in body and "cutoff" in body and "records" in body


def test_receivals_requires_auth():
    r = requests.get(f"{BASE_URL}/api/receivals", timeout=30)
    assert r.status_code == 401
