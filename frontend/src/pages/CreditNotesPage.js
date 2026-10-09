import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import SupplierCombobox from "@/components/SupplierCombobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Search, FileText, RotateCcw, PoundSterling } from "lucide-react";

const money = (n) => (n == null ? "—" : `£${Number(n).toFixed(2)}`);

const CreditNotesPage = () => {
  const [notes, setNotes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // form
  const [supplierId, setSupplierId] = useState("");
  const [type, setType] = useState("price_only");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  // product picker
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [activeProduct, setActiveProduct] = useState(null);
  const [packs, setPacks] = useState([]);

  const load = async () => {
    try {
      const [n, s] = await Promise.all([api.get("/credit-notes"), api.get("/suppliers")]);
      setNotes(n.data || []);
      setSuppliers(s.data || []);
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setSupplierId("");
    setType("price_only");
    setReason("");
    setNote("");
    setLines([]);
    setQuery("");
    setResults([]);
    setActiveProduct(null);
    setPacks([]);
    setOpen(true);
  };

  const runSearch = async (e) => {
    e?.preventDefault();
    try {
      const { data } = await api.get("/cpis/products", { params: { query, limit: 15 } });
      setResults(data.items);
    } catch {
      toast.error("Search failed");
    }
  };
  const chooseProduct = async (p) => {
    setActiveProduct(p);
    setPacks([]);
    try {
      const { data } = await api.get(`/cpis/products/${p.productId}/packs`);
      setPacks(data.packs || []);
    } catch {
      toast.error("Could not load packs");
    }
  };
  const addLine = (product, pack) => {
    setLines((ls) => [
      ...ls,
      {
        productId: product.productId,
        sku: product.sku,
        productName: product.name,
        packId: pack?.packId || null,
        packName: pack?.name || null,
        packShortCode: pack?.shortCode || null,
        unitQuantity: pack?.unitQuantity || 1,
        baseUnit: product.baseUnit,
        qtyPacks: "",
        amount: "",
      },
    ]);
  };
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = (i) => setLines((ls) => ls.filter((_, j) => j !== i));

  const total = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);

  const submit = async () => {
    if (!supplierId) return toast.error("Choose a supplier");
    if (lines.length === 0) return toast.error("Add at least one line");
    if (type === "return" && lines.some((l) => !l.packId || !l.qtyPacks)) {
      return toast.error("Return lines need a pack and a quantity");
    }
    setSaving(true);
    try {
      const { data } = await api.post("/credit-notes", {
        supplierId,
        type,
        reason,
        note,
        lines: lines.map((l) => ({
          productId: l.productId,
          packId: l.packId,
          productName: l.productName,
          packName: l.packName,
          packShortCode: l.packShortCode,
          unitQuantity: Number(l.unitQuantity) || 1,
          baseUnit: l.baseUnit,
          qtyPacks: l.qtyPacks === "" ? null : Number(l.qtyPacks),
          amount: Number(l.amount) || 0,
        })),
      });
      if (data.movementsFailed > 0) {
        toast.warning(`Credit note ${data.number} saved, but ${data.movementsFailed} stock return(s) failed at CPIS.`);
      } else {
        toast.success(`Credit note ${data.number} created`);
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create credit note");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this credit note record? (Stock already moved at CPIS is not reversed.)")) return;
    try {
      await api.delete(`/credit-notes/${id}`);
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">Credit Notes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record supplier credits — price-only (no stock) or returns (reduces CPIS stock).
          </p>
        </div>
        <Button onClick={openNew} className="h-12 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90" data-testid="new-credit-note-btn">
          <Plus size={18} className="mr-2" /> New credit note
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <Card className="rounded-sm border-border border-dashed p-10 text-center">
          <FileText size={36} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No credit notes yet.</p>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="credit-notes-list">
          {notes.map((n) => (
            <Card key={n.id} className="rounded-sm border-border p-4 flex items-center justify-between gap-3" data-testid={`cn-row-${n.id}`}>
              <div>
                <div className="font-medium flex items-center gap-2">
                  {n.number}
                  {n.type === "return" ? (
                    <Badge className="rounded-sm bg-amber-600 hover:bg-amber-600"><RotateCcw size={11} className="mr-1" /> Return</Badge>
                  ) : (
                    <Badge variant="secondary" className="rounded-sm"><PoundSterling size={11} className="mr-1" /> Price only</Badge>
                  )}
                  {n.movementsFailed > 0 && <Badge variant="destructive" className="rounded-sm">stock failed</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {n.supplierName} · {new Date(n.createdAt).toLocaleDateString()} · {(n.lines || []).length} line(s)
                  {n.reason ? ` · ${n.reason}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-head font-black text-xl tnum">{money(n.totalAmount)}</span>
                <button onClick={() => del(n.id)} className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-destructive hover:bg-destructive/10" data-testid={`cn-delete-${n.id}`}>
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="credit-note-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">New credit note</DialogTitle>
            <DialogDescription>Price-only adjusts value only; Return also reduces CPIS stock.</DialogDescription>
          </DialogHeader>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Supplier</Label>
              <div className="mt-1">
                <SupplierCombobox suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setType("price_only")}
                  className={`flex-1 h-10 rounded-sm border text-sm ${type === "price_only" ? "border-accent bg-accent/10 font-medium" : "border-border"}`}
                  data-testid="cn-type-price"
                >
                  Price only
                </button>
                <button
                  onClick={() => setType("return")}
                  className={`flex-1 h-10 rounded-sm border text-sm ${type === "return" ? "border-accent bg-accent/10 font-medium" : "border-border"}`}
                  data-testid="cn-type-return"
                >
                  Return (stock)
                </button>
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div>
              <Label>Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. overcharge / damaged" className="h-10 rounded-sm mt-1" data-testid="cn-reason" />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-10 rounded-sm mt-1" />
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <form onSubmit={runSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product to add a line…" className="pl-9 h-10 rounded-sm" data-testid="cn-search-input" />
              </div>
              <Button type="submit" className="h-10 rounded-sm" data-testid="cn-search-submit">Search</Button>
            </form>
            {results.length > 0 && (
              <div className="mt-2 space-y-1">
                {results.map((p) => (
                  <div key={p.productId} className="border border-border rounded-sm">
                    <button onClick={() => chooseProduct(p)} className="w-full text-left px-3 py-2 hover:bg-secondary text-sm" data-testid={`cn-result-${p.productId}`}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 tnum">{p.sku}</span>
                    </button>
                    {activeProduct?.productId === p.productId && (
                      <div className="border-t border-border p-2 bg-secondary/40 space-y-1">
                        <button onClick={() => addLine(p, null)} className="text-xs px-2 py-1 rounded-sm bg-background hover:bg-accent/10 w-full text-left" data-testid={`cn-add-noPack-${p.productId}`}>
                          + Add without pack (value only)
                        </button>
                        {packs.map((pk) => (
                          <button key={pk.packId} onClick={() => addLine(p, pk)} className="text-xs px-2 py-1 rounded-sm bg-background hover:bg-accent/10 w-full text-left flex justify-between" data-testid={`cn-add-pack-${pk.packId}`}>
                            <span>{pk.name} {pk.shortCode ? `· ${pk.shortCode}` : ""}</span>
                            <span className="text-muted-foreground">+ add</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="mt-3 space-y-2" data-testid="cn-lines">
              {lines.map((l, i) => (
                <div key={i} className="border border-border rounded-sm p-2" data-testid={`cn-line-${i}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{l.productName}</div>
                    <button onClick={() => removeLine(i)} className="text-destructive"><Trash2 size={14} /></button>
                  </div>
                  <div className="text-[11px] text-muted-foreground tnum mb-2">{l.sku} {l.packName ? `· ${l.packName}` : "· (no pack)"}</div>
                  <div className="flex gap-2">
                    {type === "return" && (
                      <div>
                        <label className="text-[11px] text-muted-foreground">Qty (packs)</label>
                        <Input type="number" min="0" value={l.qtyPacks} onChange={(e) => setLine(i, { qtyPacks: e.target.value })} className="h-9 rounded-sm w-28 tnum" data-testid={`cn-line-qty-${i}`} />
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] text-muted-foreground">Credit amount (£)</label>
                      <Input type="number" min="0" step="0.01" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} className="h-9 rounded-sm w-36 tnum" data-testid={`cn-line-amount-${i}`} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-right text-sm">
                Total credit: <span className="font-head font-black text-lg tnum" data-testid="cn-total">{money(total)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="rounded-sm bg-accent text-accent-foreground hover:bg-accent/90" data-testid="cn-submit">
              {saving ? "Saving…" : type === "return" ? "Create & reduce stock" : "Create credit note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreditNotesPage;
