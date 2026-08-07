"""Iteration 4 backend tests - staff PIN login, role enforcement, media, changeLog."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "admin@eurasia.com"
ADMIN_PASSWORD = "admin123"
STAFF_PIN = "1234"

TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def staff_login_resp():
    r = requests.post(f"{BASE_URL}/api/auth/staff-login", json={"pin": STAFF_PIN}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def staff_token(staff_login_resp):
    return staff_login_resp["access_token"]


@pytest.fixture(scope="module")
def staff_headers(staff_token):
    return {"Authorization": f"Bearer {staff_token}"}


# ---------- Staff PIN login ----------
def test_staff_login_success(staff_login_resp):
    assert staff_login_resp["user"]["role"] == "staff"
    assert staff_login_resp["user"]["name"] == "Warehouse Staff"
    assert staff_login_resp["access_token"]


def test_staff_login_bad_pin():
    r = requests.post(f"{BASE_URL}/api/auth/staff-login", json={"pin": "0000"}, timeout=30)
    assert r.status_code == 401


def test_me_staff(staff_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=staff_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "staff"
    assert data["name"] == "Warehouse Staff"


def test_me_admin(admin_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


# ---------- Role enforcement: admin-only endpoints reject staff ----------
def test_staff_cannot_list_staff(staff_headers):
    r = requests.get(f"{BASE_URL}/api/staff", headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_staff_cannot_create_supplier(staff_headers):
    r = requests.post(f"{BASE_URL}/api/suppliers", json={"name": "TEST_should_fail"}, headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_staff_cannot_create_status(staff_headers):
    r = requests.post(f"{BASE_URL}/api/statuses", json={"name": "TEST_should_fail"}, headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_staff_cannot_delete_archive(staff_headers):
    r = requests.delete(f"{BASE_URL}/api/archive", headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_staff_cannot_get_archive_preview(staff_headers):
    r = requests.get(f"{BASE_URL}/api/archive/preview", headers=staff_headers, timeout=30)
    assert r.status_code == 403


# ---------- Staff receival flow ----------
@pytest.fixture(scope="module")
def staff_receival(staff_headers, admin_headers):
    suppliers = requests.get(f"{BASE_URL}/api/suppliers", timeout=30).json()
    payload = {
        "supplierId": suppliers[0]["id"],
        "observation": "TEST_iter4_staff",
        "palletCount": 2,
        "items": [{"description": "TEST_initial_item", "qty": 1}],
        "base64Images": [TINY_PNG],
        "base64Signatures": [TINY_PNG],
        "signedByNames": ["Staff Signer"],
    }
    r = requests.post(f"{BASE_URL}/api/receivals", json=payload, headers=staff_headers, timeout=60)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["receivedBy"] == "Warehouse Staff"
    # changeLog Created entry
    assert any(e.get("action", "").startswith("Created") for e in rec.get("changeLog", []))
    yield rec
    # cleanup as admin
    requests.delete(f"{BASE_URL}/api/receivals/{rec['id']}", headers=admin_headers, timeout=30)


def test_staff_created_receival_no_pin_required(staff_receival):
    assert staff_receival["receivedBy"] == "Warehouse Staff"


def test_staff_cannot_delete_receival(staff_headers, staff_receival):
    r = requests.delete(f"{BASE_URL}/api/receivals/{staff_receival['id']}", headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_staff_cannot_change_supplier(staff_headers, staff_receival):
    suppliers = requests.get(f"{BASE_URL}/api/suppliers", timeout=30).json()
    other = next(s for s in suppliers if s["id"] != staff_receival["supplierId"])
    r = requests.put(f"{BASE_URL}/api/receivals/{staff_receival['id']}",
                     json={"supplierId": other["id"]}, headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_staff_cannot_change_checklist(staff_headers, staff_receival):
    r = requests.put(f"{BASE_URL}/api/receivals/{staff_receival['id']}",
                     json={"recordedInSystem": True}, headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_staff_can_edit_pallet_items_observation(staff_headers, staff_receival):
    payload = {
        "palletCount": 9,
        "observation": "TEST_iter4_edited_obs",
        "items": [{"description": "TEST_updated_item", "qty": 3}],
    }
    r = requests.put(f"{BASE_URL}/api/receivals/{staff_receival['id']}", json=payload,
                     headers=staff_headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["palletCount"] == 9
    assert body["observation"] == "TEST_iter4_edited_obs"
    assert body["items"][0]["description"] == "TEST_updated_item"

    # changeLog entry recorded for the edit
    assert len(body["changeLog"]) >= 2
    last = body["changeLog"][-1]
    assert last["by"] == "Warehouse Staff"
    assert last["role"] == "staff"
    assert "at" in last
    assert "changes" in last
    assert "pallet count" in last["changes"] or "observation" in last["changes"] or "items" in last["changes"]


def test_staff_can_add_and_remove_media(staff_headers, staff_receival):
    rec_id = staff_receival["id"]
    # add photo + signature
    r = requests.post(f"{BASE_URL}/api/receivals/{rec_id}/media",
                      json={"addImages": [TINY_PNG], "addSignatures": [TINY_PNG], "addSignedByNames": ["Extra"]},
                      headers=staff_headers, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["images"]) >= 2
    assert len(body["signatures"]) >= 2

    # remove one photo
    first_img = body["images"][0]
    r2 = requests.post(f"{BASE_URL}/api/receivals/{rec_id}/media",
                       json={"removeImagePaths": [first_img]},
                       headers=staff_headers, timeout=30)
    assert r2.status_code == 200
    assert first_img not in r2.json()["images"]

    # changeLog contains media entry
    log = r2.json()["changeLog"]
    assert any("photo" in e.get("action", "").lower() or "media" in e.get("action", "").lower() for e in log)


# ---------- Admin still has full power ----------
def test_admin_can_change_supplier(admin_headers, staff_receival):
    suppliers = requests.get(f"{BASE_URL}/api/suppliers", timeout=30).json()
    other = next(s for s in suppliers if s["id"] != staff_receival["supplierId"])
    r = requests.put(f"{BASE_URL}/api/receivals/{staff_receival['id']}",
                     json={"supplierId": other["id"], "recordedInSystem": True},
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["supplierId"] == other["id"]
    assert body["recordedInSystem"] is True
    # admin change tracked in log
    assert any(e.get("role") == "admin" for e in body["changeLog"])


def test_create_receival_requires_auth():
    r = requests.post(f"{BASE_URL}/api/receivals", json={"items": []}, timeout=30)
    assert r.status_code == 401
