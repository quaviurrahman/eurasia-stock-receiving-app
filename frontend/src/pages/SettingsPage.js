import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Download, Archive } from "lucide-react";

const CrudList = ({ title, items, onAdd, onDelete, placeholder, extraField, testid }) => {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    if (extraField && !pin.trim()) return toast.error("PIN required");
    await onAdd(name.trim(), pin.trim());
    setName("");
    setPin("");
  };
  return (
    <Card className="rounded-sm border-border p-5">
      <h3 className="font-head font-bold text-lg mb-4">{title}</h3>
      <div className="space-y-2 mb-4">
        {items.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center justify-between border border-border rounded-sm px-3 h-11"
            data-testid={`${testid}-item-${it.id}`}
          >
            <span className="text-sm font-medium">
              {it.name}
              {extraField && <span className="text-muted-foreground"> · PIN ••••</span>}
            </span>
            <button
              onClick={() => onDelete(it.id)}
              className="text-destructive hover:bg-destructive/10 rounded-sm w-8 h-8 flex items-center justify-center"
              data-testid={`${testid}-delete-${it.id}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="h-11 rounded-sm"
          data-testid={`${testid}-name-input`}
        />
        {extraField && (
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="h-11 rounded-sm w-28 tnum"
            data-testid={`${testid}-pin-input`}
          />
        )}
        <Button
          onClick={add}
          className="h-11 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
          data-testid={`${testid}-add-btn`}
        >
          <Plus size={16} />
        </Button>
      </div>
    </Card>
  );
};

const SettingsPage = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [archive, setArchive] = useState({ count: 0, records: [] });
  const [defaultStatusId, setDefaultStatusId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [sup, stat, stf, arc, cfg] = await Promise.all([
      api.get("/suppliers"),
      api.get("/statuses"),
      api.get("/staff"),
      api.get("/archive/preview"),
      api.get("/config"),
    ]);
    setSuppliers(sup.data);
    setStatuses(stat.data);
    setStaff(stf.data);
    setArchive(arc.data);
    setDefaultStatusId(cfg.data?.defaultStatusId || "");
  };

  useEffect(() => {
    load();
  }, []);

  const saveDefaultStatus = async (id) => {
    setDefaultStatusId(id);
    await api.put("/config", { defaultStatusId: id || null });
    toast.success("Default status saved");
  };

  const addSupplier = async (name) => {
    await api.post("/suppliers", { name });
    toast.success("Supplier added");
    load();
  };
  const delSupplier = async (id) => {
    await api.delete(`/suppliers/${id}`);
    toast.success("Supplier removed");
    load();
  };
  const addStatus = async (name) => {
    await api.post("/statuses", { name });
    toast.success("Status added");
    load();
  };
  const delStatus = async (id) => {
    await api.delete(`/statuses/${id}`);
    toast.success("Status removed");
    load();
  };
  const addStaff = async (name, pin) => {
    await api.post("/staff", { name, pin });
    toast.success("Staff added");
    load();
  };
  const delStaff = async (id) => {
    await api.delete(`/staff/${id}`);
    toast.success("Staff removed");
    load();
  };

  const downloadArchive = () => {
    if (archive.count === 0) return toast.error("Nothing to archive");
    const blob = new Blob([JSON.stringify(archive.records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eurasia-archive-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Archive downloaded");
  };

  const purgeArchive = async () => {
    if (archive.count === 0) return toast.error("Nothing to remove");
    if (!window.confirm(`Permanently remove ${archive.count} record(s) older than 3 months?`)) return;
    setBusy(true);
    try {
      const { data } = await api.delete("/archive");
      toast.success(`${data.deleted} record(s) removed`);
      load();
    } catch {
      toast.error("Failed to remove");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight mb-6">Admin</h1>
      <Tabs defaultValue="suppliers">
        <TabsList className="rounded-sm h-auto grid grid-cols-4 w-full p-1">
          <TabsTrigger value="suppliers" className="text-xs sm:text-sm px-1 py-2" data-testid="tab-suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="statuses" className="text-xs sm:text-sm px-1 py-2" data-testid="tab-statuses">Statuses</TabsTrigger>
          <TabsTrigger value="staff" className="text-xs sm:text-sm px-1 py-2" data-testid="tab-staff">Staff PINs</TabsTrigger>
          <TabsTrigger value="archive" className="text-xs sm:text-sm px-1 py-2" data-testid="tab-archive">Archive</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4">
          <CrudList
            title="Suppliers"
            items={suppliers}
            onAdd={addSupplier}
            onDelete={delSupplier}
            placeholder="New supplier name"
            testid="supplier"
          />
        </TabsContent>
        <TabsContent value="statuses" className="mt-4 space-y-4">
          <Card className="rounded-sm border-border p-5">
            <h3 className="font-head font-bold text-lg mb-1">Default status</h3>
            <p className="text-sm text-muted-foreground mb-3">
              New receivals start with this status unless another is picked.
            </p>
            <Select value={defaultStatusId || "none"} onValueChange={(v) => saveDefaultStatus(v === "none" ? "" : v)}>
              <SelectTrigger className="h-11 rounded-sm max-w-sm" data-testid="default-status-select">
                <SelectValue placeholder="No default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>
          <CrudList
            title="Statuses"
            items={statuses}
            onAdd={addStatus}
            onDelete={delStatus}
            placeholder="New status name"
            testid="status"
          />
        </TabsContent>
        <TabsContent value="staff" className="mt-4">
          <CrudList
            title="Staff PINs"
            items={staff}
            onAdd={addStaff}
            onDelete={delStaff}
            placeholder="Staff name"
            extraField
            testid="staff"
          />
        </TabsContent>
        <TabsContent value="archive" className="mt-4">
          <Card className="rounded-sm border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-secondary rounded-sm flex items-center justify-center">
                <Archive size={20} />
              </div>
              <div>
                <h3 className="font-head font-bold text-lg">Archive old records</h3>
                <p className="text-sm text-muted-foreground">
                  Records older than 3 months. Download to keep locally, then remove.
                </p>
              </div>
            </div>
            <div className="border border-border rounded-sm p-4 mb-4">
              <span className="text-4xl font-head font-black tnum" data-testid="archive-count">
                {archive.count}
              </span>
              <span className="text-sm text-muted-foreground ml-2">record(s) eligible</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={downloadArchive}
                className="h-11 rounded-sm"
                data-testid="download-archive-btn"
              >
                <Download size={16} className="mr-2" /> Download archive (JSON)
              </Button>
              <Button
                onClick={purgeArchive}
                disabled={busy}
                className="h-11 rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="purge-archive-btn"
              >
                <Trash2 size={16} className="mr-2" /> Remove old records
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
