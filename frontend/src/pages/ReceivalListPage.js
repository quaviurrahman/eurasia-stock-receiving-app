import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Eye,
  Trash2,
  AlertTriangle,
  Camera,
  Package,
} from "lucide-react";

const EMPTY_IMG =
  "https://images.unsplash.com/photo-1729161632263-a0e0da501895?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxmb29kJTIwZGlzdHJpYnV0aW9uJTIwcGFsbGV0fGVufDB8fHx8MTc4NjExNTM1Mnww&ixlib=rb-4.1.0&q=85";

const Toggle = ({ checked, onChange, label, testid }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <Switch checked={checked} onCheckedChange={onChange} data-testid={testid} />
    <span className={`text-xs font-medium ${checked ? "text-foreground" : "text-muted-foreground"}`}>
      {label}
    </span>
  </label>
);

const ReceivalListPage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");

  const load = async () => {
    try {
      const [recs, sup] = await Promise.all([api.get("/receivals"), api.get("/suppliers")]);
      setRows(recs.data);
      setSuppliers(sup.data);
    } catch {
      toast.error("Failed to load receivals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reassignSupplier = async (id, supplierId) => {
    setRows((r) =>
      r.map((row) =>
        row.id === id
          ? { ...row, supplierId, supplier: suppliers.find((s) => s.id === supplierId) }
          : row
      )
    );
    try {
      await api.put(`/receivals/${id}`, { supplierId });
      toast.success("Supplier re-assigned");
    } catch {
      toast.error("Could not update supplier");
      load();
    }
  };

  const toggle = async (id, field, value) => {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    try {
      await api.put(`/receivals/${id}`, { [field]: value });
    } catch {
      toast.error("Update failed");
      load();
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this receival record?")) return;
    try {
      await api.delete(`/receivals/${id}`);
      setRows((r) => r.filter((row) => row.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return rows.filter((r) => {
      if (supplierFilter !== "all" && r.supplierId !== supplierFilter) return false;
      if (!term) return true;
      return (
        r.supplier?.name?.toLowerCase().includes(term) ||
        r.receivedBy?.toLowerCase().includes(term) ||
        r.observation?.toLowerCase().includes(term)
      );
    });
  }, [rows, search, supplierFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">
            Order Receival Confirmations
          </h1>
          <p className="text-sm text-muted-foreground mt-1 tnum">
            {filtered.length} record{filtered.length !== 1 && "s"}
          </p>
        </div>
        <Button
          onClick={() => navigate("/new")}
          className="h-12 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition-transform"
          data-testid="new-receival-btn"
        >
          <Plus size={18} className="mr-2" /> New receival
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier, receiver or notes…"
            className="pl-10 h-12 rounded-sm"
            data-testid="search-input"
          />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="h-12 rounded-sm sm:w-64" data-testid="supplier-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="rounded-sm border-border p-10 text-center">
          <img src={EMPTY_IMG} alt="pallets" className="w-40 h-28 object-cover mx-auto rounded-sm mb-4 opacity-80" />
          <h3 className="font-head font-bold text-lg">No receivals yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Confirm your first delivery to get started.</p>
          <Button
            onClick={() => navigate("/new")}
            className="h-11 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
            data-testid="empty-new-btn"
          >
            <Plus size={16} className="mr-2" /> New receival
          </Button>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="receival-list">
          {filtered.map((r) => (
            <Card
              key={r.id}
              className="rounded-sm border-border p-4"
              data-testid={`receival-row-${r.id}`}
            >
              <div className="grid md:grid-cols-[1fr_auto] gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="rounded-sm tnum">
                      {new Date(r.createdAt).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Badge>
                    {r.dispute && (
                      <Badge className="rounded-sm bg-destructive text-destructive-foreground">
                        <AlertTriangle size={12} className="mr-1" /> Dispute
                      </Badge>
                    )}
                    {r.status?.name && (
                      <Badge variant="secondary" className="rounded-sm">
                        {r.status.name}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Camera size={12} /> {r.images?.length || 0}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Package size={12} /> {r.palletCount} pallets
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide sm:w-20">
                      Supplier
                    </span>
                    <Select value={r.supplierId || ""} onValueChange={(v) => reassignSupplier(r.id, v)}>
                      <SelectTrigger
                        className="h-11 rounded-sm sm:max-w-xs"
                        data-testid={`supplier-dropdown-${r.id}`}
                      >
                        <SelectValue placeholder="Assign supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id} data-testid={`reassign-${r.id}-${s.id}`}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Received by <span className="text-foreground font-medium">{r.receivedBy}</span>
                    {r.observation && <> — “{r.observation}”</>}
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                    <Toggle
                      checked={!!r.recordedInSystem}
                      onChange={(v) => toggle(r.id, "recordedInSystem", v)}
                      label="Recorded"
                      testid={`toggle-recorded-${r.id}`}
                    />
                    <Toggle
                      checked={!!r.invoiceReceived}
                      onChange={(v) => toggle(r.id, "invoiceReceived", v)}
                      label="Invoice received"
                      testid={`toggle-invoice-${r.id}`}
                    />
                    <Toggle
                      checked={!!r.priceChecked}
                      onChange={(v) => toggle(r.id, "priceChecked", v)}
                      label="Price checked"
                      testid={`toggle-price-${r.id}`}
                    />
                  </div>
                </div>

                <div className="flex md:flex-col gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/receival/${r.id}`)}
                    className="h-10 rounded-sm"
                    data-testid={`view-${r.id}`}
                  >
                    <Eye size={16} className="mr-2" /> View
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    className="h-10 rounded-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                    data-testid={`delete-${r.id}`}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReceivalListPage;
