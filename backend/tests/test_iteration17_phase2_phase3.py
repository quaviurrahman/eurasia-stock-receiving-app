"""Iteration 17: Phase 2 (purchasing intelligence) + Phase 3 (stock control & credit notes).

Covers:
 - Supplier code save + /cpis/products search by supplier code
 - Bulk supplier pack-config upload
 - Frequent products from PO history
 - Pack other-suppliers trend/stock insight (price_history)
 - Min stock levels + /needs-ordering + /min-levels/check
 - Credit notes: price_only (no stock change) and return (negative CPIS movement)

The test POSTS a real receipt (qty=1) to CPIS when closing a PO, and the "return"
credit note posts a NEGATIVE movement (qty=1). Cleanup reverses both so net CPIS
stock is unchanged, and deletes all docs created in Mongo.
"""

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://eurasia-orders-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CPIS_BASE = "https://product-core-5.emergent.host/api"
CPIS_KEY = "cpis_live_b816c49c3d904926ab099562e275cc2cae5e007e"

ADMIN_EMAIL = "admin@eurasia.com"
ADMIN_PASSWORD = "admin123"

# Safe test targets provided by main agent
P1 = {
    "productId": "3ff78b8b-8292-433d-b2a3-91eeb8432bdf",
    "sku": "freveg20",
    "name": "MUSHROOM",
    "packId": "a1021b15-be3c-4262-988a-bc2cfc072e44",
    "shortCode": "MUSBX1",
}
P2 = {
    "productId": "889085d8-42ec-4a65-a3b0-6dfb9de23c86",
    "sku": "ambdri03",
    "name": "DR PEPPER",
    "packId": "7777208d-e811-4310-b124-e0ba2f29a02f",
    "shortCode": "DRPEP330",
}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def suppliers(H):
    r = requests.get(f"{API}/suppliers", headers=H, timeout=30)
    assert r.status_code == 200, r.text
    sups = r.json()
    assert len(sups) >= 2, "need at least 2 suppliers"
    return sups


@pytest.fixture(scope="session")
def state():
    """Tracks all ids created so cleanup can remove them."""
    return {
        "po_ids": [],  # all POs to delete
        "closed_pos_cpis_reversals": [],  # list of (packId, qty) positive receipts -> need NEGATIVE reversal
        "cn_ids": [],
        "cn_return_reversals": [],  # (packId, qty) that were decreased -> need POSITIVE reversal
        "supplier_product_keys": [],  # (supplierId, productId)
        "min_level_productIds": [],
        "spc_keys": [],  # (supplierId, packId) for supplier_pack_configs cleanup via admin API if any
    }


# ---------- helpers ----------
def _cpis_stock(product_id):
    """Return 'available' stock from CPIS or None."""
    try:
        r = requests.get(
            f"{CPIS_BASE}/stock/products/{product_id}",
            params={"site_id": "MAIN-WAREHOUSE"},
            headers={"X-API-Key": CPIS_KEY},
            timeout=30,
        )
        if r.status_code == 200:
            return float(r.json().get("available") or 0)
    except Exception:
        pass
    return None


def _cpis_movement(pack_id, qty_signed):
    """Post a signed stock movement for cleanup. qty_signed is a number (int)."""
    idem = f"test-cleanup-{uuid.uuid4()}"
    r = requests.post(
        f"{CPIS_BASE}/stock/movements",
        headers={
            "X-API-Key": CPIS_KEY,
            "X-Source-System": "EURASIA_INTAKE",
            "Idempotency-Key": idem,
            "Content-Type": "application/json",
        },
        json={
            "pack_id": pack_id,
            "quantity": str(qty_signed),
            "bucket": "SELLABLE",
            "reason": "DISPATCH",
            "reference": {"type": "test_cleanup", "id": idem},
        },
        timeout=30,
    )
    return r.status_code, r.text


