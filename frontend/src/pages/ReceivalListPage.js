import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import SupplierCombobox from "@/components/SupplierCombobox";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Eye,
  Trash2,
  AlertTriangle,
  Camera,
  Package,
  Pencil,
  SlidersHorizontal,
  X,
} from "lucide-react";

const EMPTY_IMG =
  "https://images.unsplash.com/photo-1729161632263-a0e0da501895?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxmb29kJTIwZGlzdHJpYnV0aW9uJTIwcGFsbGV0fGVufDB8fHx8MTc4NjExNTM1Mnww&ixlib=rb-4.1.0&q=85";

const BOOL_OPTS = [
  { v: "all", l: "All" },
  { v: "true", l: "Yes" },
  { v: "false", l: "No" },
];

const Toggle = ({ checked, onChange, label, testid }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <Switch checked={checked} onCheckedChange={onChange} data-testid={testid} />
    <span className={`text-xs font-medium ${checked ? "text-foreground" : "text-muted-foreground"}`}>
      {label}
    </span>
  </label>
);

const BoolFilter = ({ value, onChange, label, testid }) => (
  <div>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 rounded-sm mt-1" data-testid={testid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BOOL_OPTS.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const DEFAULT_FILTERS = {
  supplier: "",
  dateFrom: "",
  dateTo: "",
  recorded: "all",
  invoice: "all",
  price: "all",
  dispute: "all",
};

const STORAGE_KEY = "eurasia_receival_filters";
const loadStored = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

