import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/StatusBadge";
import { inr, fmtDate } from "@/lib/format";
import { fetchDashboardStats, fetchDashboardCharts, fetchRecentSales, fetchDashboardClients, fetchMonthlyProductSales, fetchSale, fetchWorkOrderSale, resolveFileUrl } from "@/lib/api";
import {
    Line, LineChart, CartesianGrid, Cell, LabelList, Legend,
    Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowUpRight, IndianRupee, Package, Users, Search, FileText, CheckCircle2, Clock, Receipt, ExternalLink, Eye } from "lucide-react";

import { useNavigate } from "react-router-dom";

const StatCard = ({ icon: Icon, label, value, delta, detail, accent, onClick }) => (
    <Card className={`p-5 shadow-card hover:shadow-elegant transition-shadow border-border/60 ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
        <div className="flex items-start justify-between">
            <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="mt-2 text-2xl font-bold text-foreground tracking-tight">{value}</div>
                {detail && <div className="mt-2 text-xs font-medium text-muted-foreground">{detail}</div>}
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
    const [selectedMonth, setSelectedMonth] = useState("all");
    const [includeGst, setIncludeGst] = useState(true);
    const { data: stats } = useQuery({ queryKey: ["dashboard-stats", includeGst], queryFn: () => fetchDashboardStats(includeGst) });
    const { data: charts } = useQuery({ 
        queryKey: ["dashboard-charts", selectedMonth, includeGst], 
        queryFn: () => fetchDashboardCharts(undefined, selectedMonth !== "all" ? Number(selectedMonth) : undefined, includeGst) 
    });
    const { data: recent = [] } = useQuery({ queryKey: ["recent-sales", includeGst], queryFn: () => fetchRecentSales(100, includeGst) });
    const [selectedRecentSale, setSelectedRecentSale] = useState(null);
    const [saleDetails, setSaleDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const handleViewSale = async (r) => {
        setSelectedRecentSale(r);
        setSaleDetails(null);
        setLoadingDetails(true);
        try {
            let details = null;
            if (r.sale_type === "WO") {
                details = await fetchWorkOrderSale(r.id);
            } else {
                details = await fetchSale(r.id);
            }
            setSaleDetails(details);
        } catch (e) {
            console.error("Failed to fetch sale details:", e);
        } finally {
            setLoadingDetails(false);
        }
    };
    // Grouped-bar Monthly Sales data — real Sale Invoice records only (no
    // dummy data), all 12 months always present, revenue broken down per
    // Product Type (derived server-side from each SaleItem's item name).
    const { data: monthlySales } = useQuery({ 
        queryKey: ["monthly-product-sales", selectedMonth, includeGst], 
        queryFn: () => fetchMonthlyProductSales(undefined, selectedMonth !== "all" ? Number(selectedMonth) : undefined, includeGst) 
    });
    const monthlyProducts = monthlySales?.products ?? [];
    const monthlyData = monthlySales?.data ?? [];
    
    const transformedMonthlyData = useMemo(() => {
        const currentMonthIndex = new Date().getMonth();
        return monthlyData.map((row, i) => {
            const total = monthlyProducts.reduce((sum, p) => sum + (row[p] || 0), 0);
            
            let isHidden = false;
            // Only apply month-based clipping if we are viewing "All Months"
            if (selectedMonth === "all") {
                // Hide Jan/Feb/Mar (indices 0, 1, 2) and future months
                isHidden = i < 3 || i > currentMonthIndex;
            }
            
            return { month: row.month, "Total Sales": isHidden ? null : total };
        });
    }, [monthlyData, monthlyProducts, selectedMonth]);

    const selectedMonthTotal = useMemo(() => {
        if (selectedMonth === "all") return null;
        return transformedMonthlyData.reduce((sum, row) => sum + (row["Total Sales"] || 0), 0);
    }, [transformedMonthlyData, selectedMonth]);

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

    // ── Total Clients dialog ─────────────────────────────────────────────────
    // Sourced from Purchase Orders only (GET /api/dashboard/clients) — the
    // same PurchaseOrder.client_name data the "Total Clients" count itself is
    // built from, so this list is never longer/shorter than the number on
    // the card, and never includes a Client record that has no PO (e.g. one
    // only used on a Work Order, or added but never actually ordered from).
    const [clientsOpen, setClientsOpen] = useState(false);
    const [clientType, setClientType] = useState("PO");
    const [clientSearch, setClientSearch] = useState("");
    const { data: clientNames = [] } = useQuery({
        queryKey: ["dashboard-clients"],
        queryFn: fetchDashboardClients,
        enabled: clientsOpen,
    });
    const clientNamesForType = clientType === "WO" ? (clientNames?.wo_clients || []) : (clientNames?.po_clients || []);
    const filteredClientNames = useMemo(() => {
        const s = clientSearch.trim().toLowerCase();
        const stripPrefix = (name) => name.replace(/^m\/s\.?\s*/i, "").trim();
        const filtered = s ? clientNamesForType.filter((c) => c.toLowerCase().includes(s)) : [...clientNamesForType];
        return filtered.sort((a, b) => stripPrefix(a).localeCompare(stripPrefix(b), undefined, { sensitivity: "base" }));
    }, [clientNamesForType, clientSearch]);
    const openClients = (type) => { setClientType(type); setClientSearch(""); setClientsOpen(true); };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard Overview (Supply &amp; Job Work)</h2>
                    <p className="text-sm text-muted-foreground mt-1">Track sales performance, orders and client insights.</p>
                </div>
                <div className="flex items-center bg-muted/50 p-1 rounded-lg">
                    <button 
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${includeGst ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => setIncludeGst(true)}
                    >
                        With GST
                    </button>
                    <button 
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${!includeGst ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => setIncludeGst(false)}
                    >
                        Without GST
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><div><StatCard onClick={() => {}} icon={IndianRupee} label="Total Sales (PO + WO + CN)" value={inr(stats?.total_revenue ?? 0)} accent="bg-primary/10 text-primary" /></div></DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => navigate("/reports?section=po&tab=sales")}>PO Sales <span className="ml-auto pl-4 font-semibold">{inr(stats?.po_revenue ?? 0)}</span></DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/reports?section=wo&tab=sales")}>WO Sales <span className="ml-auto pl-4 font-semibold">{inr(stats?.wo_revenue ?? 0)}</span></DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/credit-notes")}>CN Adjustment <span className="ml-auto pl-4 font-semibold text-destructive">-{inr(stats?.credit_note_adjustment ?? 0)}</span></DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><div><StatCard onClick={() => {}} icon={Package} label="Number of Invoice Made (PO + WO)" value={String(stats?.total_orders ?? 0)} accent="bg-accent/15 text-accent" /></div></DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => navigate("/reports?section=po&tab=sales")}>PO Invoices <span className="ml-auto pl-4 font-semibold">{stats?.po_invoice_count ?? 0}</span></DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/reports?section=wo&tab=sales")}>WO Invoices <span className="ml-auto pl-4 font-semibold">{stats?.wo_invoice_count ?? 0}</span></DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><div><StatCard onClick={() => {}} icon={Users} label="Total Clients (PO + WO)" value={String(stats?.total_clients ?? 0)} accent="bg-steel/15 text-steel" /></div></DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => openClients("PO")}>PO Clients <span className="ml-auto pl-4 font-semibold">{stats?.po_client_count ?? 0}</span></DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openClients("WO")}>WO Clients <span className="ml-auto pl-4 font-semibold">{stats?.wo_client_count ?? 0}</span></DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div>
                            <StatCard onClick={() => {}} icon={FileText} label="Total Orders (PO + WO)" value={String((stats?.po_order_count ?? 0) + (stats?.wo_order_count ?? 0))} accent="bg-warning/15 text-warning" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuSub><DropdownMenuSubTrigger><span className="mr-2">Purchase Orders</span><span className="mr-2 text-xs font-bold text-slate-900 dark:text-slate-100">{stats?.po_order_count ?? 0}</span></DropdownMenuSubTrigger><DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => navigate("/reports?section=po&tab=completed")}><CheckCircle2 className="h-4 w-4 mr-2 text-success" /> Completed <span className="ml-auto pl-3 font-semibold">{stats?.completed_po_count ?? 0}</span></DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate("/reports?section=po&tab=pending")}><Clock className="h-4 w-4 mr-2 text-warning" /> Pending <span className="ml-auto pl-3 font-semibold">{stats?.pending_po_count ?? 0}</span></DropdownMenuItem>
                        </DropdownMenuSubContent></DropdownMenuSub>
                        <DropdownMenuSub><DropdownMenuSubTrigger><span className="mr-2">Work Orders</span><span className="mr-2 text-xs font-bold text-slate-900 dark:text-slate-100">{stats?.wo_order_count ?? 0}</span></DropdownMenuSubTrigger><DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => navigate("/reports?section=wo&tab=completed")}><CheckCircle2 className="h-4 w-4 mr-2 text-success" /> Completed <span className="ml-auto pl-3 font-semibold">{stats?.completed_wo_count ?? 0}</span></DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate("/reports?section=wo&tab=pending")}><Clock className="h-4 w-4 mr-2 text-warning" /> Pending <span className="ml-auto pl-3 font-semibold">{stats?.pending_wo_count ?? 0}</span></DropdownMenuItem>
                        </DropdownMenuSubContent></DropdownMenuSub>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Dialog open={clientsOpen} onOpenChange={setClientsOpen}>
                <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
                    <DialogHeader><DialogTitle>{clientType} Clients ({clientNamesForType.length})</DialogTitle></DialogHeader>
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                        <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-foreground">Monthly Sales (Total)</h3>
                            <select 
                                className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                            >
                                <option value="all">All Months</option>
                                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                                    <option key={m} value={i + 1}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-2">
                            {selectedMonth !== "all" && (
                                <span className="font-semibold text-foreground bg-primary/10 text-primary px-2 py-1 rounded-md">
                                    Total: {inr(selectedMonthTotal)}
                                </span>
                            )}
                            <span>Revenue (₹) · {monthlySales?.year ?? new Date().getFullYear()}</span>
                        </span>
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
                                    type="linear"
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
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Type</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">PO / WO No.</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Invoice No.</th>
                                <th className="text-right font-medium px-5 py-3 bg-muted/50">Amount</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Delivery</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent.map((r, index) => (
                                <tr
                                    key={r.id || index}
                                    className="border-t border-border hover:bg-muted/40 transition-colors cursor-pointer group"
                                    onClick={() => handleViewSale(r)}
                                    title="Click to view full Bill & Sale details"
                                >
                                    <td className="px-5 py-3 text-muted-foreground font-medium group-hover:text-primary transition-colors">{index + 1}</td>
                                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{r.date ? fmtDate(r.date) : "—"}</td>
                                    <td className="px-5 py-3 font-medium text-foreground">
                                        <div className="max-w-[200px] truncate group-hover:text-primary transition-colors font-semibold" title={r.client_name}>{r.client_name}</div>
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground">
                                        <div className="max-w-[350px] truncate" title={r.product}>{r.product}</div>
                                    </td>
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${r.sale_type === "WO" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                                            {r.sale_type || "PO"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs">{r.po_number || "—"}</td>
                                    <td className="px-5 py-3 text-foreground whitespace-nowrap font-mono text-xs font-semibold group-hover:text-primary group-hover:underline">
                                        {r.invoice_number || "—"}
                                    </td>
                                    <td className="px-5 py-3 text-right font-semibold whitespace-nowrap text-foreground">{inr(r.price)}</td>
                                    <td className="px-5 py-3"><StatusBadge status={r.delivery_status} /></td>
                                </tr>
                            ))}
                            {recent.length === 0 && (
                                <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">No sales data yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Recent Sale / Bill Details Dialog */}
            <Dialog open={!!selectedRecentSale} onOpenChange={(open) => !open && setSelectedRecentSale(null)}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center justify-between gap-2 pr-6">
                            <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                <Receipt className="h-5 w-5 text-primary" />
                                <span>Sale & Bill Details</span>
                                {selectedRecentSale?.invoice_number && (
                                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-foreground font-semibold">
                                        {selectedRecentSale.invoice_number}
                                    </span>
                                )}
                            </DialogTitle>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                selectedRecentSale?.sale_type === "WO" 
                                    ? "bg-violet-100 text-violet-700 border border-violet-200" 
                                    : "bg-blue-100 text-blue-700 border border-blue-200"
                            }`}>
                                {selectedRecentSale?.sale_type === "WO" ? "Work Order Sale" : "PO Sale"}
                            </span>
                        </div>
                    </DialogHeader>

                    {selectedRecentSale && (
                        <div className="space-y-4 pt-2">
                            {/* Summary Header Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/40 p-3.5 rounded-lg border border-border/60 text-xs">
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Client</span>
                                    <span className="font-semibold text-foreground text-xs line-clamp-2 mt-0.5" title={selectedRecentSale.client_name}>
                                        {selectedRecentSale.client_name}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">{selectedRecentSale.sale_type === "WO" ? "WO Number" : "PO Number"}</span>
                                    <span className="font-semibold text-foreground font-mono text-xs mt-0.5 block">
                                        {selectedRecentSale.po_number || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Invoice Date</span>
                                    <span className="font-medium text-foreground text-xs mt-0.5 block">
                                        {selectedRecentSale.date ? fmtDate(selectedRecentSale.date) : "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Total Amount</span>
                                    <span className="font-bold text-primary text-sm mt-0.5 block">
                                        {inr(saleDetails?.grand_total ?? selectedRecentSale.price)}
                                    </span>
                                </div>
                            </div>

                            {/* Additional details grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-card p-3 rounded-lg border border-border/60">
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-medium">Payment Status</span>
                                    <span className="font-semibold mt-0.5 inline-block text-foreground">
                                        {saleDetails?.payment_status || selectedRecentSale.payment_status}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase font-medium">Delivery Status</span>
                                    <div className="mt-0.5">
                                        <StatusBadge status={saleDetails?.delivery_status || selectedRecentSale.delivery_status} />
                                    </div>
                                </div>
                                {saleDetails?.e_way_bill_no && (
                                    <div>
                                        <span className="text-muted-foreground block text-[10px] uppercase font-medium">e-Way Bill No.</span>
                                        <span className="font-mono font-medium text-foreground mt-0.5 block">
                                            {saleDetails.e_way_bill_no}
                                        </span>
                                    </div>
                                )}
                                {saleDetails?.dispatched_through && (
                                    <div>
                                        <span className="text-muted-foreground block text-[10px] uppercase font-medium">Dispatched Through</span>
                                        <span className="font-medium text-foreground mt-0.5 block">
                                            {saleDetails.dispatched_through}
                                        </span>
                                    </div>
                                )}
                                {saleDetails?.dispatch_from && (
                                    <div className="col-span-2 sm:col-span-3">
                                        <span className="text-muted-foreground block text-[10px] uppercase font-medium">Dispatch From</span>
                                        <span className="font-medium text-foreground mt-0.5 block">
                                            {saleDetails.dispatch_from}
                                        </span>
                                    </div>
                                )}
                                {saleDetails?.ship_to && (
                                    <div className="col-span-2 sm:col-span-3">
                                        <span className="text-muted-foreground block text-[10px] uppercase font-medium">Ship To</span>
                                        <span className="font-medium text-foreground mt-0.5 block">
                                            {saleDetails.ship_to}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Items Breakdown */}
                            <div className="rounded-lg border border-border overflow-hidden space-y-0">
                                <div className="bg-muted/60 px-3.5 py-2 border-b border-border flex items-center justify-between">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product & Items Breakdown</span>
                                    {loadingDetails && <span className="text-xs text-muted-foreground animate-pulse">Loading items...</span>}
                                </div>
                                
                                {loadingDetails ? (
                                    <div className="p-6 text-center text-xs text-muted-foreground">Loading bill details...</div>
                                ) : saleDetails?.items && saleDetails.items.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border">
                                                <tr>
                                                    <th className="p-2.5">Item</th>
                                                    <th className="p-2.5 text-center">Qty</th>
                                                    <th className="p-2.5 text-right">Rate</th>
                                                    <th className="p-2.5 text-right">GST</th>
                                                    <th className="p-2.5 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {saleDetails.items.map((it, idx) => (
                                                    <tr key={idx} className="border-b border-border/40 hover:bg-muted/10">
                                                        <td className="p-2.5 font-medium">{it.item}</td>
                                                        <td className="p-2.5 text-center">{it.quantity} {it.uom}</td>
                                                        <td className="p-2.5 text-right">{inr(it.unit_price)}</td>
                                                        <td className="p-2.5 text-right">{inr(it.gst_amount)} ({it.gst_rate}%)</td>
                                                        <td className="p-2.5 text-right font-semibold">{inr(it.total_amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-muted/30 font-medium">
                                                {saleDetails.subtotal != null && (
                                                    <tr>
                                                        <td colSpan="4" className="p-2 text-right text-muted-foreground">Subtotal:</td>
                                                        <td className="p-2 text-right font-medium">{inr(saleDetails.subtotal)}</td>
                                                    </tr>
                                                )}
                                                {saleDetails.gst_amount != null && (
                                                    <tr>
                                                        <td colSpan="4" className="p-2 text-right text-muted-foreground">GST Amount:</td>
                                                        <td className="p-2 text-right font-medium">{inr(saleDetails.gst_amount)}</td>
                                                    </tr>
                                                )}
                                                {Number(saleDetails.freight || 0) > 0 && (
                                                    <tr>
                                                        <td colSpan="4" className="p-2 text-right text-muted-foreground">Freight ({saleDetails.freight_gst_type || "Without GST"}):</td>
                                                        <td className="p-2 text-right font-medium">{inr(saleDetails.freight)}</td>
                                                    </tr>
                                                )}
                                                <tr className="bg-primary/5 text-primary font-bold text-sm border-t border-border">
                                                    <td colSpan="4" className="p-2.5 text-right">Grand Total:</td>
                                                    <td className="p-2.5 text-right">{inr(saleDetails.grand_total)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="p-4 text-xs text-foreground bg-card">
                                        <span className="font-semibold text-muted-foreground mr-1">Product:</span>
                                        {selectedRecentSale.product}
                                    </div>
                                )}
                            </div>

                            {/* Documents Section */}
                            {(saleDetails?.invoice_urls?.length > 0 || saleDetails?.e_way_bill_urls?.length > 0 || saleDetails?.delivery_challan_urls?.length > 0) && (
                                <div className="space-y-2 pt-2 border-t border-border">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attached Documents</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {saleDetails.invoice_urls?.map((url, i) => (
                                            <a
                                                key={`inv-${i}`}
                                                href={resolveFileUrl(url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 text-xs transition-colors"
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <FileText className="h-4 w-4 text-red-500 shrink-0" />
                                                    <span className="truncate font-medium">{url.split("/").pop()}</span>
                                                </div>
                                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                                            </a>
                                        ))}
                                        {saleDetails.e_way_bill_urls?.map((url, i) => (
                                            <a
                                                key={`eway-${i}`}
                                                href={resolveFileUrl(url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 text-xs transition-colors"
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                                                    <span className="truncate font-medium">e-Way Bill: {url.split("/").pop()}</span>
                                                </div>
                                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                                            </a>
                                        ))}
                                        {saleDetails.delivery_challan_urls?.map((url, i) => (
                                            <a
                                                key={`dc-${i}`}
                                                href={resolveFileUrl(url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 text-xs transition-colors"
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <FileText className="h-4 w-4 text-green-500 shrink-0" />
                                                    <span className="truncate font-medium">Challan: {url.split("/").pop()}</span>
                                                </div>
                                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Dispatches History */}
                            {saleDetails?.dispatches && saleDetails.dispatches.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-border">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Dispatch History ({saleDetails.dispatches.length})
                                    </p>
                                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                                        {saleDetails.dispatches.map((d, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs border border-border/50">
                                                <div>
                                                    <span className="font-semibold text-foreground mr-2">Dispatch #{i + 1}</span>
                                                    <span className="text-muted-foreground">{d.dispatched_at ? fmtDate(d.dispatched_at) : "—"}</span>
                                                    {d.invoice_number && <span className="ml-2 font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">{d.invoice_number}</span>}
                                                </div>
                                                <div className="font-semibold text-foreground">
                                                    {d.quantity} {d.uom || "Nos"} ({inr(d.amount)})
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                                if (selectedRecentSale?.sale_type === "WO") {
                                    navigate("/work-order-sales");
                                } else {
                                    navigate("/sales-invoice");
                                }
                            }}
                        >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Open in {selectedRecentSale?.sale_type === "WO" ? "Work Order Sales" : "Sales Module"}
                        </Button>
                        <Button variant="default" size="sm" className="text-xs" onClick={() => setSelectedRecentSale(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Dashboard;
