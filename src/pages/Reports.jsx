import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConstants } from "@/lib/constants";
import { fetchReport, fetchFulfillmentReport, fetchPendingPOs, fetchPOFulfillmentSummary, openPODocument, exportCombinedReport, importCombinedReport } from "@/lib/api";
import { inr, fmtDate, round2 } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentUser } from "@/lib/currentUser";
import { toast } from "sonner";
import { Download, Upload, IndianRupee, Package, TrendingUp, ClipboardList, BarChart3, Clock, FileText, UploadCloud, Printer, CheckCircle2, LayoutDashboard } from "lucide-react";
import { useSortableRows } from "@/hooks/useSortableRows";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { useColumnFilters } from "@/hooks/useColumnFilters";
import { SortableHeader } from "@/components/SortableHeader";
import { FilterableHeader } from "@/components/FilterableHeader";
import { StickyScrollArea } from "@/components/StickyScrollArea";
import WorkOrderReport from "@/pages/WorkOrderReport";
import OverviewReport from "@/pages/OverviewReport";

// Guards footer quantity totals against floating-point drift from repeated
// addition (e.g. 0.1 + 0.2 producing 0.30000000000000004).
const roundQty = round2;

// Pill-style UOM filter tab — active uses the app's primary brand color
// (theme token, so it stays correct in dark mode too); inactive is a plain
// card surface with a subtle border. Scale + shadow give a tactile
// hover/press feel without introducing any new colors outside the theme.
const pillTabClass =
    "rounded-full px-5 py-2.5 text-[15px] font-semibold border transition-all duration-200 ease-in-out " +
    "hover:scale-[1.03] active:scale-[0.97] " +
    "data-[state=inactive]:bg-card data-[state=inactive]:text-foreground data-[state=inactive]:border-border " +
    "data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-muted/50 " +
    "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md";

const SALES_WIDTHS = { sno: 56, date: 100, invoice_number: 130, po_number: 130, subtotal: 110, gst_amount: 110, price: 120, payment_status: 100 };
const PENDING_WIDTHS = { sno: 56, date: 100, invoice_number: 140, po_number: 130, client_name: 140, project: 120, item: 160, total_qty: 100, delivered_qty: 100, pending_qty: 100, delivered_payment: 130, pending_total: 130, status: 110 };
const COMPLETED_WIDTHS = { sno: 56, date: 100, client_name: 140, project: 120, po_number: 130, item: 160, total_required: 110, delivered: 110 };

// Column accessors shared by sorting and the Excel-style filter checklists —
// each returns the same value the column sorts by, so "Sort A to Z" and the
// filter's distinct-value list always agree with each other.
const CompletedColumnAccessors = {
    date: (r) => r.date,
    client_name: (r) => r.client_name,
    project: (r) => r.project,
    po_number: (r) => r.po_number,
    item: (r) => r.item,
    total_required: (r) => r.total_required,
    delivered: (r) => r.delivered,
};
const SalesColumnAccessors = {
    date: (r) => r.date,
    invoice_number: (r) => r.invoice_number,
    po_number: (r) => r.po_number,
    subtotal: (r) => r.subtotal,
    gst_amount: (r) => r.gst_amount,
    price: (r) => r.price,
    payment_status: (r) => r.payment_status,
};
const PendingColumnAccessors = {
    date: (r) => r.date,
    invoice_number: (r) => r.invoice_number,
    po_number: (r) => r.po_number,
    client_name: (r) => r.client_name,
    project: (r) => r.project,
    item: (r) => r.item,
    total_qty: (r) => r.total_qty,
    delivered_qty: (r) => r.delivered_qty,
    pending_qty: (r) => r.pending_qty,
    delivered_payment: (r) => r.delivered_payment,
    pending_total: (r) => r.pending_total,
    status: (r) => r.status,
};

const applyColumnFilters = (rows, filters, accessors) => {
    const keys = Object.keys(filters);
    if (keys.length === 0) return rows;
    return rows.filter((r) =>
        keys.every((k) => {
            const v = accessors[k](r);
            return filters[k].has(v == null || v === "" ? "—" : String(v));
        })
    );
};

const SHEET_OPTIONS = [
    { id: "completed",   label: "Completed PO Report", desc: "Purchase orders that are fully delivered" },
    { id: "sales",       label: "Sales Report",       desc: "Invoice records with payment status" },
    { id: "pending-pos", label: "Pending POs Report", desc: "Open purchase orders with pending values" },
];

