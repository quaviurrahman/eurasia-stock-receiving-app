import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CameraCapture from "@/components/CameraCapture";
import SignaturePad from "@/components/SignaturePad";
import { SlipsEditor, SlipsView } from "@/components/Slips";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  ArrowLeft,
  Printer,
  AlertTriangle,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  History,
  PenLine,
} from "lucide-react";

const Field = ({ label, value }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-sm font-medium mt-0.5">{value || "—"}</div>
  </div>
);

const ReceivalDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const sigRef = useRef(null);
  const [rec, setRec] = useState(undefined);
  const [zoom, setZoom] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // edit drafts
  const [draft, setDraft] = useState({ palletCount: 0, observation: "", items: [], slips: [] });
  const [removeImagePaths, setRemoveImagePaths] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [removeSigPaths, setRemoveSigPaths] = useState([]);
  const [newSignatures, setNewSignatures] = useState([]);
  const [signedBy, setSignedBy] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get(`/receivals/${id}`);
      setRec(data);
    } catch {
      setRec(null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const startEdit = () => {
    setDraft({
      palletCount: rec.palletCount ?? 0,
      observation: rec.observation || "",
      items: (rec.items || []).map((it) => ({ ...it })),
      slips: (rec.slips || []).map((s) => ({ label: s.label || "", entries: [...(s.entries || [])] })),
    });
    setRemoveImagePaths([]);
    setNewImages([]);
    setRemoveSigPaths([]);
    setNewSignatures([]);
    setSignedBy("");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const updateItem = (idx, k, v) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === idx ? { ...it, [k]: v } : it)) }));
  const addItem = () =>
    setDraft((d) => ({ ...d, items: [...d.items, { description: "", qty: "", caseQty: "", qop: "" }] }));
  const removeItem = (idx) =>
    setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== idx) }));

  const addSignature = () => {
    const data = sigRef.current?.toDataURL();
    if (!data) return toast.error("Draw a signature first");
    setNewSignatures((s) => [...s, { data, signedBy: signedBy || "Unknown" }]);
    sigRef.current?.clear();
    setSignedBy("");
    toast.success("Signature added (save to keep)");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/receivals/${id}`, {
        palletCount: parseInt(draft.palletCount) || 0,
        observation: draft.observation,
        items: draft.items
          .filter((it) => it.description)
          .map((it) => ({
            description: it.description,
            qty: it.qty !== "" && it.qty != null ? Number(it.qty) : null,
            caseQty: it.caseQty !== "" && it.caseQty != null ? Number(it.caseQty) : null,
            qop: it.qop !== "" && it.qop != null ? Number(it.qop) : null,
          })),
        slips: (draft.slips || []).map((s) => ({
          label: s.label || "",
          entries: (s.entries || []).map((n) => Number(n)),
        })),
      });
      if (newImages.length || removeImagePaths.length || newSignatures.length || removeSigPaths.length) {
        await api.post(`/receivals/${id}/media`, {
          addImages: newImages,
          removeImagePaths,
          addSignatures: newSignatures.map((s) => s.data),
          addSignedByNames: newSignatures.map((s) => s.signedBy),
          removeSignaturePaths: removeSigPaths,
        });
      }
      toast.success("Changes saved");
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (rec === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rec === null) return <p className="text-sm">Receival not found.</p>;

  const visibleImages = (rec.images || []).filter((p) => !removeImagePaths.includes(p));
  const visibleSigs = (rec.signatures || []).filter((s) => !removeSigPaths.includes(s.path));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 no-print gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-sm" data-testid="back-btn">
          <ArrowLeft size={18} className="mr-2" /> Back
        </Button>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={startEdit} className="h-11 rounded-sm" data-testid="edit-detail-btn">
                <Pencil size={18} className="mr-2" /> Edit
              </Button>
              <Button
                onClick={() => window.print()}
                className="h-11 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="print-btn"
              >
                <Printer size={18} className="mr-2" /> Print
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={cancelEdit} className="h-11 rounded-sm" data-testid="cancel-edit-btn">
                <X size={18} className="mr-2" /> Cancel
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="h-11 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
                data-testid="save-edit-btn"
              >
                <Save size={18} className="mr-2" /> {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div id="print-area" className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-head font-black text-3xl tracking-tight">Delivery Note</h1>
          {rec.dispute && (
            <Badge className="rounded-sm bg-destructive text-destructive-foreground">
              <AlertTriangle size={12} className="mr-1" /> Dispute
            </Badge>
          )}
        </div>

        <Card className="rounded-sm border-border p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Supplier" value={rec.supplier?.name} />
            <Field label="Status" value={rec.status?.name} />
            <Field label="Delivery date" value={rec.deliveryDate ? rec.deliveryDate.substring(0, 10) : null} />
            <Field label="Received by" value={rec.receivedBy} />
            {editing ? (
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Pallets</Label>
                <Input
                  type="number"
                  min="0"
                  value={draft.palletCount}
                  onChange={(e) => setDraft((d) => ({ ...d, palletCount: e.target.value }))}
                  className="h-10 rounded-sm mt-1 tnum"
                  data-testid="edit-pallet-input"
                />
              </div>
            ) : (
              <Field label="Pallets" value={rec.palletCount} />
            )}
            <Field label="Dispute" value={rec.dispute ? "Yes" : "No"} />
          </div>
          <div className="mt-4">
            {editing ? (
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Observations</Label>
                <Textarea
                  value={draft.observation}
                  onChange={(e) => setDraft((d) => ({ ...d, observation: e.target.value }))}
                  className="rounded-sm mt-1 min-h-[70px]"
                  data-testid="edit-observation-input"
                />
              </div>
            ) : (
              rec.observation && <Field label="Observations" value={rec.observation} />
            )}
          </div>
        </Card>

        {/* Items */}
        {(editing || rec.items?.length > 0) && (
          <Card className="rounded-sm border-border p-5">
            <h3 className="font-head font-bold text-lg mb-3">Items</h3>
            {editing ? (
              <div className="space-y-2">
                {draft.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                      className="col-span-6 h-10 rounded-sm"
                      data-testid={`edit-item-desc-${idx}`}
                    />
                    <Input placeholder="Qty" type="number" value={it.qty ?? ""} onChange={(e) => updateItem(idx, "qty", e.target.value)} className="col-span-2 h-10 rounded-sm tnum" />
                    <Input placeholder="Case" type="number" value={it.caseQty ?? ""} onChange={(e) => updateItem(idx, "caseQty", e.target.value)} className="col-span-2 h-10 rounded-sm tnum" />
                    <button type="button" onClick={() => removeItem(idx)} className="col-span-2 h-10 flex items-center justify-center text-destructive hover:bg-secondary rounded-sm" data-testid={`edit-remove-item-${idx}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addItem} className="mt-2 h-10 rounded-sm" data-testid="edit-add-item">
                  <Plus size={16} className="mr-2" /> Add item
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Case Qty</TableHead>
                    <TableHead className="text-right">QoP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rec.items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>{it.description}</TableCell>
                      <TableCell className="text-right tnum">{it.qty ?? "—"}</TableCell>
                      <TableCell className="text-right tnum">{it.caseQty ?? "—"}</TableCell>
                      <TableCell className="text-right tnum">{it.qop ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}

        {/* Slips */}
        {(editing || rec.slips?.length > 0) && (
          <Card className="rounded-sm border-border p-5">
            <h3 className="font-head font-bold text-lg mb-3">Slips</h3>
            {editing ? (
              <SlipsEditor slips={draft.slips} onChange={(v) => setDraft((d) => ({ ...d, slips: v }))} />
            ) : (
              <SlipsView slips={rec.slips} />
            )}
          </Card>
        )}

        {/* Photos */}
        <Card className="rounded-sm border-border p-5">
          <h3 className="font-head font-bold text-lg mb-3">Photos</h3>
          {visibleImages.length === 0 && newImages.length === 0 && !editing && (
            <p className="text-sm text-muted-foreground">No photos.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {visibleImages.map((p, i) => (
              <div key={p} className="relative">
                <img
                  src={fileUrl(p)}
                  alt={`photo-${i}`}
                  onClick={() => !editing && setZoom(fileUrl(p))}
                  className="w-full h-40 object-cover rounded-sm border border-border cursor-zoom-in"
                  data-testid={`detail-photo-${i}`}
                />
                {editing && (
                  <button
                    type="button"
                    onClick={() => setRemoveImagePaths((r) => [...r, p])}
                    className="absolute top-1 right-1 w-7 h-7 bg-destructive text-destructive-foreground rounded-sm flex items-center justify-center no-print"
                    data-testid={`remove-existing-photo-${i}`}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <div className="mt-4 no-print">
              <CameraCapture
                images={newImages}
                onCapture={(b64) => setNewImages((p) => [...p, b64])}
                onRemove={(idx) => setNewImages((p) => p.filter((_, i) => i !== idx))}
              />
            </div>
          )}
        </Card>

        {/* Signatures */}
        <Card className="rounded-sm border-border p-5">
          <h3 className="font-head font-bold text-lg mb-3">Signatures</h3>
          <div className="flex flex-wrap gap-4">
            {visibleSigs.map((s, i) => (
              <div key={s.path} className="relative border border-border rounded-sm p-2">
                <img src={fileUrl(s.path)} alt="signature" className="h-24 bg-white" />
                <p className="text-sm text-center mt-1 font-medium">{s.signedBy}</p>
                {editing && (
                  <button
                    type="button"
                    onClick={() => setRemoveSigPaths((r) => [...r, s.path])}
                    className="absolute top-1 right-1 w-7 h-7 bg-destructive text-destructive-foreground rounded-sm flex items-center justify-center no-print"
                    data-testid={`remove-existing-sig-${i}`}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            {newSignatures.map((s, i) => (
              <div key={`new-${i}`} className="relative border border-accent rounded-sm p-2">
                <img src={s.data} alt="new signature" className="h-24 bg-white" />
                <p className="text-sm text-center mt-1 font-medium">{s.signedBy}</p>
                <button
                  type="button"
                  onClick={() => setNewSignatures((n) => n.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 w-7 h-7 bg-destructive text-destructive-foreground rounded-sm flex items-center justify-center no-print"
                  data-testid={`remove-new-sig-${i}`}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {visibleSigs.length === 0 && newSignatures.length === 0 && !editing && (
              <p className="text-sm text-muted-foreground">No signatures.</p>
            )}
          </div>

          {editing && (
            <div className="mt-4 no-print">
              <SignaturePad ref={sigRef} />
              <div className="mt-3 grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <Label>Signed by</Label>
                  <Input
                    value={signedBy}
                    onChange={(e) => setSignedBy(e.target.value)}
                    placeholder="Name"
                    className="mt-1 h-11 rounded-sm"
                    data-testid="edit-signed-by"
                  />
                </div>
                <Button type="button" variant="outline" onClick={addSignature} className="h-11 rounded-sm" data-testid="edit-add-signature">
                  <PenLine size={16} className="mr-2" /> Add signature
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Change history */}
        {rec.changeLog?.length > 0 && (
          <Card className="rounded-sm border-border p-5 no-print" data-testid="change-history">
            <div className="flex items-center gap-2 mb-3">
              <History size={18} />
              <h3 className="font-head font-bold text-lg">Change history</h3>
            </div>
            <ol className="space-y-3">
              {[...rec.changeLog].reverse().map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-accent shrink-0" />
                  <div>
                    <div className="font-medium">{e.action}</div>
                    <div className="text-xs text-muted-foreground tnum">
                      {e.by} ({e.role}) · {new Date(e.at).toLocaleString()}
                    </div>
                    {e.changes && typeof e.changes === "object" && (
                      <ul className="text-xs text-muted-foreground mt-1 list-disc ml-4">
                        {Object.entries(e.changes).map(([field, val]) => (
                          <li key={field}>
                            <span className="font-medium">{field}</span>
                            {val && typeof val === "object" && "from" in val
                              ? `: ${JSON.stringify(val.from)} → ${JSON.stringify(val.to)}`
                              : `: ${String(val)}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 no-print" onClick={() => setZoom(null)}>
          <img src={zoom} alt="zoom" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
};

export default ReceivalDetailsPage;
