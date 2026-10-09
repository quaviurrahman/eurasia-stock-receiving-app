import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import SupplierCombobox from "@/components/SupplierCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, TrendingUp, TrendingDown, Minus, BookOpen, Boxes, Upload, FileDown, Plus } from "lucide-react";

const money = (n) => (n === null || n === undefined ? "—" : `£${Number(n).toFixed(2)}`);

const PricingPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);
  const [packs, setPacks] = useState([]);
  const [activePack, setActivePack] = useState(null);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [suppliers, setSuppliers] = useState({});
  const [supplierList, setSupplierList] = useState([]);
  const [spRows, setSpRows] = useState([]);
  const [codeSupplier, setCodeSupplier] = useState("");
  const [codeVal, setCodeVal] = useState("");
  const [bulkSupplier, setBulkSupplier] = useState("");
  const [uploading, setUploading] = useState(false);
  const costCsvRef = useRef(null);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    api.get("/suppliers").then((r) => {
      const map = {};
      r.data.forEach((s) => (map[s.id] = s.name));
      setSuppliers(map);
      setSupplierList(r.data);
    });
  }, []);

  const runSearch = async (e) => {
    e?.preventDefault();
    setSearching(true);
    setActiveProduct(null);
    setPacks([]);
    setActivePack(null);
    setHistory([]);
    setSummary(null);
    try {
      const { data } = await api.get("/cpis/products", { params: { query, limit: 25 } });
      setResults(data.items);
    } catch {
      toast.error("Search failed — sync CPIS products first");
    } finally {
      setSearching(false);
    }
  };

  const chooseProduct = async (p) => {
    setActiveProduct(p);
    setActivePack(null);
    setHistory([]);
    setSummary(null);
    setCodeVal("");
    setCodeSupplier("");
    try {
      const [pk, sp] = await Promise.all([
        api.get(`/cpis/products/${p.productId}/packs`),
        api.get("/supplier-products", { params: { productId: p.productId } }).catch(() => ({ data: [] })),
      ]);
      setPacks(pk.data.packs || []);
      setSpRows(sp.data || []);
    } catch {
      toast.error("Could not load packs");
    }
  };

  const saveCode = async () => {
    if (!codeSupplier || !codeVal.trim()) return toast.error("Pick a supplier and enter a code");
    try {
      await api.post("/supplier-products", {
        supplierId: codeSupplier,
        productId: activeProduct.productId,
        sku: activeProduct.sku,
        productName: activeProduct.name,
        supplierCode: codeVal.trim(),
      });
      const sp = await api.get("/supplier-products", { params: { productId: activeProduct.productId } });
      setSpRows(sp.data || []);
      setCodeVal("");
      setCodeSupplier("");
      toast.success("Supplier code saved");
    } catch {
      toast.error("Could not save code");
    }
  };

  const handleCostCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!bulkSupplier) return toast.error("Pick a supplier for the cost upload first");
    setUploading(true);
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map((r) => r.split(",").map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
      if (rows.length < 2) throw new Error("empty");
      const header = rows[0].map((h) => h.toLowerCase().replace(/[\s_/\-.]/g, ""));
      const codeIdx = header.findIndex((h) => ["packcode", "code", "shortcode", "productpackcode"].includes(h));
      const priceIdx = header.findIndex((h) => ["costprice", "price", "packprice", "cost"].includes(h));
      if (codeIdx < 0 || priceIdx < 0) throw new Error("headers");
      const data = rows.slice(1).map((r) => ({ code: r[codeIdx], price: r[priceIdx] })).filter((x) => x.code);
      const codes = [...new Set(data.map((d) => d.code))];
      const { data: res } = await api.post("/cpis/packs/resolve", { shortCodes: codes });
      const map = {};
      (res.items || []).forEach((it) => { if (it.found) map[it.shortCode.toUpperCase()] = it; });
      const items = [];
      const notFound = [];
      data.forEach((d) => {
        const r = map[d.code.toUpperCase()];
        if (!r) return notFound.push(d.code);
        items.push({
          packId: r.packId, productId: r.productId, sku: r.sku, productName: r.productName,
          packName: r.packName, packShortCode: r.packShortCode, unitQuantity: r.unitQuantity || 1,
          baseUnit: r.baseUnit, packPrice: Number(d.price) || 0,
        });
      });
      if (items.length) await api.post("/supplier-pack-configs/bulk", { supplierId: bulkSupplier, items });
      toast.success(`Saved ${items.length} cost(s).${notFound.length ? ` ${notFound.length} code(s) not found.` : ""}`);
    } catch (err) {
      toast.error("CSV must have 'pack code' and 'cost price' columns");
    } finally {
      setUploading(false);
    }
  };

  const downloadCostTemplate = () => {
    const blob = new Blob(["pack code,cost price\nMUSBX1,120\nDRPEP330,18\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cost_upload_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const choosePack = async (pk) => {
    setActivePack(pk);
    setLoadingHist(true);
    try {
      const { data } = await api.get("/pricing/history", { params: { packId: pk.packId, limit: 200 } });
      setHistory(data.items || []);
      setSummary(data.summary || null);
    } catch {
      toast.error("Could not load price history");
    } finally {
      setLoadingHist(false);
    }
  };

  const trend = summary
    ? summary.previousPrice == null
      ? "flat"
      : summary.latestPrice > summary.previousPrice
      ? "up"
      : summary.latestPrice < summary.previousPrice
      ? "down"
      : "flat"
    : "flat";

  const maxPrice = Math.max(1, ...history.map((h) => Number(h.packPrice) || 0));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">Pricing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Purchase-price history & trend per product pack size.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/pricing/api-guide")}
          className="h-11 rounded-sm"
          data-testid="api-guide-link"
        >
          <BookOpen size={16} className="mr-2" /> API Guide
        </Button>
      </div>

      <Card className="rounded-sm border-border p-4 mb-4 bg-secondary/30" data-testid="bulk-cost-card">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Bulk cost-price upload
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <label className="text-xs text-muted-foreground">Supplier</label>
            <div className="mt-1">
              <SupplierCombobox suppliers={supplierList} value={bulkSupplier} onChange={setBulkSupplier} />
            </div>
          </div>
          <input ref={costCsvRef} type="file" accept=".csv,text/csv" onChange={handleCostCsv} className="hidden" data-testid="cost-csv-input" />
          <Button variant="ghost" onClick={downloadCostTemplate} className="h-10 rounded-sm text-muted-foreground" data-testid="cost-template-btn">
            <FileDown size={16} className="mr-2" /> Template
          </Button>
          <Button variant="outline" onClick={() => costCsvRef.current?.click()} disabled={uploading} className="h-10 rounded-sm" data-testid="cost-upload-btn">
            <Upload size={16} className="mr-2" /> {uploading ? "Uploading…" : "Upload CSV"}
          </Button>
          <span className="text-[11px] text-muted-foreground">CSV columns: pack code, cost price</span>
        </div>
      </Card>

      <Card className="rounded-sm border-border p-4 mb-4">
        <form onSubmit={runSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product by name, SKU or brand…"
              className="pl-10 h-11 rounded-sm"
              data-testid="pricing-search-input"
            />
          </div>
          <Button type="submit" className="h-11 rounded-sm" data-testid="pricing-search-submit">
            {searching ? "…" : "Search"}
          </Button>
        </form>

        {results.length > 0 && (
          <div className="mt-3 grid md:grid-cols-2 gap-2">
            {results.map((p) => (
              <button
                key={p.productId}
                onClick={() => chooseProduct(p)}
                className={`text-left px-3 py-2 rounded-sm border text-sm ${
                  activeProduct?.productId === p.productId ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
                }`}
                data-testid={`pricing-product-${p.productId}`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground ml-2 tnum">{p.sku}</span>
              </button>
            ))}
          </div>
        )}

        {activeProduct && (
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Packs
            </div>
            <div className="flex flex-wrap gap-2">
              {packs.map((pk) => (
                <button
                  key={pk.packId}
                  onClick={() => choosePack(pk)}
                  className={`px-3 py-1.5 rounded-sm border text-sm flex items-center gap-1 ${
                    activePack?.packId === pk.packId ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
                  }`}
                  data-testid={`pricing-pack-${pk.packId}`}
                >
                  <Boxes size={14} /> {pk.name}
                  <span className="text-xs text-muted-foreground tnum">·{pk.unitQuantity}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-border pt-3" data-testid="supplier-codes-panel">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Supplier codes for this product
              </div>
              {spRows.length > 0 ? (
                <div className="space-y-1 mb-2">
                  {spRows.map((sp) => (
                    <div key={sp.id} className="flex justify-between text-sm px-2 py-1 rounded-sm bg-secondary/50">
                      <span>{suppliers[sp.supplierId] || "—"}</span>
                      <span className="tnum font-medium">{sp.supplierCode}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-2">No supplier codes yet.</p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-56">
                  <SupplierCombobox suppliers={supplierList} value={codeSupplier} onChange={setCodeSupplier} />
                </div>
                <Input
                  value={codeVal}
                  onChange={(e) => setCodeVal(e.target.value)}
                  placeholder="Supplier code"
                  className="h-10 rounded-sm w-40"
                  data-testid="supplier-code-input"
                />
                <Button onClick={saveCode} className="h-10 rounded-sm" data-testid="supplier-code-save">
                  <Plus size={14} className="mr-1" /> Save code
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {activePack && (
        <>
          {loadingHist ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Card className="rounded-sm border-border p-4" data-testid="pricing-latest">
                  <div className="text-xs text-muted-foreground">Latest price</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-head font-black text-2xl tnum">{money(summary?.latestPrice)}</span>
                    {trend === "up" && (
                      <Badge variant="destructive" className="rounded-sm" data-testid="pricing-trend">
                        <TrendingUp size={12} className="mr-1" /> higher
                      </Badge>
                    )}
                    {trend === "down" && (
                      <Badge className="rounded-sm bg-emerald-600 hover:bg-emerald-600" data-testid="pricing-trend">
                        <TrendingDown size={12} className="mr-1" /> lower
                      </Badge>
                    )}
                    {trend === "flat" && (
                      <Badge variant="secondary" className="rounded-sm" data-testid="pricing-trend">
                        <Minus size={12} className="mr-1" /> flat
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 tnum">
                    per unit {money(summary?.latestPerUnitPrice)}
                  </div>
                </Card>
                <Card className="rounded-sm border-border p-4" data-testid="pricing-previous">
                  <div className="text-xs text-muted-foreground">Previous price</div>
                  <div className="font-head font-black text-2xl tnum mt-1">{money(summary?.previousPrice)}</div>
                  <div className="text-xs text-muted-foreground mt-1 tnum">
                    per unit {money(summary?.previousPerUnitPrice)}
                  </div>
                </Card>
                <Card className="rounded-sm border-border p-4" data-testid="pricing-avg3">
                  <div className="text-xs text-muted-foreground">Avg (last 3)</div>
                  <div className="font-head font-black text-2xl tnum mt-1">{money(summary?.averageLast3)}</div>
                  <div className="text-xs text-muted-foreground mt-1 tnum">
                    per unit {money(summary?.averageLast3PerUnit)}
                  </div>
                </Card>
                <Card className="rounded-sm border-border p-4">
                  <div className="text-xs text-muted-foreground">Data points</div>
                  <div className="font-head font-black text-2xl tnum mt-1">{summary?.count || 0}</div>
                </Card>
              </div>

              {history.length === 0 ? (
                <Card className="rounded-sm border-border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No purchase history yet for this pack. Close a PO with this pack to record a price point.
                </Card>
              ) : (
                <>
                  <Card className="rounded-sm border-border p-5 mb-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                      <TrendingUp size={14} /> Price trend
                    </div>
                    <div className="flex items-end gap-2" style={{ height: 128 }}>
                      {[...history].reverse().map((h, i) => {
                        const val = Number(h.packPrice) || 0;
                        const bh = val > 0 ? Math.max(6, (val / maxPrice) * 96) : 0;
                        return (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
                            title={`${money(h.packPrice)} · ${new Date(h.recordedAt).toLocaleDateString()}`}
                          >
                            <span className="text-[10px] tnum text-muted-foreground">{money(h.packPrice)}</span>
                            <div className="w-full bg-accent/80 rounded-t-sm" style={{ height: bh }} />
                            <span className="text-[9px] text-muted-foreground tnum whitespace-nowrap">
                              {new Date(h.recordedAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  <Card className="rounded-sm border-border overflow-x-auto" data-testid="pricing-history-table">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>PO #</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">Pack price</TableHead>
                          <TableHead className="text-right">Per unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell className="whitespace-nowrap tnum">
                              {new Date(h.recordedAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="tnum">{h.poNumber}</TableCell>
                            <TableCell>{suppliers[h.supplierId] || "—"}</TableCell>
                            <TableCell className="text-right tnum">{money(h.packPrice)}</TableCell>
                            <TableCell className="text-right tnum">{money(h.perUnitPrice)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default PricingPage;