const Reports = () => {
    const qc = useQueryClient();
    const { products } = useConstants();
    const [searchParams] = useSearchParams();
    const [reportSection, setReportSection] = useState("po");
    const initialTab = searchParams.get("tab");
    const [tab, setTab] = useState(
        ["completed", "sales", "pending"].includes(initialTab) ? initialTab : "sales"
    );
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [product, setProduct] = useState("all");
    const [client, setClient] = useState("all");
    const [pendingUomTab, setPendingUomTab] = useState("all");
    const [completedUomTab, setCompletedUomTab] = useState("all");

    // ── Combined export dialog ────────────────────────────────────────────────
    const [exportOpen, setExportOpen] = useState(false);
    const [exportSheets, setExportSheets] = useState(["completed", "sales", "pending-pos"]);
    const [exportFrom, setExportFrom] = useState("");
    const [exportTo, setExportTo] = useState("");
    const [exporting, setExporting] = useState(false);

    const toggleSheet = (id, checked) =>
        setExportSheets(prev => checked ? [...prev, id] : prev.filter(s => s !== id));

    const handleCombinedExport = async () => {
        if (exportSheets.length === 0) return toast.error("Select at least one report section");
        setExporting(true);
        const tid = toast.loading("Preparing combined Excel export…");
        try {
            const params = {};
            if (exportFrom) params.from_date = new Date(exportFrom).toISOString();
            if (exportTo)   params.to_date   = new Date(exportTo).toISOString();
            await exportCombinedReport(exportSheets, params);
            toast.success(
                `Exported ${exportSheets.length} sheet${exportSheets.length > 1 ? "s" : ""} to Excel`,
                { id: tid }
            );
            setExportOpen(false);
        } catch (err) {
            toast.error("Export failed: " + err.message, { id: tid });
        } finally {
            setExporting(false);
        }
    };

    // ── Combined import dialog ────────────────────────────────────────────────
    const [importOpen, setImportOpen] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importConflict, setImportConflict] = useState("skip");
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const importFileRef = useRef(null);

    const openImport = () => {
        setImportFile(null);
        setImportResult(null);
        setImportOpen(true);
    };

    const handleImport = async () => {
        if (!importFile) return toast.error("Please select an Excel (.xlsx) file");
        setImporting(true);
        const tid = toast.loading("Importing…");
        try {
            const result = await importCombinedReport(importFile, importConflict, getCurrentUser());
            setImportResult(result);
            toast.success(
                `Import done — Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`,
                { id: tid, duration: 6000 }
            );
            qc.invalidateQueries({ queryKey: ["report"] });
            qc.invalidateQueries({ queryKey: ["fulfillmentReport"] });
            qc.invalidateQueries({ queryKey: ["pendingPOsReport"] });
            qc.invalidateQueries({ queryKey: ["purchase-orders"] });
            qc.invalidateQueries({ queryKey: ["sales"] });
        } catch (err) {
            toast.error("Import failed: " + err.message, { id: tid });
        } finally {
            setImporting(false);
        }
    };

    // ── Query params ──────────────────────────────────────────────────────────
    const salesParams = {
        from_date: from ? new Date(from).toISOString() : undefined,
        to_date:   to   ? new Date(to).toISOString()   : undefined,
        product:   product !== "all" ? product : undefined,
        client:    client  !== "all" ? client  : undefined,
    };
    const { data: salesData,       isLoading: salesLoading }       = useQuery({ queryKey: ["report", salesParams],            queryFn: () => fetchReport(salesParams),          enabled: tab === "sales" });

    // Footer totals: summed straight from the exact rows the table below
    // renders (search/date-filter, then Excel-style column-filter) — so they
    // always match what's on screen. No separate query, no cache; this
    // recomputes on every render, which means it automatically reflects any
    // add/edit/delete/filter/search change.
    const salesRows = salesData?.rows ?? [];
    const { filters: salesFilters, setFilter: setSalesFilter } = useColumnFilters();
    const salesFilteredRows = applyColumnFilters(salesRows, salesFilters, SalesColumnAccessors);
    const salesTotals = {
        subtotal: salesFilteredRows.reduce((s, r) => s + (r.subtotal ?? 0), 0),
        gst: salesFilteredRows.reduce((s, r) => s + (r.gst_amount ?? 0), 0),
        grandTotal: salesFilteredRows.reduce((s, r) => s + (r.price ?? 0), 0),
    };
    const { data: pendingData,     isLoading: pendingLoading }     = useQuery({ queryKey: ["pendingPOsReport"],                queryFn: fetchPendingPOs,                         enabled: tab === "pending" });
    const { data: completedData,   isLoading: completedLoading }   = useQuery({ queryKey: ["fulfillmentReport"],               queryFn: () => fetchFulfillmentReport({}),        enabled: tab === "completed" });

    // Completed POs — the fulfillment report already gives Delivered/Pending
    // per PO; a PO counts as "Completed" here once nothing is left pending
    // (pending <= 0), regardless of the tiny floating-point noise repeated
    // qty additions elsewhere can leave behind. Then filtered by the
    // selected UOM tab (All/Nos/Meter), same pattern as Pending POs.
    const completedRowsCompleted = (completedData?.rows ?? []).filter((r) => (r.pending ?? 0) <= 0.0001);
    const completedRowsAll = completedUomTab === "all"
        ? completedRowsCompleted
        : completedRowsCompleted.filter((r) => (r.uom || "").trim().toLowerCase() === completedUomTab);
    const { filters: completedFilters, setFilter: setCompletedFilter } = useColumnFilters();
    const completedFilteredRows = applyColumnFilters(completedRowsAll, completedFilters, CompletedColumnAccessors);
    const completedTotals = {
        required: roundQty(completedFilteredRows.reduce((s, r) => s + (r.total_required ?? 0), 0)),
        delivered: roundQty(completedFilteredRows.reduce((s, r) => s + (r.delivered ?? 0), 0)),
        uom: completedFilteredRows[0]?.uom || "Nos",
    };

    // Pending POs — filtered by the selected UOM tab (All/Nos/Meter), then by
    // any active Excel-style column filters. The table body and the footer
    // totals both read from this same filtered array, so switching tabs or
    // filters updates both together and the totals always match exactly
    // what's displayed.
    const pendingRowsAll = pendingData?.rows ?? [];
    const pendingRows = pendingUomTab === "all"
        ? pendingRowsAll
        : pendingRowsAll.filter((r) => (r.uom || "").trim().toLowerCase() === pendingUomTab);
    const { filters: pendingFilters, setFilter: setPendingFilter } = useColumnFilters();
    const pendingFilteredRows = applyColumnFilters(pendingRows, pendingFilters, PendingColumnAccessors);
    const pendingTotals = {
        totalQty: roundQty(pendingFilteredRows.reduce((s, r) => s + (r.total_qty ?? 0), 0)),
        deliveredQty: roundQty(pendingFilteredRows.reduce((s, r) => s + (r.delivered_qty ?? 0), 0)),
        pendingQty: roundQty(pendingFilteredRows.reduce((s, r) => s + (r.pending_qty ?? 0), 0)),
        deliveredPayment: pendingFilteredRows.reduce((s, r) => s + (r.delivered_payment ?? 0), 0),
        pendingPayment: pendingFilteredRows.reduce((s, r) => s + (r.pending_total ?? 0), 0),
        uom: pendingFilteredRows[0]?.uom || "Nos",
    };

    const { widths: salesWidths, startResize: startSalesResize } = useResizableColumns("colw:reports-sales", SALES_WIDTHS);
    const { sortedRows: sortedSalesRows, sortConfig: salesSortConfig, setSort: setSalesSort } = useSortableRows(salesFilteredRows);

    const { widths: pendingWidths, startResize: startPendingResize } = useResizableColumns("colw:reports-pending", PENDING_WIDTHS);
    const { sortedRows: sortedPendingRows, sortConfig: pendingSortConfig, setSort: setPendingSort } = useSortableRows(pendingFilteredRows);

    const { widths: completedWidths, startResize: startCompletedResize } = useResizableColumns("colw:reports-completed", COMPLETED_WIDTHS);
    const { sortedRows: sortedCompletedRows, sortConfig: completedSortConfig, setSort: setCompletedSort } = useSortableRows(completedFilteredRows);

    const [selectedPOId, setSelectedPOId] = useState(null);
    const { data: selectedPO, isLoading: selectedPOLoading } = useQuery({
        queryKey: ["po-fulfillment-summary", selectedPOId],
        queryFn: () => fetchPOFulfillmentSummary(selectedPOId),
        enabled: !!selectedPOId,
    });
    const closeViewingPO = () => setSelectedPOId(null);
    const poDeliveryStatusBadge = (status) =>
        status === "Completed" ? "Delivered" : status === "Short Closed" ? "Short Closed" : status;

    return (
        <div className="space-y-6">
            {/* ── Page header ─────────────────────────────────────────────────── */}
            <div className="text-center space-y-1">
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">Reports & Analytics</h2>
                <p className="text-sm text-muted-foreground">Analyze your sales performance and order fulfillment.</p>
            </div>

            {/* ── Report section selector ─────────────────────────────────────── */}
            <Tabs value={reportSection} onValueChange={setReportSection} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger value="overview" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <LayoutDashboard className="h-4 w-4 mr-2" /> Overview
                    </TabsTrigger>
                    <TabsTrigger value="po" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <FileText className="h-4 w-4 mr-2" /> Purchase Order Report
                    </TabsTrigger>
                    <TabsTrigger value="wo" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <ClipboardList className="h-4 w-4 mr-2" /> Work Order Report
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                    <OverviewReport />
                </TabsContent>

                <TabsContent value="po" className="space-y-6">
            <div className="flex flex-wrap items-end justify-end gap-3">
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setExportOpen(true)} variant="outline" className="border-green-500 text-green-700 hover:bg-green-50">
                        <Download className="h-4 w-4 mr-2" /> Export Excel
                    </Button>
                    <Button onClick={openImport} variant="outline" className="border-blue-500 text-blue-700 hover:bg-blue-50">
                        <Upload className="h-4 w-4 mr-2" /> Import Excel
                    </Button>
                </div>
            </div>

            {/* ── Report tabs ─────────────────────────────────────────────────── */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger value="completed" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Completed PO
                    </TabsTrigger>
                    <TabsTrigger value="sales" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <BarChart3 className="h-4 w-4 mr-2" /> Sales
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <Clock className="h-4 w-4 mr-2" /> Pending POs
                    </TabsTrigger>
                </TabsList>

                {/* ── Completed PO Tab ─────────────────────────────────────────── */}
                <TabsContent value="completed" className="space-y-6">
                    <Tabs value={completedUomTab} onValueChange={setCompletedUomTab}>
                        <TabsList className="bg-transparent p-0 h-auto inline-flex flex-wrap gap-2 sm:gap-3">
                            <TabsTrigger value="all" className={pillTabClass}>All</TabsTrigger>
                            <TabsTrigger value="nos" className={pillTabClass}>Nos</TabsTrigger>
                            <TabsTrigger value="meter" className={pillTabClass}>Meter</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Card className="shadow-card">
                        <StickyScrollArea>
                            <table className="w-full text-sm table-fixed">
                                <thead className="bg-muted/50 text-foreground text-sm font-bold uppercase tracking-wider">
                                    <tr>
                                        <SortableHeader label="S.No." width={completedWidths.sno} onResizeStart={startCompletedResize("sno")} />
                                        <FilterableHeader label="Date" columnKey="date" type="date" accessor={CompletedColumnAccessors.date} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.date} onResizeStart={startCompletedResize("date")} rows={completedRowsAll} filterValue={completedFilters.date} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="Client Name" columnKey="client_name" accessor={CompletedColumnAccessors.client_name} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.client_name} onResizeStart={startCompletedResize("client_name")} rows={completedRowsAll} filterValue={completedFilters.client_name} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="Project" columnKey="project" accessor={CompletedColumnAccessors.project} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.project} onResizeStart={startCompletedResize("project")} rows={completedRowsAll} filterValue={completedFilters.project} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="PO Number" columnKey="po_number" accessor={CompletedColumnAccessors.po_number} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.po_number} onResizeStart={startCompletedResize("po_number")} rows={completedRowsAll} filterValue={completedFilters.po_number} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="Item" columnKey="item" accessor={CompletedColumnAccessors.item} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.item} onResizeStart={startCompletedResize("item")} rows={completedRowsAll} filterValue={completedFilters.item} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="PO Quantity" columnKey="total_required" type="number" align="right" accessor={CompletedColumnAccessors.total_required} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.total_required} onResizeStart={startCompletedResize("total_required")} rows={completedRowsAll} filterValue={completedFilters.total_required} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="Delivered Quantity" columnKey="delivered" type="number" align="right" accessor={CompletedColumnAccessors.delivered} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.delivered} onResizeStart={startCompletedResize("delivered")} rows={completedRowsAll} filterValue={completedFilters.delivered} onApplyFilter={setCompletedFilter} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {completedLoading && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {sortedCompletedRows.map((r, idx) => (
                                        <tr key={r.id} className={`border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]${r.remark ? " bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                                            <td className="px-2 py-3 text-center text-muted-foreground">{idx + 1}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground whitespace-nowrap">{r.date}</td>
                                            <td className="px-2 py-3 text-center font-semibold text-foreground truncate" title={r.client_name}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedPOId(r.id)}>
                                                    {r.client_name}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-muted-foreground truncate" title={r.project}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedPOId(r.id)}>
                                                    {r.project}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center font-semibold text-primary truncate" title={r.po_number}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedPOId(r.id)}>
                                                    {r.po_number}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-foreground font-medium truncate" title={r.item}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedPOId(r.id)}>
                                                    {r.item}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center font-medium whitespace-nowrap">{r.total_required} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                            <td className="px-2 py-3 text-center font-bold text-success whitespace-nowrap" style={{color:"var(--success)"}}>{r.delivered} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                        </tr>
                                    ))}
                                    {!completedLoading && sortedCompletedRows.length === 0 && (
                                        <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">No completed POs yet.</td></tr>
                                    )}
                                </tbody>
                                {!completedLoading && completedFilteredRows.length > 0 && (
                                    <tfoot className="sticky bottom-0">
                                        <tr className="border-t-2 text-sm" style={{ backgroundColor: "#EFF6FF", borderTopColor: "#2563EB" }}>
                                            <td className="p-2 text-center font-bold" style={{ color: "#1D4ED8" }} colSpan={6}>TOTAL</td>
                                            <td className="px-2 py-3 text-center font-bold text-blue-600 whitespace-nowrap">
                                                {completedTotals.required} <span className="text-[10px] font-normal text-muted-foreground">{completedTotals.uom}</span>
                                            </td>
                                            <td className="px-2 py-3 text-center font-bold text-green-600 whitespace-nowrap">
                                                {completedTotals.delivered} <span className="text-[10px] font-normal text-muted-foreground">{completedTotals.uom}</span>
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </StickyScrollArea>
                    </Card>
                </TabsContent>

                {/* ── Sales Tab ────────────────────────────────────────────────── */}
                <TabsContent value="sales" className="space-y-6">
                    <Card className="p-5 shadow-card">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>From Date</Label>
                                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>To Date</Label>
                                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                            </div>
                        </div>
                    </Card>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <Card className="p-5 shadow-card border-l-4 border-primary">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center"><IndianRupee className="h-5 w-5 text-primary" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Basic Sales</div>
                                    <div className="text-2xl font-bold text-foreground">{inr(salesData?.rows?.reduce((s, r) => s + (r.subtotal ?? 0), 0) ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-blue-500">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-blue-500/10 grid place-items-center"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total GST Amount</div>
                                    <div className="text-2xl font-bold text-foreground">{inr(salesData?.rows?.reduce((s, r) => s + (r.gst_amount ?? 0), 0) ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-success">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-success/15 grid place-items-center"><TrendingUp className="h-5 w-5 text-success" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Basic Sales + GST</div>
                                    <div className="text-2xl font-bold text-foreground">{inr(salesData?.rows?.reduce((s, r) => s + (r.subtotal ?? 0) + (r.gst_amount ?? 0), 0) ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-accent">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-accent/15 grid place-items-center"><Package className="h-5 w-5 text-accent" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total no. Invoice</div>
                                    <div className="text-2xl font-bold text-foreground">{salesData?.record_count ?? 0}</div>
                                </div>
                            </div>
                        </Card>
                    </div>
                    <Card className="shadow-card">
                        <StickyScrollArea>
                            <table className="w-full text-sm table-fixed">
                                <thead className="bg-muted/50 text-foreground text-sm font-bold uppercase tracking-wider">
                                    <tr>
                                        <SortableHeader label="S.No." width={salesWidths.sno} onResizeStart={startSalesResize("sno")} />
                                        <FilterableHeader label="Date" columnKey="date" type="date" accessor={SalesColumnAccessors.date} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.date} onResizeStart={startSalesResize("date")} rows={salesRows} filterValue={salesFilters.date} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="Invoice No" columnKey="invoice_number" accessor={SalesColumnAccessors.invoice_number} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.invoice_number} onResizeStart={startSalesResize("invoice_number")} rows={salesRows} filterValue={salesFilters.invoice_number} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="PO No" columnKey="po_number" accessor={SalesColumnAccessors.po_number} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.po_number} onResizeStart={startSalesResize("po_number")} rows={salesRows} filterValue={salesFilters.po_number} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="Subtotal" columnKey="subtotal" type="number" align="right" accessor={SalesColumnAccessors.subtotal} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.subtotal} onResizeStart={startSalesResize("subtotal")} rows={salesRows} filterValue={salesFilters.subtotal} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="GST Amount" columnKey="gst_amount" type="number" align="right" accessor={SalesColumnAccessors.gst_amount} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.gst_amount} onResizeStart={startSalesResize("gst_amount")} rows={salesRows} filterValue={salesFilters.gst_amount} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="Grand Total" columnKey="price" type="number" align="right" accessor={SalesColumnAccessors.price} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.price} onResizeStart={startSalesResize("price")} rows={salesRows} filterValue={salesFilters.price} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="Payment" columnKey="payment_status" accessor={SalesColumnAccessors.payment_status} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.payment_status} onResizeStart={startSalesResize("payment_status")} rows={salesRows} filterValue={salesFilters.payment_status} onApplyFilter={setSalesFilter} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesLoading && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {sortedSalesRows.map((r, idx) => (
                                        <tr key={r.id} className={`border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]${r.payment_note ? " bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                                            <td className="px-2 py-3 text-center text-muted-foreground">{idx + 1}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground whitespace-nowrap">{r.date}</td>
                                            <td className="px-2 py-3 text-center text-primary font-medium truncate" title={r.invoice_number}>{r.invoice_number || "—"}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground truncate" title={r.po_number}>{r.po_number || "—"}</td>
                                            <td className="px-2 py-3 text-center font-medium">{inr(r.subtotal)}</td>
                                            <td className="px-2 py-3 text-center font-medium text-blue-500">{inr(r.gst_amount)}</td>
                                            <td className="px-2 py-3 text-center font-bold text-foreground">{inr(r.price)}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground text-[11px]">{r.payment_status}</td>
                                        </tr>
                                    ))}
                                    {!salesLoading && sortedSalesRows.length === 0 && (
                                        <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">No records match the filters.</td></tr>
                                    )}
                                </tbody>
                                {!salesLoading && salesFilteredRows.length > 0 && (
                                    <tfoot className="sticky bottom-0">
                                        <tr className="border-t-2 border-primary bg-primary/10 text-sm">
                                            <td className="px-2 py-3 text-center font-bold text-primary tracking-wide" colSpan={4}>TOTAL</td>
                                            <td className="px-2 py-3 text-center font-bold text-primary">{inr(salesTotals.subtotal)}</td>
                                            <td className="px-2 py-3 text-center font-bold text-blue-500">{inr(salesTotals.gst)}</td>
                                            <td className="px-2 py-3 text-center font-bold text-success">{inr(salesTotals.grandTotal)}</td>
                                            <td className="px-2 py-3"></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </StickyScrollArea>
                    </Card>
                </TabsContent>

                {/* ── Pending POs Tab ──────────────────────────────────────────── */}
                <TabsContent value="pending" className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card className="p-5 shadow-card border-l-4 border-success">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-success/10 grid place-items-center"><IndianRupee className="h-5 w-5 text-success" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Delivered Value</div>
                                    <div className="text-xl font-bold text-foreground">{inr(pendingData?.total_delivered_payment ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-indigo-500">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-indigo-500/10 grid place-items-center"><ClipboardList className="h-5 w-5 text-indigo-500" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Pending POs</div>
                                    <div className="text-xl font-bold text-foreground">{pendingData?.count ?? 0}</div>
                                </div>
                            </div>
                        </Card>
                    </div>
                    <Tabs value={pendingUomTab} onValueChange={setPendingUomTab}>
                        <TabsList className="bg-transparent p-0 h-auto inline-flex flex-wrap gap-2 sm:gap-3">
                            <TabsTrigger value="all" className={pillTabClass}>All</TabsTrigger>
                            <TabsTrigger value="nos" className={pillTabClass}>Nos</TabsTrigger>
                            <TabsTrigger value="meter" className={pillTabClass}>Meter</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Card className="shadow-card">
                        <StickyScrollArea>
                            <table className="w-full text-sm table-fixed">
                                <thead className="bg-muted/50 text-foreground text-sm font-bold uppercase tracking-wider">
                                    <tr>
                                        <SortableHeader label="S.No." width={pendingWidths.sno} onResizeStart={startPendingResize("sno")} />
                                        <FilterableHeader label="Date" columnKey="date" type="date" accessor={PendingColumnAccessors.date} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.date} onResizeStart={startPendingResize("date")} rows={pendingRows} filterValue={pendingFilters.date} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="PO Number" columnKey="po_number" accessor={PendingColumnAccessors.po_number} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.po_number} onResizeStart={startPendingResize("po_number")} rows={pendingRows} filterValue={pendingFilters.po_number} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Client" columnKey="client_name" accessor={PendingColumnAccessors.client_name} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.client_name} onResizeStart={startPendingResize("client_name")} rows={pendingRows} filterValue={pendingFilters.client_name} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Project" columnKey="project" accessor={PendingColumnAccessors.project} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.project} onResizeStart={startPendingResize("project")} rows={pendingRows} filterValue={pendingFilters.project} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Item" columnKey="item" accessor={PendingColumnAccessors.item} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.item} onResizeStart={startPendingResize("item")} rows={pendingRows} filterValue={pendingFilters.item} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Total Qty" columnKey="total_qty" type="number" align="right" accessor={PendingColumnAccessors.total_qty} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.total_qty} onResizeStart={startPendingResize("total_qty")} rows={pendingRows} filterValue={pendingFilters.total_qty} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Delivered Qty" columnKey="delivered_qty" type="number" align="right" accessor={PendingColumnAccessors.delivered_qty} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.delivered_qty} onResizeStart={startPendingResize("delivered_qty")} rows={pendingRows} filterValue={pendingFilters.delivered_qty} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Pending Qty" columnKey="pending_qty" type="number" align="right" accessor={PendingColumnAccessors.pending_qty} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.pending_qty} onResizeStart={startPendingResize("pending_qty")} rows={pendingRows} filterValue={pendingFilters.pending_qty} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Delivered Payment" columnKey="delivered_payment" type="number" align="right" accessor={PendingColumnAccessors.delivered_payment} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.delivered_payment} onResizeStart={startPendingResize("delivered_payment")} rows={pendingRows} filterValue={pendingFilters.delivered_payment} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Pending Payment" columnKey="pending_total" type="number" align="right" accessor={PendingColumnAccessors.pending_total} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.pending_total} onResizeStart={startPendingResize("pending_total")} rows={pendingRows} filterValue={pendingFilters.pending_total} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Status" columnKey="status" accessor={PendingColumnAccessors.status} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.status} onResizeStart={startPendingResize("status")} rows={pendingRows} filterValue={pendingFilters.status} onApplyFilter={setPendingFilter} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingLoading && <tr><td colSpan={12} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {sortedPendingRows.map((r, idx) => (
                                        <tr key={r.id} className={`border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]${r.remark ? " bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                                            <td className="px-2 py-3 text-center text-muted-foreground">{idx + 1}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground whitespace-nowrap">{r.date}</td>
                                            <td className="px-2 py-3 text-center text-primary truncate" title={r.invoice_number}>
                                                {r.invoice_number || "—"}
                                            </td>
                                            <td className="px-2 py-3 text-center font-semibold text-primary truncate" title={r.po_number}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedPOId(r.id)}>
                                                    {r.po_number}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-muted-foreground truncate" title={r.client_name}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedPOId(r.id)}>
                                                    {r.client_name}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-muted-foreground truncate" title={r.project}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedPOId(r.id)}>
                                                    {r.project}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-muted-foreground truncate" title={r.item}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedPOId(r.id)}>
                                                    {r.item}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center font-medium whitespace-nowrap">{r.total_qty} <span className="text-[10px] text-muted-foreground">{r.uom || ''}</span></td>
                                            <td className="px-2 py-3 text-center font-bold whitespace-nowrap" style={{color:"var(--success)"}}>{r.delivered_qty || 0} <span className="text-[10px] text-muted-foreground">{r.uom || ''}</span></td>
                                            <td className="px-2 py-3 text-center font-bold whitespace-nowrap">{r.pending_qty} <span className="text-[10px] text-muted-foreground">{r.uom || ''}</span></td>
                                            <td className="px-2 py-3 text-center font-bold" style={{color:"var(--success)"}}>{inr(r.delivered_payment)}</td>
                                            <td className="px-2 py-3 text-center font-bold text-orange-500">{inr(r.pending_total)}</td>
                                            <td className="px-2 py-3 text-center"><div className="flex justify-center"><StatusBadge status={r.status} label={r.status} /></div></td>
                                        </tr>
                                    ))}
                                    {!pendingLoading && sortedPendingRows.length === 0 && (
                                        <tr><td colSpan={12} className="px-5 py-12 text-center text-muted-foreground">
                                            {pendingRowsAll.length > 0 ? "No pending POs match this UOM or filter." : "No pending POs found."}
                                        </td></tr>
                                    )}
                                </tbody>
                                {/* Totals below come straight from pendingFilteredRows (the same
                                    array the table renders) — no separate query, no cached value. */}
                                {!pendingLoading && pendingFilteredRows.length > 0 && (
                                    <tfoot className="sticky bottom-0">
                                        <tr className="border-t-2 text-sm" style={{ backgroundColor: "#EFF6FF", borderTopColor: "#2563EB" }}>
                                            <td className="px-2 py-3 text-center font-bold" style={{ color: "#1D4ED8" }} colSpan={6}>TOTAL</td>
                                            <td className="px-2 py-3 text-center font-bold text-blue-600 whitespace-nowrap">
                                                {pendingTotals.totalQty} <span className="text-[10px] font-normal text-muted-foreground">{pendingTotals.uom}</span>
                                            </td>
                                            <td className="px-2 py-3 text-center font-bold text-green-600 whitespace-nowrap">
                                                {pendingTotals.deliveredQty} <span className="text-[10px] font-normal text-muted-foreground">{pendingTotals.uom}</span>
                                            </td>
                                            <td className="px-2 py-3 text-center font-bold text-orange-600 whitespace-nowrap">
                                                {pendingTotals.pendingQty} <span className="text-[10px] font-normal text-muted-foreground">{pendingTotals.uom}</span>
                                            </td>
                                            <td className="px-2 py-3 text-center font-bold text-green-600">{inr(pendingTotals.deliveredPayment)}</td>
                                            <td className="px-2 py-3 text-center font-bold text-red-600">{inr(pendingTotals.pendingPayment)}</td>
                                            <td className="px-2 py-3"></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </StickyScrollArea>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ── PO Fulfillment Summary Dialog ─────────────────────────────── */}
            <Dialog open={!!selectedPOId} onOpenChange={(open) => !open && closeViewingPO()}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>PO Fulfillment Summary</DialogTitle></DialogHeader>
                    {selectedPOLoading && <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>}
                    {selectedPO && !selectedPOLoading && (() => {
                        const po = selectedPO;
                        return (
                            <div className="space-y-5 py-2">

                                {/* Header fields */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <Field label="PO Number" value={po.po_number} />
                                    <Field label="Client Name" value={po.client_name} />
                                    <Field label="Project Name" value={po.project || "—"} />
                                    <Field label="PO Date" value={po.po_date || "—"} />
                                </div>

                                {/* Quantity summary */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">PO Quantity</div>
                                        <div className="text-lg font-bold text-foreground">{po.po_quantity} <span className="text-xs font-normal text-muted-foreground">{po.uom}</span></div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Delivered Quantity</div>
                                        <div className="text-lg font-bold text-success">{po.delivered_quantity} <span className="text-xs font-normal text-muted-foreground">{po.uom}</span></div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pending Quantity</div>
                                        <div className="text-lg font-bold text-warning">{po.pending_quantity} <span className="text-xs font-normal text-muted-foreground">{po.uom}</span></div>
                                    </div>
                                </div>

                                {/* Financial summary */}
                                <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-slate-600">Sub Total:</span>
                                            <span className="text-sm font-bold text-slate-900">{inr(po.subtotal)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-slate-600">GST:</span>
                                            <span className="text-sm font-bold text-slate-900">{inr(po.gst_amount)}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-md border border-primary/20">
                                        <span className="text-xs font-bold text-primary uppercase tracking-wider">Grand Total:</span>
                                        <span className="text-base font-black text-primary">{inr(po.grand_total)}</span>
                                    </div>
                                </div>

                                {/* Dispatch history */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Dispatch History</Label>
                                    <div className="rounded-lg border border-border overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-muted text-muted-foreground font-medium border-b border-border">
                                                <tr>
                                                    <th className="p-2">Dispatch Date</th>
                                                    <th className="p-2">Invoice No.</th>
                                                    <th className="p-2">Item</th>
                                                    <th className="p-2 text-right">Dispatch Qty</th>
                                                    <th className="p-2 text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {po.dispatch_history.map((d, idx) => (
                                                    <tr key={idx} className="border-b border-border/50">
                                                        <td className="p-2 whitespace-nowrap">{d.date}</td>
                                                        <td className="p-2">{d.invoice_number || "—"}</td>
                                                        <td className="p-2 max-w-[200px] truncate" title={d.item || ""}>{d.item || "—"}</td>
                                                        <td className="p-2 text-right whitespace-nowrap">{d.dispatch_qty} <span className="text-muted-foreground">{d.uom}</span></td>
                                                        <td className="p-2 text-right font-medium">{inr(d.amount)}</td>
                                                    </tr>
                                                ))}
                                                {po.dispatch_history.length === 0 && (
                                                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No dispatches yet.</td></tr>
                                                )}
                                            </tbody>
                                            {po.dispatch_history.length > 0 && (
                                                <tfoot>
                                                    <tr className="border-t border-border bg-muted/30 font-semibold">
                                                        <td className="p-2" colSpan={4}>Total <span className="font-normal text-muted-foreground">(Incl. GST)</span></td>
                                                        <td className="p-2 text-right">
                                                            {inr(po.dispatch_history.reduce((sum, d) => sum + (d.amount || 0), 0))}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>
                                </div>

                                {/* Dispatch / payment / status summary */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                                    <Field label="Total Dispatches" value={po.total_dispatches} />
                                    <Field label="Last Dispatch Date" value={po.last_dispatch_date || "—"} />
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Delivery Status</div>
                                        <StatusBadge status={poDeliveryStatusBadge(po.delivery_status)} label={po.delivery_status} />
                                    </div>
                                    <Field label="Payment Received" value={inr(po.payment_received)} />
                                    <Field label="Pending Payment" value={inr(po.pending_payment)} />
                                </div>

                            </div>
                        );
                    })()}
                    <DialogFooter>
                        <Button variant="outline" onClick={closeViewingPO}>Close</Button>
                        {selectedPO && (
                            <Button variant="outline" onClick={() => openPODocument(selectedPO.po_id)}>
                                <Printer className="h-4 w-4 mr-2" /> Print PO
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Combined Export Dialog ───────────────────────────────────────── */}
            <Dialog open={exportOpen} onOpenChange={(o) => { if (!exporting) setExportOpen(o); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5 text-green-600" />
                            Export Reports to Excel
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 py-2">
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold">Select report sections to export</Label>
                            <p className="text-xs text-muted-foreground">
                                Each selected section will appear as a separate sheet in one Excel file.
                            </p>
                            {SHEET_OPTIONS.map(({ id, label, desc }) => (
                                <div key={id} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                                    <Checkbox
                                        id={`exp-${id}`}
                                        checked={exportSheets.includes(id)}
                                        onCheckedChange={(checked) => toggleSheet(id, checked === true)}
                                        className="mt-0.5"
                                    />
                                    <div className="space-y-0.5 leading-tight">
                                        <Label htmlFor={`exp-${id}`} className="cursor-pointer font-medium text-sm">{label}</Label>
                                        <p className="text-xs text-muted-foreground">{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Date range <span className="font-normal text-muted-foreground">(optional — applies to Fulfillment &amp; Sales)</span></Label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">From</Label>
                                    <Input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">To</Label>
                                    <Input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
                        <Button
                            onClick={handleCombinedExport}
                            disabled={exportSheets.length === 0 || exporting}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {exporting
                                ? "Exporting…"
                                : `Export${exportSheets.length > 0 ? ` (${exportSheets.length} sheet${exportSheets.length > 1 ? "s" : ""})` : ""}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Combined Import Dialog ───────────────────────────────────────── */}
            <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportFile(null); setImportResult(null); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-blue-600" />
                            Import Combined Report Data
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                            Upload a combined report Excel file. Sheets are detected by name and imported automatically:
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-1 pl-2 border-l-2 border-border">
                            <li><span className="font-medium text-foreground">"Completed PO"</span> → Purchase Orders module</li>
                            <li><span className="font-medium text-foreground">"Pending POs"</span> → Purchase Orders module</li>
                            <li><span className="font-medium text-foreground">"Sales Report"</span> → Sales module</li>
                        </ul>

                        <div className="space-y-2">
                            <Label>Select file (.xlsx)</Label>
                            <div
                                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                                onClick={() => importFileRef.current?.click()}
                            >
                                {importFile ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-green-700">
                                        <FileText className="h-4 w-4" />
                                        <span className="font-medium">{importFile.name}</span>
                                        <span className="text-muted-foreground">({(importFile.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                ) : (
                                    <div className="text-muted-foreground text-sm">
                                        <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                                        Click to choose or drop a file here
                                    </div>
                                )}
                            </div>
                            <input
                                ref={importFileRef}
                                type="file"
                                className="hidden"
                                accept=".xlsx"
                                onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>If record already exists</Label>
                            <Select value={importConflict} onValueChange={setImportConflict}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="skip">Skip — keep existing record (safe)</SelectItem>
                                    <SelectItem value="update">Update — overwrite matching record</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {importResult && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-2">
                                <div className="font-semibold text-foreground">Import Results</div>
                                <div className="flex gap-4 flex-wrap text-xs">
                                    <span className="text-green-700">Total Created: <strong>{importResult.created}</strong></span>
                                    <span className="text-blue-700">Total Updated: <strong>{importResult.updated}</strong></span>
                                    <span className="text-orange-600">Total Skipped: <strong>{importResult.skipped}</strong></span>
                                </div>
                                {importResult.sheets && Object.entries(importResult.sheets).map(([sheetName, r]) => (
                                    <div key={sheetName} className="border-t border-border pt-2">
                                        <div className="font-medium text-xs text-muted-foreground mb-1">{sheetName}</div>
                                        <div className="flex gap-3 flex-wrap text-xs">
                                            <span className="text-green-700">Created: <strong>{r.created}</strong></span>
                                            <span className="text-blue-700">Updated: <strong>{r.updated}</strong></span>
                                            <span className="text-orange-600">Skipped: <strong>{r.skipped}</strong></span>
                                        </div>
                                    </div>
                                ))}
                                {importResult.errors?.length > 0 && (
                                    <div className="border-t border-border pt-2">
                                        <div className="text-destructive font-medium text-xs mb-1">Errors ({importResult.errors.length}):</div>
                                        <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                                            {importResult.errors.map((e, i) => (
                                                <li key={i} className="text-destructive text-xs">• {e}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
                        <Button
                            onClick={handleImport}
                            disabled={!importFile || importing}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {importing ? "Importing…" : "Import"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
                </TabsContent>

                <TabsContent value="wo" className="space-y-6">
                    <WorkOrderReport />
                </TabsContent>
            </Tabs>
        </div>
    );
};

const Field = ({ label, value, full }) => (
    <div className={full ? "col-span-2" : ""}>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground break-words">{value ?? "—"}</div>
    </div>
);

export default Reports;
