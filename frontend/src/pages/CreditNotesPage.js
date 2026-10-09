import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Search, FileText, RotateCcw, PoundSterling, ArrowLeft } from "lucide-react";

const money = (n) => (n == null ? "—" : `£${Number(n).toFixed(2)}`);
const received = (l) => Number(l.receivedPacks ?? l.quantityPacks ?? 0);
const remainingOf = (l) => Math.max(0, received(l) - Number(l.creditedPacks || 0));

const POPicker = ({ orders, onPick }) => {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = orders.filter(
    (p) =>
      !term ||
      [p.poNumber, p.supplier?.name, p.invoiceNumber].some((v) => (v || "").toLowerCase().includes(term))
  );
  return (
    <div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO #, supplier or invoice…" className="pl-9 h-10 rounded-sm" data-testid="cn-po-search" />
      </div>
      <div className="mt-2 max-h-80 overflow-y-auto space-y-1" data-testid="cn-po-list">
        {list.length === 0 && <p className="text-sm text-muted-foreground p-3">No closed purchase orders found.</p>}
        {list.map((p) => (
          <button key={p.id} onClick={() => onPick(p.id)} className="w-full text-left border border-border rounded-sm px-3 py-2 hover:bg-secondary flex justify-between items-center" data-testid={`cn-po-option-${p.id}`}>
            <span>
              <span className="font-medium tnum">{p.poNumber}</span>
              <span className="text-xs text-muted-foreground ml-2">{p.supplier?.name || "—"}{p.invoiceNumber ? ` · Inv #${p.invoiceNumber}` : ""}</span>
            </span>
            <span className="text-xs tnum text-muted-foreground">{money(p.total)}{p.creditTotal > 0 ? ` · credited ${money(p.creditTotal)}` : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const CNLineRow = ({ l, idx, type, entry, onChange }) => {
  const rem = remainingOf(l);
  const qty = Number(entry.qty) || 0;
  const amount = type === "price_only" ? qty * (Number(entry.reduction) || 0) : entry.amount !== "" ? Number(entry.amount) || 0 : qty * (l.packPrice || 0);
  return (
    <div className={`border border-border rounded-sm p-2 ${rem === 0 ? "opacity-50" : ""}`} data-testid={`cn-line-${idx}`}>
      <div className="text-sm font-medium">{l.productName}</div>
      <div className="text-[11px] text-muted-foreground tnum mb-2">
        {l.sku} · {l.packName || "—"} · {money(l.packPrice)}/pack · received {received(l)} · credited {l.creditedPacks || 0} ·{" "}
        <span className="text-foreground font-medium" data-testid={`cn-line-remaining-${idx}`}>{rem} left</span>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[11px] text-muted-foreground">Credit qty (packs)</label>
          <Input type="number" min="0" max={rem} disabled={rem === 0} value={entry.qty} onChange={(e) => onChange({ qty: e.target.value })} className={`h-9 rounded-sm w-28 tnum ${qty > rem ? "border-destructive" : ""}`} data-testid={`cn-line-qty-${idx}`} />
        </div>
        {type === "price_only" ? (
          <div>
            <label className="text-[11px] text-muted-foreground">Price reduction / pack (£)</label>
            <Input type="number" min="0" step="0.01" disabled={rem === 0} value={entry.reduction} onChange={(e) => onChange({ reduction: e.target.value })} className="h-9 rounded-sm w-36 tnum" data-testid={`cn-line-reduction-${idx}`} />
          </div>
        ) : (
          <div>
            <label className="text-[11px] text-muted-foreground">Credit amount (£)</label>
            <Input type="number" min="0" step="0.01" disabled={rem === 0} value={entry.amount} placeholder={(qty * (l.packPrice || 0)).toFixed(2)} onChange={(e) => onChange({ amount: e.target.value })} className="h-9 rounded-sm w-36 tnum" data-testid={`cn-line-amount-${idx}`} />
          </div>
        )}
        <div className="ml-auto text-sm tnum" data-testid={`cn-line-total-${idx}`}>{money(amount)}</div>
      </div>
      {qty > rem && <p className="text-[11px] text-destructive mt-1">Max {rem} pack(s) can be credited.</p>}
    </div>
  );
};

const lineAmount = (l, type, e) => {
  const qty = Number(e.qty) || 0;
  if (type === "price_only") return qty * (Number(e.reduction) || 0);
  return e.amount !== "" ? Number(e.amount) || 0 : qty * (l.packPrice || 0);
};

const CreditNotesPage = () => {
  const [params, setParams] = useSearchParams();
  const [notes, setNotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [po, setPo] = useState(null);
  const [type, setType] = useState("price_only");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [entries, setEntries] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [n, o] = await Promise.all([api.get("/credit-notes"), api.get("/purchase-orders")]);
      setNotes(n.data || []);
      setOrders((o.data || []).filter((p) => p.status === "closed"));
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const pickPO = async (id) => {
    try {
      const { data } = await api.get(`/purchase-orders/${id}`);
      if (data.status !== "closed") return toast.error("Only closed purchase orders can be credited");
      setPo(data);
      setEntries({});
    } catch {
      toast.error("Could not load purchase order");
    }
  };

  const openNew = (poId) => {
    setPo(null);
    setType("price_only");
    setReason("");
    setNote("");
    setEntries({});
    setOpen(true);
    if (poId) pickPO(poId);
  };

  useEffect(() => {
    load();
    const poId = params.get("poId");
    if (poId) {
      openNew(poId);
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entryOf = (i) => entries[i] || { qty: "", reduction: "", amount: "" };
  const setEntry = (i, patch) => setEntries((es) => ({ ...es, [i]: { ...entryOf(i), ...patch } }));
  const poLines = po?.lines || [];
  const active = poLines.map((l, i) => ({ l, i, e: entryOf(i) })).filter((x) => Number(x.e.qty) > 0);
  const total = active.reduce((a, x) => a + lineAmount(x.l, type, x.e), 0);

  const submit = async () => {
    if (!po) return toast.error("Choose a purchase order");
    if (active.length === 0) return toast.error("Enter a credit qty on at least one line");
    const over = active.find((x) => Number(x.e.qty) > remainingOf(x.l));
    if (over) return toast.error(`${over.l.productName}: only ${remainingOf(over.l)} pack(s) left to credit`);
    if (type === "price_only" && active.some((x) => !(Number(x.e.reduction) > 0))) {
      return toast.error("Enter a price reduction per pack for each line");
    }
    setSaving(true);
    try {
      const { data } = await api.post("/credit-notes", {
        poId: po.id,
        type,
        reason,
        note,
        lines: active.map(({ i, e }) => ({
          lineIndex: i,
          qtyPacks: Number(e.qty),
          priceReduction: type === "price_only" ? Number(e.reduction) : null,
          amount: type === "return" && e.amount !== "" ? Number(e.amount) : null,
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
            Credits raised against closed purchase orders — price-only (no stock) or returns (reduces CPIS stock).
          </p>
        </div>
        <Button onClick={() => openNew()} className="h-12 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90" data-testid="new-credit-note-btn">
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
                  {n.poNumber && (
                    <Link to={`/purchase-orders/${n.poId}`} data-testid={`cn-po-link-${n.id}`}>
                      <Badge variant="outline" className="rounded-sm tnum hover:bg-secondary">{n.poNumber}</Badge>
                    </Link>
                  )}
                  {n.movementsFailed > 0 && <Badge variant="destructive" className="rounded-sm">stock failed</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {n.supplierName} · {new Date(n.createdAt).toLocaleDateString()} ·{" "}
                  {(n.lines || []).map((l) => `${l.productName} ×${l.qtyPacks}`).join(", ") || "0 lines"}
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
            <DialogDescription>
              {po ? "Enter credit quantities against the received PO lines." : "Choose the closed purchase order this credit is against."}
            </DialogDescription>
          </DialogHeader>

          {!po ? (
            <POPicker orders={orders} onPick={pickPO} />
          ) : (
            <>
              <div className="flex items-center justify-between border border-border rounded-sm px-3 py-2 bg-secondary/40" data-testid="cn-selected-po">
                <div className="text-sm">
                  <span className="font-medium tnum">{po.poNumber}</span>
                  <span className="text-muted-foreground ml-2">{po.supplier?.name || "—"}{po.invoiceNumber ? ` · Inv #${po.invoiceNumber}` : ""}</span>
                </div>
                <button onClick={() => setPo(null)} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground" data-testid="cn-change-po">
                  <ArrowLeft size={12} /> Change PO
                </button>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-3">
                <div>
                  <Label>Type</Label>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setType("price_only")} className={`flex-1 h-10 rounded-sm border text-sm ${type === "price_only" ? "border-accent bg-accent/10 font-medium" : "border-border"}`} data-testid="cn-type-price">
                      Price only
                    </button>
                    <button onClick={() => setType("return")} className={`flex-1 h-10 rounded-sm border text-sm ${type === "return" ? "border-accent bg-accent/10 font-medium" : "border-border"}`} data-testid="cn-type-return">
                      Return
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. overcharge / damaged" className="h-10 rounded-sm mt-1" data-testid="cn-reason" />
                </div>
                <div>
                  <Label>Note</Label>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-10 rounded-sm mt-1" data-testid="cn-note" />
                </div>
              </div>

              <div className="mt-3 space-y-2" data-testid="cn-lines">
                {poLines.map((l, i) => (
                  <CNLineRow key={i} l={l} idx={i} type={type} entry={entryOf(i)} onChange={(p) => setEntry(i, p)} />
                ))}
                <div className="text-right text-sm">
                  Total credit: <span className="font-head font-black text-lg tnum" data-testid="cn-total">{money(total)}</span>
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !po} className="rounded-sm bg-accent text-accent-foreground hover:bg-accent/90" data-testid="cn-submit">
              {saving ? "Saving…" : type === "return" ? "Create & reduce stock" : "Create credit note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreditNotesPage;
