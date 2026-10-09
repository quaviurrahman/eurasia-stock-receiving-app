import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, KeyRound, Code2 } from "lucide-react";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Code = ({ children }) => (
  <pre className="bg-zinc-900 text-zinc-100 rounded-sm p-4 text-xs overflow-x-auto leading-relaxed">
    <code>{children}</code>
  </pre>
);

const Endpoint = ({ method, path, desc, sample, curl, testid }) => (
  <Card className="rounded-sm border-border p-5 space-y-3" data-testid={testid}>
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className="rounded-sm bg-primary text-primary-foreground tnum">{method}</Badge>
      <code className="text-sm font-medium break-all">{path}</code>
    </div>
    <p className="text-sm text-muted-foreground">{desc}</p>
    {curl && (
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Example request</div>
        <Code>{curl}</Code>
      </div>
    )}
    {sample && (
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Example response</div>
        <Code>{sample}</Code>
      </div>
    )}
  </Card>
);

const ApiGuidePage = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate("/pricing")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        data-testid="apiguide-back"
      >
        <ArrowLeft size={16} /> Pricing
      </button>

      <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight mb-2">Pricing API Guide</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Read-only endpoints that expose the latest purchase price, previous price and the average of the last
        3 purchases per product pack size, for consumption by other systems.
      </p>

      <Card className="rounded-sm border-border p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Code2 size={18} />
          <h2 className="font-head font-bold text-lg">Base URL</h2>
        </div>
        <Code>{API_BASE}</Code>
      </Card>

      <Card className="rounded-sm border-border p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound size={18} />
          <h2 className="font-head font-bold text-lg">Authentication</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-2">
          Send your system API key in the <code>X-API-Key</code> header. This is the same CPIS system key used
          across the platform (from CPIS → Systems &amp; Settings). Requests without a valid key return
          <code> 401</code>.
        </p>
        <Code>{`X-API-Key: <your CPIS system key>`}</Code>
      </Card>

      <h2 className="font-head font-bold text-xl mb-3">Endpoints</h2>
      <div className="space-y-4">
        <Endpoint
          method="GET"
          path="/pricing/packs/{packId}"
          testid="endpoint-pack"
          desc="Pricing summary for a single pack: latest & previous purchase price, average of the last 3 purchases, and per-unit equivalents (price ÷ pack unit_quantity)."
          curl={`curl "${API_BASE}/pricing/packs/PACK_ID" \\
  -H "X-API-Key: <your CPIS system key>"`}
          sample={`{
  "packId": "a1021b15-…",
  "found": true,
  "productId": "3ff78b8b-…",
  "sku": "freveg20",
  "productName": "CLOSED CUP MUSHROOM",
  "packName": "1.1KG Box",
  "unitQuantity": 1,
  "baseUnit": "UNIT",
  "latestPrice": 130.0,
  "latestPerUnitPrice": 130.0,
  "previousPrice": 100.0,
  "previousPerUnitPrice": 100.0,
  "averageLast3": 115.0,
  "averageLast3PerUnit": 115.0,
  "count": 2,
  "latestRecordedAt": "2026-09-07T22:51:02Z"
}`}
        />
        <Endpoint
          method="POST"
          path="/pricing/batch"
          testid="endpoint-batch"
          desc="Batch pricing summaries for many packs in one call. Unknown packs return found:false with null prices; order is preserved."
          curl={`curl -X POST "${API_BASE}/pricing/batch" \\
  -H "X-API-Key: <your CPIS system key>" \\
  -H "Content-Type: application/json" \\
  -d '{"packIds": ["PACK_ID_1", "PACK_ID_2"]}'`}
          sample={`{
  "items": [
    { "packId": "PACK_ID_1", "found": true,
      "latestPrice": 130.0, "averageLast3": 115.0, "count": 2, … },
    { "packId": "PACK_ID_2", "found": false,
      "latestPrice": null, "averageLast3": null, "count": 0 }
  ]
}`}
        />
      </div>

      <Card className="rounded-sm border-border p-5 mt-6" data-testid="bbd-guide-section">
        <h2 className="font-head font-bold text-lg mb-2">Stock receipts &amp; best-before batches</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Closing a purchase order posts a positive goods-receipt to CPIS (<code>POST /stock/receipts</code>)
          for each line. For products with CPIS best-before (batch) tracking enabled, the line's
          <b> best-before date</b> is captured at receive and sent as <code>best_before_date</code> (required
          by CPIS for tracked products). Products without tracking ignore the date and behave as before.
        </p>
        <Code>{`POST /stock/receipts
{ "pack_id": "...", "quantity": "10",
  "best_before_date": "2026-12-31",
  "reference": { "type": "purchase_order", "id": "PO-0001" } }`}</Code>
        <p className="text-xs text-muted-foreground mt-2">
          Live stock views in this app show the CPIS batch breakdown (per best-before date, with expiry
          flags) and the active pick rule (FEFO / FIFO / LIFO), configured in CPIS per product.
        </p>
      </Card>

      <p className="text-xs text-muted-foreground mt-6">
        Price points are recorded automatically each time a purchase order is closed. All amounts are in the
        purchasing currency configured for your account.
      </p>
    </div>
  );
};

export default ApiGuidePage;
