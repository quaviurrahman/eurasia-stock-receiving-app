"""Iteration 5 backend tests - Slips feature (per-receival tally slips)."""
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


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def staff_headers():
    r = requests.post(f"{BASE_URL}/api/auth/staff-login", json={"pin": STAFF_PIN}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def supplier_id(admin_headers):
    r = requests.get(f"{BASE_URL}/api/suppliers", timeout=30)
    assert r.status_code == 200
    return r.json()[0]["id"]


created_ids = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_headers):
    yield
    for rid in created_ids:
        try:
            requests.delete(f"{BASE_URL}/api/receivals/{rid}", headers=admin_headers, timeout=30)
        except Exception:
            pass


# ---------- Create receival with slips (staff) ----------
def test_staff_create_receival_with_slips(staff_headers, supplier_id):
    payload = {
        "supplierId": supplier_id,
        "observation": "TEST_slips_create",
        "palletCount": 1,
        "items": [],
        "slips": [
            {"label": "Slip A", "entries": [10, 20, 30]},
            {"label": "", "entries": [5.5, 4.5]},
        ],
    }
    r = requests.post(f"{BASE_URL}/api/receivals", json=payload, headers=staff_headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    created_ids.append(data["id"])

    assert "slips" in data
    assert len(data["slips"]) == 2
    assert data["slips"][0]["label"] == "Slip A"
    assert data["slips"][0]["entries"] == [10.0, 20.0, 30.0]
    assert data["slips"][1]["entries"] == [5.5, 4.5]

    # GET verifies persistence
    g = requests.get(f"{BASE_URL}/api/receivals/{data['id']}", headers=staff_headers, timeout=30)
    assert g.status_code == 200
    got = g.json()
    assert len(got["slips"]) == 2
    assert got["slips"][0]["entries"] == [10.0, 20.0, 30.0]


# ---------- Staff can update slips (STAFF_EDITABLE contains 'slips') ----------
def test_staff_update_slips_and_changelog(staff_headers, supplier_id):
    # Create fresh
    r = requests.post(f"{BASE_URL}/api/receivals",
                      json={"supplierId": supplier_id, "observation": "TEST_slips_upd",
                            "slips": [{"label": "S1", "entries": [1, 2]}]},
                      headers=staff_headers, timeout=60)
    assert r.status_code == 200
    rid = r.json()["id"]
    created_ids.append(rid)

    new_slips = [
        {"label": "S1", "entries": [1, 2, 3]},   # modified
        {"label": "S2", "entries": [100.5]},     # new
    ]
    u = requests.put(f"{BASE_URL}/api/receivals/{rid}",
                     json={"slips": new_slips}, headers=staff_headers, timeout=30)
    assert u.status_code == 200, u.text
    updated = u.json()
    assert len(updated["slips"]) == 2
    assert updated["slips"][0]["entries"] == [1.0, 2.0, 3.0]
    assert updated["slips"][1]["entries"] == [100.5]

    # changeLog should include 'slips: updated slips'
    log_entries = updated.get("changeLog", [])
    found = False
    for e in log_entries:
        ch = e.get("changes") or {}
        if ch.get("slips") == "updated slips":
            found = True
            assert e.get("role") == "staff"
    assert found, f"changeLog missing 'slips: updated slips'. log={log_entries}"


# ---------- Admin can update slips too ----------
def test_admin_update_slips(admin_headers, staff_headers, supplier_id):
    r = requests.post(f"{BASE_URL}/api/receivals",
                      json={"supplierId": supplier_id, "observation": "TEST_slips_admin",
                            "slips": [{"label": "A", "entries": [7]}]},
                      headers=staff_headers, timeout=60)
    rid = r.json()["id"]
    created_ids.append(rid)

    u = requests.put(f"{BASE_URL}/api/receivals/{rid}",
                     json={"slips": [{"label": "A", "entries": [7, 8, 9]}]},
                     headers=admin_headers, timeout=30)
    assert u.status_code == 200, u.text
    updated = u.json()
    assert updated["slips"][0]["entries"] == [7.0, 8.0, 9.0]
    admin_log = [e for e in updated["changeLog"]
                 if e.get("role") == "admin" and (e.get("changes") or {}).get("slips") == "updated slips"]
    assert admin_log, "Expected admin changeLog entry for slips update"


# ---------- No-slips receival stays empty ----------
def test_create_receival_without_slips_defaults_empty(staff_headers, supplier_id):
    r = requests.post(f"{BASE_URL}/api/receivals",
                      json={"supplierId": supplier_id, "observation": "TEST_no_slips"},
                      headers=staff_headers, timeout=60)
    assert r.status_code == 200
    data = r.json()
    created_ids.append(data["id"])
    assert data.get("slips", []) == []
