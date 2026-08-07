import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Package, ClipboardCheck, FileWarning, Truck, TrendingUp } from "lucide-react";

const ACCENT = "#0055FF";
const BARS = ["#0A0A0A", "#0055FF", "#7C3AED", "#059669", "#EA580C", "#DB2777"];

const Kpi = ({ icon: Icon, label, value, testid }) => (
  <Card className="rounded-sm border-border p-5" data-testid={testid}>
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Icon size={18} className="text-muted-foreground" />
    </div>
    <div className="font-head font-black text-4xl tracking-tight mt-2 tnum">{value}</div>
  </Card>
);

const TrendChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={260}>
    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
      <Tooltip contentStyle={{ borderRadius: 4, border: "1px solid #eee", fontSize: 12 }} />
      <Area type="monotone" dataKey="count" stroke={ACCENT} strokeWidth={2} fill="url(#g)" />
    </AreaChart>
  </ResponsiveContainer>
);

const DashboardPage = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get("/analytics")
      .then((r) => setData(r.data))
      .catch(() => setData(false));
  }, []);

  if (data === null) return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  if (data === false) return <p className="text-sm">Could not load analytics.</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Intake overview and trends.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi icon={ClipboardCheck} label="Total intakes" value={data.total} testid="kpi-total" />
        <Kpi icon={Package} label="Pallets received" value={data.palletsTotal} testid="kpi-pallets" />
        <Kpi icon={FileWarning} label="Invoices pending" value={data.invoicesPending} testid="kpi-pending" />
        <Kpi icon={Truck} label="Suppliers" value={data.suppliersCount} testid="kpi-suppliers" />
      </div>

      <Card className="rounded-sm border-border p-5 mb-6" data-testid="trend-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} />
          <h3 className="font-head font-bold text-lg">Intake trend</h3>
        </div>
        <Tabs defaultValue="daily">
          <TabsList className="rounded-sm h-10 mb-4">
            <TabsTrigger value="daily" data-testid="trend-daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly" data-testid="trend-weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" data-testid="trend-monthly">Monthly</TabsTrigger>
          </TabsList>
          <TabsContent value="daily">
            {data.daily.length ? <TrendChart data={data.daily} /> : <p className="text-sm text-muted-foreground py-8 text-center">No data</p>}
          </TabsContent>
          <TabsContent value="weekly">
            {data.weekly.length ? <TrendChart data={data.weekly} /> : <p className="text-sm text-muted-foreground py-8 text-center">No data</p>}
          </TabsContent>
          <TabsContent value="monthly">
            {data.monthly.length ? <TrendChart data={data.monthly} /> : <p className="text-sm text-muted-foreground py-8 text-center">No data</p>}
          </TabsContent>
        </Tabs>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="rounded-sm border-border p-5" data-testid="status-card">
          <h3 className="font-head font-bold text-lg mb-4">Intakes by status</h3>
          {data.statusCounts.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.statusCounts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f5f5f5" }} contentStyle={{ borderRadius: 4, border: "1px solid #eee", fontSize: 12 }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {data.statusCounts.map((_, i) => (
                    <Cell key={i} fill={BARS[i % BARS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
          )}
        </Card>

        <Card className="rounded-sm border-border p-5" data-testid="supplier-freq-card">
          <h3 className="font-head font-bold text-lg mb-1">Supplier intake frequency</h3>
          <p className="text-xs text-muted-foreground mb-4">Average days between deliveries per supplier.</p>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs uppercase tracking-wide text-muted-foreground pb-2 border-b border-border">
              <span>Supplier</span>
              <span className="text-right">Intakes</span>
              <span className="text-right">Avg gap</span>
            </div>
            {data.supplierFrequency.length ? (
              data.supplierFrequency.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm py-2 border-b border-border/50 items-center" data-testid={`supplier-freq-row-${i}`}>
                  <span className="font-medium truncate">{s.supplier}</span>
                  <span className="text-right tnum">{s.count}</span>
                  <span className="text-right tnum text-muted-foreground">
                    {s.avgIntervalDays != null ? `${s.avgIntervalDays}d` : "—"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