const ReceivalListPage = () => {
  const navigate = useNavigate();
  const stored = loadStored();
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(stored.search || "");
  const [showFilters, setShowFilters] = useState(stored.showFilters || false);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, ...(stored.filters || {}) });
  const [edit, setEdit] = useState(null); // record being edited
  const [savingEdit, setSavingEdit] = useState(false);

  // Persist search + filters so they survive reload and back-navigation.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ search, showFilters, filters }));
  }, [search, showFilters, filters]);

  const load = async () => {
    try {
      const [recs, sup, stat] = await Promise.all([
        api.get("/receivals"),
        api.get("/suppliers"),
        api.get("/statuses"),
      ]);
      setRows(recs.data);
      setSuppliers(sup.data);
      setStatuses(stat.data);
    } catch {
      toast.error("Failed to load receivals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const reassignSupplier = async (id, supplierId) => {
    setRows((r) =>
      r.map((row) =>
        row.id === id
          ? { ...row, supplierId, supplier: suppliers.find((s) => s.id === supplierId) || null }
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

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const payload = {
        supplierId: edit.supplierId || null,
        statusId: edit.statusId || null,
        deliveryDate: edit.deliveryDate || null,
        observation: edit.observation || "",
        dispute: !!edit.dispute,
        palletCount: parseInt(edit.palletCount) || 0,
        recordedInSystem: !!edit.recordedInSystem,
        invoiceReceived: !!edit.invoiceReceived,
        priceChecked: !!edit.priceChecked,
      };
      const { data } = await api.put(`/receivals/${edit.id}`, payload);
      setRows((r) => r.map((row) => (row.id === edit.id ? data : row)));
      toast.success("Record updated");
      setEdit(null);
    } catch {
      toast.error("Save failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.supplier) c++;
    if (filters.dateFrom) c++;
    if (filters.dateTo) c++;
    ["recorded", "invoice", "price", "dispute"].forEach((k) => filters[k] !== "all" && c++);
    return c;
  }, [filters]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const matchBool = (val, filt) =>
      filt === "all" ? true : filt === "true" ? !!val : !val;
    return rows.filter((r) => {
      if (filters.supplier && r.supplierId !== filters.supplier) return false;
      const day = (r.createdAt || "").slice(0, 10);
      if (filters.dateFrom && day < filters.dateFrom) return false;
      if (filters.dateTo && day > filters.dateTo) return false;
      if (!matchBool(r.recordedInSystem, filters.recorded)) return false;
      if (!matchBool(r.invoiceReceived, filters.invoice)) return false;
      if (!matchBool(r.priceChecked, filters.price)) return false;
      if (!matchBool(r.dispute, filters.dispute)) return false;
      if (!term) return true;
      return (
        r.supplier?.name?.toLowerCase().includes(term) ||
        r.receivedBy?.toLowerCase().includes(term) ||
        r.observation?.toLowerCase().includes(term)
      );
    });
  }, [rows, search, filters]);

  const editDispute = (val) => (
    <button
      type="button"
      onClick={() => setEdit((e) => ({ ...e, dispute: val }))}
      className={`flex-1 h-11 rounded-sm border text-sm font-semibold transition-colors ${
        !!edit.dispute === val
          ? val
            ? "bg-destructive text-destructive-foreground border-destructive"
            : "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border hover:bg-secondary"
      }`}
      data-testid={`edit-dispute-${val}`}
    >
      {val ? "Dispute" : "No dispute"}
    </button>
  );

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

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
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
        <Button
          variant="outline"
          onClick={() => setShowFilters((s) => !s)}
          className="h-12 rounded-sm"
          data-testid="toggle-filters-btn"
        >
          <SlidersHorizontal size={18} className="mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge className="ml-2 rounded-sm bg-accent text-accent-foreground tnum">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {showFilters && (
        <Card className="rounded-sm border-border p-4 mb-6" data-testid="filter-panel">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-1">
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <SupplierCombobox
                suppliers={suppliers}
                value={filters.supplier}
                onChange={(v) => setFilter("supplier", v)}
                placeholder="All suppliers"
                allowClear
                testid="filter-supplier"
                className="mt-1 !h-11"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date from</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilter("dateFrom", e.target.value)}
                className="h-11 rounded-sm mt-1"
                data-testid="filter-date-from"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date to</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilter("dateTo", e.target.value)}
                className="h-11 rounded-sm mt-1"
                data-testid="filter-date-to"
              />
            </div>
            <BoolFilter value={filters.dispute} onChange={(v) => setFilter("dispute", v)} label="Dispute" testid="filter-dispute" />
            <BoolFilter value={filters.recorded} onChange={(v) => setFilter("recorded", v)} label="Recorded" testid="filter-recorded" />
            <BoolFilter value={filters.invoice} onChange={(v) => setFilter("invoice", v)} label="Invoice received" testid="filter-invoice" />
            <BoolFilter value={filters.price} onChange={(v) => setFilter("price", v)} label="Price checked" testid="filter-price" />
            <div className="flex items-end">
              <Button
                variant="ghost"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="h-11 rounded-sm w-full"
                data-testid="reset-filters-btn"
              >
                <X size={16} className="mr-2" /> Reset
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="rounded-sm border-border p-10 text-center">
          <img src={EMPTY_IMG} alt="pallets" className="w-40 h-28 object-cover mx-auto rounded-sm mb-4 opacity-80" />
          <h3 className="font-head font-bold text-lg">No receivals found</h3>
          <p className="text-sm text-muted-foreground mb-4">Adjust filters or confirm a new delivery.</p>
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
            <Card key={r.id} className="rounded-sm border-border p-4" data-testid={`receival-row-${r.id}`}>
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
                    <div className="sm:max-w-xs w-full">
                      <SupplierCombobox
                        suppliers={suppliers}
                        value={r.supplierId || ""}
                        onChange={(v) => reassignSupplier(r.id, v)}
                        placeholder="Assign supplier"
                        allowClear
                        testid={`supplier-dropdown-${r.id}`}
                        className="!h-11"
                      />
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Received by <span className="text-foreground font-medium">{r.receivedBy}</span>
                    {r.observation && <> — “{r.observation}”</>}
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                    <Toggle checked={!!r.recordedInSystem} onChange={(v) => toggle(r.id, "recordedInSystem", v)} label="Recorded" testid={`toggle-recorded-${r.id}`} />
                    <Toggle checked={!!r.invoiceReceived} onChange={(v) => toggle(r.id, "invoiceReceived", v)} label="Invoice received" testid={`toggle-invoice-${r.id}`} />
                    <Toggle checked={!!r.priceChecked} onChange={(v) => toggle(r.id, "priceChecked", v)} label="Price checked" testid={`toggle-price-${r.id}`} />
                  </div>
                </div>

                <div className="flex md:flex-col gap-2 justify-end">
                  <Button variant="outline" onClick={() => setEdit({ ...r })} className="h-10 rounded-sm" data-testid={`edit-${r.id}`}>
                    <Pencil size={16} className="mr-2" /> Edit
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/receival/${r.id}`)} className="h-10 rounded-sm" data-testid={`view-${r.id}`}>
                    <Eye size={16} className="mr-2" /> View
                  </Button>
                  <Button variant="ghost" onClick={() => remove(r.id)} className="h-10 rounded-sm text-destructive hover:text-destructive hover:bg-destructive/10" data-testid={`delete-${r.id}`}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog — admin can edit all fields */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="rounded-sm max-w-lg max-h-[90vh] overflow-y-auto" data-testid="edit-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Edit receival</DialogTitle>
            <DialogDescription>Update any field on this receival record.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div>
                <Label>Supplier</Label>
                <SupplierCombobox
                  suppliers={suppliers}
                  value={edit.supplierId || ""}
                  onChange={(v) => setEdit((e) => ({ ...e, supplierId: v }))}
                  placeholder="Search supplier…"
                  allowClear
                  testid="edit-supplier"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={edit.statusId || ""} onValueChange={(v) => setEdit((e) => ({ ...e, statusId: v }))}>
                    <SelectTrigger className="h-11 rounded-sm mt-1" data-testid="edit-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pallets</Label>
                  <Input
                    type="number"
                    min="0"
                    value={edit.palletCount ?? 0}
                    onChange={(e) => setEdit((v) => ({ ...v, palletCount: e.target.value }))}
                    className="h-11 rounded-sm mt-1 tnum"
                    data-testid="edit-pallets"
                  />
                </div>
              </div>
              <div>
                <Label>Delivery date</Label>
                <Input
                  type="date"
                  value={edit.deliveryDate ? edit.deliveryDate.slice(0, 10) : ""}
                  onChange={(e) => setEdit((v) => ({ ...v, deliveryDate: e.target.value }))}
                  className="h-11 rounded-sm mt-1"
                  data-testid="edit-delivery-date"
                />
              </div>
              <div>
                <Label>Dispute?</Label>
                <div className="flex gap-2 mt-1">
                  {editDispute(false)}
                  {editDispute(true)}
                </div>
              </div>
              <div>
                <Label>Observations</Label>
                <Textarea
                  value={edit.observation || ""}
                  onChange={(e) => setEdit((v) => ({ ...v, observation: e.target.value }))}
                  className="rounded-sm mt-1 min-h-[80px]"
                  data-testid="edit-observation"
                />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 border border-border rounded-sm p-3">
                <Toggle checked={!!edit.recordedInSystem} onChange={(v) => setEdit((e) => ({ ...e, recordedInSystem: v }))} label="Recorded" testid="edit-toggle-recorded" />
                <Toggle checked={!!edit.invoiceReceived} onChange={(v) => setEdit((e) => ({ ...e, invoiceReceived: v }))} label="Invoice received" testid="edit-toggle-invoice" />
                <Toggle checked={!!edit.priceChecked} onChange={(v) => setEdit((e) => ({ ...e, priceChecked: v }))} label="Price checked" testid="edit-toggle-price" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} className="rounded-sm" data-testid="edit-cancel">
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={savingEdit}
              className="rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
              data-testid="edit-save"
            >
              {savingEdit ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReceivalListPage;
