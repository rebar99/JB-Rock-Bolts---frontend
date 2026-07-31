import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchWorkOrderReport, exportWorkOrderReport, fetchWorkOrder, openWODocument, fetchWorkOrderSalesReport } from "@/lib/api";
import { inr, fmtDate, fmtDateTime, round2 } from "@/lib/format";
import { Download, Printer, Search, ClipboardList, CheckCircle2, Clock, TrendingUp, Eye, BarChart3, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { useSortableRows } from "@/hooks/useSortableRows";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { useColumnFilters } from "@/hooks/useColumnFilters";
import { SortableHeader } from "@/components/SortableHeader";
import { FilterableHeader } from "@/components/FilterableHeader";
import { StickyScrollArea } from "@/components/StickyScrollArea";

const roundQty = round2;

// Pill-style UOM filter tab — same look as the Purchase Order Report's
// Completed/Pending UOM sub-tabs, duplicated locally (small, self-contained).
const pillTabClass =
    "rounded-full px-5 py-2.5 text-[15px] font-semibold border transition-all duration-200 ease-in-out " +
    "hover:scale-[1.03] active:scale-[0.97] " +
    "data-[state=inactive]:bg-card data-[state=inactive]:text-foreground data-[state=inactive]:border-border " +
    "data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-muted/50 " +
    "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md";

const COMPLETED_WOR_WIDTHS = { sno: 56, wo_date: 100, client_name: 150, project: 130, wo_number: 130, item: 160, total_quantity: 110, completed_quantity: 110 };
const SALES_WOR_WIDTHS = { sno: 56, date: 100, invoice_number: 130, wo_number: 130, subtotal: 110, gst_amount: 110, grand_total: 120, payment_status: 100 };
const PENDING_WOR_WIDTHS = { sno: 56, wo_date: 100, wo_number: 130, client_name: 140, project: 120, item: 160, total_quantity: 100, completed_quantity: 100, pending_quantity: 100, status: 110 };

const CompletedWORColumnAccessors = {
    wo_date: (r) => r.wo_date,
    client_name: (r) => r.client_name,
    project: (r) => r.project,
    wo_number: (r) => r.wo_number,
    item: (r) => r.item,
    total_quantity: (r) => r.total_quantity,
    completed_quantity: (r) => r.completed_quantity,
};
const SalesWORColumnAccessors = {
    date: (r) => r.date,
    invoice_number: (r) => r.invoice_number,
    wo_number: (r) => r.wo_number,
    subtotal: (r) => r.subtotal,
    gst_amount: (r) => r.gst_amount,
    grand_total: (r) => r.grand_total,
    payment_status: (r) => r.payment_status,
};
const PendingWORColumnAccessors = {
    wo_date: (r) => r.wo_date,
    wo_number: (r) => r.wo_number,
    client_name: (r) => r.client_name,
    project: (r) => r.project,
    item: (r) => r.item,
    total_quantity: (r) => r.total_quantity,
    completed_quantity: (r) => r.completed_quantity,
    pending_quantity: (r) => r.pending_quantity,
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

const WorkOrderReport = () => {
    const [search, setSearch] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ["workOrderReport"],
        queryFn: () => fetchWorkOrderReport(),
    });

    const allRows = data?.rows ?? [];
    const searchedRows = useMemo(() => {
        const s = search.toLowerCase();
        if (!s) return allRows;
        return allRows.filter((r) =>
            (r.wo_number || "").toLowerCase().includes(s) ||
            (r.client_name || "").toLowerCase().includes(s) ||
            (r.project || "").toLowerCase().includes(s) ||
            (r.item || "").toLowerCase().includes(s) ||
            (r.status || "").toLowerCase().includes(s)
        );
    }, [allRows, search]);

    const [tab, setTab] = useState("completed");
    const [completedUomTab, setCompletedUomTab] = useState("all");
    const [pendingUomTab, setPendingUomTab] = useState("all");

    // ── Completed WO tab ────────────────────────────────────────────────────
    const completedRowsAll = useMemo(() => {
        const base = searchedRows.filter((r) => r.status === "Completed");
        return completedUomTab === "all" ? base : base.filter((r) => (r.uom || "").trim().toLowerCase() === completedUomTab);
    }, [searchedRows, completedUomTab]);
    const { filters: completedFilters, setFilter: setCompletedFilter } = useColumnFilters();
    const completedFilteredRows = applyColumnFilters(completedRowsAll, completedFilters, CompletedWORColumnAccessors);
    const completedTotals = {
        total: roundQty(completedFilteredRows.reduce((s, r) => s + (r.total_quantity ?? 0), 0)),
        completed: roundQty(completedFilteredRows.reduce((s, r) => s + (r.completed_quantity ?? 0), 0)),
        uom: completedFilteredRows[0]?.uom || "Nos",
    };
    const { widths: completedWidths, startResize: startCompletedResize } = useResizableColumns("colw:wor-completed", COMPLETED_WOR_WIDTHS);
    const { sortedRows: sortedCompletedRows, sortConfig: completedSortConfig, setSort: setCompletedSort } = useSortableRows(completedFilteredRows);

    // ── Sales WO tab (real Work Order Sale invoices) ────────────────────────
    const [salesFrom, setSalesFrom] = useState("");
    const [salesTo, setSalesTo] = useState("");
    const salesParams = {
        from_date: salesFrom ? new Date(salesFrom).toISOString() : undefined,
        to_date: salesTo ? new Date(salesTo).toISOString() : undefined,
    };
    const { data: salesData, isLoading: salesLoading } = useQuery({
        queryKey: ["workOrderSalesReport", salesParams],
        queryFn: () => fetchWorkOrderSalesReport(salesParams),
    });
    const salesRowsAll = useMemo(() => {
        const rows = salesData?.rows ?? [];
        const s = search.toLowerCase();
        if (!s) return rows;
        return rows.filter((r) =>
            (r.wo_number || "").toLowerCase().includes(s) ||
            (r.client_name || "").toLowerCase().includes(s) ||
            (r.invoice_number || "").toLowerCase().includes(s)
        );
    }, [salesData, search]);
    const { filters: salesFilters, setFilter: setSalesFilter } = useColumnFilters();
    const salesFilteredRows = applyColumnFilters(salesRowsAll, salesFilters, SalesWORColumnAccessors);
    const salesTotals = {
        subtotal: salesFilteredRows.reduce((s, r) => s + (r.subtotal ?? 0), 0),
        gst: salesFilteredRows.reduce((s, r) => s + (r.gst_amount ?? 0), 0),
        grandTotal: salesFilteredRows.reduce((s, r) => s + (r.grand_total ?? 0), 0),
    };
    const { widths: salesWidths, startResize: startSalesResize } = useResizableColumns("colw:wor-sales", SALES_WOR_WIDTHS);
    const { sortedRows: sortedSalesRows, sortConfig: salesSortConfig, setSort: setSalesSort } = useSortableRows(salesFilteredRows);

    // ── Pending WO tab (anything not yet Completed) ─────────────────────────
    const pendingRowsAll = useMemo(() => {
        const base = searchedRows.filter((r) => r.status !== "Completed");
        return pendingUomTab === "all" ? base : base.filter((r) => (r.uom || "").trim().toLowerCase() === pendingUomTab);
    }, [searchedRows, pendingUomTab]);
    const { filters: pendingFilters, setFilter: setPendingFilter } = useColumnFilters();
    const pendingFilteredRows = applyColumnFilters(pendingRowsAll, pendingFilters, PendingWORColumnAccessors);
    const pendingTotals = {
        total: roundQty(pendingFilteredRows.reduce((s, r) => s + (r.total_quantity ?? 0), 0)),
        completed: roundQty(pendingFilteredRows.reduce((s, r) => s + (r.completed_quantity ?? 0), 0)),
        pending: roundQty(pendingFilteredRows.reduce((s, r) => s + (r.pending_quantity ?? 0), 0)),
        value: pendingFilteredRows.reduce((s, r) => s + (r.grand_total ?? 0), 0),
        uom: pendingFilteredRows[0]?.uom || "Nos",
    };
    const { widths: pendingWidths, startResize: startPendingResize } = useResizableColumns("colw:wor-pending", PENDING_WOR_WIDTHS);
    const { sortedRows: sortedPendingRows, sortConfig: pendingSortConfig, setSort: setPendingSort } = useSortableRows(pendingFilteredRows);

    const handleExport = async () => {
        const tid = toast.loading("Preparing Excel export…");
        try {
            await exportWorkOrderReport();
            toast.success("Work Order Report exported", { id: tid });
        } catch (err) {
            toast.error("Export failed: " + err.message, { id: tid });
        }
    };

    const handlePrint = () => window.print();

    const [selectedId, setSelectedId] = useState(null);
    const { data: selected, isLoading: selectedLoading } = useQuery({
        queryKey: ["work-order-view", selectedId],
        queryFn: () => fetchWorkOrder(selectedId),
        enabled: !!selectedId,
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-end gap-3">
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleExport} variant="outline" className="border-green-500 text-green-700 hover:bg-green-50">
                        <Download className="h-4 w-4 mr-2" /> Export Excel
                    </Button>
                    <Button onClick={handlePrint} variant="outline" className="border-blue-500 text-blue-700 hover:bg-blue-50">
                        <Printer className="h-4 w-4 mr-2" /> Print Report
                    </Button>
                </div>
            </div>

            {/* ── Report tabs (same pattern as Purchase Order Report) ───────────── */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger value="completed" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Completed WO
                    </TabsTrigger>
                    <TabsTrigger value="sales" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <BarChart3 className="h-4 w-4 mr-2" /> Sales
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <Clock className="h-4 w-4 mr-2" /> Pending WO
                    </TabsTrigger>
                </TabsList>

                {/* ── Search ──────────────────────────────────────────────────── */}
                <Card className="p-4 shadow-card mb-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search by client, project, work order number, status..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                </Card>

                {/* ── Completed WO Tab ─────────────────────────────────────────── */}
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
                                        <FilterableHeader label="WO Date" columnKey="wo_date" type="date" accessor={CompletedWORColumnAccessors.wo_date} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.wo_date} onResizeStart={startCompletedResize("wo_date")} rows={completedRowsAll} filterValue={completedFilters.wo_date} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="Client" columnKey="client_name" accessor={CompletedWORColumnAccessors.client_name} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.client_name} onResizeStart={startCompletedResize("client_name")} rows={completedRowsAll} filterValue={completedFilters.client_name} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="Project" columnKey="project" accessor={CompletedWORColumnAccessors.project} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.project} onResizeStart={startCompletedResize("project")} rows={completedRowsAll} filterValue={completedFilters.project} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="WO Number" columnKey="wo_number" accessor={CompletedWORColumnAccessors.wo_number} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.wo_number} onResizeStart={startCompletedResize("wo_number")} rows={completedRowsAll} filterValue={completedFilters.wo_number} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="Item" columnKey="item" accessor={CompletedWORColumnAccessors.item} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.item} onResizeStart={startCompletedResize("item")} rows={completedRowsAll} filterValue={completedFilters.item} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="WO Quantity" columnKey="total_quantity" type="number" align="right" accessor={CompletedWORColumnAccessors.total_quantity} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.total_quantity} onResizeStart={startCompletedResize("total_quantity")} rows={completedRowsAll} filterValue={completedFilters.total_quantity} onApplyFilter={setCompletedFilter} />
                                        <FilterableHeader label="Completed Quantity" columnKey="completed_quantity" type="number" align="right" accessor={CompletedWORColumnAccessors.completed_quantity} sortConfig={completedSortConfig} setSort={setCompletedSort} width={completedWidths.completed_quantity} onResizeStart={startCompletedResize("completed_quantity")} rows={completedRowsAll} filterValue={completedFilters.completed_quantity} onApplyFilter={setCompletedFilter} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {sortedCompletedRows.map((r, idx) => (
                                        <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]">
                                            <td className="px-2 py-3 text-center text-muted-foreground">{idx + 1}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground whitespace-nowrap">{r.wo_date}</td>
                                            <td className="px-2 py-3 text-center font-semibold text-foreground truncate" title={r.client_name}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedId(r.id)}>{r.client_name}</button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-muted-foreground truncate" title={r.project}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedId(r.id)}>{r.project}</button>
                                            </td>
                                            <td className="px-2 py-3 text-center font-semibold text-primary truncate" title={r.wo_number}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedId(r.id)}>{r.wo_number}</button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-foreground font-medium truncate" title={r.item}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedId(r.id)}>{r.item}</button>
                                            </td>
                                            <td className="px-2 py-3 text-center font-medium whitespace-nowrap">{r.total_quantity} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                            <td className="px-2 py-3 text-center font-bold text-success whitespace-nowrap">{r.completed_quantity} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                        </tr>
                                    ))}
                                    {!isLoading && sortedCompletedRows.length === 0 && (
                                        <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">No completed work orders yet.</td></tr>
                                    )}
                                </tbody>
                                {!isLoading && completedFilteredRows.length > 0 && (
                                    <tfoot className="sticky bottom-0">
                                        <tr className="border-t-2 text-sm" style={{ backgroundColor: "#EFF6FF", borderTopColor: "#2563EB" }}>
                                            <td className="p-2 text-center font-bold" style={{ color: "#1D4ED8" }} colSpan={6}>TOTAL</td>
                                            <td className="px-2 py-3 text-center font-bold text-blue-600 whitespace-nowrap">{completedTotals.total} <span className="text-[10px] font-normal text-muted-foreground">{completedTotals.uom}</span></td>
                                            <td className="px-2 py-3 text-center font-bold text-green-600 whitespace-nowrap">{completedTotals.completed} <span className="text-[10px] font-normal text-muted-foreground">{completedTotals.uom}</span></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </StickyScrollArea>
                    </Card>
                </TabsContent>

                {/* ── Sales (In Progress) Tab ──────────────────────────────────── */}
                <TabsContent value="sales" className="space-y-6">
                    <Card className="p-5 shadow-card">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>From Date</Label>
                                <Input type="date" value={salesFrom} onChange={(e) => setSalesFrom(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>To Date</Label>
                                <Input type="date" value={salesTo} onChange={(e) => setSalesTo(e.target.value)} />
                            </div>
                        </div>
                    </Card>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <Card className="p-5 shadow-card border-l-4 border-primary">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center"><IndianRupee className="h-5 w-5 text-primary" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Basic Sales</div>
                                    <div className="text-2xl font-bold text-foreground">{inr(salesTotals.subtotal)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-blue-500">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-blue-500/10 grid place-items-center"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total GST Amount</div>
                                    <div className="text-2xl font-bold text-foreground">{inr(salesTotals.gst)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-success">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-success/15 grid place-items-center"><TrendingUp className="h-5 w-5 text-success" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Basic Sales + GST</div>
                                    <div className="text-2xl font-bold text-foreground">{inr(salesTotals.subtotal + salesTotals.gst)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-accent">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-accent/15 grid place-items-center"><ClipboardList className="h-5 w-5 text-accent" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total no. Invoice</div>
                                    <div className="text-2xl font-bold text-foreground">{salesFilteredRows.length}</div>
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
                                        <FilterableHeader label="Date" columnKey="date" type="date" accessor={SalesWORColumnAccessors.date} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.date} onResizeStart={startSalesResize("date")} rows={salesRowsAll} filterValue={salesFilters.date} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="Invoice No" columnKey="invoice_number" accessor={SalesWORColumnAccessors.invoice_number} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.invoice_number} onResizeStart={startSalesResize("invoice_number")} rows={salesRowsAll} filterValue={salesFilters.invoice_number} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="WO Number" columnKey="wo_number" accessor={SalesWORColumnAccessors.wo_number} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.wo_number} onResizeStart={startSalesResize("wo_number")} rows={salesRowsAll} filterValue={salesFilters.wo_number} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="Subtotal" columnKey="subtotal" type="number" align="right" accessor={SalesWORColumnAccessors.subtotal} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.subtotal} onResizeStart={startSalesResize("subtotal")} rows={salesRowsAll} filterValue={salesFilters.subtotal} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="GST Amount" columnKey="gst_amount" type="number" align="right" accessor={SalesWORColumnAccessors.gst_amount} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.gst_amount} onResizeStart={startSalesResize("gst_amount")} rows={salesRowsAll} filterValue={salesFilters.gst_amount} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="Grand Total" columnKey="grand_total" type="number" align="right" accessor={SalesWORColumnAccessors.grand_total} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.grand_total} onResizeStart={startSalesResize("grand_total")} rows={salesRowsAll} filterValue={salesFilters.grand_total} onApplyFilter={setSalesFilter} />
                                        <FilterableHeader label="Payment" columnKey="payment_status" accessor={SalesWORColumnAccessors.payment_status} sortConfig={salesSortConfig} setSort={setSalesSort} width={salesWidths.payment_status} onResizeStart={startSalesResize("payment_status")} rows={salesRowsAll} filterValue={salesFilters.payment_status} onApplyFilter={setSalesFilter} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesLoading && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {sortedSalesRows.map((r, idx) => (
                                        <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]">
                                            <td className="px-2 py-3 text-center text-muted-foreground">{idx + 1}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground whitespace-nowrap">{r.date}</td>
                                            <td className="px-2 py-3 text-center text-primary font-medium truncate" title={r.invoice_number}>{r.invoice_number || "—"}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground truncate" title={r.wo_number}>{r.wo_number || "—"}</td>
                                            <td className="px-2 py-3 text-center font-medium">{inr(r.subtotal)}</td>
                                            <td className="px-2 py-3 text-center font-medium text-blue-500">{inr(r.gst_amount)}</td>
                                            <td className="px-2 py-3 text-center font-bold text-foreground">{inr(r.grand_total)}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground text-[11px]">{r.payment_status}</td>
                                        </tr>
                                    ))}
                                    {!salesLoading && sortedSalesRows.length === 0 && (
                                        <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">No work order sales match the filters.</td></tr>
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

                {/* ── Pending WO Tab ───────────────────────────────────────────── */}
                <TabsContent value="pending" className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card className="p-5 shadow-card border-l-4 border-warning">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-warning/10 grid place-items-center"><IndianRupee className="h-5 w-5 text-warning" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending Value</div>
                                    <div className="text-xl font-bold text-foreground">{inr(pendingTotals.value)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-indigo-500">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-indigo-500/10 grid place-items-center"><ClipboardList className="h-5 w-5 text-indigo-500" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Pending Work Orders</div>
                                    <div className="text-xl font-bold text-foreground">{pendingFilteredRows.length}</div>
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
                                        <FilterableHeader label="WO Date" columnKey="wo_date" type="date" accessor={PendingWORColumnAccessors.wo_date} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.wo_date} onResizeStart={startPendingResize("wo_date")} rows={pendingRowsAll} filterValue={pendingFilters.wo_date} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="WO Number" columnKey="wo_number" accessor={PendingWORColumnAccessors.wo_number} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.wo_number} onResizeStart={startPendingResize("wo_number")} rows={pendingRowsAll} filterValue={pendingFilters.wo_number} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Client" columnKey="client_name" accessor={PendingWORColumnAccessors.client_name} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.client_name} onResizeStart={startPendingResize("client_name")} rows={pendingRowsAll} filterValue={pendingFilters.client_name} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Project" columnKey="project" accessor={PendingWORColumnAccessors.project} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.project} onResizeStart={startPendingResize("project")} rows={pendingRowsAll} filterValue={pendingFilters.project} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Item" columnKey="item" accessor={PendingWORColumnAccessors.item} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.item} onResizeStart={startPendingResize("item")} rows={pendingRowsAll} filterValue={pendingFilters.item} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Total Qty" columnKey="total_quantity" type="number" align="right" accessor={PendingWORColumnAccessors.total_quantity} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.total_quantity} onResizeStart={startPendingResize("total_quantity")} rows={pendingRowsAll} filterValue={pendingFilters.total_quantity} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Completed Qty" columnKey="completed_quantity" type="number" align="right" accessor={PendingWORColumnAccessors.completed_quantity} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.completed_quantity} onResizeStart={startPendingResize("completed_quantity")} rows={pendingRowsAll} filterValue={pendingFilters.completed_quantity} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Pending Qty" columnKey="pending_quantity" type="number" align="right" accessor={PendingWORColumnAccessors.pending_quantity} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.pending_quantity} onResizeStart={startPendingResize("pending_quantity")} rows={pendingRowsAll} filterValue={pendingFilters.pending_quantity} onApplyFilter={setPendingFilter} />
                                        <FilterableHeader label="Status" columnKey="status" accessor={PendingWORColumnAccessors.status} sortConfig={pendingSortConfig} setSort={setPendingSort} width={pendingWidths.status} onResizeStart={startPendingResize("status")} rows={pendingRowsAll} filterValue={pendingFilters.status} onApplyFilter={setPendingFilter} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading && <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {sortedPendingRows.map((r, idx) => (
                                        <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]">
                                            <td className="px-2 py-3 text-center text-muted-foreground">{idx + 1}</td>
                                            <td className="px-2 py-3 text-center text-muted-foreground whitespace-nowrap">{r.wo_date}</td>
                                            <td className="px-2 py-3 text-center font-semibold text-primary truncate" title={r.wo_number}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedId(r.id)}>{r.wo_number}</button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-foreground truncate" title={r.client_name}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedId(r.id)}>{r.client_name}</button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-muted-foreground truncate" title={r.project}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedId(r.id)}>{r.project}</button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-foreground font-medium truncate" title={r.item}>
                                                <button type="button" className="text-center w-full text-primary hover:underline focus:outline-none" onClick={() => setSelectedId(r.id)}>{r.item}</button>
                                            </td>
                                            <td className="px-2 py-3 text-center font-medium whitespace-nowrap">{r.total_quantity} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                            <td className="px-2 py-3 text-center font-bold text-success whitespace-nowrap">{r.completed_quantity} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                            <td className="px-2 py-3 text-center font-bold text-warning whitespace-nowrap">{r.pending_quantity} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                        </tr>
                                    ))}
                                    {!isLoading && sortedPendingRows.length === 0 && (
                                        <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">No pending work orders match the filters.</td></tr>
                                    )}
                                </tbody>
                                {!isLoading && pendingFilteredRows.length > 0 && (
                                    <tfoot className="sticky bottom-0">
                                        <tr className="border-t-2 border-warning bg-warning/10 text-sm">
                                            <td className="px-2 py-3 text-center font-bold text-warning tracking-wide" colSpan={6}>TOTAL</td>
                                            <td className="px-2 py-3 text-center font-bold text-primary whitespace-nowrap">{pendingTotals.total} <span className="text-[10px] font-normal text-muted-foreground">{pendingTotals.uom}</span></td>
                                            <td className="px-2 py-3 text-center font-bold text-success whitespace-nowrap">{pendingTotals.completed} <span className="text-[10px] font-normal text-muted-foreground">{pendingTotals.uom}</span></td>
                                            <td className="px-2 py-3 text-center font-bold text-warning whitespace-nowrap">{pendingTotals.pending} <span className="text-[10px] font-normal text-muted-foreground">{pendingTotals.uom}</span></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </StickyScrollArea>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ── View Details Dialog ─────────────────────────────────────────── */}
            <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Work Order Details</DialogTitle></DialogHeader>
                    {selectedLoading && <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>}
                    {selected && (
                        <div className="space-y-4 py-2">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <Field label="Client" value={selected.client_name} />
                                <Field label="Project" value={selected.project || "—"} />
                                <Field label="Work Order No." value={selected.wo_number} />
                                <Field label="Work Order Date" value={selected.wo_date ? fmtDate(selected.wo_date) : "—"} />
                                <Field label="Site Location" value={selected.site_location || "—"} />
                                <Field label="Engineer / Supervisor" value={selected.engineer_name || "—"} />
                                <Field label="Priority" value={selected.priority || "—"} />
                                <Field label="Target Completion" value={selected.target_completion_date ? fmtDate(selected.target_completion_date) : "—"} />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <Card className="p-3 shadow-none border border-border">
                                    <div className="text-[10px] uppercase text-muted-foreground">Total Qty</div>
                                    <div className="text-lg font-bold text-foreground">{selected.total_quantity} <span className="text-xs font-normal text-muted-foreground">{selected.uom}</span></div>
                                </Card>
                                <Card className="p-3 shadow-none border border-border">
                                    <div className="text-[10px] uppercase text-muted-foreground">Completed</div>
                                    <div className="text-lg font-bold text-success">{selected.completed_quantity} <span className="text-xs font-normal text-muted-foreground">{selected.uom}</span></div>
                                </Card>
                                <Card className="p-3 shadow-none border border-border">
                                    <div className="text-[10px] uppercase text-muted-foreground">Pending</div>
                                    <div className="text-lg font-bold text-warning">{selected.pending_quantity} <span className="text-xs font-normal text-muted-foreground">{selected.uom}</span></div>
                                </Card>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-600">Subtotal:</span>
                                        <span className="text-sm font-bold text-slate-900">{inr(selected.subtotal || 0)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-600">GST:</span>
                                        <span className="text-sm font-bold text-slate-900">{inr(selected.gst_amount || 0)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-md border border-primary/20">
                                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Grand Total:</span>
                                    <span className="text-base font-black text-primary">{inr(selected.grand_total || 0)}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <StatusBadge status={selected.status || "Pending"} label={selected.status || "Pending"} />
                                <span className="text-xs text-muted-foreground">Created by {selected.created_by || "—"} on {selected.created_at ? fmtDateTime(selected.created_at) : "—"}</span>
                            </div>

                            {selected.work_description && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Work Description</Label>
                                    <Textarea value={selected.work_description} disabled rows={2} className="opacity-100" />
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button>
                        {selected && (
                            <Button variant="outline" onClick={() => openWODocument(selected.id)}>
                                <Printer className="h-4 w-4 mr-2" /> Print
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const Field = ({ label, value }) => (
    <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground break-words">{value ?? "—"}</div>
    </div>
);

export default WorkOrderReport;
