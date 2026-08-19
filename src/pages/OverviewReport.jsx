import { Fragment, useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchProductPendingReport, exportProductPendingReport, openLogStream, fetchItemMasterList } from "@/lib/api";
import { round2, inr } from "@/lib/format";
import { toast } from "sonner";
import {
    Boxes, ChevronRight, ClipboardList, Download, IndianRupee, Package, RefreshCw, Users, Search,
} from "lucide-react";

const POLL_INTERVAL_MS = 45_000;
const RELEVANT_ENTITY_TYPES = new Set(["PurchaseOrder", "Sale"]);

const StatCard = ({ icon: Icon, label, value, subtext, accent, onClick }) => (
    <Card 
        className={`p-5 shadow-card hover:shadow-elegant transition-shadow border-border/60 bg-white ${onClick ? "cursor-pointer" : ""}`}
        onClick={onClick}
    >
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
    const navigate = useNavigate();
    const qc = useQueryClient();

    // Left sidebar selection
    const [selectedCategory, setSelectedCategory] = useState(null);

    const { data: itemMasterList = [] } = useQuery({
        queryKey: ["item-master", "PO"],
        queryFn: () => fetchItemMasterList("PO"),
    });

    
    // Dropdown filters state
    const [filterProduct, setFilterProduct] = useState("all");
    const [filterClient, setFilterClient] = useState("all");
    const [filterPOStatus, setFilterPOStatus] = useState("All");

    // Applied filters state (only used for fetch)
    const [appliedProduct, setAppliedProduct] = useState("all");
    const [appliedClient, setAppliedClient] = useState("all");
    const [appliedPOStatus, setAppliedPOStatus] = useState("All");

    const [expandedProducts, setExpandedProducts] = useState(new Set());
    const [expandedClients, setExpandedClients] = useState(new Set());
    const [exporting, setExporting] = useState(false);
    const [productsDialogOpen, setProductsDialogOpen] = useState(false);
    const [productSearch, setProductSearch] = useState("");

    const [clientsDialogOpen, setClientsDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState("");
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
        setFilterPOStatus("All");
        setAppliedProduct("all");
        setAppliedClient("all");
        setAppliedPOStatus("All");
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

    const filteredProducts = useMemo(() => {
        if (!selectedCategory) return [];
        return products.filter(p => p.product_label === selectedCategory || p.product_label.startsWith(`${selectedCategory} `));
    }, [products, selectedCategory]);

    const activeSummary = useMemo(() => {
        if (!selectedCategory) return null;
        
        const totOrdered = filteredProducts.reduce((sum, p) => sum + p.total_ordered_qty, 0);
        const totDispatched = filteredProducts.reduce((sum, p) => sum + p.total_dispatched_qty, 0);
        const totPending = filteredProducts.reduce((sum, p) => sum + p.pending_qty, 0);
        const totValue = filteredProducts.reduce((sum, p) => sum + p.pending_value, 0);
        
        const clientSet = new Set();
        filteredProducts.forEach(p => {
            p.clients.forEach(c => clientSet.add(c.client_key));
        });

        return {
            total_pending_qty: totPending,
            total_pending_value: totValue,
            total_products: filteredProducts.length,
            total_clients: clientSet.size,
            total_ordered: totOrdered,
            total_dispatched: totDispatched
        };
    }, [filteredProducts, selectedCategory]);

    const displayProducts = selectedCategory ? filteredProducts : [];
    const displaySummary = selectedCategory ? activeSummary : summary;


    const activeProductNames = useMemo(() => {
        return displayProducts.map((p) => p.product_label).sort((a, b) => a.localeCompare(b));
    }, [displayProducts]);

    const activeClientNames = useMemo(() => {
        const names = new Set();
        displayProducts.forEach((p) => {
            p.clients.forEach((c) => {
                if (c.client_name) {
                    names.add(c.client_name);
                }
            });
        });
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [displayProducts]);

    const filteredProductNames = useMemo(() => {
        const s = productSearch.trim().toLowerCase();
        return s ? activeProductNames.filter((name) => name.toLowerCase().includes(s)) : activeProductNames;
    }, [activeProductNames, productSearch]);

    const filteredClientNames = useMemo(() => {
        const s = clientSearch.trim().toLowerCase();
        return s ? activeClientNames.filter((name) => name.toLowerCase().includes(s)) : activeClientNames;
    }, [activeClientNames, clientSearch]);

    // Calculate totals for table footer
    const overallTotals = displayProducts.reduce((acc, p) => {
        acc.ordered += p.total_ordered_qty;
        acc.dispatched += p.total_dispatched_qty;
        acc.pending += p.pending_qty;
        acc.value += p.pending_value;
        return acc;
    }, { ordered: 0, dispatched: 0, pending: 0, value: 0 });

    return (
        <div className="flex flex-col md:flex-row gap-6 items-start h-[calc(100vh-6rem)]">
            {/* Left Sidebar */}
            <Card className="w-full md:w-80 shrink-0 shadow-card border-border/60 bg-white overflow-hidden flex flex-col h-full sticky top-24">
                <div className="bg-[#8B0000] text-white px-4 py-3 font-bold flex items-center gap-2 shrink-0">
                    <Boxes className="h-5 w-5" />
                    ITEM CATEGORIES
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    {itemMasterList.map((item) => {
                        const isSelected = selectedCategory === item.name;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setSelectedCategory(item.name);
                                    // Reset active product expansion when switching categories
                                    setExpandedProducts(new Set());
                                    setExpandedClients(new Set());
                                }}
                                className={`w-full text-left px-3 py-2.5 rounded-md text-sm font-semibold flex items-center justify-between transition-colors ${isSelected ? "bg-[#8B0000] text-white" : "text-slate-700 hover:bg-slate-100"}`}
                            >
                                <span className="truncate pr-2">{item.name}</span>
                                <span className={`text-[10px] whitespace-nowrap ${isSelected ? "text-red-200" : "text-slate-400"}`}>
                                    {item.sizes?.length || 0} sizes
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* Main Content */}
            <div className="flex-1 min-w-0 h-full overflow-y-auto pr-2 pb-12">
                {!selectedCategory ? (
                    <Card className="p-12 shadow-card border-border/60 bg-white flex flex-col items-center justify-center text-center text-muted-foreground h-full min-h-[400px]">
                        <Boxes className="h-16 w-16 mb-4 text-slate-200" />
                        <h3 className="text-xl font-bold text-slate-700 mb-2">Select an Item Category</h3>
                        <p className="text-sm">Please select an item from the left navigation to view its product-wise pending details.</p>
                    </Card>
                ) : (
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
                <StatCard icon={Package} label="Total Pending Qty" value={fmtQty(displaySummary.total_pending_qty)} subtext="Nos" accent="bg-blue-500/10 text-blue-600" />
                <StatCard icon={IndianRupee} label="Total pending payment ( without GST)" value={inr(displaySummary.total_pending_value)} subtext="In INR" accent="bg-green-500/10 text-green-600" />
                <StatCard icon={Boxes} label="Total Products" value={String(displaySummary.total_products)} subtext="Different Diameters" accent="bg-purple-500/10 text-purple-600" onClick={() => { setProductSearch(""); setProductsDialogOpen(true); }} />
                <StatCard icon={Users} label="Total Clients" value={String(displaySummary.total_clients)} subtext="With Pending Orders" accent="bg-amber-500/10 text-amber-600" onClick={() => { setClientSearch(""); setClientsDialogOpen(true); }} />
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
                            {!isLoading && displayProducts.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                                        No pending analysis data found.
                                    </td>
                                </tr>
                            )}
                            {!isLoading && displayProducts.map((p, pIdx) => {
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
                                                                                                                <td
                                                                                                                    className="py-2 px-2 font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                                                                                                    onClick={() => navigate(`/purchase-orders?search=${encodeURIComponent(po.po_number)}`)}
                                                                                                                >
                                                                                                                    {po.po_number}
                                                                                                                </td>
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
                        {!isLoading && displayProducts.length > 0 && (
                            <tfoot>
                                <tr className="bg-blue-50/80 font-bold border-t border-slate-300 text-slate-800">
                                    <td className="py-3.5 px-4" colSpan={2}>TOTAL</td>
                                    <td className="py-3.5 px-4 text-right">{fmtQty(overallTotals.ordered)}</td>
                                    <td className="py-3.5 px-4 text-right">{fmtQty(overallTotals.dispatched)}</td>
                                    <td className="py-3.5 px-4 text-right text-orange-600">{fmtQty(overallTotals.pending)}</td>
                                    <td className="py-3.5 px-4 text-right text-green-600">{inr(overallTotals.value)}</td>
                                    <td className="py-3.5 px-4 text-center text-slate-600">{displaySummary.total_clients}</td>
                                    <td className="py-3.5 px-4"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>

            {/* Products List Dialog */}
            <Dialog open={productsDialogOpen} onOpenChange={setProductsDialogOpen}>
                <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Products ({(activeProductNames || []).length})</DialogTitle>
                    </DialogHeader>
                    <div className="relative my-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                    </div>
                    <div className="overflow-y-auto -mx-1 px-1 space-y-1 flex-1 min-h-[200px]">
                        {filteredProductNames.map((name, idx) => (
                            <div key={name} className="px-3 py-2 rounded-md text-sm text-foreground bg-muted/40 hover:bg-muted/60 transition-colors flex items-center">
                                <span className="text-slate-400 font-semibold mr-3 text-xs w-6 shrink-0">{idx + 1}.</span>
                                <span className="truncate">{name}</span>
                            </div>
                        ))}
                        {filteredProductNames.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">No products found.</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Clients List Dialog */}
            <Dialog open={clientsDialogOpen} onOpenChange={setClientsDialogOpen}>
                <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Clients ({(activeClientNames || []).length})</DialogTitle>
                    </DialogHeader>
                    <div className="relative my-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Search clients..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
                    </div>
                    <div className="overflow-y-auto -mx-1 px-1 space-y-1 flex-1 min-h-[200px]">
                        {filteredClientNames.map((name, idx) => (
                            <div key={name} className="px-3 py-2 rounded-md text-sm text-foreground bg-muted/40 hover:bg-muted/60 transition-colors flex items-center">
                                <span className="text-slate-400 font-semibold mr-3 text-xs w-6 shrink-0">{idx + 1}.</span>
                                <span className="truncate">{name}</span>
                            </div>
                        ))}
                        {filteredClientNames.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">No clients found.</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OverviewReport;
