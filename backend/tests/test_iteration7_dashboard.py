"""Iteration 7: default-status config, auto invoice flag, analytics dashboard, slip totals."""
import os
import pytest
import requests

BASE_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "admin@eurasia.com"
ADMIN_PASSWORD = "admin123"
STAFF_PIN = "1234"

TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def staff_headers():
    r = requests.post(f"{BASE_URL}/api/auth/staff-login", json={"pin": STAFF_PIN}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---- Config: default status ----
def test_config_get_default_status(admin_headers):
    r = requests.get(f"{BASE_URL}/api/config", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "defaultStatusId" in body


def test_put_config_admin_only(staff_headers):
    r = requests.put(f"{BASE_URL}/api/config", json={"defaultStatusId": None}, headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_put_config_and_create_uses_default(admin_headers):
    # Save current default first
    cur = requests.get(f"{BASE_URL}/api/config", headers=admin_headers, timeout=30).json()
    original = cur.get("defaultStatusId")

    statuses = requests.get(f"{BASE_URL}/api/statuses", timeout=30).json()
    chosen = statuses[-1]["id"]
    try:
        # Set default
        r = requests.put(f"{BASE_URL}/api/config", json={"defaultStatusId": chosen}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["defaultStatusId"] == chosen
        # Verify persisted
        r2 = requests.get(f"{BASE_URL}/api/config", headers=admin_headers, timeout=30)
        assert r2.json()["defaultStatusId"] == chosen

        # Create receival WITHOUT statusId
        payload = {
            "pin": STAFF_PIN,
            "observation": "TEST_default_status",
            "palletCount": 1,
            "items": [],
            "slips": [],
            "base64Images": [],
            "base64Signatures": [],
            "signedByNames": [],
        }
        cr = requests.post(f"{BASE_URL}/api/receivals", json=payload, headers=admin_headers, timeout=30)
        assert cr.status_code == 200, cr.text
        rec = cr.json()
        assert rec["statusId"] == chosen, f"default status not applied: got {rec['statusId']}"
        # cleanup
        requests.delete(f"{BASE_URL}/api/receivals/{rec['id']}", headers=admin_headers, timeout=30)
    finally:
        # Restore original default
        requests.put(f"{BASE_URL}/api/config", json={"defaultStatusId": original}, headers=admin_headers, timeout=30)


# ---- Auto invoice flag ----
def test_auto_invoice_flag(admin_headers):
    # Create record
    payload = {
        "pin": STAFF_PIN,
        "observation": "TEST_auto_invoice",
        "palletCount": 1,
        "items": [],
        "slips": [],
        "base64Images": [],
        "base64Signatures": [],
        "signedByNames": [],
    }
    cr = requests.post(f"{BASE_URL}/api/receivals", json=payload, headers=admin_headers, timeout=30)
    rec = cr.json()
    rid = rec["id"]
    assert rec["invoiceReceived"] is False
    try:
        # PUT invoiceNumber -> auto-sets invoiceReceived True
        upd = requests.put(f"{BASE_URL}/api/receivals/{rid}",
                           json={"invoiceNumber": "INV-AUTO-777"},
                           headers=admin_headers, timeout=30)
        assert upd.status_code == 200
        body = upd.json()
        assert body["invoiceNumber"] == "INV-AUTO-777"
        assert body["invoiceReceived"] is True

        # Verify via GET
        g = requests.get(f"{BASE_URL}/api/receivals/{rid}", headers=admin_headers, timeout=30).json()
        assert g["invoiceReceived"] is True
        assert g["invoiceNumber"] == "INV-AUTO-777"
    finally:
        requests.delete(f"{BASE_URL}/api/receivals/{rid}", headers=admin_headers, timeout=30)


def test_staff_cannot_edit_invoice(admin_headers, staff_headers):
    payload = {
        "pin": STAFF_PIN,
        "observation": "TEST_staff_invoice_403",
        "items": [], "slips": [], "base64Images": [], "base64Signatures": [], "signedByNames": [],
    }
    rec = requests.post(f"{BASE_URL}/api/receivals", json=payload, headers=admin_headers, timeout=30).json()
    rid = rec["id"]
    try:
        r = requests.put(f"{BASE_URL}/api/receivals/{rid}",
                         json={"invoiceNumber": "STAFF-BAD"},
                         headers=staff_headers, timeout=30)
        assert r.status_code == 403
        assert "invoice" in r.json()["detail"].lower()
    finally:
        requests.delete(f"{BASE_URL}/api/receivals/{rid}", headers=admin_headers, timeout=30)


# ---- Analytics ----
def test_analytics_admin_only(staff_headers):
    r = requests.get(f"{BASE_URL}/api/analytics", headers=staff_headers, timeout=30)
    assert r.status_code == 403


def test_analytics_payload(admin_headers):
    r = requests.get(f"{BASE_URL}/api/analytics", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    for key in ("total", "palletsTotal", "invoicesPending", "suppliersCount",
                "statusCounts", "supplierFrequency", "daily", "weekly", "monthly"):
        assert key in d, f"missing {key}"
    assert isinstance(d["total"], int)
    assert isinstance(d["statusCounts"], list)
    assert isinstance(d["supplierFrequency"], list)
    assert isinstance(d["daily"], list)
    assert isinstance(d["weekly"], list)
    assert isinstance(d["monthly"], list)
    if d["statusCounts"]:
        assert "status" in d["statusCounts"][0] and "count" in d["statusCounts"][0]
    if d["supplierFrequency"]:
        row = d["supplierFrequency"][0]
        assert "supplier" in row and "count" in row and "avgIntervalDays" in row
    if d["daily"]:
        assert "label" in d["daily"][0] and "count" in d["daily"][0]


# ---- Slips ----
def test_create_receival_with_slips_and_totals(admin_headers):
    """Confirm slips persist so the frontend badge can compute totals."""
    payload = {
        "pin": STAFF_PIN,
        "observation": "TEST_slips",
        "items": [],
        "slips": [
            {"label": "S1", "entries": [10, 20]},
            {"label": "S2", "entries": [5.5]},
        ],
        "base64Images": [], "base64Signatures": [], "signedByNames": [],
    }
    cr = requests.post(f"{BASE_URL}/api/receivals", json=payload, headers=admin_headers, timeout=30)
    assert cr.status_code == 200, cr.text
    rec = cr.json()
    rid = rec["id"]
    try:
        g = requests.get(f"{BASE_URL}/api/receivals/{rid}", headers=admin_headers, timeout=30).json()
        slips = g.get("slips") or []
        assert len(slips) == 2
        total_entries = sum(len(s.get("entries") or []) for s in slips)
        assert total_entries == 3
        total_sum = sum((e or 0) for s in slips for e in (s.get("entries") or []))
        assert abs(total_sum - 35.5) < 0.01
    finally:
        requests.delete(f"{BASE_URL}/api/receivals/{rid}", headers=admin_headers, timeout=30)
