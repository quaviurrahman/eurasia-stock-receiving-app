import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SupplierCombobox from "@/components/SupplierCombobox";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Search,
  Trash2,
  Save,
  CheckCircle2,
  PackagePlus,
  Layers,
  Boxes,
  LineChart,
  Printer,
  AlertTriangle,
  Upload,
  FileDown,
} from "lucide-react";

const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

const PurchaseOrderEditPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [suppliers, setSuppliers] = useState([]);
  const [poNumber, setPoNumber] = useState("");
  const [status, setStatus] = useState("open");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [linkedReceivalId, setLinkedReceivalId] = useState(null);
  const [poId, setPoId] = useState(isNew ? null : id);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  // product search dialog
  const [pickOpen, setPickOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);
  const [packs, setPacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(false);

  // close dialog
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeInvoice, setCloseInvoice] = useState("");
  const [closeReceival, setCloseReceival] = useState("none");
  const [invoiceError, setInvoiceError] = useState(false);
  const [receivals, setReceivals] = useState([]);
  const [closing, setClosing] = useState(false);

  // per-line CPIS trend & stock insight
  const [openInsight, setOpenInsight] = useState(null);
  const [insight, setInsight] = useState({}); // idx -> { loading, stock, sales, granularity }

  const loadInsight = async (idx, line, granularity = "weekly") => {
    setOpenInsight((cur) => (cur === idx && !granularity ? null : idx));
    setInsight((s) => ({ ...s, [idx]: { ...(s[idx] || {}), loading: true, granularity } }));
    try {
      const [stk, sal, oth] = await Promise.all([
        api.get(`/cpis/products/${line.productId}/stock`),
        api.get(`/cpis/products/${line.productId}/sales`, { params: { granularity, periods: 6 } }),
        api.get(`/pack-other-suppliers`, { params: { packId: line.packId, excludeSupplierId: supplierId || undefined } }).catch(() => ({ data: { items: [] } })),
      ]);
      setInsight((s) => ({ ...s, [idx]: { loading: false, stock: stk.data, sales: sal.data, others: oth.data.items || [], granularity } }));
    } catch {
      setInsight((s) => ({ ...s, [idx]: { loading: false, error: true, granularity } }));
      toast.error("Could not load CPIS trend/stock");
    }
  };

  const toggleInsight = (idx, line) => {
    if (openInsight === idx) {
      setOpenInsight(null);
    } else {
      setOpenInsight(idx);
      if (!insight[idx]) loadInsight(idx, line, "weekly");
    }
  };

  useEffect(() => {
    if (!supplierId) {
      setFrequent([]);
      return;
    }
    api
      .get("/frequent-products", { params: { supplierId } })
      .then((r) => setFrequent(r.data.items || []))
      .catch(() => setFrequent([]));
  }, [supplierId]);

  useEffect(() => {
    (async () => {
      const sup = await api.get("/suppliers");
      setSuppliers(sup.data);
      if (!isNew) {
        try {
          const { data } = await api.get(`/purchase-orders/${id}`);
          setPoNumber(data.poNumber);
          setStatus(data.status);
          setSupplierId(data.supplierId || "");
          setNotes(data.notes || "");
          const enriched = await Promise.all(
            (data.lines || []).map(async (ln) => {
              try {
                const { data: h } = await api.get("/pricing/history", {
                  params: { packId: ln.packId, supplierId: data.supplierId || undefined, limit: 50 },
                });
                const items = h.items || [];
                const l3 = items.slice(0, 3).map((i) => i.packPrice).filter((v) => v != null);
                return {
                  ...ln,
                  priceRefLast: items.length ? items[0].packPrice ?? null : null,
                  priceRefAvg: l3.length ? l3.reduce((a, b) => a + b, 0) / l3.length : null,
                };
              } catch {
                return ln;
              }
            })
          );
          setLines(enriched);
          setInvoiceNumber(data.invoiceNumber || "");
          setLinkedReceivalId(data.linkedReceivalId || null);
          setPoId(data.id);
        } catch {
          toast.error("Purchase order not found");
          navigate("/purchase-orders");
        } finally {
          setLoading(false);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const closed = status === "closed";

  const runSearch = async () => {
    setSearching(true);
    setActiveProduct(null);
    setPacks([]);
    try {
      const { data } = await api.get("/cpis/products", { params: { query, limit: 25 } });
      setResults(data.items);
    } catch {
      toast.error("Search failed — try syncing CPIS products first");
    } finally {
      setSearching(false);
    }
  };

  const chooseProduct = async (p) => {
    setActiveProduct(p);
    setLoadingPacks(true);
    setPacks([]);
    try {
      const { data } = await api.get(`/cpis/products/${p.productId}/packs`);
      setPacks(data.packs || []);
    } catch {
      toast.error("Could not load packs");
    } finally {
      setLoadingPacks(false);
    }
  };

  const [frequent, setFrequent] = useState([]);

  const fetchLineMeta = async (productId, packId) => {
    const meta = { priceRefLast: null, priceRefAvg: null, supplierCode: "", belowMin: false, minStock: null, available: null, packPriceCfg: null, layerCfg: null, palletCfg: null };
    const calls = [
      api.get("/pricing/history", { params: { packId, supplierId: supplierId || undefined, limit: 50 } }).then((r) => {
        const items = r.data.items || [];
        if (items.length) {
          meta.priceRefLast = items[0].packPrice ?? null;
          const l3 = items.slice(0, 3).map((i) => i.packPrice).filter((v) => v != null);
          meta.priceRefAvg = l3.length ? l3.reduce((a, b) => a + b, 0) / l3.length : null;
        }
      }).catch(() => {}),
      api.get("/min-levels/check", { params: { productId } }).then((r) => {
        if (r.data.hasMin) {
          meta.belowMin = !!r.data.belowMin;
          meta.minStock = r.data.minStock;
          meta.available = r.data.available;
        }
      }).catch(() => {}),
    ];
    if (supplierId) {
      calls.push(
        api.get("/supplier-pack-configs", { params: { supplierId, productId } }).then((r) => {
          const cfg = (r.data || []).find((c) => c.packId === packId) || null;
          meta.packPriceCfg = cfg?.packPrice ?? null;
          meta.layerCfg = cfg?.unitsPerLayer ?? null;
          meta.palletCfg = cfg?.unitsPerPallet ?? null;
        }).catch(() => {}),
        api.get("/supplier-products", { params: { supplierId, productId } }).then((r) => {
          meta.supplierCode = (r.data || [])[0]?.supplierCode || "";
        }).catch(() => {})
      );
    }
    await Promise.all(calls);
    return meta;
  };

  const addLine = async (product, pack) => {
    const m = await fetchLineMeta(product.productId, pack.packId);
    setLines((ls) => [
      ...ls,
      {
        productId: product.productId,
        sku: product.sku,
        productName: product.name,
        packId: pack.packId,
        packName: pack.name,
        packShortCode: pack.shortCode,
        unitQuantity: pack.unitQuantity || 1,
        baseUnit: product.baseUnit,
        quantityPacks: 1,
        receivedPacks: "",
        packPrice: m.packPriceCfg ?? "",
        unitsPerLayer: m.layerCfg ?? "",
        unitsPerPallet: m.palletCfg ?? "",
        supplierCode: m.supplierCode,
        priceRefLast: m.priceRefLast,
        priceRefAvg: m.priceRefAvg,
        belowMin: m.belowMin,
        minStock: m.minStock,
        available: m.available,
      },
    ]);
    toast.success(`Added ${product.name} · ${pack.name}`);
    setPickOpen(false);
    setQuery("");
    setResults([]);
    setActiveProduct(null);
    setPacks([]);
  };

  const addFromFrequent = async (f) => {
    if (lines.some((l) => l.packId === f.packId)) return toast.info("Already on this order");
    const m = await fetchLineMeta(f.productId, f.packId);
    setLines((ls) => [
      ...ls,
      {
        productId: f.productId,
        sku: f.sku,
        productName: f.productName,
        packId: f.packId,
        packName: f.packName,
        packShortCode: f.packShortCode,
        unitQuantity: f.unitQuantity || 1,
        baseUnit: f.baseUnit,
        quantityPacks: 1,
        receivedPacks: "",
        packPrice: m.packPriceCfg ?? "",
        unitsPerLayer: m.layerCfg ?? "",
        unitsPerPallet: m.palletCfg ?? "",
        supplierCode: m.supplierCode,
        priceRefLast: m.priceRefLast,
        priceRefAvg: m.priceRefAvg,
        belowMin: m.belowMin,
        minStock: m.minStock,
        available: m.available,
      },
    ]);
    toast.success(`Added ${f.productName}`);
  };

  const setLine = (idx, patch) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));

  // ---- Bulk CSV import (match rows by CPIS pack code) ----
  const csvInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const HKEY = (h) => h.toLowerCase().replace(/[\s_/\-.]/g, "");
  const normHeader = (h) => {
    const k = HKEY(h);
    if (["packcode", "code", "shortcode", "productpackcode", "packshortcode"].includes(k)) return "packCode";
    if (["qty", "quantity", "orderqty", "quantitypacks", "ordered"].includes(k)) return "qty";
    if (["received", "receivedpacks", "recvd", "recv"].includes(k)) return "received";
    if (["packprice", "price", "cost", "unitprice"].includes(k)) return "packPrice";
    if (["unitsperlayer", "unitslayer", "perlayer", "layer"].includes(k)) return "unitsPerLayer";
    if (["unitsperpallet", "unitspallet", "perpallet", "pallet"].includes(k)) return "unitsPerPallet";
    return null;
  };

  const parseCsv = (text) => {
    const rows = [];
    let field = "";
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.some((v) => v.trim() !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== "" || row.length) {
      row.push(field);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
    }
    return rows;
  };

  const handleCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        toast.error("CSV needs a header row and at least one data row");
        return;
      }
      const headers = rows[0].map((h) => normHeader(h.trim()));
      if (!headers.includes("packCode")) {
        toast.error("CSV must have a 'pack code' column");
        return;
      }
      const parsed = rows.slice(1).map((r) => {
        const obj = {};
        headers.forEach((h, i) => {
          if (h) obj[h] = (r[i] ?? "").trim();
        });
        return obj;
      }).filter((o) => o.packCode);

      if (parsed.length === 0) {
        toast.error("No rows with a pack code found");
        return;
      }

      const codes = [...new Set(parsed.map((p) => p.packCode))];
      const { data } = await api.post("/cpis/packs/resolve", { shortCodes: codes });
      const map = {};
      (data.items || []).forEach((it) => {
        map[it.shortCode] = it;
        map[it.shortCode.toUpperCase()] = it;
      });

      const newLines = [];
      const notFound = [];
      for (const p of parsed) {
        const r = map[p.packCode] || map[p.packCode.toUpperCase()];
        if (!r || !r.found) {
          notFound.push(p.packCode);
          continue;
        }
        newLines.push({
          productId: r.productId,
          sku: r.sku,
          productName: r.productName,
          packId: r.packId,
          packName: r.packName,
          packShortCode: r.packShortCode,
          unitQuantity: r.unitQuantity || 1,
          baseUnit: r.baseUnit,
          quantityPacks: p.qty !== undefined && p.qty !== "" ? Number(p.qty) : 1,
          receivedPacks: p.received !== undefined && p.received !== "" ? Number(p.received) : "",
          packPrice: p.packPrice !== undefined && p.packPrice !== "" ? Number(p.packPrice) : "",
          unitsPerLayer: p.unitsPerLayer !== undefined && p.unitsPerLayer !== "" ? Number(p.unitsPerLayer) : "",
          unitsPerPallet: p.unitsPerPallet !== undefined && p.unitsPerPallet !== "" ? Number(p.unitsPerPallet) : "",
          priceRefLast: null,
          priceRefAvg: null,
        });
      }
      if (newLines.length) setLines((ls) => [...ls, ...newLines]);
      if (notFound.length) {
        toast.warning(`Imported ${newLines.length} line(s). ${notFound.length} code(s) not found: ${notFound.slice(0, 5).join(", ")}${notFound.length > 5 ? "…" : ""}`);
      } else {
        toast.success(`Imported ${newLines.length} line(s) from CSV`);
      }
    } catch (err) {
      toast.error("Could not import CSV — check the format");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv =
      "pack code,qty,received,pack price,units per layer,units per pallet\nMUSBX1,10,10,120,8,64\nDRPEP330,5,4,18,6,48\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "po_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const perUnit = (l) => {
    const pp = num(l.packPrice);
    const uq = Number(l.unitQuantity) || 1;
    return pp === null ? null : pp / uq;
  };
  const lineTotal = (l) => (num(l.packPrice) || 0) * (num(l.quantityPacks) || 0);
  const grandTotal = lines.reduce((a, l) => a + lineTotal(l), 0);

  const buildPayload = () => ({
    supplierId: supplierId || null,
    notes,
    lines: lines.map((l) => ({
      ...l,
      unitQuantity: Number(l.unitQuantity) || 1,
      quantityPacks: num(l.quantityPacks) || 0,
      receivedPacks: num(l.receivedPacks),
      bestBeforeDate: l.bestBeforeDate || null,
      packPrice: num(l.packPrice),
      unitsPerLayer: num(l.unitsPerLayer),
      unitsPerPallet: num(l.unitsPerPallet),
    })),
  });

  const persistSupplierConfigs = async () => {
    if (!supplierId) return;
    await Promise.all([
      ...lines
        .filter((l) => num(l.packPrice) !== null || num(l.unitsPerLayer) !== null || num(l.unitsPerPallet) !== null)
        .map((l) =>
          api.post("/supplier-pack-configs", {
            supplierId,
            productId: l.productId,
            packId: l.packId,
            packName: l.packName,
            packShortCode: l.packShortCode,
            unitQuantity: Number(l.unitQuantity) || 1,
            baseUnit: l.baseUnit,
            unitsPerLayer: num(l.unitsPerLayer),
            unitsPerPallet: num(l.unitsPerPallet),
            packPrice: num(l.packPrice),
          })
        ),
      ...lines
        .filter((l) => l.supplierCode && l.supplierCode.trim())
        .map((l) =>
          api.post("/supplier-products", {
            supplierId,
            productId: l.productId,
            sku: l.sku,
            productName: l.productName,
            supplierCode: l.supplierCode.trim(),
          })
        ),
    ]);
  };

  const save = async () => {
    if (!supplierId) return toast.error("Select a supplier first");
    setSaving(true);
    try {
      let saved;
      if (poId) {
        saved = (await api.put(`/purchase-orders/${poId}`, buildPayload())).data;
      } else {
        saved = (await api.post("/purchase-orders", buildPayload())).data;
        setPoId(saved.id);
        setPoNumber(saved.poNumber);
        window.history.replaceState(null, "", `/purchase-orders/${saved.id}`);
      }
      await persistSupplierConfigs();
      setLines((prev) =>
        (saved.lines || []).map((ln, i) => ({
          ...ln,
          priceRefLast: prev[i]?.priceRefLast ?? null,
          priceRefAvg: prev[i]?.priceRefAvg ?? null,
        }))
      );
      toast.success(`${saved.poNumber} saved · supplier pricing stored`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openCloseDialog = async () => {
    if (!poId) return toast.error("Save the purchase order first");
    setCloseInvoice(invoiceNumber || "");
    setCloseReceival(linkedReceivalId || "none");
    setInvoiceError(false);
    try {
      const { data } = await api.get("/receivals", { params: { limit: 100 } });
      setReceivals(data.items || []);
    } catch {
      setReceivals([]);
    }
    setCloseOpen(true);
  };

  const confirmClose = async () => {
    if (!closeInvoice.trim()) {
      setInvoiceError(true);
      return toast.error("Invoice number is required");
    }
    setClosing(true);
    try {
      // Persist any line edits (e.g. received quantities) before closing.
      await api.put(`/purchase-orders/${poId}`, buildPayload());
      const { data } = await api.post(`/purchase-orders/${poId}/close`, {
        invoiceNumber: closeInvoice.trim(),
        linkedReceivalId: closeReceival === "none" ? null : closeReceival,
      });
      setStatus("closed");
      setInvoiceNumber(data.invoiceNumber);
      setLinkedReceivalId(data.linkedReceivalId);
      setCloseOpen(false);
      if (data.receiptsFailed > 0) {
        toast.warning(`Closed, but ${data.receiptsFailed} CPIS receipt(s) failed — check line packs`);
      } else {
        toast.success("PO closed & goods receipt posted to CPIS");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Close failed");
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const printPO = () => {
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || "—";
    const rows = lines
      .map(
        (l, i) => `<tr>
          <td>${i + 1}</td>
          <td>${l.productName || ""}<div class="muted">${l.sku || ""} · ${l.packName || ""}${l.packShortCode ? " · " + l.packShortCode : ""}</div></td>
          <td class="r">${num(l.quantityPacks) || 0}</td>
          <td class="r">${num(l.receivedPacks) === null ? "—" : num(l.receivedPacks)}</td>
          <td class="r">${money(num(l.packPrice) || 0)}</td>
          <td class="r">${perUnit(l) === null ? "—" : money(perUnit(l))}</td>
          <td class="r">${money(lineTotal(l))}</td>
        </tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><title>${poNumber || "Purchase Order"}</title>
      <style>
        *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
        body{margin:32px;color:#111}
        h1{margin:0 0 2px;font-size:24px}
        .muted{color:#666;font-size:11px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
        .meta div{font-size:13px;margin-bottom:2px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th,td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:left;vertical-align:top}
        th{background:#f2f2f2}
        .r{text-align:right}
        tfoot td{font-weight:bold;font-size:13px}
        .note{margin-top:16px;font-size:12px;color:#333}
      </style></head><body>
      <div class="head">
        <div><h1>EurasiaStockIntake</h1><div class="muted">Purchase Order</div></div>
        <div class="meta" style="text-align:right">
          <div><b>${poNumber || "(unsaved)"}</b></div>
          <div>Status: ${status}</div>
          ${invoiceNumber ? `<div>Invoice #: ${invoiceNumber}</div>` : ""}
          <div>Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
      <div class="meta"><div><b>Supplier:</b> ${supplierName}</div>${notes ? `<div><b>Notes:</b> ${notes}</div>` : ""}</div>
      <table>
        <thead><tr><th>#</th><th>Product</th><th class="r">Ordered</th><th class="r">Received</th><th class="r">Pack price</th><th class="r">Per unit</th><th class="r">Line total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="6" class="r">Grand total</td><td class="r">${money(grandTotal)}</td></tr></tfoot>
      </table>
      <div class="note">Generated by EurasiaStockIntake · ${new Date().toLocaleString()}</div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Allow pop-ups to print");
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/purchase-orders")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        data-testid="po-back-btn"
      >
        <ArrowLeft size={16} /> Purchase Orders
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-head font-black text-3xl tracking-tight">
            {poNumber || "New Purchase Order"}
          </h1>
          <div className="mt-1">
            <Badge
              variant={closed ? "secondary" : "default"}
              className={`rounded-sm ${closed ? "" : "bg-accent text-accent-foreground"}`}
              data-testid="po-status-badge"
            >
              {status}
            </Badge>
            {invoiceNumber && (
              <Badge variant="outline" className="rounded-sm ml-2 tnum" data-testid="po-invoice-badge">
                Invoice #{invoiceNumber}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={printPO}
            variant="outline"
            className="h-11 rounded-sm"
            data-testid="po-print-btn"
          >
            <Printer size={16} className="mr-2" /> Print
          </Button>
          {!closed && (
            <Button
              onClick={save}
              disabled={saving}
              variant="outline"
              className="h-11 rounded-sm"
              data-testid="po-save-btn"
            >
              <Save size={16} className="mr-2" /> {saving ? "Saving…" : "Save"}
            </Button>
          )}
          {!closed && (
            <Button
              onClick={openCloseDialog}
              className="h-11 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
              data-testid="po-close-btn"
            >
              <CheckCircle2 size={16} className="mr-2" /> Close PO
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-sm border-border p-5 mb-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Supplier</Label>
            <SupplierCombobox
              suppliers={suppliers}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="Select supplier"
              allowClear
              testid="po-supplier"
              className="mt-1 !h-11"
              disabled={closed}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              className="h-11 rounded-sm mt-1"
              disabled={closed}
              data-testid="po-notes"
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between mb-2">
        <h2 className="font-head font-bold text-lg">Products</h2>
        {!closed && (
          <div className="flex items-center gap-2">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsv}
              className="hidden"
              data-testid="csv-file-input"
            />
            <Button
              onClick={downloadTemplate}
              variant="ghost"
              className="h-10 rounded-sm text-muted-foreground"
              data-testid="csv-template-btn"
            >
              <FileDown size={16} className="mr-2" /> Template
            </Button>
            <Button
              onClick={() => csvInputRef.current?.click()}
              disabled={importing}
              variant="outline"
              className="h-10 rounded-sm"
              data-testid="import-csv-btn"
            >
              <Upload size={16} className="mr-2" /> {importing ? "Importing…" : "Import CSV"}
            </Button>
            <Button
              onClick={() => setPickOpen(true)}
              className="h-10 rounded-sm bg-primary text-primary-foreground"
              data-testid="add-product-btn"
            >
              <Plus size={16} className="mr-2" /> Add product
            </Button>
          </div>
        )}
      </div>

      {!closed && frequent.length > 0 && (
        <Card className="rounded-sm border-border p-4 mb-3 bg-secondary/30" data-testid="frequent-products">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Frequently ordered from this supplier
          </div>
          <div className="flex flex-wrap gap-2">
            {frequent.map((f) => (
              <button
                key={f.packId}
                onClick={() => addFromFrequent(f)}
                className="px-3 py-1.5 rounded-sm border border-border bg-background hover:bg-accent/10 text-left"
                data-testid={`frequent-${f.packId}`}
              >
                <span className="text-sm font-medium">{f.productName}</span>
                <span className="block text-[11px] text-muted-foreground tnum">
                  {f.packName} · ordered {f.count}× · last{" "}
                  {f.lastOrderedAt ? new Date(f.lastOrderedAt).toLocaleDateString() : "—"}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {lines.length === 0 ? (
        <Card className="rounded-sm border-border border-dashed p-8 text-center text-sm text-muted-foreground">
          No products yet. Click “Add product” to search CPIS.
        </Card>
      ) : (
        <div className="space-y-3" data-testid="po-lines">
          {lines.map((l, idx) => (
            <Card key={idx} className="rounded-sm border-border p-4" data-testid={`po-line-${idx}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {l.productName}
                    {num(l.receivedPacks) !== null && num(l.receivedPacks) < (num(l.quantityPacks) || 0) && (
                      <Badge variant="destructive" className="rounded-sm text-[10px]" data-testid={`po-line-short-${idx}`}>
                        SHORT {num(l.receivedPacks)}/{num(l.quantityPacks)}
                      </Badge>
                    )}
                    {num(l.receivedPacks) !== null && num(l.receivedPacks) >= (num(l.quantityPacks) || 0) && (
                      <Badge variant="secondary" className="rounded-sm text-[10px]">received</Badge>
                    )}
                    {l.belowMin && (
                      <Badge variant="destructive" className="rounded-sm text-[10px]" data-testid={`po-line-belowmin-${idx}`}>
                        LOW STOCK {l.available}/{l.minStock}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground tnum">
                    {l.sku} · {l.packName} {l.packShortCode ? `· ${l.packShortCode}` : ""} · pack size{" "}
                    {l.unitQuantity} {l.baseUnit}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleInsight(idx, l)}
                    className="h-8 rounded-sm"
                    data-testid={`po-line-insight-${idx}`}
                  >
                    <LineChart size={14} className="mr-1" /> Trend & stock
                  </Button>
                  {!closed && (
                    <button
                      onClick={() => removeLine(idx)}
                      className="text-destructive hover:bg-destructive/10 rounded-sm w-8 h-8 flex items-center justify-center"
                      data-testid={`po-line-remove-${idx}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Qty (packs)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={l.quantityPacks ?? ""}
                    onChange={(e) => setLine(idx, { quantityPacks: e.target.value })}
                    className="h-10 rounded-sm mt-1 tnum"
                    disabled={closed}
                    data-testid={`po-line-qty-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Received</Label>
                  <Input
                    type="number"
                    min="0"
                    value={l.receivedPacks ?? ""}
                    onChange={(e) => setLine(idx, { receivedPacks: e.target.value })}
                    placeholder="—"
                    className="h-10 rounded-sm mt-1 tnum"
                    disabled={closed}
                    data-testid={`po-line-received-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Pack price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.packPrice ?? ""}
                    onChange={(e) => setLine(idx, { packPrice: e.target.value })}
                    className="h-10 rounded-sm mt-1 tnum"
                    disabled={closed}
                    data-testid={`po-line-price-${idx}`}
                  />
                  {(() => {
                    const pp = num(l.packPrice);
                    if (pp === null) return null;
                    const aboveLast = l.priceRefLast != null && pp > l.priceRefLast;
                    const aboveAvg = l.priceRefAvg != null && pp > l.priceRefAvg;
                    if (!aboveLast && !aboveAvg) return null;
                    return (
                      <div
                        className="mt-1 flex items-center gap-1 text-[11px] text-destructive font-medium"
                        data-testid={`po-line-price-alert-${idx}`}
                      >
                        <AlertTriangle size={12} />
                        {aboveLast && <span>above last {money(l.priceRefLast)}</span>}
                        {aboveLast && aboveAvg && <span>·</span>}
                        {aboveAvg && <span>above avg {money(l.priceRefAvg)}</span>}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Layers size={12} /> Units / layer
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={l.unitsPerLayer ?? ""}
                    onChange={(e) => setLine(idx, { unitsPerLayer: e.target.value })}
                    className="h-10 rounded-sm mt-1 tnum"
                    disabled={closed}
                    data-testid={`po-line-layer-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Boxes size={12} /> Units / pallet
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={l.unitsPerPallet ?? ""}
                    onChange={(e) => setLine(idx, { unitsPerPallet: e.target.value })}
                    className="h-10 rounded-sm mt-1 tnum"
                    disabled={closed}
                    data-testid={`po-line-pallet-${idx}`}
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="text-xs text-muted-foreground">Per unit</div>
                  <div className="tnum font-medium" data-testid={`po-line-perunit-${idx}`}>
                    {perUnit(l) === null ? "—" : money(perUnit(l))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Line total</div>
                  <div className="tnum font-bold" data-testid={`po-line-total-${idx}`}>
                    {money(lineTotal(l))}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  Best before (batch)
                </label>
                <Input
                  type="date"
                  value={l.bestBeforeDate || ""}
                  onChange={(e) => setLine(idx, { bestBeforeDate: e.target.value })}
                  className="h-9 rounded-sm w-44 tnum"
                  disabled={closed}
                  data-testid={`po-line-bbd-${idx}`}
                />
                <span className="text-[11px] text-muted-foreground">
                  required at receive for batch-tracked products
                </span>
                <span className="mx-1 text-border">|</span>
                <label className="text-xs text-muted-foreground">Supplier code</label>
                <Input
                  value={l.supplierCode || ""}
                  onChange={(e) => setLine(idx, { supplierCode: e.target.value })}
                  placeholder="e.g. SUP-123"
                  className="h-9 rounded-sm w-40"
                  disabled={closed}
                  data-testid={`po-line-suppliercode-${idx}`}
                />
              </div>

              {openInsight === idx && (
                <div className="mt-4 border-t border-border pt-4" data-testid={`po-line-insight-panel-${idx}`}>
                  {insight[idx]?.loading ? (
                    <p className="text-sm text-muted-foreground">Loading CPIS trend & stock…</p>
                  ) : insight[idx]?.error ? (
                    <p className="text-sm text-destructive">Could not load data from CPIS.</p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                          Live stock (CPIS)
                        </div>
                        <div className="tnum text-sm mb-2">
                          Available:{" "}
                          <span className="font-bold">
                            {insight[idx]?.stock?.available} {insight[idx]?.stock?.base_unit}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {(insight[idx]?.stock?.packs || []).map((pk) => (
                            <div
                              key={pk.pack_id}
                              className={`flex justify-between text-xs tnum px-2 py-1 rounded-sm ${
                                pk.pack_id === l.packId ? "bg-accent/10 font-medium" : "bg-secondary/50"
                              }`}
                            >
                              <span>{pk.pack_name}</span>
                              <span>{pk.available_packs_whole} packs</span>
                            </div>
                          ))}
                        </div>
                        {insight[idx]?.stock?.batch_tracking && (
                          <div className="mt-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                              Batches · {insight[idx]?.stock?.batch_pick_rule || "FEFO"}
                            </div>
                            <div className="space-y-1">
                              {(insight[idx]?.stock?.batches || []).length === 0 ? (
                                <div className="text-[11px] text-muted-foreground">No batches on hand.</div>
                              ) : (
                                (insight[idx]?.stock?.batches || []).map((b) => (
                                  <div
                                    key={b.batch_id}
                                    className={`flex justify-between text-[11px] tnum px-2 py-1 rounded-sm ${
                                      b.is_expired ? "bg-destructive/10 text-destructive" : "bg-secondary/50"
                                    }`}
                                  >
                                    <span>
                                      BBD {b.best_before_date}
                                      {b.is_expired ? " · expired" : ` · ${b.days_to_expiry}d`}
                                    </span>
                                    <span>{b.available} {insight[idx]?.stock?.base_unit}</span>
                                  </div>
                                ))
                              )}
                              {Number(insight[idx]?.stock?.unbatched_on_hand) > 0 && (
                                <div className="flex justify-between text-[11px] tnum px-2 py-1 rounded-sm bg-secondary/50">
                                  <span>Unbatched</span>
                                  <span>{insight[idx]?.stock?.unbatched_on_hand}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Sales trend
                          </span>
                          <div className="flex rounded-sm border border-border overflow-hidden text-xs">
                            {["weekly", "monthly"].map((g) => (
                              <button
                                key={g}
                                onClick={() => loadInsight(idx, l, g)}
                                className={`px-2 py-1 capitalize ${
                                  insight[idx]?.granularity === g
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-secondary"
                                }`}
                                data-testid={`po-line-gran-${g}-${idx}`}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(() => {
                          const series = insight[idx]?.sales?.series || [];
                          const packOf = (bucket) =>
                            (bucket.by_pack || []).find((b) => b.pack_id === l.packId);
                          const vals = series.map((s) => Number(packOf(s)?.quantity_packs || 0));
                          const max = Math.max(1, ...vals);
                          return series.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No sales in window.</p>
                          ) : (
                            <div className="flex items-end gap-1" style={{ height: 96 }}>
                              {series.map((s, i) => {
                                const h = vals[i] > 0 ? Math.max(6, (vals[i] / max) * 78) : 0;
                                return (
                                  <div
                                    key={i}
                                    className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
                                    title={`${s.label}: ${vals[i]} packs`}
                                  >
                                    <span className="text-[9px] tnum text-muted-foreground">{vals[i] ? vals[i] : ""}</span>
                                    <div className="w-full bg-accent/80 rounded-t-sm" style={{ height: h }} />
                                    <span className="text-[9px] text-muted-foreground tnum whitespace-nowrap">
                                      {s.label.slice(-3)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        <div className="text-[11px] text-muted-foreground mt-1 tnum">
                          Sold this pack ({insight[idx]?.granularity}): total{" "}
                          {(insight[idx]?.sales?.totals?.by_pack || []).find((b) => b.pack_id === l.packId)
                            ?.quantity_packs_whole ?? 0}{" "}
                          packs
                        </div>
                      </div>
                    </div>
                  )}
                  {!insight[idx]?.loading && !insight[idx]?.error && (insight[idx]?.others || []).length > 0 && (
                    <div className="mt-4 border-t border-border pt-3" data-testid={`po-line-others-${idx}`}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Other suppliers' last purchase price
                      </div>
                      <div className="grid sm:grid-cols-2 gap-1">
                        {(insight[idx]?.others || []).map((o) => (
                          <div key={o.supplierId} className="flex justify-between text-xs px-2 py-1 rounded-sm bg-secondary/50">
                            <span>{o.supplierName}</span>
                            <span className="tnum">
                              {money(o.packPrice)} · {o.recordedAt ? new Date(o.recordedAt).toLocaleDateString() : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
          <div className="flex justify-end pr-1">
            <div className="text-right">
              <span className="text-sm text-muted-foreground mr-3">Grand total</span>
              <span className="font-head font-black text-2xl tnum" data-testid="po-grand-total">
                {money(grandTotal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Product search dialog */}
      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="product-search-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Add product from CPIS</DialogTitle>
            <DialogDescription>Search by product name, SKU or brand, then pick a pack.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. mushroom, PRD002, brand…"
                className="pl-10 h-11 rounded-sm"
                data-testid="product-search-input"
                autoFocus
              />
            </div>
            <Button type="submit" className="h-11 rounded-sm" data-testid="product-search-submit">
              {searching ? "…" : "Search"}
            </Button>
          </form>

          <div className="mt-3 space-y-2">
            {results.length === 0 && !searching && (
              <p className="text-sm text-muted-foreground">Type a term and search.</p>
            )}
            {results.map((p) => (
              <div key={p.productId} className="border border-border rounded-sm" data-testid={`product-result-${p.productId}`}>
                <button
                  onClick={() => chooseProduct(p)}
                  className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center justify-between"
                >
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2 tnum">
                      {p.sku} {p.brandName ? `· ${p.brandName}` : ""} · {p.packCount} pack(s)
                    </span>
                  </span>
                  <PackagePlus size={16} className="text-muted-foreground" />
                </button>
                {activeProduct?.productId === p.productId && (
                  <div className="border-t border-border p-2 bg-secondary/40 space-y-1">
                    {loadingPacks ? (
                      <p className="text-xs text-muted-foreground px-1">Loading packs…</p>
                    ) : packs.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1">No packs.</p>
                    ) : (
                      packs.map((pk) => (
                        <div
                          key={pk.packId}
                          className="flex items-center justify-between px-2 py-1.5 bg-background rounded-sm"
                        >
                          <span className="text-sm">
                            {pk.name}
                            <span className="text-xs text-muted-foreground ml-2 tnum">
                              {pk.shortCode ? `${pk.shortCode} · ` : ""}size {pk.unitQuantity} {pk.unitOfMeasure}
                            </span>
                          </span>
                          <Button
                            size="sm"
                            className="h-8 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
                            onClick={() => addLine(p, pk)}
                            data-testid={`add-pack-${pk.packId}`}
                          >
                            <Plus size={14} className="mr-1" /> Add
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Close PO dialog */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="rounded-sm max-w-md" data-testid="close-po-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Close purchase order</DialogTitle>
            <DialogDescription>
              Enter the invoice number and optionally link a receival confirmation. On close, a positive
              goods receipt is posted to CPIS for every line.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Invoice number</Label>
              <Input
                value={closeInvoice}
                onChange={(e) => {
                  setCloseInvoice(e.target.value);
                  if (e.target.value.trim()) setInvoiceError(false);
                }}
                placeholder="e.g. INV-10234"
                className={`h-11 rounded-sm mt-1 ${invoiceError ? "border-destructive" : ""}`}
                data-testid="close-invoice-input"
              />
              {invoiceError && (
                <p className="text-xs text-destructive mt-1">Invoice number is required to close.</p>
              )}
            </div>
            <div>
              <Label>Link receival confirmation (optional)</Label>
              <Select value={closeReceival} onValueChange={setCloseReceival}>
                <SelectTrigger className="h-11 rounded-sm mt-1" data-testid="close-receival-select">
                  <SelectValue placeholder="No link" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No link</SelectItem>
                  {receivals.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {new Date(r.createdAt).toLocaleDateString()} · {r.supplier?.name || "—"} ·{" "}
                      {r.receivedBy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {closeReceival !== "none" && (
                <p className="text-xs text-muted-foreground mt-1">
                  The linked receival's invoice number will be set to “{closeInvoice || "…"}”.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)} className="rounded-sm" data-testid="close-cancel">
              Cancel
            </Button>
            <Button
              onClick={confirmClose}
              disabled={closing}
              className="rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
              data-testid="close-confirm"
            >
              {closing ? "Closing…" : "Close & post receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseOrderEditPage;
