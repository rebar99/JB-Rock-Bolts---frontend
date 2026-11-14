import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountsStore, fetchAccountsStoreDetail } from "@/lib/api";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { useColumnFilters } from "@/hooks/useColumnFilters";
import { useSortableRows } from "@/hooks/useSortableRows";
import { FilterableHeader } from "@/components/FilterableHeader";
import { Search, Eye, X, Calendar, Package, RotateCcw, ChevronDown, ChevronUp, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STORE_COLUMN_ACCESSORS = {
    vendor_name: (r) => r.vendor_name || "",
    items: (r) => (r.items?.length > 0 ? r.items.map(i => i.item_description || i.item).filter(Boolean).join(", ") : r.item_name || ""),
    po_number: (r) => r.po_number || "",
    invoice_number: (r) => r.receipt_number || "",
    po_date: (r) => r.po_date || "",
    order_qty: (r) => r.order_qty ?? "",
    received_qty: (r) => r.received_qty ?? "",
    amount: (r) => r.amount ?? "",
    status: (r) => r.status || "",
    received_date: (r) => r.received_date || "",
    payment_status: (r) => r.payment_status || "",
};

const DEFAULT_COL_WIDTHS = {
    sno: 55,
    vendor_name: 200,
    items: 260,
    po_number: 140,
    invoice_number: 125,
    po_date: 110,
    order_qty: 100,
    received_qty: 100,
    amount: 130,
    status: 140,
    received_date: 115,
    payment_status: 105,
    action: 95,
};

function StatusBadge({ status }) {
    if (status === "Fully Received")
        return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 whitespace-nowrap">✓ Fully Received</span>;
    if (status === "Partially Received")
        return <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 whitespace-nowrap">◑ Partially Received</span>;
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 whitespace-nowrap">○ Pending</span>;
}

function PaymentBadge({ status }) {
    if (!status) return <span className="text-slate-400 text-xs">—</span>;
    const color = status === "Paid" ? "bg-green-100 text-green-700" : status === "Partial" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700";
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${color}`}>{status}</span>;
}

function ItemCell({ items = [], fallbackName = "" }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const safeItems = items && items.length > 0 ? items : (fallbackName ? [{ item_description: fallbackName }] : []);
    if (safeItems.length === 0) {
        return <span className="text-slate-400 text-xs">—</span>;
    }

    const first = safeItems[0];
    const count = safeItems.length;

    if (!isExpanded) {
        return (
            <div className="py-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-xs text-slate-900" title={first.item_description || first.item}>
                        {first.item_description || first.item}
                    </span>
                    {count > 1 && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 transition cursor-pointer"
                            title={`Click to view all ${count} items`}
                        >
                            +{count - 1} more <ChevronDown className="h-3 w-3" />
                        </button>
                    )}
                </div>
                {(first.received_quantity > 0 || first.ordered_quantity > 0 || first.unit_rate > 0) && (
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {first.received_quantity || first.ordered_quantity ? `${Number(first.received_quantity || first.ordered_quantity).toLocaleString("en-IN")} ${first.uom || "Nos"}` : ""}
                        {first.unit_rate > 0 && <span className="text-slate-400 mx-1.5">•</span>}
                        {first.unit_rate > 0 && <span>Rate: ₹{Number(first.unit_rate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                    </p>
                )}
            </div>
        );
    }

    // Expanded view — shows all items clearly with descriptions, quantities and rates
    return (
        <div className="py-1 space-y-1.5">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    All {count} Items:
                </span>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(false);
                    }}
                    className="inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                >
                    Collapse <ChevronUp className="h-3 w-3" />
                </button>
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {safeItems.map((it, idx) => (
                    <div key={idx} className="rounded-md bg-slate-50 p-2 border border-slate-200/70">
                        <p className="font-semibold text-xs text-slate-900 leading-tight">
                            {idx + 1}. {it.item_description || it.item}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1">
                            <span>
                                <span className="font-medium text-slate-700">
                                    {Number(it.received_quantity || it.ordered_quantity || 0).toLocaleString("en-IN")} {it.uom || "Nos"}
                                </span>
                                {it.unit_rate > 0 && (
                                    <span className="text-slate-500 ml-2">
                                        Rate: ₹{Number(it.unit_rate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                )}
                            </span>
                            {it.amount > 0 && (
                                <span className="font-bold text-slate-900">
                                    ₹{Number(it.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ResizableTh({ label, width, onResizeStart, align = "left", className = "" }) {
    return (
        <th
            style={{ width, minWidth: width, maxWidth: width }}
            className={`relative select-none border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`}
        >
            <span className="truncate block" title={label}>{label}</span>
            {onResizeStart && (
                <div
                    onMouseDown={onResizeStart}
                    className="group absolute right-0 top-0 h-full w-2.5 cursor-col-resize hover:bg-emerald-500/20 active:bg-emerald-500/40 z-10 flex justify-center"
                    title="Drag to resize column"
                >
                    <div className="w-[2px] h-full bg-slate-300 group-hover:bg-emerald-600 group-active:bg-emerald-600 transition-colors" />
                </div>
            )}
        </th>
    );
}

function DetailModal({ poId, open, onClose }) {
    const { data, isLoading } = useQuery({
        queryKey: ["accounts-store-detail", poId],
        queryFn: () => fetchAccountsStoreDetail(poId),
        enabled: !!poId && open,
    });

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-800">
                        <Package className="h-5 w-5 text-emerald-600" />
                        PO & Receipt Detail — {data?.order_number || "Loading..."}
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-12 text-center text-slate-400">Loading...</div>
                ) : !data ? (
                    <div className="py-12 text-center text-slate-400">Data not found</div>
                ) : (
                    <div className="space-y-6 text-sm">
                        {/* PO Header */}
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-emerald-700">Purchase Order Details</p>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                                <div><span className="text-xs text-slate-500">PO Number</span><p className="font-semibold text-slate-900">{data.order_number}</p></div>
                                <div><span className="text-xs text-slate-500">PO Date</span><p className="font-semibold text-slate-900">{data.po_date || "—"}</p></div>
                                <div><span className="text-xs text-slate-500">Vendor</span><p className="font-semibold text-slate-900">{data.supplier}</p></div>
                                <div><span className="text-xs text-slate-500">PO Type</span><p className="font-semibold text-slate-900">{data.po_type}</p></div>
                                <div><span className="text-xs text-slate-500">Status</span><p className="font-semibold text-slate-900">{data.status}</p></div>
                                <div><span className="text-xs text-slate-500">Grand Total</span><p className="font-semibold text-slate-900">₹{Number(data.grand_total || 0).toLocaleString("en-IN")}</p></div>
                                <div><span className="text-xs text-slate-500">Prepared By</span><p className="font-semibold text-slate-900">{data.created_by || "—"}</p></div>
                                {data.remark_1 && <div className="col-span-2"><span className="text-xs text-slate-500">Remark 1</span><p className="font-semibold text-slate-900">{data.remark_1}</p></div>}
                                {data.remark_2 && <div className="col-span-2"><span className="text-xs text-slate-500">Remark 2</span><p className="font-semibold text-slate-900">{data.remark_2}</p></div>}
                            </div>
                        </div>

                        {/* PO Lines */}
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">Original PO Order Items</p>
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50">
                                        <tr>{["Item Description", "UOM", "Qty", "Rate", "Amount"].map(h => <th key={h} className="border-b px-3 py-2 text-left font-semibold text-slate-600">{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {(data.lines || []).map((line, i) => (
                                            <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                                                <td className="px-3 py-2 font-medium">{line.item_description}</td>
                                                <td className="px-3 py-2 text-slate-500">{line.uom || "—"}</td>
                                                <td className="px-3 py-2">{line.quantity}</td>
                                                <td className="px-3 py-2">₹{Number(line.unit_rate).toLocaleString("en-IN")}</td>
                                                <td className="px-3 py-2 font-semibold">₹{Number(line.amount).toLocaleString("en-IN")}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Material Receipts */}
                        {data.receipts?.length > 0 && (
                            <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">Material Received Records</p>
                                <div className="space-y-3">
                                    {data.receipts.map((receipt) => (
                                        <div key={receipt.id} className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                                            <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                                                <div><span className="text-[10px] text-slate-500 uppercase">Invoice / Receipt No.</span><p className="font-semibold text-slate-800">{receipt.receipt_number}</p></div>
                                                <div><span className="text-[10px] text-slate-500 uppercase">Received Date</span><p className="font-semibold text-slate-800">{receipt.invoice_date || "—"}</p></div>
                                                <div><span className="text-[10px] text-slate-500 uppercase">Received By</span><p className="font-semibold text-slate-800">{receipt.created_by || "—"}</p></div>
                                                <div><span className="text-[10px] text-slate-500 uppercase">Payment</span><p><PaymentBadge status={receipt.payment_status} /></p></div>
                                            </div>
                                            <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-slate-50">
                                                        <tr>{["Item", "Order Qty", "Received Qty", "Rate", "Amount"].map(h => <th key={h} className="border-b px-3 py-2 text-left font-semibold text-slate-600">{h}</th>)}</tr>
                                                    </thead>
                                                    <tbody>
                                                        {(receipt.lines || []).map((rl, ri) => (
                                                            <tr key={ri} className="border-b last:border-0 hover:bg-slate-50">
                                                                <td className="px-3 py-2 font-medium">{rl.item_description}</td>
                                                                <td className="px-3 py-2">{rl.ordered_quantity}</td>
                                                                <td className="px-3 py-2 font-semibold text-emerald-700">{rl.received_quantity}</td>
                                                                <td className="px-3 py-2">₹{Number(rl.unit_rate).toLocaleString("en-IN")}</td>
                                                                <td className="px-3 py-2 font-semibold">₹{Number(rl.amount).toLocaleString("en-IN")}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {data.receipts?.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                                No material received against this PO yet.
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default function StoreAccounts() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [vendorFilter, setVendorFilter] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [selectedPoId, setSelectedPoId] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);

    // Resizable columns hook — drag column borders left/right to adjust size
    const { widths, startResize, resetWidths } = useResizableColumns("colw:store-accounts-table-v2", DEFAULT_COL_WIDTHS);
    const { filters: columnFilters, setFilter: setColumnFilter, clearAllFilters } = useColumnFilters();

    const { data: rows = [], isLoading, error } = useQuery({
        queryKey: ["accounts-store"],
        queryFn: fetchAccountsStore,
        staleTime: 30_000,
    });

    const vendors = useMemo(() => [...new Set(rows.map(r => r.vendor_name).filter(Boolean))].sort(), [rows]);

    const searchFiltered = useMemo(() => {
        return rows.filter(row => {
            const q = search.toLowerCase();
            const matchSearch = !q || [
                row.vendor_name,
                row.item_name,
                row.po_number,
                row.receipt_number,
                row.received_by,
                ...(row.items || []).map(i => i.item_description)
            ].some(v => (v || "").toLowerCase().includes(q));
            const matchStatus = statusFilter === "All" || row.status === statusFilter;
            const matchVendor = !vendorFilter || row.vendor_name === vendorFilter;
            const rowDate = row.received_date || row.po_date || "";
            const matchFrom = !dateFrom || rowDate >= dateFrom;
            const matchTo = !dateTo || rowDate <= dateTo;
            return matchSearch && matchStatus && matchVendor && matchFrom && matchTo;
        });
    }, [rows, search, statusFilter, vendorFilter, dateFrom, dateTo]);

    const columnFiltered = useMemo(() => {
        const keys = Object.keys(columnFilters);
        if (keys.length === 0) return searchFiltered;
        return searchFiltered.filter((r) =>
            keys.every((k) => {
                const fn = STORE_COLUMN_ACCESSORS[k];
                const v = fn ? fn(r) : r[k];
                return columnFilters[k].has(v == null || v === "" ? "—" : String(v));
            })
        );
    }, [searchFiltered, columnFilters]);

    const { sortedRows, sortConfig, setSort } = useSortableRows(columnFiltered);

    const activeColumnFiltersCount = Object.keys(columnFilters).length;

    const openDetail = (poId) => { setSelectedPoId(poId); setDetailOpen(true); };
    const closeDetail = () => { setDetailOpen(false); setSelectedPoId(null); };

    const summary = useMemo(() => ({
        total: rows.length,
        full: rows.filter(r => r.status === "Fully Received").length,
        partial: rows.filter(r => r.status === "Partially Received").length,
        totalAmount: rows.reduce((acc, r) => acc + Number(r.amount || 0), 0),
    }), [rows]);

    const totalTableWidth = useMemo(() => {
        return Object.values(widths).reduce((sum, w) => sum + (Number(w) || 100), 0);
    }, [widths]);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {/* Page Header */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store Accounts</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Materials received entries auto-fetched from Store Workspace ({rows.length} total receiving transactions).
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={resetWidths}
                    className="text-xs h-8 text-slate-600 hover:text-slate-900"
                    title="Reset column widths to default"
                >
                    <RotateCcw className="mr-1.5 h-3 w-3" />
                    Reset Column Sizes
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: "Total Materials Received", value: summary.total, color: "bg-slate-50 text-slate-700 border-slate-200" },
                    { label: "Fully Received", value: summary.full, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                    { label: "Partially Received", value: summary.partial, color: "bg-amber-50 text-amber-700 border-amber-200" },
                    { label: "Total Received Value", value: `₹${Number(summary.totalAmount).toLocaleString("en-IN")}`, color: "bg-blue-50 text-blue-700 border-blue-200" },
                ].map(c => (
                    <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
                        <p className="text-xs font-medium opacity-70">{c.label}</p>
                        <p className="mt-1 text-2xl font-bold">{c.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-3">
                <div className="relative min-w-[200px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input placeholder="Search vendor, item, PO, invoice..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="All">All Status</option>
                    <option value="Fully Received">Fully Received</option>
                    <option value="Partially Received">Partially Received</option>
                </select>
                <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm max-w-[200px]">
                    <option value="">All Vendors</option>
                    {vendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-sm w-36" placeholder="From" />
                    <span className="text-slate-400">—</span>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-sm w-36" placeholder="To" />
                </div>
                {(search || statusFilter !== "All" || vendorFilter || dateFrom || dateTo || activeColumnFiltersCount > 0) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setSearch("");
                            setStatusFilter("All");
                            setVendorFilter("");
                            setDateFrom("");
                            setDateTo("");
                            clearAllFilters();
                        }}
                        className="h-9 text-slate-500 hover:text-slate-900"
                    >
                        <X className="mr-1 h-3.5 w-3.5" /> Clear All Filters
                    </Button>
                )}
                {activeColumnFiltersCount > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAllFilters}
                        className="h-9 text-xs border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    >
                        <FilterX className="mr-1.5 h-3.5 w-3.5" />
                        Clear Column Filters ({activeColumnFiltersCount})
                    </Button>
                )}
            </div>

            {/* Table with Resizable Columns & Excel-like Filterable Headers */}
            {isLoading ? (
                <div className="flex h-48 items-center justify-center text-slate-400">Loading store accounts...</div>
            ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-600 text-sm">{error.message || "Failed to load data"}</div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table style={{ width: totalTableWidth, minWidth: "100%" }} className="w-full text-sm border-collapse table-fixed">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                <th style={{ width: widths.sno, minWidth: widths.sno, maxWidth: widths.sno }} className="px-3 py-3 text-center">
                                    S.No.
                                </th>
                                <FilterableHeader
                                    label="Vendor Name"
                                    columnKey="vendor_name"
                                    accessor={STORE_COLUMN_ACCESSORS.vendor_name}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.vendor_name}
                                    onResizeStart={startResize("vendor_name")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.vendor_name}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="Items Received"
                                    columnKey="items"
                                    accessor={STORE_COLUMN_ACCESSORS.items}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.items}
                                    onResizeStart={startResize("items")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.items}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="PO No."
                                    columnKey="po_number"
                                    accessor={STORE_COLUMN_ACCESSORS.po_number}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.po_number}
                                    onResizeStart={startResize("po_number")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.po_number}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="Invoice No."
                                    columnKey="invoice_number"
                                    accessor={STORE_COLUMN_ACCESSORS.invoice_number}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.invoice_number}
                                    onResizeStart={startResize("invoice_number")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.invoice_number}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="PO Date"
                                    columnKey="po_date"
                                    type="date"
                                    accessor={STORE_COLUMN_ACCESSORS.po_date}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.po_date}
                                    onResizeStart={startResize("po_date")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.po_date}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="Order Qty"
                                    columnKey="order_qty"
                                    type="number"
                                    align="right"
                                    accessor={STORE_COLUMN_ACCESSORS.order_qty}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.order_qty}
                                    onResizeStart={startResize("order_qty")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.order_qty}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="Recd Qty"
                                    columnKey="received_qty"
                                    type="number"
                                    align="right"
                                    accessor={STORE_COLUMN_ACCESSORS.received_qty}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.received_qty}
                                    onResizeStart={startResize("received_qty")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.received_qty}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="Total Amount"
                                    columnKey="amount"
                                    type="number"
                                    align="right"
                                    accessor={STORE_COLUMN_ACCESSORS.amount}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.amount}
                                    onResizeStart={startResize("amount")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.amount}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="Status"
                                    columnKey="status"
                                    accessor={STORE_COLUMN_ACCESSORS.status}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.status}
                                    onResizeStart={startResize("status")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.status}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="Received Date"
                                    columnKey="received_date"
                                    type="date"
                                    accessor={STORE_COLUMN_ACCESSORS.received_date}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.received_date}
                                    onResizeStart={startResize("received_date")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.received_date}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <FilterableHeader
                                    label="Payment"
                                    columnKey="payment_status"
                                    accessor={STORE_COLUMN_ACCESSORS.payment_status}
                                    sortConfig={sortConfig}
                                    setSort={setSort}
                                    width={widths.payment_status}
                                    onResizeStart={startResize("payment_status")}
                                    rows={searchFiltered}
                                    filterValue={columnFilters.payment_status}
                                    onApplyFilter={setColumnFilter}
                                    className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                />
                                <th style={{ width: widths.action, minWidth: widths.action, maxWidth: widths.action }} className="px-3 py-3 text-center border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedRows.length === 0 ? (
                                <tr><td colSpan={13} className="py-14 text-center text-slate-400">No records found.</td></tr>
                            ) : sortedRows.map((row, i) => (
                                <tr key={row.receipt_id || i} className="hover:bg-slate-50 transition-colors">
                                    <td style={{ width: widths.sno }} className="px-3 py-2.5 text-slate-500 text-xs text-center">{i + 1}</td>
                                    <td style={{ width: widths.vendor_name }} className="px-3 py-2.5 font-medium text-slate-800 truncate" title={row.vendor_name}>
                                        {row.vendor_name || "—"}
                                    </td>
                                    <td style={{ width: widths.items }} className="px-3 py-2.5 text-slate-700">
                                        <ItemCell items={row.items} fallbackName={row.item_name} />
                                    </td>
                                    <td style={{ width: widths.po_number }} className="px-3 py-2.5 font-mono text-xs text-slate-800 truncate" title={row.po_number}>{row.po_number}</td>
                                    <td style={{ width: widths.invoice_number }} className="px-3 py-2.5 font-mono text-xs text-slate-600 truncate" title={row.receipt_number}>{row.receipt_number || "—"}</td>
                                    <td style={{ width: widths.po_date }} className="px-3 py-2.5 text-slate-600 text-xs truncate">{row.po_date || "—"}</td>
                                    <td style={{ width: widths.order_qty }} className="px-3 py-2.5 text-right tabular-nums truncate">{row.order_qty}</td>
                                    <td style={{ width: widths.received_qty }} className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700 truncate">{row.received_qty}</td>
                                    <td style={{ width: widths.amount }} className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900 truncate">
                                        ₹{Number(row.amount).toLocaleString("en-IN")}
                                    </td>
                                    <td style={{ width: widths.status }} className="px-3 py-2.5 truncate"><StatusBadge status={row.status} /></td>
                                    <td style={{ width: widths.received_date }} className="px-3 py-2.5 text-slate-600 text-xs truncate">{row.received_date || "—"}</td>
                                    <td style={{ width: widths.payment_status }} className="px-3 py-2.5 truncate"><PaymentBadge status={row.payment_status} /></td>
                                    <td style={{ width: widths.action }} className="px-3 py-2.5 text-center">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openDetail(row.po_id)}
                                            className="h-7 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                        >
                                            <Eye className="mr-1 h-3.5 w-3.5" /> View
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {sortedRows.length > 0 && (
                        <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                            Showing {sortedRows.length} of {rows.length} receipts
                        </div>
                    )}
                </div>
            )}

            <DetailModal poId={selectedPoId} open={detailOpen} onClose={closeDetail} />
        </div>
    );
}
