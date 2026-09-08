import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Search, Trash2, Package, PackagePlus, CheckCircle2, Truck } from "lucide-react";

const imgUrl = (id) => (id ? `${API}/cpis/images/${id}` : null);

const OrderListPage = () => {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());

  // product search dialog
  const [pickOpen, setPickOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);
  const [packs, setPacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(false);

  // mark-ordered dialog
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderIds, setOrderIds] = useState([]);
  const [eta, setEta] = useState("");
  const [marking, setMarking] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/order-list");
      setItems(data);
    } catch {
      toast.error("Failed to load order list");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const runSearch = async (e) => {
    e?.preventDefault();
    setSearching(true);
    setActiveProduct(null);
    setPacks([]);
    try {
      const { data } = await api.get("/cpis/products", { params: { query, limit: 25 } });
      setResults(data.items);
    } catch {
      toast.error("Search failed — admin may need to sync CPIS products first");
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

  const addItem = async (product, pack) => {
    try {
      const { data } = await api.post("/order-list", {
        productId: product.productId,
        sku: product.sku,
        productName: product.name,
        packId: pack.packId,
        packName: pack.name,
        packShortCode: pack.shortCode,
        unitQuantity: pack.unitQuantity || 1,
        baseUnit: product.baseUnit,
        imageId: pack.imageId || null,
      });
      setItems((it) => [data, ...it]);
      toast.success(`Added ${product.name}`);
      setPickOpen(false);
      setQuery("");
      setResults([]);
      setActiveProduct(null);
      setPacks([]);
    } catch {
      toast.error("Could not add item");
    }
  };

  const setStock = (id, v) => setItems((it) => it.map((x) => (x.id === id ? { ...x, physicalStock: v } : x)));
  const persistStock = async (id, v) => {
    try {
      await api.put(`/order-list/${id}`, { physicalStock: v === "" ? null : Number(v) });
    } catch {
      toast.error("Could not save stock count");
      load();
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this item?")) return;
    try {
      await api.delete(`/order-list/${id}`);
      setItems((it) => it.filter((x) => x.id !== id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      toast.success("Removed");
    } catch {
      toast.error("Delete failed");
    }
  };

  const toggleSel = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const pendingIds = items.filter((i) => i.status !== "ordered").map((i) => i.id);
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));
  const toggleAll = () =>
    setSelected((s) => (allPendingSelected ? new Set() : new Set(pendingIds)));

  const openOrderDialog = (ids) => {
    if (ids.length === 0) return toast.error("Select at least one item");
    setOrderIds(ids);
    setEta("");
    setOrderOpen(true);
  };

  const confirmOrdered = async () => {
    setMarking(true);
    try {
      await api.post("/order-list/mark-ordered", { ids: orderIds, estimatedDelivery: eta || null });
      toast.success(`Marked ${orderIds.length} item(s) ordered`);
      setOrderOpen(false);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to mark ordered");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">To Order</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Products that need ordering. Staff add items &amp; record stock; admins mark them ordered.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && selected.size > 0 && (
            <Button
              onClick={() => openOrderDialog([...selected])}
              className="h-12 rounded-sm bg-primary text-primary-foreground"
              data-testid="bulk-mark-ordered-btn"
            >
              <CheckCircle2 size={18} className="mr-2" /> Mark ordered ({selected.size})
            </Button>
          )}
          <Button
            onClick={() => setPickOpen(true)}
            className="h-12 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition-transform"
            data-testid="add-order-item-btn"
          >
            <Plus size={18} className="mr-2" /> Add product
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card className="rounded-sm border-border p-10 text-center">
          <Package size={40} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-head font-bold text-lg">Nothing to order yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Add a product that needs ordering.</p>
          <Button
            onClick={() => setPickOpen(true)}
            className="h-11 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
            data-testid="empty-add-order-btn"
          >
            <Plus size={16} className="mr-2" /> Add product
          </Button>
        </Card>
      ) : (
        <Card className="rounded-sm border-border overflow-x-auto" data-testid="order-list-table">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allPendingSelected}
                      onCheckedChange={toggleAll}
                      data-testid="select-all-checkbox"
                    />
                  </TableHead>
                )}
                <TableHead className="w-16">Image</TableHead>
                <TableHead>Product / pack</TableHead>
                <TableHead className="w-32">Physical stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Est. delivery</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const ordered = it.status === "ordered";
                return (
                  <TableRow
                    key={it.id}
                    data-testid={`order-row-${it.id}`}
                    style={ordered ? { backgroundColor: "rgba(16,185,129,0.14)" } : {}}
                  >
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(it.id)}
                          onCheckedChange={() => toggleSel(it.id)}
                          disabled={ordered}
                          data-testid={`row-checkbox-${it.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      {it.imageId ? (
                        <img
                          src={imgUrl(it.imageId)}
                          alt={it.productName}
                          className="w-12 h-12 object-cover rounded-sm border border-border bg-white"
                          data-testid={`order-img-${it.id}`}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-sm border border-border bg-secondary flex items-center justify-center">
                          <Package size={18} className="text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{it.productName}</div>
                      <div className="text-xs text-muted-foreground tnum">
                        {it.sku} · {it.packName} {it.packShortCode ? `· ${it.packShortCode}` : ""} · pack size{" "}
                        {it.unitQuantity} {it.baseUnit}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={it.physicalStock ?? ""}
                        onChange={(e) => setStock(it.id, e.target.value)}
                        onBlur={(e) => persistStock(it.id, e.target.value)}
                        placeholder="—"
                        className="h-9 rounded-sm tnum w-24"
                        data-testid={`stock-input-${it.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      {ordered ? (
                        <Badge className="rounded-sm bg-emerald-600 hover:bg-emerald-600" data-testid={`order-status-${it.id}`}>
                          Ordered
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-sm" data-testid={`order-status-${it.id}`}>
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tnum">
                      {it.estimatedDelivery
                        ? new Date(it.estimatedDelivery).toLocaleDateString(undefined, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{it.addedBy}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {isAdmin && !ordered && (
                          <button
                            onClick={() => openOrderDialog([it.id])}
                            className="h-8 px-2 flex items-center gap-1 rounded-sm border border-border hover:bg-secondary text-xs font-medium"
                            data-testid={`mark-ordered-${it.id}`}
                          >
                            <Truck size={14} /> Order
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => remove(it.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-sm text-destructive hover:bg-destructive/10"
                            data-testid={`order-delete-${it.id}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Product search dialog */}
      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="order-product-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Add product to order list</DialogTitle>
            <DialogDescription>Search by product name, SKU or brand, then pick a pack.</DialogDescription>
          </DialogHeader>
          <form onSubmit={runSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. mushroom, PRD002, brand…"
                className="pl-10 h-11 rounded-sm"
                data-testid="order-search-input"
                autoFocus
              />
            </div>
            <Button type="submit" className="h-11 rounded-sm" data-testid="order-search-submit">
              {searching ? "…" : "Search"}
            </Button>
          </form>

          <div className="mt-3 space-y-2">
            {results.length === 0 && !searching && (
              <p className="text-sm text-muted-foreground">Type a term and search.</p>
            )}
            {results.map((p) => (
              <div key={p.productId} className="border border-border rounded-sm" data-testid={`order-result-${p.productId}`}>
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
                        <div key={pk.packId} className="flex items-center justify-between px-2 py-1.5 bg-background rounded-sm">
                          <span className="flex items-center gap-2">
                            {pk.imageId ? (
                              <img src={imgUrl(pk.imageId)} alt={pk.name} className="w-9 h-9 object-cover rounded-sm border border-border bg-white" />
                            ) : (
                              <span className="w-9 h-9 rounded-sm border border-border bg-secondary flex items-center justify-center">
                                <Package size={14} className="text-muted-foreground" />
                              </span>
                            )}
                            <span className="text-sm">
                              {pk.name}
                              <span className="text-xs text-muted-foreground ml-2 tnum">
                                {pk.shortCode ? `${pk.shortCode} · ` : ""}size {pk.unitQuantity} {pk.unitOfMeasure}
                              </span>
                            </span>
                          </span>
                          <Button
                            size="sm"
                            className="h-8 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
                            onClick={() => addItem(p, pk)}
                            data-testid={`order-add-pack-${pk.packId}`}
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

      {/* Mark ordered dialog */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="rounded-sm max-w-md" data-testid="mark-ordered-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Mark ordered</DialogTitle>
            <DialogDescription>
              Set an estimated delivery date for {orderIds.length} item(s). They'll be highlighted green.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Estimated delivery date</Label>
            <Input
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              className="h-11 rounded-sm mt-1"
              data-testid="eta-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderOpen(false)} className="rounded-sm" data-testid="mark-ordered-cancel">
              Cancel
            </Button>
            <Button
              onClick={confirmOrdered}
              disabled={marking}
              className="rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
              data-testid="mark-ordered-confirm"
            >
              {marking ? "Saving…" : "Mark ordered"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderListPage;
