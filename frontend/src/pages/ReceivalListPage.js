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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SupplierCombobox from "@/components/SupplierCombobox";
import { fmt } from "@/components/Slips";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Eye,
  Trash2,
  FileText,
  Camera,
  Package,
  Pencil,
  Calculator,
  MapPin,
  LayoutGrid,
  Table as TableIcon,
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
  status: "",
  dateFrom: "",
  dateTo: "",
  recorded: "all",
  invoice: "all",
  price: "all",
};

const STORAGE_KEY = "eurasia_receival_filters";
const PAGE_SIZE = 20;
const loadStored = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

const hexToRgba = (hex, a) => {
  if (!hex || typeof hex !== "string") return null;
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const rowTint = (color) => {
  const bg = hexToRgba(color, 0.14);
  const border = hexToRgba(color, 0.55);
  return bg ? { backgroundColor: bg, borderColor: border } : {};
};

const ReceivalListPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const stored = loadStored();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [suppliers, setSuppliers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(stored.search || "");
  const [debouncedSearch, setDebouncedSearch] = useState(stored.search || "");
  const [showFilters, setShowFilters] = useState(stored.showFilters || false);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, ...(stored.filters || {}) });
  const [viewMode, setViewMode] = useState(stored.viewMode || "tiles");
  const [editMode, setEditMode] = useState(false);
  const [edit, setEdit] = useState(null); // record being edited
  const [savingEdit, setSavingEdit] = useState(false);

  // Persist search + filters so they survive reload and back-navigation.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ search, showFilters, filters, viewMode }));
  }, [search, showFilters, filters, viewMode]);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const filtersKey = JSON.stringify(filters);

  // Load lookup lists once.
  useEffect(() => {
    (async () => {
      try {
        const [sup, stat, loc] = await Promise.all([
          api.get("/suppliers"),
          api.get("/statuses"),
          api.get("/locations"),
        ]);
        setSuppliers(sup.data);
        setStatuses(stat.data);
        setLocations(loc.data);
      } catch {
        toast.error("Failed to load settings");
      }
    })();
  }, []);

  const loadReceivals = async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (filters.supplier) params.supplierId = filters.supplier;
      if (filters.status) params.statusId = filters.status;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.recorded !== "all") params.recorded = filters.recorded;
      if (filters.invoice !== "all") params.invoice = filters.invoice;
      if (filters.price !== "all") params.price = filters.price;
      const { data } = await api.get("/receivals", { params });
      setRows(data.items);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load receivals");
    } finally {
      setLoading(false);
    }
  };

  // Reset to first page whenever the search term or filters change.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filtersKey]);

  // Fetch the current page whenever page, search or filters change.
  useEffect(() => {
    loadReceivals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, filtersKey]);

  const load = loadReceivals;

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
      toast.success("Deleted");
      loadReceivals();
    } catch {
      toast.error("Delete failed");
    }
  };

  // Inline editing helpers (used when the Edit toggle is on).
  const setLocal = (id, patch) => setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const persistField = async (id, patch) => {
    try {
      const { data } = await api.put(`/receivals/${id}`, patch);
      setRows((r) => r.map((row) => (row.id === id ? data : row)));
    } catch {
      toast.error("Update failed");
      load();
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
        invoiceNumber: edit.invoiceNumber || "",
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
    if (filters.status) c++;
    if (filters.dateFrom) c++;
    if (filters.dateTo) c++;
    ["recorded", "invoice", "price"].forEach((k) => filters[k] !== "all" && c++);
    return c;
  }, [filters]);

  const filtered = rows;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));


  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">
            Order Receival Confirmations
          </h1>
          <p className="text-sm text-muted-foreground mt-1 tnum">
            {total} record{total !== 1 && "s"}
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
        {isAdmin && (
          <label
            className={`flex items-center gap-2 h-12 px-3 rounded-sm border cursor-pointer transition-colors ${
              editMode ? "border-accent bg-accent/10 text-accent" : "border-border"
            }`}
            data-testid="edit-mode-toggle"
          >
            <Switch checked={editMode} onCheckedChange={setEditMode} data-testid="edit-mode-switch" />
            <span className="text-sm font-medium flex items-center gap-1">
              <Pencil size={15} /> Edit
            </span>
          </label>
        )}
        <div className="flex rounded-sm border border-border overflow-hidden h-12" data-testid="view-toggle">
          <button
            type="button"
            onClick={() => setViewMode("tiles")}
            title="Tiles view"
            className={`px-3 flex items-center gap-2 text-sm font-medium transition-colors ${
              viewMode === "tiles" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
            data-testid="view-tiles"
          >
            <LayoutGrid size={18} />
            <span className="hidden sm:inline">Tiles</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            title="Table view"
            className={`px-3 flex items-center gap-2 text-sm font-medium border-l border-border transition-colors ${
              viewMode === "table" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
            data-testid="view-table"
          >
            <TableIcon size={18} />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>
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
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filters.status || "all"} onValueChange={(v) => setFilter("status", v === "all" ? "" : v)}>
                <SelectTrigger className="h-11 rounded-sm mt-1" data-testid="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
      ) : viewMode === "table" ? (
        <Card className="rounded-sm border-border overflow-x-auto" data-testid="receival-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received by</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Observation</TableHead>
                <TableHead className="text-right">Slips</TableHead>
                <TableHead className="text-right">Pallets</TableHead>
                <TableHead>Checklist</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const entries = (r.slips || []).flatMap((s) => s.entries || []);
                const slipSum = entries.reduce((a, b) => a + (Number(b) || 0), 0);
                const canEdit = isAdmin && editMode;
                return (
                  <TableRow key={r.id} data-testid={`receival-trow-${r.id}`} style={rowTint(r.status?.color)}>
                    <TableCell className="whitespace-nowrap tnum">
                      {new Date(r.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      {canEdit ? (
                        <SupplierCombobox
                          suppliers={suppliers}
                          value={r.supplierId || ""}
                          onChange={(v) => reassignSupplier(r.id, v)}
                          placeholder="Assign"
                          allowClear
                          testid={`supplier-dropdown-${r.id}`}
                          className="!h-9"
                        />
                      ) : (
                        <span className="text-sm font-medium" data-testid={`supplier-name-${r.id}`}>{r.supplier?.name || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[130px]">
                      {canEdit ? (
                        <Select value={r.locationId || "none"} onValueChange={(v) => persistField(r.id, { locationId: v === "none" ? null : v })}>
                          <SelectTrigger className="h-9 rounded-sm" data-testid={`location-select-${r.id}`}>
                            <SelectValue placeholder="Location" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No location</SelectItem>
                            {locations.map((l) => (
                              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm" data-testid={`location-name-${r.id}`}>{r.location?.name || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[130px]">
                      {canEdit ? (
                        <Select value={r.statusId || "none"} onValueChange={(v) => persistField(r.id, { statusId: v === "none" ? null : v })}>
                          <SelectTrigger className="h-9 rounded-sm" data-testid={`status-select-${r.id}`}>
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No status</SelectItem>
                            {statuses.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : r.status?.name ? (
                        <Badge variant="secondary" className="rounded-sm">{r.status.name}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.receivedBy}</TableCell>
                    <TableCell className="min-w-[130px]" data-testid={`invoice-number-${r.id}`}>
                      {canEdit ? (
                        <Input
                          value={r.invoiceNumber || ""}
                          onChange={(e) => setLocal(r.id, { invoiceNumber: e.target.value })}
                          onBlur={(e) => persistField(r.id, { invoiceNumber: e.target.value })}
                          placeholder="INV-…"
                          className="h-9 rounded-sm"
                          data-testid={`invoice-input-${r.id}`}
                        />
                      ) : (
                        r.invoiceNumber || "—"
                      )}
                    </TableCell>
                    <TableCell className="min-w-[180px] max-w-[240px]">
                      {canEdit ? (
                        <Input
                          value={r.observation || ""}
                          onChange={(e) => setLocal(r.id, { observation: e.target.value })}
                          onBlur={(e) => persistField(r.id, { observation: e.target.value })}
                          placeholder="Note…"
                          className="h-9 rounded-sm"
                          data-testid={`observation-input-${r.id}`}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground" title={r.observation} data-testid={`observation-text-${r.id}`}>
                          {r.observation ? (r.observation.length > 40 ? r.observation.slice(0, 40) + "…" : r.observation) : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tnum whitespace-nowrap" data-testid={`slip-total-${r.id}`}>
                      {r.slips?.length ? `${r.slips.length} · Σ${fmt(slipSum)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tnum min-w-[80px]">
                      {canEdit ? (
                        <Input
                          type="number"
                          min="0"
                          value={r.palletCount ?? 0}
                          onChange={(e) => setLocal(r.id, { palletCount: e.target.value })}
                          onBlur={(e) => persistField(r.id, { palletCount: parseInt(e.target.value) || 0 })}
                          className="h-9 rounded-sm tnum text-right w-20 ml-auto"
                          data-testid={`pallet-input-${r.id}`}
                        />
                      ) : (
                        r.palletCount
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <div className="flex items-center gap-2">
                          <Switch checked={!!r.recordedInSystem} onCheckedChange={(v) => toggle(r.id, "recordedInSystem", v)} title="Recorded" data-testid={`toggle-recorded-${r.id}`} />
                          <Switch checked={!!r.invoiceReceived} onCheckedChange={(v) => toggle(r.id, "invoiceReceived", v)} title="Invoice received" data-testid={`toggle-invoice-${r.id}`} />
                          <Switch checked={!!r.priceChecked} onCheckedChange={(v) => toggle(r.id, "priceChecked", v)} title="Price checked" data-testid={`toggle-price-${r.id}`} />
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.recordedInSystem && <Badge variant="secondary" className="rounded-sm text-[10px]">R</Badge>}
                          {r.invoiceReceived && <Badge variant="secondary" className="rounded-sm text-[10px]">I</Badge>}
                          {r.priceChecked && <Badge variant="secondary" className="rounded-sm text-[10px]">P</Badge>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => navigate(`/receival/${r.id}`)} className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-secondary" title="View" data-testid={`view-${r.id}`}>
                          <Eye size={15} />
                        </button>
                        {isAdmin && (
                          <button onClick={() => remove(r.id)} className="w-8 h-8 flex items-center justify-center rounded-sm text-destructive hover:bg-destructive/10" title="Delete" data-testid={`delete-${r.id}`}>
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
      ) : (
        <div className="space-y-3" data-testid="receival-list">
          {filtered.map((r) => {
            const canEdit = isAdmin && editMode;
            return (
            <Card key={r.id} className="rounded-sm border-border p-4" data-testid={`receival-row-${r.id}`} style={rowTint(r.status?.color)}>
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
                    {!canEdit && r.status?.name && (
                      <Badge variant="secondary" className="rounded-sm">
                        {r.status.name}
                      </Badge>
                    )}
                    {!canEdit && r.location?.name && (
                      <Badge variant="outline" className="rounded-sm" data-testid={`location-name-${r.id}`}>
                        <MapPin size={12} className="mr-1" /> {r.location.name}
                      </Badge>
                    )}
                    {!canEdit && r.invoiceNumber && (
                      <Badge variant="outline" className="rounded-sm border-accent text-accent" data-testid={`invoice-number-${r.id}`}>
                        <FileText size={12} className="mr-1" /> Inv #{r.invoiceNumber}
                      </Badge>
                    )}
                    {!canEdit && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Camera size={12} /> {r.images?.length || 0}
                      </span>
                    )}
                    {!canEdit && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package size={12} /> {r.palletCount} pallets
                      </span>
                    )}
                    {r.slips?.length > 0 &&
                      (() => {
                        const entries = r.slips.flatMap((s) => s.entries || []);
                        const sum = entries.reduce((a, b) => a + (Number(b) || 0), 0);
                        return (
                          <Badge variant="outline" className="rounded-sm" data-testid={`slip-total-${r.id}`}>
                            <Calculator size={12} className="mr-1" />
                            {r.slips.length} slip{r.slips.length !== 1 ? "s" : ""} · {entries.length} entries · Σ {fmt(sum)}
                          </Badge>
                        );
                      })()}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide sm:w-20">
                      Supplier
                    </span>
                    {canEdit ? (
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
                    ) : (
                      <span className="text-sm font-medium" data-testid={`supplier-name-${r.id}`}>
                        {r.supplier?.name || "—"}
                      </span>
                    )}
                  </div>

                  {canEdit && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
                        <Select value={r.statusId || "none"} onValueChange={(v) => persistField(r.id, { statusId: v === "none" ? null : v })}>
                          <SelectTrigger className="h-11 rounded-sm mt-1" data-testid={`status-select-${r.id}`}>
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No status</SelectItem>
                            {statuses.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Storage location</span>
                        <Select value={r.locationId || "none"} onValueChange={(v) => persistField(r.id, { locationId: v === "none" ? null : v })}>
                          <SelectTrigger className="h-11 rounded-sm mt-1" data-testid={`location-select-${r.id}`}>
                            <SelectValue placeholder="Location" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No location</SelectItem>
                            {locations.map((l) => (
                              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pallets</span>
                        <Input
                          type="number"
                          min="0"
                          value={r.palletCount ?? 0}
                          onChange={(e) => setLocal(r.id, { palletCount: e.target.value })}
                          onBlur={(e) => persistField(r.id, { palletCount: parseInt(e.target.value) || 0 })}
                          className="h-11 rounded-sm mt-1 tnum"
                          data-testid={`pallet-input-${r.id}`}
                        />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice #</span>
                        <Input
                          value={r.invoiceNumber || ""}
                          onChange={(e) => setLocal(r.id, { invoiceNumber: e.target.value })}
                          onBlur={(e) => persistField(r.id, { invoiceNumber: e.target.value })}
                          placeholder="INV-…"
                          className="h-11 rounded-sm mt-1"
                          data-testid={`invoice-input-${r.id}`}
                        />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observation</span>
                        <Input
                          value={r.observation || ""}
                          onChange={(e) => setLocal(r.id, { observation: e.target.value })}
                          onBlur={(e) => persistField(r.id, { observation: e.target.value })}
                          placeholder="Note…"
                          className="h-11 rounded-sm mt-1"
                          data-testid={`observation-input-${r.id}`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="text-sm text-muted-foreground">
                    Received by <span className="text-foreground font-medium">{r.receivedBy}</span>
                    {!canEdit && r.observation && <> — “{r.observation}”</>}
                  </div>

                  {canEdit ? (
                    <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                      <Toggle checked={!!r.recordedInSystem} onChange={(v) => toggle(r.id, "recordedInSystem", v)} label="Recorded" testid={`toggle-recorded-${r.id}`} />
                      <Toggle checked={!!r.invoiceReceived} onChange={(v) => toggle(r.id, "invoiceReceived", v)} label="Invoice received" testid={`toggle-invoice-${r.id}`} />
                      <Toggle checked={!!r.priceChecked} onChange={(v) => toggle(r.id, "priceChecked", v)} label="Price checked" testid={`toggle-price-${r.id}`} />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {r.recordedInSystem && <Badge variant="secondary" className="rounded-sm">Recorded</Badge>}
                      {r.invoiceReceived && <Badge variant="secondary" className="rounded-sm">Invoice received</Badge>}
                      {r.priceChecked && <Badge variant="secondary" className="rounded-sm">Price checked</Badge>}
                    </div>
                  )}
                </div>

                <div className="flex md:flex-col gap-2 justify-end">
                  <Button variant="outline" onClick={() => navigate(`/receival/${r.id}`)} className="h-10 rounded-sm" data-testid={`view-${r.id}`}>
                    <Eye size={16} className="mr-2" /> {isAdmin ? "View" : "Open"}
                  </Button>
                  {isAdmin && (
                    <Button variant="ghost" onClick={() => remove(r.id)} className="h-10 rounded-sm text-destructive hover:text-destructive hover:bg-destructive/10" data-testid={`delete-${r.id}`}>
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {!loading && total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 mt-6" data-testid="pagination-controls">
          <span className="text-sm text-muted-foreground tnum">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-10 rounded-sm"
              data-testid="page-prev-btn"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-10 rounded-sm"
              data-testid="page-next-btn"
            >
              Next
            </Button>
          </div>
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
                <Label>Invoice number</Label>
                <Input
                  value={edit.invoiceNumber || ""}
                  onChange={(e) => setEdit((v) => ({ ...v, invoiceNumber: e.target.value }))}
                  placeholder="e.g. INV-10234"
                  className="h-11 rounded-sm mt-1"
                  data-testid="edit-invoice-number"
                />
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
