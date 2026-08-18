import { Fragment, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchProductPendingReport, exportProductPendingReport, openLogStream } from "@/lib/api";
import { round2, inr } from "@/lib/format";
import { toast } from "sonner";
import {
    Boxes, ChevronRight, ClipboardList, Download, IndianRupee, Package, RefreshCw, Users,
} from "lucide-react";

const POLL_INTERVAL_MS = 45_000;
const RELEVANT_ENTITY_TYPES = new Set(["PurchaseOrder", "Sale"]);

const StatCard = ({ icon: Icon, label, value, subtext, accent }) => (
    <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow border-border/60 bg-white">
        <div className="flex items-start justify-between">
            <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="text-2xl font-bold text-slate-800 tracking-tight">{value}</div>
                {subtext && <div className="text-xs text-muted-foreground font-medium">{subtext}</div>}
            </div>
            <div className={`h-11 w-11 rounded-xl grid place-items-center ${accent ?? "bg-primary/10 text-primary"}`}>
                <Icon className="h-5 w-5" />
            </div>
        </div>
    </Card>
);

const fmtQty = (val) => {
    return new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(val) || 0);
};

const OverviewReport = () => {
    const qc = useQueryClient();
    
    // Dropdown filters state
    const [filterProduct, setFilterProduct] = useState("all");
    const [filterClient, setFilterClient] = useState("all");
    const [filterPOStatus, setFilterPOStatus] = useState("Pending");

    // Applied filters state (only used for fetch)
    const [appliedProduct, setAppliedProduct] = useState("all");
    const [appliedClient, setAppliedClient] = useState("all");
    const [appliedPOStatus, setAppliedPOStatus] = useState("Pending");

    const [expandedProducts, setExpandedProducts] = useState(new Set());
    const [expandedClients, setExpandedClients] = useState(new Set());
    const [exporting, setExporting] = useState(false);

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ["productPendingReport", appliedProduct, appliedClient, appliedPOStatus],
        queryFn: () => fetchProductPendingReport({
            product: appliedProduct,
            client: appliedClient,
            po_status: appliedPOStatus,
        }),
        refetchInterval: POLL_INTERVAL_MS,
        refetchOnWindowFocus: true,
    });

    // SSE activity listener to trigger automatic refetch on PO or Sale changes
    useEffect(() => {
        const es = openLogStream((log) => {
            if (RELEVANT_ENTITY_TYPES.has(log.entity_type)) {
                qc.invalidateQueries({ queryKey: ["productPendingReport"] });
            }
        });
        return () => es.close();
    }, [qc]);

    const handleApplyFilter = () => {
        setAppliedProduct(filterProduct);
        setAppliedClient(filterClient);
        setAppliedPOStatus(filterPOStatus);
        setExpandedProducts(new Set());
        setExpandedClients(new Set());
    };

    const handleResetFilter = () => {
        setFilterProduct("all");
        setFilterClient("all");
        setFilterPOStatus("Pending");
        setAppliedProduct("all");
        setAppliedClient("all");
        setAppliedPOStatus("Pending");
        setExpandedProducts(new Set());
        setExpandedClients(new Set());
    };

    const handleExport = async () => {
        setExporting(true);
        const tid = toast.loading("Generating Excel report...");
        try {
            await exportProductPendingReport({
                product: appliedProduct,
                client: appliedClient,
                po_status: appliedPOStatus,
            });
            toast.success("Excel report exported successfully!", { id: tid });
        } catch (err) {
            toast.error("Export failed: " + err.message, { id: tid });
        } finally {
            setExporting(false);
        }
    };

    const toggleProduct = (prodLabel) => {
        setExpandedProducts((prev) => {
            const next = new Set(prev);
            if (next.has(prodLabel)) {
                next.delete(prodLabel);
            } else {
                next.add(prodLabel);
            }
            return next;
        });
    };

    const toggleClient = (prodLabel, clientKey) => {
        const key = `${prodLabel}::${clientKey}`;
        setExpandedClients((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const getProductPORows = (product) => {
        const rows = [];
        product.clients.forEach((client) => {
            client.pos.forEach((po) => {
                rows.push({
                    client_name: client.client_name,
                    client_key: client.client_key,
                    po_number: po.po_number,
                    po_date: po.po_date,
                    ordered_qty: po.ordered_qty,
                    dispatched_qty: po.dispatched_qty,
                    pending_qty: po.pending_qty,
                    rate: po.rate,
                    pending_value: po.pending_value,
                });
            });
        });
        return rows;
    };

    const summary = data?.summary ?? {
        total_pending_qty: 0,
        total_pending_value: 0,
        total_products: 0,
        total_clients: 0,
    };

    const products = data?.products ?? [];

    // Calculate totals for table footer
    const overallTotals = products.reduce((acc, p) => {
        acc.ordered += p.total_ordered_qty;
        acc.dispatched += p.total_dispatched_qty;
        acc.pending += p.pending_qty;
        acc.value += p.pending_value;
        return acc;
    }, { ordered: 0, dispatched: 0, pending: 0, value: 0 });

    return (
        <div className="space-y-6">
            {/* Header / Export Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-border shadow-sm">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Product-wise Pending Analysis</h3>
                    <p className="text-xs text-muted-foreground">Product / Diameter wise pending quantity and value with client breakup.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="h-9"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={exporting}
                        className="h-9 border-green-500 text-green-700 hover:bg-green-50 hover:text-green-800"
                    >
                        <Download className="h-3.5 w-3.5 mr-2" /> Export
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card className="p-5 shadow-card border-border/60 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Product / Diameter</label>
                        <Select value={filterProduct} onValueChange={setFilterProduct}>
                            <SelectTrigger className="w-full bg-white border-slate-200 text-slate-700 h-10">
                                <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px] bg-white">
                                <SelectItem value="all">All</SelectItem>
                                {data?.product_labels?.filter(lbl => lbl !== "All").map((lbl) => (
                                    <SelectItem key={lbl} value={lbl.toLowerCase()}>
                                        {lbl}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Client Name</label>
                        <Select value={filterClient} onValueChange={setFilterClient}>
                            <SelectTrigger className="w-full bg-white border-slate-200 text-slate-700 h-10">
                                <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px] bg-white">
                                <SelectItem value="all">All</SelectItem>
                                {data?.client_names?.filter(name => name !== "All").map((name) => (
                                    <SelectItem key={name} value={name}>
                                        {name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">PO Status</label>
                        <Select value={filterPOStatus} onValueChange={setFilterPOStatus}>
                            <SelectTrigger className="w-full bg-white border-slate-200 text-slate-700 h-10">
                                <SelectValue placeholder="Pending" />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                                <SelectItem value="All">All</SelectItem>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="Completed">Completed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2 sm:col-span-2 md:col-span-2 h-10 self-end">
                        <Button onClick={handleApplyFilter} className="flex-1 bg-[#0F172A] text-white hover:bg-slate-800 h-10">
                            Apply Filter
                        </Button>
                        <Button onClick={handleResetFilter} variant="outline" className="flex-1 border-slate-200 text-slate-700 hover:bg-slate-50 h-10">
                            Reset
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Package} label="Total Pending Qty" value={fmtQty(summary.total_pending_qty)} subtext="Nos" accent="bg-blue-500/10 text-blue-600" />
                <StatCard icon={IndianRupee} label="Total pending payment ( without GST)" value={inr(summary.total_pending_value)} subtext="In INR" accent="bg-green-500/10 text-green-600" />
                <StatCard icon={Boxes} label="Total Products" value={String(summary.total_products)} subtext="Different Diameters" accent="bg-purple-500/10 text-purple-600" />
                <StatCard icon={Users} label="Total Clients" value={String(summary.total_clients)} subtext="With Pending Orders" accent="bg-amber-500/10 text-amber-600" />
            </div>

            {/* Main Table */}
            <Card className="shadow-card overflow-hidden bg-white border-border/60">
                <div className="bg-[#0B1E3F] text-white px-4 py-3 font-bold flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    PRODUCT-WISE SUMMARY
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50/70 border-b border-border text-slate-600 font-semibold uppercase text-xs">
                            <tr>
                                <th className="py-3 px-4 text-left w-14">S.No.</th>
                                <th className="py-3 px-4 text-left">Product / Diameter</th>
                                <th className="py-3 px-4 text-right">Total Ordered Qty</th>
                                <th className="py-3 px-4 text-right">Total Dispatched Qty</th>
                                <th className="py-3 px-4 text-right text-orange-600">Pending Qty</th>
                                <th className="py-3 px-4 text-right text-green-600">Pending Value (without GST) (₹)</th>
                                <th className="py-3 px-4 text-center w-28">Clients</th>
                                <th className="py-3 px-4 text-center w-36">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && (
                                <tr>
                                    <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                                        Loading product-wise pending details...
                                    </td>
                                </tr>
                            )}
                            {!isLoading && products.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                                        No pending analysis data found.
                                    </td>
                                </tr>
                            )}
                            {!isLoading && products.map((p, pIdx) => {
                                const isProductExpanded = expandedProducts.has(p.product_label);
                                return (
                                    <Fragment key={p.product_label}>
                                        <tr className={`border-b border-border transition-colors hover:bg-slate-50/50 ${isProductExpanded ? "bg-slate-50/30" : ""}`}>
                                            <td className="py-3 px-4 text-slate-400 font-medium">{pIdx + 1}</td>
                                            <td className="py-3 px-4 font-semibold text-slate-800 cursor-pointer hover:underline" onClick={() => toggleProduct(p.product_label)}>
                                                <div className="flex items-center gap-2">
                                                    <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform shrink-0 ${isProductExpanded ? "rotate-90" : ""}`} />
                                                    <span>{p.product_label}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right font-medium text-slate-700">{fmtQty(p.total_ordered_qty)}</td>
                                            <td className="py-3 px-4 text-right text-slate-700 font-medium">{fmtQty(p.total_dispatched_qty)}</td>
                                            <td className="py-3 px-4 text-right text-orange-600 font-bold">{fmtQty(p.pending_qty)}</td>
                                            <td className="py-3 px-4 text-right text-green-600 font-bold">{inr(p.pending_value)}</td>
                                            <td className="py-3 px-4 text-center font-semibold text-slate-600">{p.client_count}</td>
                                            <td className="py-3 px-4 text-center">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-3 text-xs border-slate-200 text-slate-700 hover:bg-slate-100"
                                                    onClick={() => toggleProduct(p.product_label)}
                                                >
                                                    {isProductExpanded ? "Hide Details" : "View Details"}
                                                </Button>
                                            </td>
                                        </tr>
                                        {isProductExpanded && (
                                            <tr className="bg-slate-50/20">
                                                <td colSpan={8} className="py-3 px-4 border-b border-border/60">
                                                    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-4 max-w-7xl mx-auto animate-in fade-in duration-200">
                                                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2 bg-slate-50/50 p-2.5 rounded-t-lg">
                                                            <h4 className="text-sm font-bold text-slate-800 max-w-full md:max-w-3xl break-words flex items-center gap-1.5">
                                                                <span className="text-slate-500 text-[10px]">▼</span> {p.product_label.toUpperCase()} - CLIENT WISE PENDING DETAILS
                                                            </h4>
                                                            <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600 shrink-0">
                                                                <span>Pending Qty: <strong className="text-orange-600">{fmtQty(p.pending_qty)}</strong></span>
                                                                <span className="text-slate-300">|</span>
                                                                <span>Pending Value (without GST): <strong className="text-green-600">{inr(p.pending_value)}</strong></span>
                                                            </div>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-slate-100/85 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                                                    <tr>
                                                                        <th className="py-2.5 px-3 text-left w-14">S.No.</th>
                                                                        <th className="py-2.5 px-3 text-left">Client Name</th>
                                                                        <th className="py-2.5 px-3 text-right">Total Ordered Qty</th>
                                                                        <th className="py-2.5 px-3 text-right">Total Dispatched Qty</th>
                                                                        <th className="py-2.5 px-3 text-right text-orange-600">Pending Qty</th>
                                                                        <th className="py-2.5 px-3 text-right text-green-600">Pending Value (without GST) (₹)</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {p.clients.map((c, cIdx) => {
                                                                        const isClientExpanded = expandedClients.has(`${p.product_label}::${c.client_key}`);
                                                                        return (
                                                                            <Fragment key={c.client_key}>
                                                                                <tr className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
                                                                                    <td className="py-2.5 px-3 text-slate-400 font-medium">{cIdx + 1}</td>
                                                                                    <td
                                                                                        className="py-2.5 px-3 font-semibold text-blue-600 cursor-pointer hover:underline flex items-center gap-1"
                                                                                        onClick={() => toggleClient(p.product_label, c.client_key)}
                                                                                    >
                                                                                        <ChevronRight className={`h-3.5 w-3.5 text-blue-600 transition-transform shrink-0 ${isClientExpanded ? "rotate-90" : ""}`} />
                                                                                        {c.client_name}
                                                                                    </td>
                                                                                    <td className="py-2.5 px-3 text-right font-medium text-slate-700">{fmtQty(c.total_ordered_qty)}</td>
                                                                                    <td className="py-2.5 px-3 text-right text-slate-700 font-medium">{fmtQty(c.total_dispatched_qty)}</td>
                                                                                    <td className="py-2.5 px-3 text-right text-orange-600 font-bold">{fmtQty(c.pending_qty)}</td>
                                                                                    <td className="py-2.5 px-3 text-right text-green-600 font-bold">{inr(c.pending_value)}</td>
                                                                                </tr>
                                                                                {isClientExpanded && (
                                                                                    <tr className="bg-slate-50/30">
                                                                                        <td colSpan={6} className="py-3 px-6">
                                                                                            <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2 shadow-sm animate-in fade-in duration-200">
                                                                                                <table className="w-full text-xs">
                                                                                                    <thead className="bg-slate-100/70 text-slate-500 font-semibold uppercase tracking-wider text-[9px] border-b border-slate-200">
                                                                                                        <tr>
                                                                                                            <th className="py-2 px-2 text-left">PO No.</th>
                                                                                                            <th className="py-2 px-2 text-left">PO Date</th>
                                                                                                            <th className="py-2 px-2 text-right">Total Ordered Qty</th>
                                                                                                            <th className="py-2 px-2 text-right">Dispatched Qty</th>
                                                                                                            <th className="py-2 px-2 text-right text-orange-600">Pending Qty</th>
                                                                                                            <th className="py-2 px-2 text-right">Rate (₹)</th>
                                                                                                            <th className="py-2 px-2 text-right text-green-600">Pending Value (₹)</th>
                                                                                                        </tr>
                                                                                                    </thead>
                                                                                                    <tbody>
                                                                                                        {c.pos.map((po, poIdx) => (
                                                                                                            <tr key={poIdx} className="border-b border-slate-100 hover:bg-slate-50/30">
                                                                                                                <td className="py-2 px-2 font-medium text-slate-700">{po.po_number}</td>
                                                                                                                <td className="py-2 px-2 text-slate-400 font-medium">{po.po_date || "—"}</td>
                                                                                                                <td className="py-2 px-2 text-right text-slate-600">{fmtQty(po.ordered_qty)}</td>
                                                                                                                <td className="py-2 px-2 text-right text-slate-600">{fmtQty(po.dispatched_qty)}</td>
                                                                                                                <td className="py-2 px-2 text-right text-orange-600 font-medium">{fmtQty(po.pending_qty)}</td>
                                                                                                                <td className="py-2 px-2 text-right text-slate-500 font-medium">{round2(po.rate).toFixed(2)}</td>
                                                                                                                <td className="py-2 px-2 text-right text-green-600 font-semibold">{inr(po.pending_value)}</td>
                                                                                                            </tr>
                                                                                                        ))}
                                                                                                        <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-700">
                                                                                                            <td className="py-2 px-2 text-slate-800" colSpan={2}>Client Total</td>
                                                                                                            <td className="py-2 px-2 text-right">{fmtQty(c.total_ordered_qty)}</td>
                                                                                                            <td className="py-2 px-2 text-right">{fmtQty(c.total_dispatched_qty)}</td>
                                                                                                            <td className="py-2 px-2 text-right text-orange-600">{fmtQty(c.pending_qty)}</td>
                                                                                                            <td className="py-2 px-2"></td>
                                                                                                            <td className="py-2 px-2 text-right text-green-600">{inr(c.pending_value)}</td>
                                                                                                        </tr>
                                                                                                    </tbody>
                                                                                                </table>
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                )}
                                                                            </Fragment>
                                                                        );
                                                                    })}
                                                                    <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-700">
                                                                        <td className="py-2.5 px-3 text-slate-800" colSpan={2}>
                                                                            TOTAL ({p.product_label.toUpperCase()})
                                                                        </td>
                                                                        <td className="py-2.5 px-3 text-right">{fmtQty(p.total_ordered_qty)}</td>
                                                                        <td className="py-2.5 px-3 text-right">{fmtQty(p.total_dispatched_qty)}</td>
                                                                        <td className="py-2.5 px-3 text-right text-orange-600">{fmtQty(p.pending_qty)}</td>
                                                                        <td className="py-2.5 px-3 text-right text-green-600" colSpan={2}>{inr(p.pending_value)}</td>
                                                                    </tr>
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                        {!isLoading && products.length > 0 && (
                            <tfoot>
                                <tr className="bg-blue-50/80 font-bold border-t border-slate-300 text-slate-800">
                                    <td className="py-3.5 px-4" colSpan={2}>TOTAL</td>
                                    <td className="py-3.5 px-4 text-right">{fmtQty(overallTotals.ordered)}</td>
                                    <td className="py-3.5 px-4 text-right">{fmtQty(overallTotals.dispatched)}</td>
                                    <td className="py-3.5 px-4 text-right text-orange-600">{fmtQty(overallTotals.pending)}</td>
                                    <td className="py-3.5 px-4 text-right text-green-600">{inr(overallTotals.value)}</td>
                                    <td className="py-3.5 px-4 text-center text-slate-600">{summary.total_clients}</td>
                                    <td className="py-3.5 px-4"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default OverviewReport;
