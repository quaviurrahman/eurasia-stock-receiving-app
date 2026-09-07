import { useEffect, useState } from "react";
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
          setLines(data.lines || []);
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

  const addLine = async (product, pack) => {
    let cfg = null;
    if (supplierId) {
      try {
        const { data } = await api.get("/supplier-pack-configs", {
          params: { supplierId, productId: product.productId },
        });
        cfg = data.find((c) => c.packId === pack.packId) || null;
      } catch {
        /* ignore */
      }
    }
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
        packPrice: cfg?.packPrice ?? "",
        unitsPerLayer: cfg?.unitsPerLayer ?? "",
        unitsPerPallet: cfg?.unitsPerPallet ?? "",
      },
    ]);
    toast.success(`Added ${product.name} · ${pack.name}`);
    setPickOpen(false);
    setQuery("");
    setResults([]);
    setActiveProduct(null);
    setPacks([]);
  };

  const setLine = (idx, patch) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));

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
      packPrice: num(l.packPrice),
      unitsPerLayer: num(l.unitsPerLayer),
      unitsPerPallet: num(l.unitsPerPallet),
    })),
  });

  const persistSupplierConfigs = async () => {
    if (!supplierId) return;
    await Promise.all(
      lines
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
        )
    );
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
      setLines(saved.lines || []);
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
          <Button
            onClick={() => setPickOpen(true)}
            className="h-10 rounded-sm bg-primary text-primary-foreground"
            data-testid="add-product-btn"
          >
            <Plus size={16} className="mr-2" /> Add product
          </Button>
        )}
      </div>

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
                  <div className="font-medium">{l.productName}</div>
                  <div className="text-xs text-muted-foreground tnum">
                    {l.sku} · {l.packName} {l.packShortCode ? `· ${l.packShortCode}` : ""} · pack size{" "}
                    {l.unitQuantity} {l.baseUnit}
                  </div>
                </div>
                {!closed && (
                  <button
                    onClick={() => removeLine(idx)}
                    className="text-destructive hover:bg-destructive/10 rounded-sm w-8 h-8 flex items-center justify-center shrink-0"
                    data-testid={`po-line-remove-${idx}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Qty (packs)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={l.quantityPacks}
                    onChange={(e) => setLine(idx, { quantityPacks: e.target.value })}
                    className="h-10 rounded-sm mt-1 tnum"
                    disabled={closed}
                    data-testid={`po-line-qty-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Pack price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.packPrice}
                    onChange={(e) => setLine(idx, { packPrice: e.target.value })}
                    className="h-10 rounded-sm mt-1 tnum"
                    disabled={closed}
                    data-testid={`po-line-price-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Layers size={12} /> Units / layer
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={l.unitsPerLayer}
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
                    value={l.unitsPerPallet}
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
