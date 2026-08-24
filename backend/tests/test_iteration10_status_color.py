"""Backend tests for Iteration 10 — status colour config + receival enrichment."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://eurasia-orders-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@eurasia.com", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# --- Statuses CRUD + color ---
def test_list_statuses_returns_color_field(admin_headers):
    r = requests.get(f"{API}/statuses", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    for s in data:
        assert "id" in s and "name" in s
        assert "color" in s  # may be None


def test_create_update_no_color_status(admin_headers):
    # create
    r = requests.post(f"{API}/statuses", headers=admin_headers, json={"name": "TEST_ColorStatus", "color": "#123456"}, timeout=15)
    assert r.status_code == 200, r.text
    created = r.json()
    sid = created["id"]
    assert created["color"] == "#123456"

    # verify via list
    lst = requests.get(f"{API}/statuses", headers=admin_headers, timeout=15).json()
    found = next(s for s in lst if s["id"] == sid)
    assert found["color"] == "#123456"

    # update color
    r = requests.put(f"{API}/statuses/{sid}", headers=admin_headers, json={"name": "TEST_ColorStatus", "color": "#abcdef"}, timeout=15)
    assert r.status_code == 200
    lst = requests.get(f"{API}/statuses", headers=admin_headers, timeout=15).json()
    found = next(s for s in lst if s["id"] == sid)
    assert found["color"] == "#abcdef"

    # clear (no colour)
    r = requests.put(f"{API}/statuses/{sid}", headers=admin_headers, json={"name": "TEST_ColorStatus", "color": None}, timeout=15)
    assert r.status_code == 200
    lst = requests.get(f"{API}/statuses", headers=admin_headers, timeout=15).json()
    found = next(s for s in lst if s["id"] == sid)
    assert found["color"] is None

    # cleanup
    requests.delete(f"{API}/statuses/{sid}", headers=admin_headers, timeout=15)


def test_receival_enrich_includes_status_color(admin_headers):
    # Ensure Pending has a colour
    statuses = requests.get(f"{API}/statuses", headers=admin_headers, timeout=15).json()
    pending = next((s for s in statuses if s["name"].lower() == "pending"), None)
    assert pending is not None, "Pending status seed expected"
    if pending["color"] != "#e11d48":
        requests.put(f"{API}/statuses/{pending['id']}", headers=admin_headers, json={"name": pending["name"], "color": "#e11d48"}, timeout=15)

    receivals = requests.get(f"{API}/receivals", headers=admin_headers, timeout=15).json()
    assert isinstance(receivals, list)
    # Each receival with a status must expose color key
    saw_colored = False
    for r in receivals:
        if r.get("status"):
            assert "color" in r["status"]
            if r["status"].get("color"):
                saw_colored = True
    # not strictly required all have status; but at least Pending ones should be colored
    # (only assert if any receival has status name Pending)
    if any((r.get("status") or {}).get("name") == "Pending" for r in receivals):
        assert saw_colored, "Pending receival should carry status.color in enrichment"


def test_admin_only_status_update(admin_headers):
    # staff login
    r = requests.post(f"{API}/auth/staff-login", json={"pin": "1234"}, timeout=15)
    assert r.status_code == 200
    staff_h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    statuses = requests.get(f"{API}/statuses", headers=admin_headers, timeout=15).json()
    sid = statuses[0]["id"]
    r = requests.put(f"{API}/statuses/{sid}", headers=staff_h, json={"name": statuses[0]["name"], "color": "#000000"}, timeout=15)
    assert r.status_code == 403
