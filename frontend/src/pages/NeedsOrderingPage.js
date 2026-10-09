import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
import { Search, Trash2, AlertTriangle, Plus } from "lucide-react";

const NeedsOrderingPage = () => {
  const [needs, setNeeds] = useState([]);
  const [mins, setMins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState(null);
  const [minVal, setMinVal] = useState("");

  const load = async () => {
    try {
      const [n, m] = await Promise.all([api.get("/needs-ordering"), api.get("/min-levels")]);
      setNeeds(n.data.items || []);
      setMins(m.data || []);
    } catch {
      toast.error("Failed to load");
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
    try {
      const { data } = await api.get("/cpis/products", { params: { query, limit: 20 } });
      setResults(data.items);
    } catch {
      toast.error("Search failed — sync CPIS products first");
    } finally {
      setSearching(false);
    }
  };

  const saveMin = async () => {
    if (!sel || minVal === "") return toast.error("Pick a product and enter a minimum");
    try {
      await api.post("/min-levels", {
        productId: sel.productId,
        sku: sel.sku,
        productName: sel.name,
        minStock: Number(minVal),
      });
      toast.success(`Min set for ${sel.name}`);
      setSel(null);
      setMinVal("");
      setQuery("");
      setResults([]);
      load();
    } catch {
      toast.error("Could not save minimum");
    }
  };

  const delMin = async (productId) => {
    try {
      await api.delete(`/min-levels/${productId}`);
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">Needs Ordering</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Products at or below their minimum stock level (live from CPIS).
      </p>

      <Card className="rounded-sm border-border p-4 mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Set a minimum stock level
        </div>
        <form onSubmit={runSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product by name, SKU, brand or supplier code…"
              className="pl-10 h-11 rounded-sm"
              data-testid="min-search-input"
            />
          </div>
          <Button type="submit" className="h-11 rounded-sm" data-testid="min-search-submit">
            {searching ? "…" : "Search"}
          </Button>
        </form>
        {results.length > 0 && (
          <div className="mt-2 grid md:grid-cols-2 gap-2">
            {results.map((p) => (
              <button
                key={p.productId}
                onClick={() => setSel(p)}
                className={`text-left px-3 py-2 rounded-sm border text-sm ${
                  sel?.productId === p.productId ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
                }`}
                data-testid={`min-product-${p.productId}`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground ml-2 tnum">{p.sku}</span>
              </button>
            ))}
          </div>
        )}
        {sel && (
          <div className="mt-3 flex items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Min stock for {sel.name}</label>
              <Input
                type="number"
                min="0"
                value={minVal}
                onChange={(e) => setMinVal(e.target.value)}
                className="h-11 rounded-sm w-40 tnum mt-1"
                data-testid="min-value-input"
              />
            </div>
            <Button onClick={saveMin} className="h-11 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90" data-testid="min-save-btn">
              <Plus size={16} className="mr-1" /> Save minimum
            </Button>
          </div>
        )}
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Card className="rounded-sm border-border overflow-x-auto mb-6" data-testid="needs-ordering-table">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" />
              <span className="font-head font-bold">Below minimum ({needs.length})</span>
            </div>
            {needs.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Nothing below minimum right now. 🎉</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Minimum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {needs.map((n) => (
                    <TableRow key={n.productId} style={{ backgroundColor: "rgba(239,68,68,0.10)" }} data-testid={`needs-row-${n.productId}`}>
                      <TableCell>
                        <div className="font-medium">{n.productName}</div>
                        <div className="text-xs text-muted-foreground tnum">{n.sku}</div>
                      </TableCell>
                      <TableCell className="text-right tnum font-bold text-destructive">
                        {n.available} {n.baseUnit}
                      </TableCell>
                      <TableCell className="text-right tnum">{n.minStock}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="rounded-sm border-border overflow-x-auto">
            <div className="px-4 py-3 border-b border-border font-head font-bold">All minimum levels ({mins.length})</div>
            {mins.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No minimums set yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Minimum</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mins.map((m) => (
                    <TableRow key={m.productId} data-testid={`min-row-${m.productId}`}>
                      <TableCell>
                        <div className="font-medium">{m.productName}</div>
                        <div className="text-xs text-muted-foreground tnum">{m.sku}</div>
                      </TableCell>
                      <TableCell className="text-right tnum">{m.minStock}</TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => delMin(m.productId)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-destructive hover:bg-destructive/10"
                          data-testid={`min-delete-${m.productId}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default NeedsOrderingPage;
