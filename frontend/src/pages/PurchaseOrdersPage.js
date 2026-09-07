import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { Plus, RefreshCw, Trash2, Eye, FileText, PackageCheck } from "lucide-react";

const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;

const PurchaseOrdersPage = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [cpis, setCpis] = useState({ productCount: 0, lastSync: null });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    try {
      const [po, st] = await Promise.all([
        api.get("/purchase-orders"),
        api.get("/cpis/status"),
      ]);
      setOrders(po.data);
      setCpis(st.data);
    } catch {
      toast.error("Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/cpis/sync");
      toast.success(`Synced ${data.synced} products from CPIS`);
      load();
    } catch {
      toast.error("CPIS sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this purchase order?")) return;
    try {
      await api.delete(`/purchase-orders/${id}`);
      setOrders((o) => o.filter((p) => p.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <PackageCheck size={14} />
            {cpis.productCount} products synced from CPIS
            {cpis.lastSync && (
              <span className="tnum">· last {new Date(cpis.lastSync).toLocaleString()}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={sync}
            disabled={syncing}
            className="h-12 rounded-sm"
            data-testid="sync-cpis-btn"
          >
            <RefreshCw size={18} className={`mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync CPIS products"}
          </Button>
          <Button
            onClick={() => navigate("/purchase-orders/new")}
            className="h-12 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition-transform"
            data-testid="new-po-btn"
          >
            <Plus size={18} className="mr-2" /> New PO
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <Card className="rounded-sm border-border p-10 text-center">
          <FileText size={40} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-head font-bold text-lg">No purchase orders yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a purchase order against a supplier using products synced from CPIS.
          </p>
          <Button
            onClick={() => navigate("/purchase-orders/new")}
            className="h-11 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
            data-testid="empty-new-po-btn"
          >
            <Plus size={16} className="mr-2" /> New PO
          </Button>
        </Card>
      ) : (
        <Card className="rounded-sm border-border overflow-x-auto" data-testid="po-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/purchase-orders/${p.id}`)}
                  data-testid={`po-row-${p.id}`}
                >
                  <TableCell className="font-medium tnum">{p.poNumber}</TableCell>
                  <TableCell>{p.supplier?.name || "—"}</TableCell>
                  <TableCell className="text-right tnum">{p.lines?.length || 0}</TableCell>
                  <TableCell className="text-right tnum">{money(p.total)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={p.status === "closed" ? "secondary" : "default"}
                      className={`rounded-sm ${p.status === "closed" ? "" : "bg-accent text-accent-foreground"}`}
                      data-testid={`po-status-${p.id}`}
                    >
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tnum">{p.invoiceNumber || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tnum">
                    {new Date(p.createdAt).toLocaleDateString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => navigate(`/purchase-orders/${p.id}`)}
                        className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-secondary"
                        title="Open"
                        data-testid={`po-open-${p.id}`}
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={(e) => remove(p.id, e)}
                        className="w-8 h-8 flex items-center justify-center rounded-sm text-destructive hover:bg-destructive/10"
                        title="Delete"
                        data-testid={`po-delete-${p.id}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default PurchaseOrdersPage;
