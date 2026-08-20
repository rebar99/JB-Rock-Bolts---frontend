import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/StatusBadge";
import { inr, fmtDate } from "@/lib/format";
import { fetchDashboardStats, fetchDashboardCharts, fetchRecentSales, fetchDashboardClients, fetchMonthlyProductSales, fetchPurchaseOrders } from "@/lib/api";
import {
    Line, LineChart, CartesianGrid, Cell, LabelList,
    Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowUpRight, IndianRupee, Package, Users, Search, FileText, CheckCircle2, Clock } from "lucide-react";

import { useNavigate } from "react-router-dom";

const StatCard = ({ icon: Icon, label, value, delta, accent, onClick }) => (
    <Card className={`p-5 shadow-card hover:shadow-elegant transition-shadow border-border/60 ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
        <div className="flex items-start justify-between">
            <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="mt-2 text-2xl font-bold text-foreground tracking-tight">{value}</div>
                {delta && (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-success font-medium">
                        <ArrowUpRight className="h-3.5 w-3.5" />{delta}
                    </div>
                )}
            </div>
            <div className={`h-11 w-11 rounded-xl grid place-items-center ${accent ?? "bg-primary/10 text-primary"}`}>
                <Icon className="h-5 w-5" />
            </div>
        </div>
    </Card>
);

// Distinct, categorical colors auto-assigned to each product — shared by the
// Monthly Sales grouped chart and the "Sales By Products" donut, in the
// order the backend ranks them (highest revenue first) — cycles if there
// are ever more products than colors, so a brand new product type always
// gets a color with no code change required.
const MONTHLY_PRODUCT_COLORS = [
    "#003882", // Dark blue
    "#009fe3", // Cyan
    "#8cc63f", // Lime green
    "#f7931e", // Orange
    "#ed1c24", // Red
    "#00a99d", // Teal
    "#7fccf6", // Light Blue
    "#c3b2e3", // Lavender
    "#f9a2b8", // Pink
    "#fcd0b6", // Peach
];
const colorForProduct = (index) => MONTHLY_PRODUCT_COLORS[index % MONTHLY_PRODUCT_COLORS.length];

// Simple tooltip for the Total Sales line chart
const TotalSalesTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const entry = payload[0];
    if (entry.value == null) return null;
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                {entry.name}: {inr(entry.value)}
            </div>
        </div>
    );
};

// Recharts' default Pie tooltip renders name + value on one unbroken line —
// with full product-description names that overflows past the card edge
// instead of wrapping, so the amount ends up clipped off-screen. This wraps
// the name onto its own line inside a fixed max-width box, with the amount
// always on a second line underneath so it's never cut off.
const ProductDonutTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const entry = payload[0];
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md max-w-[240px]">
            <div className="text-xs text-foreground font-medium flex items-start gap-1.5">
                <span className="h-2 w-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: entry.payload.color }} />
                <span className="break-words">{entry.name}</span>
            </div>
            <div className="text-sm font-semibold text-foreground mt-1">{inr(entry.value)}</div>
        </div>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: fetchDashboardStats });
    const { data: charts } = useQuery({ queryKey: ["dashboard-charts"], queryFn: fetchDashboardCharts });
    // Shares the same queryKey/queryFn as the Purchase Orders page's own
    // full-list fetch, so react-query serves this from cache instead of a
    // second network round-trip whenever both are visited in a session.
    const { data: purchaseOrders = [] } = useQuery({ queryKey: ["purchase-orders"], queryFn: () => fetchPurchaseOrders({ limit: 100000 }) });
    // Same split the Purchase Order Report's own tabs use: "Completed" is
    // fully delivered, everything else (including short-closed) is what
    // that report's "Pending POs" tab lists.
    const completedPOCount = useMemo(() => purchaseOrders.filter((o) => o.delivery_status === "Delivered").length, [purchaseOrders]);
    const pendingPOCount = purchaseOrders.length - completedPOCount;
    const { data: recent = [] } = useQuery({ queryKey: ["recent-sales"], queryFn: () => fetchRecentSales(100) });
    // Grouped-bar Monthly Sales data — real Sale Invoice records only (no
    // dummy data), all 12 months always present, revenue broken down per
    // Product Type (derived server-side from each SaleItem's item name).
    const { data: monthlySales } = useQuery({ queryKey: ["monthly-product-sales"], queryFn: () => fetchMonthlyProductSales() });
    const monthlyProducts = monthlySales?.products ?? [];
    const monthlyData = monthlySales?.data ?? [];
    
    const transformedMonthlyData = useMemo(() => {
        return monthlyData.map(row => {
            const total = monthlyProducts.reduce((sum, p) => sum + (row[p] || 0), 0);
            return { month: row.month, "Total Sales": total };
        });
    }, [monthlyData, monthlyProducts]);

    // Y-axis step is derived from the actual sales data, not a fixed number —
    // picks a "nice" round step (1/2/5 x a power of 10) that lands around 8
    // ticks for whatever the tallest stacked bar currently is, so the axis
    // stays readable whether monthly revenue is in lakhs or crores.
    const monthlyMax = useMemo(() => {
        const highest = transformedMonthlyData.reduce((max, row) => Math.max(max, row["Total Sales"]), 0);
        return highest || 100000;
    }, [transformedMonthlyData]);
    const monthlyStep = useMemo(() => {
        const roughStep = monthlyMax / 8;
        const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
        const residual = roughStep / magnitude;
        const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
        return niceResidual * magnitude;
    }, [monthlyMax]);
    const monthlyAxisMax = useMemo(() => Math.ceil(monthlyMax / monthlyStep) * monthlyStep, [monthlyMax, monthlyStep]);
    const monthlyTicks = useMemo(() => {
        const ticks = [];
        for (let v = 0; v <= monthlyAxisMax; v += monthlyStep) ticks.push(v);
        return ticks;
    }, [monthlyAxisMax, monthlyStep]);

    const salesByProductDonut = (charts?.sales_by_product || []).map((p, i) => ({
        ...p,
        color: colorForProduct(i),
    }));

    const goToSalesReport = () => navigate("/reports?tab=sales");

    // ── Total Clients dialog ─────────────────────────────────────────────────
    // Sourced from Purchase Orders only (GET /api/dashboard/clients) — the
    // same PurchaseOrder.client_name data the "Total Clients" count itself is
    // built from, so this list is never longer/shorter than the number on
    // the card, and never includes a Client record that has no PO (e.g. one
    // only used on a Work Order, or added but never actually ordered from).
    const [clientsOpen, setClientsOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState("");
    const { data: clientNames = [] } = useQuery({
        queryKey: ["dashboard-clients"],
        queryFn: fetchDashboardClients,
        enabled: clientsOpen,
    });
    const filteredClientNames = useMemo(() => {
        const s = clientSearch.trim().toLowerCase();
        return s ? clientNames.filter((c) => c.toLowerCase().includes(s)) : clientNames;
    }, [clientNames, clientSearch]);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard Overview</h2>
                <p className="text-sm text-muted-foreground mt-1">Track sales performance, orders and client insights.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard onClick={goToSalesReport} icon={IndianRupee} label="Total Sales" value={inr(stats?.total_revenue ?? 0)} accent="bg-primary/10 text-primary" />
                <StatCard onClick={goToSalesReport} icon={Package} label="Number of Invoice made" value={String(stats?.total_orders ?? 0)} accent="bg-accent/15 text-accent" />
                <StatCard onClick={() => setClientsOpen(true)} icon={Users} label="Total Clients" value={String(stats?.total_clients ?? 0)} accent="bg-steel/15 text-steel" />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div>
                            <StatCard onClick={() => {}} icon={FileText} label="Total Purchase Order" value={String(purchaseOrders.length)} accent="bg-warning/15 text-warning" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => navigate("/reports?tab=completed")}>
                            <CheckCircle2 className="h-4 w-4 mr-2 text-success" /> Completed PO
                            <span className="ml-auto pl-3 text-xs font-semibold text-muted-foreground">{completedPOCount}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/reports?tab=pending")}>
                            <Clock className="h-4 w-4 mr-2 text-warning" /> Pending PO
                            <span className="ml-auto pl-3 text-xs font-semibold text-muted-foreground">{pendingPOCount}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Dialog open={clientsOpen} onOpenChange={setClientsOpen}>
                <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
                    <DialogHeader><DialogTitle>Clients ({(clientNames || []).length})</DialogTitle></DialogHeader>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Search clients..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
                    </div>
                    <div className="overflow-y-auto -mx-1 px-1 space-y-1">
                        {filteredClientNames.map((name) => (
                            <div key={name} className="px-3 py-2 rounded-md text-sm text-foreground bg-muted/40 hover:bg-muted/60 transition-colors">
                                {name}
                            </div>
                        ))}
                        {filteredClientNames.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">No clients found.</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2 p-5 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-foreground">Monthly Sales (Total)</h3>
                        <span className="text-xs text-muted-foreground">Revenue (₹) · {monthlySales?.year ?? new Date().getFullYear()}</span>
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer>
                            <LineChart data={transformedMonthlyData} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                                <YAxis
                                    domain={[0, monthlyAxisMax]}
                                    ticks={monthlyTicks}
                                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                    tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
                                />
                                <Tooltip
                                    cursor={{ stroke: "hsl(var(--muted))", strokeWidth: 1, strokeDasharray: "3 3" }}
                                    content={<TotalSalesTooltip />}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="Total Sales"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary" />
                            <span className="text-foreground font-medium">Total Sales</span>
                        </div>
                        {transformedMonthlyData.length === 0 && (
                            <span className="text-xs text-muted-foreground">No sales invoices yet.</span>
                        )}
                    </div>
                </Card>

                <Card className="p-5 shadow-card">
                    <h3 className="font-semibold text-foreground mb-4">Sales By Products</h3>
                    <div className="h-44">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={salesByProductDonut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                                    {salesByProductDonut.map((e) => <Cell key={e.name} fill={e.color} />)}
                                </Pie>
                                <Tooltip content={<ProductDonutTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    {/* Custom compact legend — recharts' built-in Legend doesn't
                        wrap/truncate long product names, so with ~10 items it
                        overflows the card instead of listing cleanly. One shared
                        scrollbar pair for the whole list (vertical for more rows,
                        horizontal for long names) — not a separate scrollbar per
                        row — so all rows stay aligned and scroll together. */}
                    <div className="mt-2 max-h-24 overflow-auto pr-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-thumb]:rounded-full">
                        <div className="space-y-1.5 w-max min-w-full">
                            {salesByProductDonut.map((e) => (
                                <div key={e.name} className="flex items-center gap-2 text-xs pr-2">
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                                    <span className="whitespace-nowrap text-muted-foreground" title={e.name}>{e.name}</span>
                                    <span className="text-foreground font-medium shrink-0 ml-auto pl-3">{inr(e.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            </div>

            <Card className="shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Recent Sales</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[450px]">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50 w-[60px]">S.No.</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Date</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Client</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Product</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">PO No.</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Invoice No.</th>
                                <th className="text-right font-medium px-5 py-3 bg-muted/50">Amount</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Delivery</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent.map((r, index) => (
                                <tr key={r.id || index} className="border-t border-border hover:bg-muted/30 transition-colors">
                                    <td className="px-5 py-3 text-muted-foreground font-medium">{index + 1}</td>
                                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{r.date ? fmtDate(r.date) : "—"}</td>
                                    <td className="px-5 py-3 font-medium text-foreground">
                                        <div className="max-w-[200px] truncate" title={r.client_name}>{r.client_name}</div>
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground">
                                        <div className="max-w-[350px] truncate" title={r.product}>{r.product}</div>
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{r.po_number || "—"}</td>
                                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{r.invoice_number || "—"}</td>
                                    <td className="px-5 py-3 text-right font-semibold whitespace-nowrap">{inr(r.price)}</td>
                                    <td className="px-5 py-3"><StatusBadge status={r.delivery_status} /></td>
                                </tr>
                            ))}
                            {recent.length === 0 && (
                                <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">No sales data yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default Dashboard;
