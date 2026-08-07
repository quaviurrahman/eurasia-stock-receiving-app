"""
Iteration 6: verify dispute removal, invoice number admin-only, staff 403 on invoiceNumber.
"""
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
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{BASE_URL}/api/auth/staff-login", json={"pin": STAFF_PIN}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def created_receival(admin_token):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    suppliers = requests.get(f"{BASE_URL}/api/suppliers", headers=hdr, timeout=30).json()
    statuses = requests.get(f"{BASE_URL}/api/statuses", headers=hdr, timeout=30).json()
    payload = {
        "supplierId": suppliers[0]["id"],
        "statusId": statuses[0]["id"],
        "observation": "TEST_ITER6",
        "palletCount": 2,
        "items": [{"description": "Widget", "qty": 5}],
    }
    r = requests.post(f"{BASE_URL}/api/receivals", json=payload, headers=hdr, timeout=60)
    assert r.status_code == 200, r.text
    rec = r.json()
    yield rec
    requests.delete(f"{BASE_URL}/api/receivals/{rec['id']}", headers=hdr, timeout=30)


# --- Dispute removal ---
def test_create_ignores_dispute_field(admin_token):
    """Backend model no longer has dispute; create still works and record has no dispute key."""
    hdr = {"Authorization": f"Bearer {admin_token}"}
    suppliers = requests.get(f"{BASE_URL}/api/suppliers", headers=hdr, timeout=30).json()
    r = requests.post(f"{BASE_URL}/api/receivals",
                      json={"supplierId": suppliers[0]["id"], "observation": "TEST_no_dispute",
                            "palletCount": 1, "items": []}, headers=hdr, timeout=60)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert "dispute" not in rec or rec.get("dispute") in (None, False, "")
    # cleanup
    requests.delete(f"{BASE_URL}/api/receivals/{rec['id']}", headers=hdr, timeout=30)


# --- Admin can set invoiceNumber ---
def test_admin_can_set_invoice_number(admin_token, created_receival):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    rid = created_receival["id"]
    inv = "INV-TEST-123"
    r = requests.put(f"{BASE_URL}/api/receivals/{rid}",
                     json={"invoiceNumber": inv}, headers=hdr, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("invoiceNumber") == inv

    # GET verifies persistence
    g = requests.get(f"{BASE_URL}/api/receivals/{rid}", headers=hdr, timeout=30)
    assert g.status_code == 200
    assert g.json().get("invoiceNumber") == inv

    # changeLog should reflect invoice change
    logs = g.json().get("changeLog", [])
    assert any("changes" in l and "invoice number" in l.get("changes", {}) for l in logs), logs


# --- Staff blocked from invoiceNumber ---
def test_staff_cannot_set_invoice_number(staff_token, created_receival):
    hdr = {"Authorization": f"Bearer {staff_token}"}
    rid = created_receival["id"]
    r = requests.put(f"{BASE_URL}/api/receivals/{rid}",
                     json={"invoiceNumber": "STAFF-TRY"}, headers=hdr, timeout=30)
    assert r.status_code == 403, r.text


# --- Staff still allowed for palletCount / observation / items ---
def test_staff_can_edit_allowed_fields(staff_token, admin_token, created_receival):
    shdr = {"Authorization": f"Bearer {staff_token}"}
    ahdr = {"Authorization": f"Bearer {admin_token}"}
    rid = created_receival["id"]
    r = requests.put(f"{BASE_URL}/api/receivals/{rid}",
                     json={"palletCount": 9, "observation": "staff-edit",
                           "items": [{"description": "X", "qty": 1}]},
                     headers=shdr, timeout=30)
    assert r.status_code == 200, r.text
    g = requests.get(f"{BASE_URL}/api/receivals/{rid}", headers=ahdr, timeout=30).json()
    assert g["palletCount"] == 9
    assert g["observation"] == "staff-edit"


def test_receival_list_includes_invoice(admin_token, created_receival):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    # ensure invoice is set
    requests.put(f"{BASE_URL}/api/receivals/{created_receival['id']}",
                 json={"invoiceNumber": "INV-LIST-999"}, headers=hdr, timeout=30)
    r = requests.get(f"{BASE_URL}/api/receivals", headers=hdr, timeout=30)
    assert r.status_code == 200
    match = [x for x in r.json() if x["id"] == created_receival["id"]]
    assert match and match[0].get("invoiceNumber") == "INV-LIST-999"
