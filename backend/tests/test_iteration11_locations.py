"""Iteration 11: storage locations CRUD + receival locationId integration."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://eurasia-orders-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@eurasia.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{API}/auth/staff-login", json={"pin": "1234"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def staff_h(staff_token):
    return {"Authorization": f"Bearer {staff_token}"}


# ---------- locations CRUD ----------
def test_locations_seeded():
    r = requests.get(f"{API}/locations", timeout=30)
    assert r.status_code == 200
    names = [x["name"] for x in r.json()]
    for expected in ["Cold Store A", "Cold Store B", "Dry Store", "Freezer", "Receiving Bay"]:
        assert expected in names, f"missing seeded location {expected}: {names}"


def test_location_add_delete_admin(admin_h):
    unique = f"TEST_LOC_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/locations", json={"name": unique}, headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    assert r.json()["name"] == unique

    # verify persisted via GET
    r2 = requests.get(f"{API}/locations", timeout=30)
    assert any(x["id"] == lid for x in r2.json())

    r3 = requests.delete(f"{API}/locations/{lid}", headers=admin_h, timeout=30)
    assert r3.status_code == 200

    r4 = requests.get(f"{API}/locations", timeout=30)
    assert not any(x["id"] == lid for x in r4.json())


def test_location_add_forbidden_for_staff(staff_h):
    r = requests.post(f"{API}/locations", json={"name": "TEST_forbid"}, headers=staff_h, timeout=30)
    assert r.status_code == 403


# ---------- receival + locationId ----------
@pytest.fixture(scope="module")
def sample_location(admin_h):
    r = requests.get(f"{API}/locations", timeout=30)
    return r.json()[0]


def test_create_receival_with_location(admin_h, sample_location):
    payload = {"observation": "TEST_iter11_loc", "locationId": sample_location["id"], "palletCount": 1}
    r = requests.post(f"{API}/receivals", json=payload, headers=admin_h, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["locationId"] == sample_location["id"]
    assert body["location"] and body["location"]["name"] == sample_location["name"]
    rid = body["id"]

    # GET verification
    r2 = requests.get(f"{API}/receivals/{rid}", headers=admin_h, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["location"]["name"] == sample_location["name"]

    # cleanup
    requests.delete(f"{API}/receivals/{rid}", headers=admin_h, timeout=30)


def test_update_receival_locationid_persists(admin_h):
    locs = requests.get(f"{API}/locations", timeout=30).json()
    l1, l2 = locs[0], locs[1]

    r = requests.post(f"{API}/receivals", json={"observation": "TEST_iter11_upd", "locationId": l1["id"]}, headers=admin_h, timeout=60)
    rid = r.json()["id"]

    r2 = requests.put(f"{API}/receivals/{rid}", json={"locationId": l2["id"]}, headers=admin_h, timeout=30)
    assert r2.status_code == 200, r2.text
    assert r2.json()["locationId"] == l2["id"]
    assert r2.json()["location"]["name"] == l2["name"]

    r3 = requests.get(f"{API}/receivals/{rid}", headers=admin_h, timeout=30)
    assert r3.json()["location"]["name"] == l2["name"]

    # changeLog contains storage location
    log = r3.json().get("changeLog", [])
    assert any("storage location" in str(e.get("changes", {})) for e in log)

    requests.delete(f"{API}/receivals/{rid}", headers=admin_h, timeout=30)


def test_staff_cannot_edit_locationid(admin_h, staff_h):
    r = requests.post(f"{API}/receivals", json={"observation": "TEST_iter11_stfloc"}, headers=admin_h, timeout=60)
    rid = r.json()["id"]
    locs = requests.get(f"{API}/locations", timeout=30).json()
    r2 = requests.put(f"{API}/receivals/{rid}", json={"locationId": locs[0]["id"]}, headers=staff_h, timeout=30)
    assert r2.status_code == 403
    requests.delete(f"{API}/receivals/{rid}", headers=admin_h, timeout=30)
