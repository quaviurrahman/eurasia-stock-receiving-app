import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
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
import { ArrowLeft, Printer, AlertTriangle } from "lucide-react";

const Field = ({ label, value }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-sm font-medium mt-0.5">{value || "—"}</div>
  </div>
);

const ReceivalDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rec, setRec] = useState(undefined);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    api
      .get(`/receivals/${id}`)
      .then((r) => setRec(r.data))
      .catch(() => setRec(null));
  }, [id]);

  if (rec === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rec === null) return <p className="text-sm">Receival not found.</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 no-print">
        <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-sm" data-testid="back-btn">
          <ArrowLeft size={18} className="mr-2" /> Back
        </Button>
        <Button
          onClick={() => window.print()}
          className="h-11 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="print-btn"
        >
          <Printer size={18} className="mr-2" /> Print delivery note
        </Button>
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
            <Field
              label="Delivery date"
              value={rec.deliveryDate ? rec.deliveryDate.substring(0, 10) : null}
            />
            <Field label="Received by" value={rec.receivedBy} />
            <Field label="Pallets" value={rec.palletCount} />
            <Field label="Dispute" value={rec.dispute ? "Yes" : "No"} />
          </div>
          {rec.observation && (
            <div className="mt-4">
              <Field label="Observations" value={rec.observation} />
            </div>
          )}
        </Card>

        {rec.items?.length > 0 && (
          <Card className="rounded-sm border-border p-5">
            <h3 className="font-head font-bold text-lg mb-3">Items</h3>
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
          </Card>
        )}

        {rec.images?.length > 0 && (
          <Card className="rounded-sm border-border p-5">
            <h3 className="font-head font-bold text-lg mb-3">Photos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {rec.images.map((p, i) => (
                <img
                  key={i}
                  src={fileUrl(p)}
                  alt={`photo-${i}`}
                  onClick={() => setZoom(fileUrl(p))}
                  className="w-full h-40 object-cover rounded-sm border border-border cursor-zoom-in"
                  data-testid={`detail-photo-${i}`}
                />
              ))}
            </div>
          </Card>
        )}

        {rec.signatures?.length > 0 && (
          <Card className="rounded-sm border-border p-5">
            <h3 className="font-head font-bold text-lg mb-3">Signatures</h3>
            <div className="flex flex-wrap gap-4">
              {rec.signatures.map((s, i) => (
                <div key={i} className="border border-border rounded-sm p-2">
                  <img src={fileUrl(s.path)} alt="signature" className="h-24 bg-white" />
                  <p className="text-sm text-center mt-1 font-medium">{s.signedBy}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 no-print"
          onClick={() => setZoom(null)}
        >
          <img src={zoom} alt="zoom" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
};

export default ReceivalDetailsPage;
