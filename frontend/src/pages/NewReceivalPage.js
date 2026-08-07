import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SupplierCombobox from "@/components/SupplierCombobox";
import CameraCapture from "@/components/CameraCapture";
import SignaturePad from "@/components/SignaturePad";
import { SlipsEditor } from "@/components/Slips";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CheckCircle2, PenLine, X, UserRound } from "lucide-react";

const Section = ({ n, title, children }) => (
  <Card className="rounded-sm border-border p-5">
    <div className="flex items-center gap-3 mb-4">
      <span className="w-7 h-7 bg-primary text-primary-foreground rounded-sm flex items-center justify-center text-sm font-bold tnum">
        {n}
      </span>
      <h3 className="font-head font-bold text-lg tracking-tight">{title}</h3>
    </div>
    {children}
  </Card>
);

const NewReceivalPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sigRef = useRef(null);
  const [suppliers, setSuppliers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    supplierId: "",
    statusId: "",
    deliveryDate: new Date().toISOString().slice(0, 10),
    observation: "",
    dispute: "false",
    palletCount: 0,
    signedBy: "",
  });
  const [items, setItems] = useState([]);
  const [slips, setSlips] = useState([]);
  const [images, setImages] = useState([]);
  const [signatures, setSignatures] = useState([]); // [{data, signedBy}]

  useEffect(() => {
    (async () => {
      const [sup, stat] = await Promise.all([api.get("/suppliers"), api.get("/statuses")]);
      setSuppliers(sup.data);
      setStatuses(stat.data);
    })();
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addItem = () => setItems((i) => [...i, { description: "", qty: "", caseQty: "", qop: "" }]);
  const updateItem = (idx, k, v) =>
    setItems((i) => i.map((it, j) => (j === idx ? { ...it, [k]: v } : it)));
  const removeItem = (idx) => setItems((i) => i.filter((_, j) => j !== idx));

  const addSignature = () => {
    const data = sigRef.current?.toDataURL();
    if (!data) return toast.error("Draw a signature first");
    setSignatures((s) => [...s, { data, signedBy: form.signedBy || "Unknown" }]);
    sigRef.current?.clear();
    set("signedBy", "");
    toast.success("Signature added");
  };
  const removeSignature = (idx) => setSignatures((s) => s.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    // include an un-added, currently-drawn signature too
    const drawn = sigRef.current?.toDataURL();
    const allSigs = [...signatures];
    if (drawn) allSigs.push({ data: drawn, signedBy: form.signedBy || "Unknown" });

    const payload = {
      supplierId: form.supplierId || null,
      statusId: form.statusId || null,
      deliveryDate: form.deliveryDate || null,
      observation: form.observation,
      dispute: form.dispute === "true",
      palletCount: parseInt(form.palletCount) || 0,
      items: items
        .filter((it) => it.description)
        .map((it) => ({
          description: it.description,
          qty: it.qty ? Number(it.qty) : null,
          caseQty: it.caseQty ? Number(it.caseQty) : null,
          qop: it.qop ? Number(it.qop) : null,
        })),
      slips: slips.map((s) => ({
        label: s.label || "",
        entries: (s.entries || []).map((n) => Number(n)),
      })),
      base64Images: images,
      base64Signatures: allSigs.map((s) => s.data),
      signedByNames: allSigs.map((s) => s.signedBy),
    };

    try {
      await api.post("/receivals", payload);
      toast.success("Receival confirmed");
      navigate("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed. Check your PIN.");
    } finally {
      setSaving(false);
    }
  };

  const disputeBtn = (val, label) => (
    <button
      type="button"
      onClick={() => set("dispute", val)}
      data-testid={`dispute-${val}`}
      className={`flex-1 h-12 rounded-sm border text-sm font-semibold transition-colors ${
        form.dispute === val
          ? val === "true"
            ? "bg-destructive text-destructive-foreground border-destructive"
            : "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border hover:bg-secondary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">New Receival</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Confirm a goods delivery with photos and a signature.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4" data-testid="receival-form">
        <Section n="1" title="Delivery details">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Supplier (optional)</Label>
              <SupplierCombobox
                suppliers={suppliers}
                value={form.supplierId}
                onChange={(v) => set("supplierId", v)}
                placeholder="Search supplier…"
                allowClear
                testid="supplier-combobox"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.statusId} onValueChange={(v) => set("statusId", v)}>
                <SelectTrigger className="mt-1 h-12 rounded-sm" data-testid="status-select">
                  <SelectValue placeholder="Select status" />
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
              <Label>Delivery date</Label>
              <Input
                type="date"
                value={form.deliveryDate}
                onChange={(e) => set("deliveryDate", e.target.value)}
                className="mt-1 h-12 rounded-sm"
                data-testid="delivery-date"
              />
            </div>
            <div>
              <Label>Number of pallets</Label>
              <Input
                type="number"
                min="0"
                value={form.palletCount}
                onChange={(e) => set("palletCount", e.target.value)}
                className="mt-1 h-12 rounded-sm tnum"
                data-testid="pallet-count"
              />
            </div>
          </div>

          <div className="mt-4">
            <Label>Dispute?</Label>
            <div className="flex gap-2 mt-1">
              {disputeBtn("false", "No dispute")}
              {disputeBtn("true", "Dispute")}
            </div>
          </div>

          <div className="mt-4">
            <Label>Observations</Label>
            <Textarea
              value={form.observation}
              onChange={(e) => set("observation", e.target.value)}
              placeholder="Any notes about the delivery…"
              className="mt-1 rounded-sm min-h-[90px]"
              data-testid="observation"
            />
          </div>
        </Section>

        <Section n="2" title="Items (optional)">
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  placeholder="Description"
                  value={it.description}
                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                  className="col-span-6 h-11 rounded-sm"
                  data-testid={`item-desc-${idx}`}
                />
                <Input
                  placeholder="Qty"
                  type="number"
                  value={it.qty}
                  onChange={(e) => updateItem(idx, "qty", e.target.value)}
                  className="col-span-2 h-11 rounded-sm tnum"
                />
                <Input
                  placeholder="Case"
                  type="number"
                  value={it.caseQty}
                  onChange={(e) => updateItem(idx, "caseQty", e.target.value)}
                  className="col-span-2 h-11 rounded-sm tnum"
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="col-span-2 h-11 flex items-center justify-center text-destructive hover:bg-secondary rounded-sm"
                  data-testid={`remove-item-${idx}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addItem}
            className="mt-3 h-11 rounded-sm"
            data-testid="add-item-btn"
          >
            <Plus size={16} className="mr-2" /> Add item
          </Button>
        </Section>

        <Section n="3" title="Slips (number tally)">
          <p className="text-sm text-muted-foreground mb-3 -mt-1">
            Add one or more slips and punch in numbers. Count and sum are calculated for each slip.
          </p>
          <SlipsEditor slips={slips} onChange={setSlips} />
        </Section>

        <Section n="4" title="Photos (add multiple)">
          <CameraCapture
            images={images}
            onCapture={(b64) => setImages((p) => [...p, b64])}
            onRemove={(idx) => setImages((p) => p.filter((_, i) => i !== idx))}
          />
        </Section>

        <Section n="5" title="Signatures (add multiple)">
          <SignaturePad ref={sigRef} />
          <div className="mt-3 grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label>Signed by</Label>
              <Input
                value={form.signedBy}
                onChange={(e) => set("signedBy", e.target.value)}
                placeholder="Name of person signing"
                className="mt-1 h-12 rounded-sm"
                data-testid="signed-by"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addSignature}
              className="h-12 rounded-sm"
              data-testid="add-signature-btn"
            >
              <PenLine size={16} className="mr-2" /> Add signature
            </Button>
          </div>

          {signatures.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3" data-testid="signature-list">
              {signatures.map((s, idx) => (
                <div key={idx} className="relative border border-border rounded-sm p-2">
                  <img src={s.data} alt={`sig-${idx}`} className="w-full h-16 object-contain bg-white" />
                  <p className="text-xs text-center mt-1 font-medium truncate">{s.signedBy}</p>
                  <button
                    type="button"
                    onClick={() => removeSignature(idx)}
                    className="absolute top-1 right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-sm flex items-center justify-center"
                    data-testid={`remove-signature-${idx}`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section n="6" title="Received by">
          <div className="flex items-center gap-3 border border-border rounded-sm px-4 h-12" data-testid="received-by">
            <UserRound size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">{user?.name}</span>
            <span className="text-[10px] uppercase tracking-wide bg-secondary px-1.5 py-0.5 rounded-sm">
              {user?.role}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            This receival will be recorded under your name.
          </p>
        </Section>

        <Button
          type="submit"
          disabled={saving}
          className="w-full h-14 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition-transform text-base font-semibold"
          data-testid="submit-receival"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              <CheckCircle2 size={20} className="mr-2" /> Confirm receival
            </>
          )}
        </Button>
      </form>
    </div>
  );
};

export default NewReceivalPage;