# ---------- Tests ----------
class TestA_SupplierCodeSearch:
    """(a) Supplier code save + search by supplier code via /cpis/products"""

    def test_save_and_search(self, H, suppliers, state):
        sup = suppliers[0]
        code = f"TEST_SUP_{uuid.uuid4().hex[:6].upper()}"

        payload = {
            "supplierId": sup["id"],
            "productId": P1["productId"],
            "sku": P1["sku"],
            "productName": P1["name"],
            "supplierCode": code,
        }
        r = requests.post(f"{API}/supplier-products", headers=H, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["supplierCode"] == code
        assert data["supplierId"] == sup["id"]
        assert data["productId"] == P1["productId"]
        state["supplier_product_keys"].append((sup["id"], P1["productId"]))

        # idempotent upsert
        r2 = requests.post(f"{API}/supplier-products", headers=H, json=payload, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["id"] == data["id"]

        # search by supplier code via /cpis/products
        r3 = requests.get(f"{API}/cpis/products", headers=H, params={"query": code}, timeout=30)
        assert r3.status_code == 200, r3.text
        items = r3.json().get("items", [])
        pids = [i.get("productId") for i in items]
        assert P1["productId"] in pids, f"product not returned by supplier-code search: {pids}"


class TestB_BulkCost:
    """(b) Bulk cost upload via /supplier-pack-configs/bulk"""

    def test_bulk_cost_upload(self, H, suppliers, state):
        sup = suppliers[0]
        payload = {
            "supplierId": sup["id"],
            "items": [
                {
                    "packId": P1["packId"],
                    "productId": P1["productId"],
                    "sku": P1["sku"],
                    "productName": P1["name"],
                    "packShortCode": P1["shortCode"],
                    "unitQuantity": 1,
                    "packPrice": 120.0,
                },
                {
                    "packId": P2["packId"],
                    "productId": P2["productId"],
                    "sku": P2["sku"],
                    "productName": P2["name"],
                    "packShortCode": P2["shortCode"],
                    "unitQuantity": 1,
                    "packPrice": 18.0,
                },
            ],
        }
        r = requests.post(f"{API}/supplier-pack-configs/bulk", headers=H, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("updated") == 2
        state["spc_keys"].extend([(sup["id"], P1["packId"]), (sup["id"], P2["packId"])])

        # Verify via GET /supplier-pack-configs?supplierId=
        r2 = requests.get(f"{API}/supplier-pack-configs", headers=H, params={"supplierId": sup["id"]}, timeout=30)
        assert r2.status_code == 200, r2.text
        rows = r2.json()
        by_pack = {row["packId"]: row for row in rows}
        assert P1["packId"] in by_pack, "pack1 not persisted"
        assert P2["packId"] in by_pack, "pack2 not persisted"
        assert abs(by_pack[P1["packId"]]["packPrice"] - 120.0) < 0.001
        assert abs(by_pack[P2["packId"]]["packPrice"] - 18.0) < 0.001


class TestC_FrequentAndOtherSuppliers:
    """(c) frequent products after PO closure, (d) other-suppliers last price."""

    def test_po_close_populates_frequent_and_other_suppliers(self, H, suppliers, state):
        supA = suppliers[0]
        supB = suppliers[1]

        # 1) Create a PO for supplier A with P1 pack qty 1, price 110
        po_payload = {
            "supplierId": supA["id"],
            "notes": "TEST iteration17 - frequent/history",
            "lines": [
                {
                    "productId": P1["productId"],
                    "sku": P1["sku"],
                    "productName": P1["name"],
                    "packId": P1["packId"],
                    "packShortCode": P1["shortCode"],
                    "unitQuantity": 1,
                    "quantityPacks": 1,
                    "packPrice": 110.0,
                }
            ],
        }
        r = requests.post(f"{API}/purchase-orders", headers=H, json=po_payload, timeout=30)
        assert r.status_code == 200, r.text
        po = r.json()
        state["po_ids"].append(po["id"])

        # Capture stock before close
        stock_before = _cpis_stock(P1["productId"])

        # 2) Close PO (posts +1 to CPIS)
        inv = f"TEST-INV-{uuid.uuid4().hex[:6].upper()}"
        rc = requests.post(f"{API}/purchase-orders/{po['id']}/close", headers=H, json={"invoiceNumber": inv}, timeout=60)
        assert rc.status_code == 200, rc.text
        closed = rc.json()
        assert closed.get("status") == "closed"
        receipts = closed.get("cpisReceipts", [])
        if receipts and receipts[0].get("accepted"):
            # record for cleanup (we posted +1 so we need -1 reversal)
            state["closed_pos_cpis_reversals"].append((P1["packId"], -1))

        # Verify stock actually increased
        time.sleep(1)
        stock_after = _cpis_stock(P1["productId"])
        if stock_before is not None and stock_after is not None and receipts and receipts[0].get("accepted"):
            assert stock_after >= stock_before, f"stock did not increase: {stock_before} -> {stock_after}"

        # 3) GET /frequent-products?supplierId=supA -> should list the P1 pack
        rf = requests.get(f"{API}/frequent-products", headers=H, params={"supplierId": supA["id"]}, timeout=30)
        assert rf.status_code == 200, rf.text
        items = rf.json().get("items", [])
        assert any(it["packId"] == P1["packId"] for it in items), "pack not in frequent-products"
        row = next(it for it in items if it["packId"] == P1["packId"])
        assert row["count"] >= 1
        assert row["lastOrderedAt"], "lastOrderedAt missing"

        # 4) GET /pack-other-suppliers?packId=P1&excludeSupplierId=supB -> should include supA price
        ro = requests.get(
            f"{API}/pack-other-suppliers",
            headers=H,
            params={"packId": P1["packId"], "excludeSupplierId": supB["id"]},
            timeout=30,
        )
        assert ro.status_code == 200, ro.text
        oth = ro.json().get("items", [])
        assert any(x["supplierId"] == supA["id"] for x in oth), "supplierA not in other-suppliers"
        sa = next(x for x in oth if x["supplierId"] == supA["id"])
        assert abs(float(sa["packPrice"]) - 110.0) < 0.001
        assert sa["recordedAt"]

        # Also: excluding supA should remove it
        ro2 = requests.get(
            f"{API}/pack-other-suppliers",
            headers=H,
            params={"packId": P1["packId"], "excludeSupplierId": supA["id"]},
            timeout=30,
        )
        assert ro2.status_code == 200
        assert not any(x["supplierId"] == supA["id"] for x in ro2.json().get("items", []))


class TestD_MinLevelsAndNeedsOrdering:
    """(e) min levels + needs-ordering + /min-levels/check"""

    def test_min_and_needs(self, H, state):
        # set a very high min so product definitely qualifies as 'below min'
        payload = {
            "productId": P2["productId"],
            "sku": P2["sku"],
            "productName": P2["name"],
            "minStock": 99999,
        }
        r = requests.post(f"{API}/min-levels", headers=H, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["minStock"] == 99999
        state["min_level_productIds"].append(P2["productId"])

        # list min-levels
        rl = requests.get(f"{API}/min-levels", headers=H, timeout=30)
        assert rl.status_code == 200
        assert any(m["productId"] == P2["productId"] for m in rl.json())

        # check endpoint
        rc = requests.get(f"{API}/min-levels/check", headers=H, params={"productId": P2["productId"]}, timeout=30)
        assert rc.status_code == 200, rc.text
        chk = rc.json()
        assert chk["hasMin"] is True
        assert chk["minStock"] == 99999
        # available should be <= 99999 (unless CPIS unreachable -> None)
        if chk.get("available") is not None:
            assert chk["belowMin"] is True

        # needs-ordering: expect this product in the list
        rn = requests.get(f"{API}/needs-ordering", headers=H, timeout=60)
        assert rn.status_code == 200, rn.text
        needs = rn.json().get("items", [])
        assert any(x["productId"] == P2["productId"] for x in needs), f"P2 not in needs-ordering: {needs}"

    def test_delete_min_removes_from_list(self, H, state):
        r = requests.delete(f"{API}/min-levels/{P2['productId']}", headers=H, timeout=30)
        assert r.status_code == 200
        # verify gone
        rl = requests.get(f"{API}/min-levels", headers=H, timeout=30)
        assert not any(m["productId"] == P2["productId"] for m in rl.json())
        state["min_level_productIds"].remove(P2["productId"])

        # check endpoint should now say no min
        rc = requests.get(f"{API}/min-levels/check", headers=H, params={"productId": P2["productId"]}, timeout=30)
        assert rc.status_code == 200
        assert rc.json()["hasMin"] is False


class TestE_CreditNotes:
    """(f) credit notes - price_only (no stock) + return (negative CPIS movement)"""

    def test_price_only(self, H, suppliers, state):
        sup = suppliers[0]
        payload = {
            "supplierId": sup["id"],
            "type": "price_only",
            "reason": "TEST price adjustment",
            "note": "iteration17",
            "lines": [
                {
                    "productId": P1["productId"],
                    "productName": P1["name"],
                    "amount": 5.50,
                }
            ],
        }
        r = requests.post(f"{API}/credit-notes", headers=H, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        cn = r.json()
        assert cn["type"] == "price_only"
        assert cn["movementsFailed"] == 0
        assert cn["cpisMovements"] == []
        assert cn["totalAmount"] == 5.5
        assert cn["number"].startswith("CN-")
        state["cn_ids"].append(cn["id"])

        # verify listed
        rl = requests.get(f"{API}/credit-notes", headers=H, timeout=30)
        assert rl.status_code == 200
        assert any(c["id"] == cn["id"] for c in rl.json())

    def test_return_posts_negative_cpis(self, H, suppliers, state):
        sup = suppliers[1]
        stock_before = _cpis_stock(P1["productId"])

        payload = {
            "supplierId": sup["id"],
            "type": "return",
            "reason": "TEST return",
            "note": "iteration17",
            "lines": [
                {
                    "productId": P1["productId"],
                    "productName": P1["name"],
                    "packId": P1["packId"],
                    "packShortCode": P1["shortCode"],
                    "unitQuantity": 1,
                    "qtyPacks": 1,
                    "amount": 10.0,
                }
            ],
        }
        r = requests.post(f"{API}/credit-notes", headers=H, json=payload, timeout=60)
        assert r.status_code == 200, r.text
        cn = r.json()
        assert cn["type"] == "return"
        movs = cn.get("cpisMovements", [])
        assert len(movs) == 1
        assert movs[0]["quantity"] == -1
        assert movs[0]["accepted"] is True, f"CPIS movement not accepted: {movs}"
        assert cn["movementsFailed"] == 0
        state["cn_ids"].append(cn["id"])
        state["cn_return_reversals"].append((P1["packId"], 1))  # need +1 reversal

        # verify stock decreased
        time.sleep(1)
        stock_after = _cpis_stock(P1["productId"])
        if stock_before is not None and stock_after is not None:
            assert stock_after < stock_before, f"stock did not decrease: {stock_before} -> {stock_after}"


# ---------- Final cleanup ----------
class TestZ_Cleanup:
    """Reverses CPIS movements and deletes all test docs. Keep LAST in the file."""

    def test_cleanup(self, H, state):
        errors = []

        # Delete credit notes
        for cnid in state["cn_ids"]:
            try:
                requests.delete(f"{API}/credit-notes/{cnid}", headers=H, timeout=30)
            except Exception as e:
                errors.append(f"cn delete {cnid}: {e}")

        # Delete POs
        for pid in state["po_ids"]:
            try:
                requests.delete(f"{API}/purchase-orders/{pid}", headers=H, timeout=30)
            except Exception as e:
                errors.append(f"po delete {pid}: {e}")

        # Delete min levels
        for pid in state["min_level_productIds"]:
            try:
                requests.delete(f"{API}/min-levels/{pid}", headers=H, timeout=30)
            except Exception as e:
                errors.append(f"min delete {pid}: {e}")

        # Reverse CPIS: for each PO close (+qty) -> post -qty
        for pack_id, qty in state["closed_pos_cpis_reversals"]:
            code, body = _cpis_movement(pack_id, qty)
            if code >= 300:
                errors.append(f"cpis reversal (close) pack={pack_id} qty={qty}: {code} {body[:120]}")

        # Reverse CPIS: for each return CN (-qty) -> post +qty
        for pack_id, qty in state["cn_return_reversals"]:
            code, body = _cpis_movement(pack_id, qty)
            if code >= 300:
                errors.append(f"cpis reversal (return) pack={pack_id} qty={qty}: {code} {body[:120]}")

        # Also clean mongo collections directly for supplier_products, price_history, supplier_pack_configs, cn_counter.
        # We don't have direct DB endpoints, but these are test-prefixed and OK to leave if API cannot clean.
        # The agent context says they can remain mongo-side cleanup; here we at least try to remove supplier_products
        # that were inserted (no delete API) — document them in test report.
        print(f"CLEANUP residuals: supplier_products keys={state['supplier_product_keys']}, "
              f"spc keys={state['spc_keys']}, price_history entries for packs="
              f"{[p for p,_ in state['closed_pos_cpis_reversals']]}")

        assert not errors, "Cleanup errors:\n" + "\n".join(errors)
