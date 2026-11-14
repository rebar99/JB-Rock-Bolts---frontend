import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountsMarketing } from "@/lib/api";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { useColumnFilters } from "@/hooks/useColumnFilters";
import { useSortableRows } from "@/hooks/useSortableRows";
import { FilterableHeader } from "@/components/FilterableHeader";
import {
    Search,
    Download,
    TrendingUp,
    FileText,
    Receipt,
    FileMinus,
    Eye,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    CheckCircle2,
    Clock,
    AlertCircle,
    RotateCcw,
    Package,
    Layers,
    FilterX,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SALES_ACCESSORS = {
    client_name: (r) => r.client_name || "",
    invoice_number: (r) => r.invoices_summary || r.invoice_number || "",
    ref_number: (r) => r.po_number || "",
    date: (r) => r.latest_invoice_date || r.invoice_date || r.po_date || "",
    items: (r) => (r.items?.length > 0 ? r.items.map(it => it.item || it.item_description).filter(Boolean).join(", ") : r.items_summary || ""),
    po_qty: (r) => r.po_qty ?? "",
    dispatch_qty: (r) => r.total_dispatch_qty ?? r.dispatch_qty ?? "",
    subtotal: (r) => r.subtotal ?? "",
    gst: (r) => r.gst_amount ?? "",
    freight: (r) => r.freight ?? "",
    grand_total: (r) => r.grand_total ?? "",
    payment: (r) => r.payment_status || "",
    delivery: (r) => r.delivery_status || "",
};

const WO_SALES_ACCESSORS = {
    client_name: (r) => r.client_name || "",
    invoice_number: (r) => r.invoices_summary || r.invoice_number || "",
    ref_number: (r) => r.wo_number || "",
    date: (r) => r.latest_invoice_date || r.invoice_date || r.wo_date || "",
    items: (r) => (r.items?.length > 0 ? r.items.map(it => it.item || it.item_description).filter(Boolean).join(", ") : r.items_summary || ""),
    po_qty: (r) => r.po_qty ?? "",
    dispatch_qty: (r) => r.total_dispatch_qty ?? r.dispatch_qty ?? "",
    subtotal: (r) => r.subtotal ?? "",
    gst: (r) => r.gst_amount ?? "",
    freight: (r) => r.freight ?? "",
    grand_total: (r) => r.grand_total ?? "",
    payment: (r) => r.payment_status || "",
    delivery: (r) => r.delivery_status || "",
};

const CN_ACCESSORS = {
    cn_number: (r) => r.cn_number || "",
    date: (r) => r.cn_date || "",
    type: (r) => r.sale_type || "",
    invoice_number: (r) => r.invoice_number || "",
    client_name: (r) => r.client_name || "",
    items: (r) => (r.items?.length > 0 ? r.items.map(it => it.item || it.item_description).filter(Boolean).join(", ") : r.items_summary || ""),
    reason: (r) => r.reason || "",
    taxable: (r) => r.taxable_amount ?? "",
    gst: (r) => r.gst_amount ?? "",
    total: (r) => r.total_amount ?? "",
    status: (r) => r.status || "",
};

const money = val => `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = val => Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const DEFAULT_SALES_WIDTHS = {
    sno: 55,
    client_name: 210,
    invoice_number: 135,
    ref_number: 135,
    date: 105,
    items: 220,
    po_qty: 100,
    dispatch_qty: 105,
    subtotal: 115,
    gst: 95,
    freight: 90,
    grand_total: 130,
    payment: 110,
    delivery: 115,
    action: 70,
};

const DEFAULT_CN_WIDTHS = {
    sno: 55,
    cn_number: 120,
    date: 105,
    type: 100,
    invoice_number: 140,
    client_name: 220,
    items: 220,
    reason: 160,
    taxable: 115,
    gst: 95,
    total: 130,
    status: 105,
    action: 70,
};

function ItemCell({ items = [], color = "blue" }) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!items || items.length === 0) {
        return <span className="text-slate-400 text-xs">—</span>;
    }

    const first = items[0];
    const count = items.length;

    const badgeColor =
        color === "indigo"
            ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
            : color === "rose"
            ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
            : "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200";

    if (!isExpanded) {
        return (
            <div className="py-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-xs text-slate-900" title={first.item}>
                        {first.item}
                    </span>
                    {count > 1 && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(true);
                            }}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition cursor-pointer ${badgeColor}`}
                            title={`Click to view all ${count} items`}
                        >
                            +{count - 1} more <ChevronDown className="h-3 w-3" />
                        </button>
                    )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {qty(first.quantity || first.credit_qty)} {first.uom || "Nos"}
                    {first.unit_price > 0 && <span className="text-slate-400 mx-1.5">•</span>}
                    {first.unit_price > 0 && <span>Rate: {money(first.unit_price)}</span>}
                </p>
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
                {items.map((it, idx) => (
                    <div key={idx} className="rounded-md bg-slate-50 p-2 border border-slate-200/70">
                        <p className="font-semibold text-xs text-slate-900 leading-tight">
                            {idx + 1}. {it.item}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1">
                            <span>
                                <span className="font-medium text-slate-700">
                                    {qty(it.quantity || it.credit_qty)} {it.uom || "Nos"}
                                </span>
                                {it.unit_price > 0 && (
                                    <span className="text-slate-500 ml-2">Rate: {money(it.unit_price)}</span>
                                )}
                            </span>
                            {it.total_amount > 0 && (
                                <span className="font-bold text-slate-900">{money(it.total_amount)}</span>
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
            className={`relative select-none border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ${
                align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
            } ${className}`}
        >
            <span className="truncate block" title={label}>{label}</span>
            {onResizeStart && (
                <div
                    onMouseDown={onResizeStart}
                    className="group absolute right-0 top-0 h-full w-3 cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40 z-10 flex justify-center items-center"
                    title="Drag to resize column width"
                >
                    <div className="w-[2px] h-4/5 bg-slate-300 group-hover:bg-blue-600 group-active:bg-blue-600 transition-colors" />
                </div>
            )}
        </th>
    );
}

function SummaryCard({ label, count, amount, icon: Icon, color, bg }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{amount != null ? money(amount) : count}</p>
                    {count != null && amount != null && (
                        <p className="mt-0.5 text-xs text-slate-500">{count} total recorded</p>
                    )}
                </div>
                <div className={`grid h-12 w-12 place-items-center rounded-xl ${bg} ${color}`}>
                    <Icon className="h-6 w-6" />
                </div>
            </div>
        </div>
    );
}

function PaymentBadge({ status }) {
    const s = String(status || "").toLowerCase();
    if (s === "paid") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Paid
            </span>
        );
    }
    if (s.includes("part")) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                <Clock className="h-3 w-3" /> Partial
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
            <AlertCircle className="h-3 w-3" /> Pending
        </span>
    );
}

function DeliveryBadge({ status }) {
    const s = String(status || "").toLowerCase();
    if (s === "delivered") {
        return <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Delivered</span>;
    }
    if (s.includes("part")) {
        return <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Partially Delivered</span>;
    }
    return <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{status || "Not Delivered"}</span>;
}

const csvExport = (filename, rows) => {
    const esc = x => `"${String(x ?? "").replaceAll('"', '""')}"`;
    const text = rows.map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

export default function MarketingAccounts() {
    const [tab, setTab] = useState("sales"); // "sales" | "wo_sales" | "credit_notes"
    const [groupByPo, setGroupByPo] = useState(true);
    const [expandedPoRows, setExpandedPoRows] = useState({});
    const togglePoExpand = id => setExpandedPoRows(prev => ({ ...prev, [id]: !prev[id] }));
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [expandedRows, setExpandedRows] = useState({});
    const [viewItem, setViewItem] = useState(null);

    // Resizable columns for Sales & WO Sales
    const {
        widths: salesWidths,
        startResize: startSalesResize,
        resetWidths: resetSalesWidths
    } = useResizableColumns("colw:marketing-accounts-sales-v2", DEFAULT_SALES_WIDTHS);

    // Resizable columns for Credit Notes
    const {
        widths: cnWidths,
        startResize: startCnResize,
        resetWidths: resetCnWidths
    } = useResizableColumns("colw:marketing-accounts-cn-v1", DEFAULT_CN_WIDTHS);

    const totalSalesWidth = useMemo(
        () => Object.values(salesWidths).reduce((a, b) => a + b, 0),
        [salesWidths]
    );
    const totalCnWidth = useMemo(
        () => Object.values(cnWidths).reduce((a, b) => a + b, 0),
        [cnWidths]
    );

    const { data, isLoading } = useQuery({
        queryKey: ["accounts-marketing"],
        queryFn: fetchAccountsMarketing,
        staleTime: 30_000,
    });

    const summary = data?.summary || {
        sales_count: 0,
        sales_amount: 0,
        wo_sales_count: 0,
        wo_sales_amount: 0,
        credit_notes_count: 0,
        credit_notes_amount: 0,
        net_revenue: 0,
    };

    const salesList = useMemo(() => {
        const list = data?.sales || [];
        const q = search.trim().toLowerCase();
        return list.filter(item => {
            const matchesSearch =
                !q ||
                `${item.client_name} ${item.invoice_number} ${item.po_number} ${item.project} ${item.items_summary}`
                    .toLowerCase()
                    .includes(q);
            const matchesStatus =
                statusFilter === "all" ||
                String(item.payment_status).toLowerCase() === statusFilter.toLowerCase();
            return matchesSearch && matchesStatus;
        });
    }, [data?.sales, search, statusFilter]);

    const woSalesList = useMemo(() => {
        const list = data?.wo_sales || [];
        const q = search.trim().toLowerCase();
        return list.filter(item => {
            const matchesSearch =
                !q ||
                `${item.client_name} ${item.invoice_number} ${item.wo_number} ${item.project} ${item.items_summary}`
                    .toLowerCase()
                    .includes(q);
            const matchesStatus =
                statusFilter === "all" ||
                String(item.payment_status).toLowerCase() === statusFilter.toLowerCase();
            return matchesSearch && matchesStatus;
        });
    }, [data?.wo_sales, search, statusFilter]);

    // Grouping for Marketing Sales: All dispatches of the same PO consolidated together
    const groupedSales = useMemo(() => {
        const map = new Map();
        for (const sale of salesList) {
            const key = sale.po_id ? `po_${sale.po_id}` : (sale.po_number && sale.po_number !== "—" ? `ponum_${sale.po_number}` : `sale_${sale.id}`);
            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    po_id: sale.po_id,
                    po_number: sale.po_number || "—",
                    client_name: sale.client_name || "—",
                    project: sale.project || "—",
                    po_date: sale.po_date || sale.invoice_date,
                    po_qty: Number(sale.po_qty || 0),
                    dispatches: [],
                    items: [],
                    subtotal: 0,
                    gst_amount: 0,
                    freight: 0,
                    grand_total: 0,
                    total_dispatch_qty: 0,
                });
            }
            const group = map.get(key);
            group.dispatches.push(sale);
            group.total_dispatch_qty += Number(sale.dispatch_qty || 0);
            group.subtotal += Number(sale.subtotal || 0);
            group.gst_amount += Number(sale.gst_amount || 0);
            group.freight += Number(sale.freight || 0);
            group.grand_total += Number(sale.grand_total || 0);

            if (!group.po_qty && sale.po_qty) {
                group.po_qty = Number(sale.po_qty);
            }

            for (const it of (sale.items || [])) {
                const existing = group.items.find(x => x.item === it.item);
                if (existing) {
                    existing.quantity = (existing.quantity || 0) + Number(it.quantity || 0);
                    existing.total_amount = (existing.total_amount || 0) + Number(it.total_amount || 0);
                } else {
                    group.items.push({ ...it });
                }
            }
        }

        return Array.from(map.values()).map(g => {
            const hasUnpaid = g.dispatches.some(d => d.payment_status === "Pending" || d.payment_status === "Unpaid");
            const hasPaid = g.dispatches.some(d => d.payment_status === "Paid");
            const allPaid = g.dispatches.every(d => d.payment_status === "Paid");
            const payment_status = allPaid ? "Paid" : (hasPaid && hasUnpaid ? "Partially Paid" : (hasPaid ? "Paid" : "Pending"));
            const balance_qty = Math.max(0, (g.po_qty || 0) - g.total_dispatch_qty);
            const delivery_status = balance_qty <= 0 && g.total_dispatch_qty > 0 ? "Delivered" : (g.total_dispatch_qty > 0 ? "Partial" : "Not Delivered");

            return {
                ...g,
                balance_qty,
                payment_status: g.dispatches.length === 1 ? g.dispatches[0].payment_status : payment_status,
                delivery_status: g.dispatches.length === 1 ? g.dispatches[0].delivery_status : delivery_status,
                latest_invoice_date: g.dispatches[0]?.invoice_date || g.po_date,
                invoices_summary: g.dispatches.map(d => d.invoice_number).filter(Boolean).join(", "),
            };
        });
    }, [salesList]);

    // Grouping for Work Order Sales: All dispatches of the same WO consolidated together
    const groupedWoSales = useMemo(() => {
        const map = new Map();
        for (const ws of woSalesList) {
            const key = ws.wo_id ? `wo_${ws.wo_id}` : (ws.wo_number && ws.wo_number !== "—" ? `wonum_${ws.wo_number}` : `wosale_${ws.id}`);
            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    wo_id: ws.wo_id,
                    wo_number: ws.wo_number || "—",
                    client_name: ws.client_name || "—",
                    project: ws.project || "—",
                    wo_date: ws.wo_date || ws.invoice_date,
                    po_qty: Number(ws.po_qty || 0),
                    dispatches: [],
                    items: [],
                    subtotal: 0,
                    gst_amount: 0,
                    freight: 0,
                    grand_total: 0,
                    total_dispatch_qty: 0,
                });
            }
            const group = map.get(key);
            group.dispatches.push(ws);
            group.total_dispatch_qty += Number(ws.dispatch_qty || 0);
            group.subtotal += Number(ws.subtotal || 0);
            group.gst_amount += Number(ws.gst_amount || 0);
            group.freight += Number(ws.freight || 0);
            group.grand_total += Number(ws.grand_total || 0);

            if (!group.po_qty && ws.po_qty) {
                group.po_qty = Number(ws.po_qty);
            }

            for (const it of (ws.items || [])) {
                const existing = group.items.find(x => x.item === it.item);
                if (existing) {
                    existing.quantity = (existing.quantity || 0) + Number(it.quantity || 0);
                    existing.total_amount = (existing.total_amount || 0) + Number(it.total_amount || 0);
                } else {
                    group.items.push({ ...it });
                }
            }
        }

        return Array.from(map.values()).map(g => {
            const hasUnpaid = g.dispatches.some(d => d.payment_status === "Pending" || d.payment_status === "Unpaid");
            const hasPaid = g.dispatches.some(d => d.payment_status === "Paid");
            const allPaid = g.dispatches.every(d => d.payment_status === "Paid");
            const payment_status = allPaid ? "Paid" : (hasPaid && hasUnpaid ? "Partially Paid" : (hasPaid ? "Paid" : "Pending"));
            const balance_qty = Math.max(0, (g.po_qty || 0) - g.total_dispatch_qty);
            const delivery_status = balance_qty <= 0 && g.total_dispatch_qty > 0 ? "Delivered" : (g.total_dispatch_qty > 0 ? "Partial" : "Not Delivered");

            return {
                ...g,
                balance_qty,
                payment_status: g.dispatches.length === 1 ? g.dispatches[0].payment_status : payment_status,
                delivery_status: g.dispatches.length === 1 ? g.dispatches[0].delivery_status : delivery_status,
                latest_invoice_date: g.dispatches[0]?.invoice_date || g.wo_date,
                invoices_summary: g.dispatches.map(d => d.invoice_number).filter(Boolean).join(", "),
            };
        });
    }, [woSalesList]);

    const creditNotesList = useMemo(() => {
        const list = data?.credit_notes || [];
        const q = search.trim().toLowerCase();
        return list.filter(item => {
            const matchesSearch =
                !q ||
                `${item.client_name} ${item.cn_number} ${item.invoice_number} ${item.po_number} ${item.reason} ${item.items_summary}`
                    .toLowerCase()
                    .includes(q);
            const matchesStatus =
                statusFilter === "all" ||
                String(item.status).toLowerCase() === statusFilter.toLowerCase();
            return matchesSearch && matchesStatus;
        });
    }, [data?.credit_notes, search, statusFilter]);

    // Excel-style column filters & sorting per tab
    const { filters: salesFilters, setFilter: setSalesFilter, clearAllFilters: clearSalesFilters } = useColumnFilters();
    const { filters: woFilters, setFilter: setWoFilter, clearAllFilters: clearWoFilters } = useColumnFilters();
    const { filters: cnFilters, setFilter: setCnFilter, clearAllFilters: clearCnFilters } = useColumnFilters();

    const baseSalesRows = groupByPo ? groupedSales : salesList;
    const filteredSalesRows = useMemo(() => {
        const keys = Object.keys(salesFilters);
        if (keys.length === 0) return baseSalesRows;
        return baseSalesRows.filter(r =>
            keys.every(k => {
                const fn = SALES_ACCESSORS[k];
                const v = fn ? fn(r) : r[k];
                return salesFilters[k].has(v == null || v === "" ? "—" : String(v));
            })
        );
    }, [baseSalesRows, salesFilters]);
    const { sortedRows: sortedSalesRows, sortConfig: salesSortConfig, setSort: setSalesSort } = useSortableRows(filteredSalesRows);

    const baseWoRows = groupByPo ? groupedWoSales : woSalesList;
    const filteredWoRows = useMemo(() => {
        const keys = Object.keys(woFilters);
        if (keys.length === 0) return baseWoRows;
        return baseWoRows.filter(r =>
            keys.every(k => {
                const fn = WO_SALES_ACCESSORS[k];
                const v = fn ? fn(r) : r[k];
                return woFilters[k].has(v == null || v === "" ? "—" : String(v));
            })
        );
    }, [baseWoRows, woFilters]);
    const { sortedRows: sortedWoRows, sortConfig: woSortConfig, setSort: setWoSort } = useSortableRows(filteredWoRows);

    const filteredCnRows = useMemo(() => {
        const keys = Object.keys(cnFilters);
        if (keys.length === 0) return creditNotesList;
        return creditNotesList.filter(r =>
            keys.every(k => {
                const fn = CN_ACCESSORS[k];
                const v = fn ? fn(r) : r[k];
                return cnFilters[k].has(v == null || v === "" ? "—" : String(v));
            })
        );
    }, [creditNotesList, cnFilters]);
    const { sortedRows: sortedCnRows, sortConfig: cnSortConfig, setSort: setCnSort } = useSortableRows(filteredCnRows);

    const activeSalesFiltersCount = Object.keys(salesFilters).length;
    const activeWoFiltersCount = Object.keys(woFilters).length;
    const activeCnFiltersCount = Object.keys(cnFilters).length;
    const currentTabFiltersCount = tab === "sales" ? activeSalesFiltersCount : tab === "wo_sales" ? activeWoFiltersCount : activeCnFiltersCount;
    const clearCurrentTabFilters = tab === "sales" ? clearSalesFilters : tab === "wo_sales" ? clearWoFilters : clearCnFilters;

    const handleExport = () => {
        if (tab === "sales") {
            if (groupByPo) {
                csvExport("marketing-sales-po-grouped.csv", [
                    ["S.No.", "Client Name", "PO No.", "Dispatches Count", "Invoices", "Date", "Items", "PO Qty", "Total Dispatch Qty", "Balance Qty", "Subtotal", "GST", "Freight", "Grand Total", "Payment Status", "Delivery Status"],
                    ...groupedSales.map((x, i) => [
                        i + 1,
                        x.client_name,
                        x.po_number,
                        x.dispatches.length,
                        x.invoices_summary,
                        x.latest_invoice_date,
                        x.items.map(it => it.item).join(", "),
                        x.po_qty,
                        x.total_dispatch_qty,
                        x.balance_qty,
                        x.subtotal,
                        x.gst_amount,
                        x.freight,
                        x.grand_total,
                        x.payment_status,
                        x.delivery_status
                    ])
                ]);
            } else {
                csvExport("marketing-sales-report.csv", [
                    ["S.No.", "Client Name", "Invoice No.", "PO No.", "Invoice Date", "Items", "PO Qty", "Dispatch Qty", "Subtotal", "GST", "Freight", "Grand Total", "Payment Status", "Delivery Status"],
                    ...salesList.map((x, i) => [
                        i + 1,
                        x.client_name,
                        x.invoice_number,
                        x.po_number,
                        x.invoice_date,
                        x.items_summary,
                        x.po_qty,
                        x.dispatch_qty,
                        x.subtotal,
                        x.gst_amount,
                        x.freight,
                        x.grand_total,
                        x.payment_status,
                        x.delivery_status
                    ])
                ]);
            }
        } else if (tab === "wo_sales") {
            if (groupByPo) {
                csvExport("work-order-sales-wo-grouped.csv", [
                    ["S.No.", "Client Name", "WO No.", "Dispatches Count", "Invoices", "Date", "Items", "WO Qty", "Total Dispatch Qty", "Balance Qty", "Subtotal", "GST", "Freight", "Grand Total", "Payment Status", "Delivery Status"],
                    ...groupedWoSales.map((x, i) => [
                        i + 1,
                        x.client_name,
                        x.wo_number,
                        x.dispatches.length,
                        x.invoices_summary,
                        x.latest_invoice_date,
                        x.items.map(it => it.item).join(", "),
                        x.po_qty,
                        x.total_dispatch_qty,
                        x.balance_qty,
                        x.subtotal,
                        x.gst_amount,
                        x.freight,
                        x.grand_total,
                        x.payment_status,
                        x.delivery_status
                    ])
                ]);
            } else {
                csvExport("work-order-sales-report.csv", [
                    ["S.No.", "Client Name", "Invoice No.", "WO No.", "Invoice Date", "Items", "WO Qty", "Dispatch Qty", "Subtotal", "GST", "Freight", "Grand Total", "Payment Status", "Delivery Status"],
                    ...woSalesList.map((x, i) => [
                        i + 1,
                        x.client_name,
                        x.invoice_number,
                        x.wo_number,
                        x.invoice_date,
                        x.items_summary,
                        x.po_qty,
                        x.dispatch_qty,
                        x.subtotal,
                        x.gst_amount,
                        x.freight,
                        x.grand_total,
                        x.payment_status,
                        x.delivery_status
                    ])
                ]);
            }
        } else {
            csvExport("credit-notes-report.csv", [
                ["S.No.", "CN Number", "CN Date", "Type", "Linked Invoice", "Client Name", "Reason", "Taxable Amount", "GST Amount", "Total Credit Amount", "Status"],
                ...creditNotesList.map((x, i) => [
                    i + 1,
                    x.cn_number,
                    x.cn_date,
                    x.sale_type,
                    x.invoice_number,
                    x.client_name,
                    x.reason,
                    x.taxable_amount,
                    x.gst_amount,
                    x.total_amount,
                    x.status
                ])
            ]);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Marketing Accounts</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Financial ledger & invoice verification for Marketing Sales, Work Order Sales, and Credit Notes.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={tab === "credit_notes" ? resetCnWidths : resetSalesWidths}
                        title="Reset column widths to default size"
                        className="text-xs text-slate-500 hover:text-slate-800"
                    >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Reset Columns
                    </Button>
                    <Button onClick={handleExport} variant="outline" className="border-slate-300 text-xs">
                        <Download className="mr-2 h-4 w-4" />
                        Export Current Report
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                    label="Marketing Sales (PO)"
                    count={summary.sales_count}
                    amount={summary.sales_amount}
                    icon={FileText}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                <SummaryCard
                    label="Work Order Sales"
                    count={summary.wo_sales_count}
                    amount={summary.wo_sales_amount}
                    icon={Receipt}
                    color="text-indigo-600"
                    bg="bg-indigo-50"
                />
                <SummaryCard
                    label="Credit Notes (Issued)"
                    count={summary.credit_notes_count}
                    amount={summary.credit_notes_amount}
                    icon={FileMinus}
                    color="text-rose-600"
                    bg="bg-rose-50"
                />
                <SummaryCard
                    label="Net Invoiced Amount"
                    count={null}
                    amount={summary.net_revenue}
                    icon={TrendingUp}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />
            </div>

            {/* Main Tabs Container */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* Tabs & Controls */}
                <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Navigation Tabs */}
                    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => { setTab("sales"); setExpandedRows({}); setExpandedPoRows({}); }}
                            className={`rounded-md px-3.5 py-2 text-xs font-semibold transition ${
                                tab === "sales" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                            }`}
                        >
                            Marketing Sales ({groupByPo ? `${groupedSales.length} POs` : summary.sales_count})
                        </button>
                        <button
                            type="button"
                            onClick={() => { setTab("wo_sales"); setExpandedRows({}); setExpandedPoRows({}); }}
                            className={`rounded-md px-3.5 py-2 text-xs font-semibold transition ${
                                tab === "wo_sales" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                            }`}
                        >
                            Work Order Sales ({groupByPo ? `${groupedWoSales.length} WOs` : summary.wo_sales_count})
                        </button>
                        <button
                            type="button"
                            onClick={() => { setTab("credit_notes"); setExpandedRows({}); setExpandedPoRows({}); }}
                            className={`rounded-md px-3.5 py-2 text-xs font-semibold transition ${
                                tab === "credit_notes" ? "bg-white text-rose-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                            }`}
                        >
                            Credit Notes ({summary.credit_notes_count})
                        </button>
                    </div>

                    {/* Search & Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Group by PO Toggle */}
                        {tab !== "credit_notes" && (
                            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                                <button
                                    type="button"
                                    onClick={() => setGroupByPo(true)}
                                    className={`rounded-md px-2.5 py-1.5 transition flex items-center gap-1.5 ${
                                        groupByPo ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                                    }`}
                                    title="Group all dispatches of the same PO / WO together"
                                >
                                    <Layers className="h-3.5 w-3.5" />
                                    Group by PO
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGroupByPo(false)}
                                    className={`rounded-md px-2.5 py-1.5 transition flex items-center gap-1.5 ${
                                        !groupByPo ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                                    }`}
                                    title="View individual invoices / dispatches"
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    All Invoices
                                </button>
                            </div>
                        )}
                        <div className="relative min-w-[200px] max-w-xs flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="Search client, invoice, PO/WO, item..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 h-9 text-xs"
                            />
                        </div>
                        {tab !== "credit_notes" ? (
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="all">All Payment Status</option>
                                <option value="paid">Paid</option>
                                <option value="partially paid">Partial</option>
                                <option value="pending">Pending</option>
                            </select>
                        ) : (
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="all">All Status</option>
                                <option value="issued">Issued</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        )}
                        {currentTabFiltersCount > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={clearCurrentTabFilters}
                                className="h-9 text-xs border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            >
                                <FilterX className="mr-1.5 h-3.5 w-3.5" />
                                Clear Column Filters ({currentTabFiltersCount})
                            </Button>
                        )}
                        {(search || statusFilter !== "all" || currentTabFiltersCount > 0) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSearch("");
                                    setStatusFilter("all");
                                    clearCurrentTabFilters();
                                }}
                                className="h-9 text-xs text-slate-500 hover:text-slate-900"
                            >
                                Reset All
                            </Button>
                        )}
                    </div>
                </div>

                {/* Table Content */}
                {isLoading ? (
                    <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                        Loading Marketing Accounts records...
                    </div>
                ) : tab === "sales" ? (
                    /* Marketing Sales Table with Resizable Columns & Excel-like Filterable Headers */
                    <div className="overflow-x-auto">
                        <table style={{ width: totalSalesWidth, minWidth: "100%" }} className="w-full text-sm border-collapse table-fixed">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                    <ResizableTh label="S.No." width={salesWidths.sno} onResizeStart={startSalesResize("sno")} align="center" />
                                    <FilterableHeader
                                        label="Client Name"
                                        columnKey="client_name"
                                        accessor={SALES_ACCESSORS.client_name}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.client_name}
                                        onResizeStart={startSalesResize("client_name")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.client_name}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Invoice No."
                                        columnKey="invoice_number"
                                        accessor={SALES_ACCESSORS.invoice_number}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.invoice_number}
                                        onResizeStart={startSalesResize("invoice_number")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.invoice_number}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="PO No."
                                        columnKey="ref_number"
                                        accessor={SALES_ACCESSORS.ref_number}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.ref_number}
                                        onResizeStart={startSalesResize("ref_number")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.ref_number}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Date"
                                        columnKey="date"
                                        type="date"
                                        accessor={SALES_ACCESSORS.date}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.date}
                                        onResizeStart={startSalesResize("date")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.date}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Items"
                                        columnKey="items"
                                        accessor={SALES_ACCESSORS.items}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.items}
                                        onResizeStart={startSalesResize("items")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.items}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="PO Qty"
                                        columnKey="po_qty"
                                        type="number"
                                        align="right"
                                        accessor={SALES_ACCESSORS.po_qty}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.po_qty}
                                        onResizeStart={startSalesResize("po_qty")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.po_qty}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Dispatch Qty"
                                        columnKey="dispatch_qty"
                                        type="number"
                                        align="right"
                                        accessor={SALES_ACCESSORS.dispatch_qty}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.dispatch_qty}
                                        onResizeStart={startSalesResize("dispatch_qty")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.dispatch_qty}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Subtotal"
                                        columnKey="subtotal"
                                        type="number"
                                        align="right"
                                        accessor={SALES_ACCESSORS.subtotal}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.subtotal}
                                        onResizeStart={startSalesResize("subtotal")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.subtotal}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="GST"
                                        columnKey="gst"
                                        type="number"
                                        align="right"
                                        accessor={SALES_ACCESSORS.gst}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.gst}
                                        onResizeStart={startSalesResize("gst")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.gst}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Freight"
                                        columnKey="freight"
                                        type="number"
                                        align="right"
                                        accessor={SALES_ACCESSORS.freight}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.freight}
                                        onResizeStart={startSalesResize("freight")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.freight}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Grand Total"
                                        columnKey="grand_total"
                                        type="number"
                                        align="right"
                                        accessor={SALES_ACCESSORS.grand_total}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.grand_total}
                                        onResizeStart={startSalesResize("grand_total")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.grand_total}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-900 uppercase tracking-wide"
                                    />
                                    <FilterableHeader
                                        label="Payment"
                                        columnKey="payment"
                                        accessor={SALES_ACCESSORS.payment}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.payment}
                                        onResizeStart={startSalesResize("payment")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.payment}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Delivery"
                                        columnKey="delivery"
                                        accessor={SALES_ACCESSORS.delivery}
                                        sortConfig={salesSortConfig}
                                        setSort={setSalesSort}
                                        width={salesWidths.delivery}
                                        onResizeStart={startSalesResize("delivery")}
                                        rows={baseSalesRows}
                                        filterValue={salesFilters.delivery}
                                        onApplyFilter={setSalesFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <ResizableTh label="Action" width={salesWidths.action} onResizeStart={startSalesResize("action")} align="center" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {groupByPo ? (
                                    sortedSalesRows.length ? sortedSalesRows.map((row, i) => (
                                        <tr key={`g_s_${row.id || i}`} className="contents">
                                            <tr className="hover:bg-slate-50 transition-colors">
                                                <td style={{ width: salesWidths.sno }} className="px-3 py-3 text-center text-xs text-slate-400">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {row.dispatches.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => togglePoExpand(row.id)}
                                                                className="p-0.5 text-slate-400 hover:text-blue-600 rounded transition"
                                                                title={expandedPoRows[row.id] ? "Collapse dispatches" : "Expand all dispatches for this PO"}
                                                            >
                                                                {expandedPoRows[row.id] ? <ChevronDown className="h-3.5 w-3.5 text-blue-600" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                            </button>
                                                        )}
                                                        <span>{i + 1}</span>
                                                    </div>
                                                </td>
                                                <td style={{ width: salesWidths.client_name }} className="px-4 py-3 font-semibold text-slate-900 truncate" title={row.client_name}>
                                                    {row.client_name}
                                                </td>
                                                <td style={{ width: salesWidths.invoice_number }} className="px-4 py-3">
                                                    {row.dispatches.length === 1 ? (
                                                        <span className="font-mono text-xs font-semibold text-blue-700 truncate block" title={row.dispatches[0].invoice_number}>
                                                            {row.dispatches[0].invoice_number}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => togglePoExpand(row.id)}
                                                            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200"
                                                            title="Click to view all dispatches for this PO"
                                                        >
                                                            <Package className="h-3 w-3" />
                                                            {row.dispatches.length} Invoices
                                                            {expandedPoRows[row.id] ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
                                                        </button>
                                                    )}
                                                </td>
                                                <td style={{ width: salesWidths.ref_number }} className="px-4 py-3 font-medium text-slate-700">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="truncate" title={row.po_number}>{row.po_number}</span>
                                                        {row.dispatches.length > 1 && (
                                                            <span className="rounded-full bg-blue-50 text-blue-700 font-bold px-1.5 py-0.2 text-[10px] border border-blue-200">
                                                                {row.dispatches.length} dispatches
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ width: salesWidths.date }} className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap truncate">
                                                    {row.latest_invoice_date || row.po_date}
                                                </td>
                                                <td style={{ width: salesWidths.items }} className="px-4 py-3">
                                                    <ItemCell items={row.items} color="blue" />
                                                </td>
                                                <td style={{ width: salesWidths.po_qty }} className="px-4 py-3 text-right text-xs font-medium text-slate-700 truncate">
                                                    {qty(row.po_qty)}
                                                </td>
                                                <td style={{ width: salesWidths.dispatch_qty }} className="px-4 py-3 text-right text-xs">
                                                    <span className="font-bold text-blue-700 block">{qty(row.total_dispatch_qty)}</span>
                                                    {row.balance_qty > 0 && (
                                                        <span className="text-[10px] text-amber-600 font-medium block">Bal: {qty(row.balance_qty)}</span>
                                                    )}
                                                </td>
                                                <td style={{ width: salesWidths.subtotal }} className="px-4 py-3 text-right text-xs font-medium text-slate-600 truncate">
                                                    {money(row.subtotal)}
                                                </td>
                                                <td style={{ width: salesWidths.gst }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                                    {money(row.gst_amount)}
                                                </td>
                                                <td style={{ width: salesWidths.freight }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                                    {money(row.freight)}
                                                </td>
                                                <td style={{ width: salesWidths.grand_total }} className="px-4 py-3 text-right font-bold text-slate-900 truncate">
                                                    {money(row.grand_total)}
                                                </td>
                                                <td style={{ width: salesWidths.payment }} className="px-4 py-3 text-center">
                                                    <PaymentBadge status={row.payment_status} />
                                                </td>
                                                <td style={{ width: salesWidths.delivery }} className="px-4 py-3 text-center">
                                                    <DeliveryBadge status={row.delivery_status} />
                                                </td>
                                                <td style={{ width: salesWidths.action }} className="px-3 py-3 text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-slate-500 hover:text-blue-600"
                                                        title="View PO & Dispatches Detail"
                                                        onClick={() => setViewItem({ type: "grouped_po", data: row })}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                            {/* Expandable all dispatches for this PO */}
                                            {expandedPoRows[row.id] && (
                                                <tr className="bg-blue-50/25 border-y-2 border-blue-100">
                                                    <td colSpan={15} className="p-3 pl-8 sm:pl-12">
                                                        <div className="rounded-lg border border-blue-200 bg-white p-3 shadow-xs space-y-2">
                                                            <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                                                                <span className="font-bold text-slate-800 flex items-center gap-2">
                                                                    <Package className="h-4 w-4 text-blue-600" />
                                                                    <span>All Dispatches for PO #{row.po_number} ({row.dispatches.length} Total)</span>
                                                                    <span className="text-[11px] text-slate-500 font-normal">
                                                                        Dispatched: <strong className="text-blue-700">{qty(row.total_dispatch_qty)}</strong> / {qty(row.po_qty)} Nos
                                                                    </span>
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => togglePoExpand(row.id)}
                                                                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                                                                >
                                                                    Close ✕
                                                                </button>
                                                            </div>
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-slate-50 text-slate-600 text-left uppercase text-[10px] font-bold">
                                                                    <tr>
                                                                        <th className="p-2 w-8 text-center">#</th>
                                                                        <th className="p-2">Invoice No.</th>
                                                                        <th className="p-2">Date</th>
                                                                        <th className="p-2">Dispatched Items</th>
                                                                        <th className="p-2 text-right">Dispatch Qty</th>
                                                                        <th className="p-2 text-right">Subtotal</th>
                                                                        <th className="p-2 text-right">GST</th>
                                                                        <th className="p-2 text-right">Grand Total</th>
                                                                        <th className="p-2 text-center">Payment</th>
                                                                        <th className="p-2 text-center">Action</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {row.dispatches.map((disp, dIdx) => (
                                                                        <tr key={disp.id || dIdx} className="hover:bg-blue-50/40">
                                                                            <td className="p-2 text-center text-slate-400">{dIdx + 1}</td>
                                                                            <td className="p-2 font-mono font-bold text-blue-700">{disp.invoice_number}</td>
                                                                            <td className="p-2 text-slate-600">{disp.invoice_date}</td>
                                                                            <td className="p-2 text-slate-800">{disp.items_summary}</td>
                                                                            <td className="p-2 text-right font-bold text-blue-700">{qty(disp.dispatch_qty)} Nos</td>
                                                                            <td className="p-2 text-right">{money(disp.subtotal)}</td>
                                                                            <td className="p-2 text-right">{money(disp.gst_amount)}</td>
                                                                            <td className="p-2 text-right font-bold text-slate-900">{money(disp.grand_total)}</td>
                                                                            <td className="p-2 text-center"><PaymentBadge status={disp.payment_status} /></td>
                                                                            <td className="p-2 text-center">
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    className="h-7 text-xs text-blue-600 hover:bg-blue-50"
                                                                                    onClick={() => setViewItem({ type: "sale", data: disp })}
                                                                                >
                                                                                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                                                                                </Button>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={15} className="p-12 text-center text-slate-400">
                                                No Marketing Sales records found.
                                            </td>
                                        </tr>
                                    )
                                ) : (
                                    sortedSalesRows.length ? sortedSalesRows.map((row, i) => (
                                        <tr key={`s_${row.id || i}`} className="hover:bg-slate-50 transition-colors">
                                            <td style={{ width: salesWidths.sno }} className="px-3 py-3 text-center text-xs text-slate-400">{i + 1}</td>
                                            <td style={{ width: salesWidths.client_name }} className="px-4 py-3 font-semibold text-slate-900 truncate" title={row.client_name}>
                                                {row.client_name}
                                            </td>
                                            <td style={{ width: salesWidths.invoice_number }} className="px-4 py-3 font-mono text-xs font-semibold text-blue-700 truncate" title={row.invoice_number}>
                                                {row.invoice_number}
                                            </td>
                                            <td style={{ width: salesWidths.ref_number }} className="px-4 py-3 font-medium text-slate-700 truncate" title={row.po_number}>
                                                {row.po_number}
                                            </td>
                                            <td style={{ width: salesWidths.date }} className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap truncate">
                                                {row.invoice_date}
                                            </td>
                                            <td style={{ width: salesWidths.items }} className="px-4 py-3">
                                                <ItemCell items={row.items} color="blue" />
                                            </td>
                                            <td style={{ width: salesWidths.po_qty }} className="px-4 py-3 text-right text-xs font-medium text-slate-700 truncate">
                                                {qty(row.po_qty)}
                                            </td>
                                            <td style={{ width: salesWidths.dispatch_qty }} className="px-4 py-3 text-right text-xs font-bold text-blue-700 truncate">
                                                {qty(row.dispatch_qty)}
                                            </td>
                                            <td style={{ width: salesWidths.subtotal }} className="px-4 py-3 text-right text-xs font-medium text-slate-600 truncate">
                                                {money(row.subtotal)}
                                            </td>
                                            <td style={{ width: salesWidths.gst }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                                {money(row.gst_amount)}
                                            </td>
                                            <td style={{ width: salesWidths.freight }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                                {money(row.freight)}
                                            </td>
                                            <td style={{ width: salesWidths.grand_total }} className="px-4 py-3 text-right font-bold text-slate-900 truncate">
                                                {money(row.grand_total)}
                                            </td>
                                            <td style={{ width: salesWidths.payment }} className="px-4 py-3 text-center">
                                                <PaymentBadge status={row.payment_status} />
                                            </td>
                                            <td style={{ width: salesWidths.delivery }} className="px-4 py-3 text-center">
                                                <DeliveryBadge status={row.delivery_status} />
                                            </td>
                                            <td style={{ width: salesWidths.action }} className="px-3 py-3 text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-500 hover:text-blue-600"
                                                    title="View Invoice Detail"
                                                    onClick={() => setViewItem({ type: "sale", data: row })}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={15} className="p-12 text-center text-slate-400">
                                                No Marketing Sales records found.
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                        {sortedSalesRows.length > 0 && (
                            <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                                Showing {sortedSalesRows.length} of {groupByPo ? `${groupedSales.length} POs` : `${data?.sales?.length || 0} invoices`}
                            </div>
                        )}
                    </div>
                ) : tab === "wo_sales" ? (
                    /* Work Order Sales Table with Resizable Columns & Excel-like Filterable Headers */
                    <div className="overflow-x-auto">
                        <table style={{ width: totalSalesWidth, minWidth: "100%" }} className="w-full text-sm border-collapse table-fixed">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                    <ResizableTh label="S.No." width={salesWidths.sno} onResizeStart={startSalesResize("sno")} align="center" />
                                    <FilterableHeader
                                        label="Client Name"
                                        columnKey="client_name"
                                        accessor={WO_SALES_ACCESSORS.client_name}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.client_name}
                                        onResizeStart={startSalesResize("client_name")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.client_name}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Invoice No."
                                        columnKey="invoice_number"
                                        accessor={WO_SALES_ACCESSORS.invoice_number}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.invoice_number}
                                        onResizeStart={startSalesResize("invoice_number")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.invoice_number}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="WO No."
                                        columnKey="ref_number"
                                        accessor={WO_SALES_ACCESSORS.ref_number}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.ref_number}
                                        onResizeStart={startSalesResize("ref_number")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.ref_number}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Date"
                                        columnKey="date"
                                        type="date"
                                        accessor={WO_SALES_ACCESSORS.date}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.date}
                                        onResizeStart={startSalesResize("date")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.date}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Items"
                                        columnKey="items"
                                        accessor={WO_SALES_ACCESSORS.items}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.items}
                                        onResizeStart={startSalesResize("items")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.items}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="WO Qty"
                                        columnKey="po_qty"
                                        type="number"
                                        align="right"
                                        accessor={WO_SALES_ACCESSORS.po_qty}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.po_qty}
                                        onResizeStart={startSalesResize("po_qty")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.po_qty}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Dispatch Qty"
                                        columnKey="dispatch_qty"
                                        type="number"
                                        align="right"
                                        accessor={WO_SALES_ACCESSORS.dispatch_qty}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.dispatch_qty}
                                        onResizeStart={startSalesResize("dispatch_qty")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.dispatch_qty}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Subtotal"
                                        columnKey="subtotal"
                                        type="number"
                                        align="right"
                                        accessor={WO_SALES_ACCESSORS.subtotal}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.subtotal}
                                        onResizeStart={startSalesResize("subtotal")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.subtotal}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="GST"
                                        columnKey="gst"
                                        type="number"
                                        align="right"
                                        accessor={WO_SALES_ACCESSORS.gst}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.gst}
                                        onResizeStart={startSalesResize("gst")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.gst}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Freight"
                                        columnKey="freight"
                                        type="number"
                                        align="right"
                                        accessor={WO_SALES_ACCESSORS.freight}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.freight}
                                        onResizeStart={startSalesResize("freight")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.freight}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Grand Total"
                                        columnKey="grand_total"
                                        type="number"
                                        align="right"
                                        accessor={WO_SALES_ACCESSORS.grand_total}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.grand_total}
                                        onResizeStart={startSalesResize("grand_total")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.grand_total}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-900 uppercase tracking-wide"
                                    />
                                    <FilterableHeader
                                        label="Payment"
                                        columnKey="payment"
                                        accessor={WO_SALES_ACCESSORS.payment}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.payment}
                                        onResizeStart={startSalesResize("payment")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.payment}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Delivery"
                                        columnKey="delivery"
                                        accessor={WO_SALES_ACCESSORS.delivery}
                                        sortConfig={woSortConfig}
                                        setSort={setWoSort}
                                        width={salesWidths.delivery}
                                        onResizeStart={startSalesResize("delivery")}
                                        rows={baseWoRows}
                                        filterValue={woFilters.delivery}
                                        onApplyFilter={setWoFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <ResizableTh label="Action" width={salesWidths.action} onResizeStart={startSalesResize("action")} align="center" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {groupByPo ? (
                                    sortedWoRows.length ? sortedWoRows.map((row, i) => (
                                        <tr key={`g_wo_${row.id || i}`} className="contents">
                                            <tr className="hover:bg-slate-50 transition-colors">
                                                <td style={{ width: salesWidths.sno }} className="px-3 py-3 text-center text-xs text-slate-400">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {row.dispatches.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => togglePoExpand(row.id)}
                                                                className="p-0.5 text-slate-400 hover:text-indigo-600 rounded transition"
                                                                title={expandedPoRows[row.id] ? "Collapse dispatches" : "Expand all dispatches for this WO"}
                                                            >
                                                                {expandedPoRows[row.id] ? <ChevronDown className="h-3.5 w-3.5 text-indigo-600" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                            </button>
                                                        )}
                                                        <span>{i + 1}</span>
                                                    </div>
                                                </td>
                                                <td style={{ width: salesWidths.client_name }} className="px-4 py-3 font-semibold text-slate-900 truncate" title={row.client_name}>
                                                    {row.client_name}
                                                </td>
                                                <td style={{ width: salesWidths.invoice_number }} className="px-4 py-3">
                                                    {row.dispatches.length === 1 ? (
                                                        <span className="font-mono text-xs font-semibold text-indigo-700 truncate block" title={row.dispatches[0].invoice_number}>
                                                            {row.dispatches[0].invoice_number}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => togglePoExpand(row.id)}
                                                            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200"
                                                            title="Click to view all dispatches for this WO"
                                                        >
                                                            <Package className="h-3 w-3" />
                                                            {row.dispatches.length} Invoices
                                                            {expandedPoRows[row.id] ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
                                                        </button>
                                                    )}
                                                </td>
                                                <td style={{ width: salesWidths.ref_number }} className="px-4 py-3 font-medium text-slate-700">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="truncate" title={row.wo_number}>{row.wo_number}</span>
                                                        {row.dispatches.length > 1 && (
                                                            <span className="rounded-full bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.2 text-[10px] border border-indigo-200">
                                                                {row.dispatches.length} dispatches
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ width: salesWidths.date }} className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap truncate">
                                                    {row.latest_invoice_date || row.wo_date}
                                                </td>
                                                <td style={{ width: salesWidths.items }} className="px-4 py-3">
                                                    <ItemCell items={row.items} color="indigo" />
                                                </td>
                                                <td style={{ width: salesWidths.po_qty }} className="px-4 py-3 text-right text-xs font-medium text-slate-700 truncate">
                                                    {qty(row.po_qty)}
                                                </td>
                                                <td style={{ width: salesWidths.dispatch_qty }} className="px-4 py-3 text-right text-xs">
                                                    <span className="font-bold text-indigo-700 block">{qty(row.total_dispatch_qty)}</span>
                                                    {row.balance_qty > 0 && (
                                                        <span className="text-[10px] text-amber-600 font-medium block">Bal: {qty(row.balance_qty)}</span>
                                                    )}
                                                </td>
                                                <td style={{ width: salesWidths.subtotal }} className="px-4 py-3 text-right text-xs font-medium text-slate-600 truncate">
                                                    {money(row.subtotal)}
                                                </td>
                                                <td style={{ width: salesWidths.gst }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                                    {money(row.gst_amount)}
                                                </td>
                                                <td style={{ width: salesWidths.freight }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                                    {money(row.freight)}
                                                </td>
                                                <td style={{ width: salesWidths.grand_total }} className="px-4 py-3 text-right font-bold text-slate-900 truncate">
                                                    {money(row.grand_total)}
                                                </td>
                                                <td style={{ width: salesWidths.payment }} className="px-4 py-3 text-center">
                                                    <PaymentBadge status={row.payment_status} />
                                                </td>
                                                <td style={{ width: salesWidths.delivery }} className="px-4 py-3 text-center">
                                                    <DeliveryBadge status={row.delivery_status} />
                                                </td>
                                                <td style={{ width: salesWidths.action }} className="px-3 py-3 text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-slate-500 hover:text-indigo-600"
                                                        title="View WO & Dispatches Detail"
                                                        onClick={() => setViewItem({ type: "grouped_po", data: row })}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                            {/* Expandable all dispatches for this WO */}
                                            {expandedPoRows[row.id] && (
                                                <tr className="bg-indigo-50/25 border-y-2 border-indigo-100">
                                                    <td colSpan={15} className="p-3 pl-8 sm:pl-12">
                                                        <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-xs space-y-2">
                                                            <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                                                                <span className="font-bold text-slate-800 flex items-center gap-2">
                                                                    <Package className="h-4 w-4 text-indigo-600" />
                                                                    <span>All Dispatches for WO #{row.wo_number} ({row.dispatches.length} Total)</span>
                                                                    <span className="text-[11px] text-slate-500 font-normal">
                                                                        Dispatched: <strong className="text-indigo-700">{qty(row.total_dispatch_qty)}</strong> / {qty(row.po_qty)} Nos
                                                                    </span>
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => togglePoExpand(row.id)}
                                                                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                                                                >
                                                                    Close ✕
                                                                </button>
                                                            </div>
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-slate-50 text-slate-600 text-left uppercase text-[10px] font-bold">
                                                                    <tr>
                                                                        <th className="p-2 w-8 text-center">#</th>
                                                                        <th className="p-2">Invoice No.</th>
                                                                        <th className="p-2">Date</th>
                                                                        <th className="p-2">Dispatched Items</th>
                                                                        <th className="p-2 text-right">Dispatch Qty</th>
                                                                        <th className="p-2 text-right">Subtotal</th>
                                                                        <th className="p-2 text-right">GST</th>
                                                                        <th className="p-2 text-right">Grand Total</th>
                                                                        <th className="p-2 text-center">Payment</th>
                                                                        <th className="p-2 text-center">Action</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {row.dispatches.map((disp, dIdx) => (
                                                                        <tr key={disp.id || dIdx} className="hover:bg-indigo-50/40">
                                                                            <td className="p-2 text-center text-slate-400">{dIdx + 1}</td>
                                                                            <td className="p-2 font-mono font-bold text-indigo-700">{disp.invoice_number}</td>
                                                                            <td className="p-2 text-slate-600">{disp.invoice_date}</td>
                                                                            <td className="p-2 text-slate-800">{disp.items_summary}</td>
                                                                            <td className="p-2 text-right font-bold text-indigo-700">{qty(disp.dispatch_qty)} Nos</td>
                                                                            <td className="p-2 text-right">{money(disp.subtotal)}</td>
                                                                            <td className="p-2 text-right">{money(disp.gst_amount)}</td>
                                                                            <td className="p-2 text-right font-bold text-slate-900">{money(disp.grand_total)}</td>
                                                                            <td className="p-2 text-center"><PaymentBadge status={disp.payment_status} /></td>
                                                                            <td className="p-2 text-center">
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    className="h-7 text-xs text-indigo-600 hover:bg-indigo-50"
                                                                                    onClick={() => setViewItem({ type: "wo_sale", data: disp })}
                                                                                >
                                                                                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                                                                                </Button>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={15} className="p-12 text-center text-slate-400">
                                                No Work Order Sales records found.
                                            </td>
                                        </tr>
                                    )
                                ) : (
                                    woSalesList.length ? woSalesList.map((row, i) => (
                                        <tr key={`wo_${row.id || i}`} className="hover:bg-slate-50 transition-colors">
                                            <td style={{ width: salesWidths.sno }} className="px-3 py-3 text-center text-xs text-slate-400">{i + 1}</td>
                                            <td style={{ width: salesWidths.client_name }} className="px-4 py-3 font-semibold text-slate-900 truncate" title={row.client_name}>
                                                {row.client_name}
                                            </td>
                                            <td style={{ width: salesWidths.invoice_number }} className="px-4 py-3 font-mono text-xs font-semibold text-indigo-700 truncate" title={row.invoice_number}>
                                                {row.invoice_number}
                                            </td>
                                            <td style={{ width: salesWidths.ref_number }} className="px-4 py-3 font-medium text-slate-700 truncate" title={row.wo_number}>
                                                {row.wo_number}
                                            </td>
                                            <td style={{ width: salesWidths.date }} className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap truncate">
                                                {row.invoice_date}
                                            </td>
                                            <td style={{ width: salesWidths.items }} className="px-4 py-3">
                                                <ItemCell items={row.items} color="indigo" />
                                            </td>
                                            <td style={{ width: salesWidths.po_qty }} className="px-4 py-3 text-right text-xs font-medium text-slate-700 truncate">
                                                {qty(row.po_qty)}
                                            </td>
                                            <td style={{ width: salesWidths.dispatch_qty }} className="px-4 py-3 text-right text-xs font-bold text-indigo-700 truncate">
                                                {qty(row.dispatch_qty)}
                                            </td>
                                            <td style={{ width: salesWidths.subtotal }} className="px-4 py-3 text-right text-xs font-medium text-slate-600 truncate">
                                                {money(row.subtotal)}
                                            </td>
                                            <td style={{ width: salesWidths.gst }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                                {money(row.gst_amount)}
                                            </td>
                                            <td style={{ width: salesWidths.freight }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                                {money(row.freight)}
                                            </td>
                                            <td style={{ width: salesWidths.grand_total }} className="px-4 py-3 text-right font-bold text-slate-900 truncate">
                                                {money(row.grand_total)}
                                            </td>
                                            <td style={{ width: salesWidths.payment }} className="px-4 py-3 text-center">
                                                <PaymentBadge status={row.payment_status} />
                                            </td>
                                            <td style={{ width: salesWidths.delivery }} className="px-4 py-3 text-center">
                                                <DeliveryBadge status={row.delivery_status} />
                                            </td>
                                            <td style={{ width: salesWidths.action }} className="px-3 py-3 text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-500 hover:text-indigo-600"
                                                    title="View Invoice Detail"
                                                    onClick={() => setViewItem({ type: "wo_sale", data: row })}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={15} className="p-12 text-center text-slate-400">
                                                No Work Order Sales records found.
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                        {sortedWoRows.length > 0 && (
                            <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                                Showing {sortedWoRows.length} of {groupByPo ? `${groupedWoSales.length} WOs` : `${data?.wo_sales?.length || 0} invoices`}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Credit Notes Table with Resizable Columns & Excel-like Filterable Headers */
                    <div className="overflow-x-auto">
                        <table style={{ width: totalCnWidth, minWidth: "100%" }} className="w-full text-sm border-collapse table-fixed">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                    <ResizableTh label="S.No." width={cnWidths.sno} onResizeStart={startCnResize("sno")} align="center" />
                                    <FilterableHeader
                                        label="CN Number"
                                        columnKey="cn_number"
                                        accessor={CN_ACCESSORS.cn_number}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.cn_number}
                                        onResizeStart={startCnResize("cn_number")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.cn_number}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Date"
                                        columnKey="date"
                                        type="date"
                                        accessor={CN_ACCESSORS.date}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.date}
                                        onResizeStart={startCnResize("date")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.date}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Type"
                                        columnKey="type"
                                        accessor={CN_ACCESSORS.type}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.type}
                                        onResizeStart={startCnResize("type")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.type}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Linked Invoice"
                                        columnKey="invoice_number"
                                        accessor={CN_ACCESSORS.invoice_number}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.invoice_number}
                                        onResizeStart={startCnResize("invoice_number")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.invoice_number}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Client Name"
                                        columnKey="client_name"
                                        accessor={CN_ACCESSORS.client_name}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.client_name}
                                        onResizeStart={startCnResize("client_name")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.client_name}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Items"
                                        columnKey="items"
                                        accessor={CN_ACCESSORS.items}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.items}
                                        onResizeStart={startCnResize("items")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.items}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Reason"
                                        columnKey="reason"
                                        accessor={CN_ACCESSORS.reason}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.reason}
                                        onResizeStart={startCnResize("reason")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.reason}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Taxable"
                                        columnKey="taxable"
                                        type="number"
                                        align="right"
                                        accessor={CN_ACCESSORS.taxable}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.taxable}
                                        onResizeStart={startCnResize("taxable")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.taxable}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="GST"
                                        columnKey="gst"
                                        type="number"
                                        align="right"
                                        accessor={CN_ACCESSORS.gst}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.gst}
                                        onResizeStart={startCnResize("gst")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.gst}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <FilterableHeader
                                        label="Total Credit"
                                        columnKey="total"
                                        type="number"
                                        align="right"
                                        accessor={CN_ACCESSORS.total}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.total}
                                        onResizeStart={startCnResize("total")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.total}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-bold text-rose-700 uppercase tracking-wide"
                                    />
                                    <FilterableHeader
                                        label="Status"
                                        columnKey="status"
                                        accessor={CN_ACCESSORS.status}
                                        sortConfig={cnSortConfig}
                                        setSort={setCnSort}
                                        width={cnWidths.status}
                                        onResizeStart={startCnResize("status")}
                                        rows={creditNotesList}
                                        filterValue={cnFilters.status}
                                        onApplyFilter={setCnFilter}
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                    />
                                    <ResizableTh label="Action" width={cnWidths.action} onResizeStart={startCnResize("action")} align="center" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedCnRows.length ? sortedCnRows.map((row, i) => (
                                    <tr key={`cn_${row.id || i}`} className="hover:bg-slate-50 transition-colors">
                                        <td style={{ width: cnWidths.sno }} className="px-3 py-3 text-center text-xs text-slate-400">{i + 1}</td>
                                        <td style={{ width: cnWidths.cn_number }} className="px-4 py-3 font-mono text-xs font-bold text-rose-700 truncate" title={row.cn_number}>
                                            {row.cn_number}
                                        </td>
                                        <td style={{ width: cnWidths.date }} className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap truncate">
                                            {row.cn_date}
                                        </td>
                                        <td style={{ width: cnWidths.type }} className="px-4 py-3 text-xs">
                                            <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                                row.sale_type === "PO" ? "bg-blue-100 text-blue-800" : "bg-indigo-100 text-indigo-800"
                                            }`}>
                                                {row.sale_type} Sale
                                            </span>
                                        </td>
                                        <td style={{ width: cnWidths.invoice_number }} className="px-4 py-3 font-mono text-xs text-slate-700 truncate" title={row.invoice_number}>
                                            {row.invoice_number}
                                        </td>
                                        <td style={{ width: cnWidths.client_name }} className="px-4 py-3 font-semibold text-slate-900 truncate" title={row.client_name}>
                                            {row.client_name}
                                        </td>
                                        <td style={{ width: cnWidths.items }} className="px-4 py-3">
                                            <ItemCell items={row.items} color="rose" />
                                        </td>
                                        <td style={{ width: cnWidths.reason }} className="px-4 py-3 text-xs text-slate-600 truncate" title={row.reason}>
                                            {row.reason}
                                        </td>
                                        <td style={{ width: cnWidths.taxable }} className="px-4 py-3 text-right text-xs font-medium text-slate-600 truncate">
                                            {money(row.taxable_amount)}
                                        </td>
                                        <td style={{ width: cnWidths.gst }} className="px-4 py-3 text-right text-xs text-slate-500 truncate">
                                            {money(row.gst_amount)}
                                        </td>
                                        <td style={{ width: cnWidths.total }} className="px-4 py-3 text-right font-bold text-rose-700 truncate">
                                            {money(row.total_amount)}
                                        </td>
                                        <td style={{ width: cnWidths.status }} className="px-4 py-3 text-center">
                                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                                row.status === "Cancelled" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-800"
                                            }`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td style={{ width: cnWidths.action }} className="px-3 py-3 text-center">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-rose-600"
                                                title="View Credit Note Detail"
                                                onClick={() => setViewItem({ type: "credit_note", data: row })}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={13} className="p-12 text-center text-slate-400">
                                            No Credit Notes found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {sortedCnRows.length > 0 && (
                            <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                                Showing {sortedCnRows.length} of {data?.credit_notes?.length || 0} credit notes
                            </div>
                        )}
                    </div>
                )}
                <div className="border-t bg-slate-50 px-4 py-2 text-[11px] text-muted-foreground flex items-center justify-end">
                    <button
                        type="button"
                        onClick={tab === "credit_notes" ? resetCnWidths : resetSalesWidths}
                        className="text-primary hover:underline font-semibold"
                    >
                        Reset Widths
                    </button>
                </div>
            </section>

            {/* Detail Dialog */}
            <DetailDialog item={viewItem} onClose={() => setViewItem(null)} />
        </div>
    );
}

function DetailDialog({ item, onClose }) {
    if (!item) return null;
    const { type, data } = item;
    const isCN = type === "credit_note";
    const isGrouped = type === "grouped_po";

    return (
        <Dialog open={!!item} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        {isCN ? (
                            <>
                                <FileMinus className="h-5 w-5 text-rose-600" />
                                Credit Note — {data.cn_number}
                            </>
                        ) : isGrouped ? (
                            <>
                                <Layers className="h-5 w-5 text-blue-600" />
                                PO Dispatches Summary — {data.po_number || data.wo_number}
                            </>
                        ) : (
                            <>
                                <FileText className="h-5 w-5 text-blue-600" />
                                Invoice Detail — {data.invoice_number}
                            </>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 text-sm pt-2">
                    {/* Header info box */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div>
                                <span className="text-[11px] font-semibold text-slate-500 uppercase">Client Name</span>
                                <p className="font-bold text-slate-900">{data.client_name}</p>
                            </div>
                            <div>
                                <span className="text-[11px] font-semibold text-slate-500 uppercase">
                                    {isCN ? "CN Date" : isGrouped ? "Latest Date" : "Invoice Date"}
                                </span>
                                <p className="font-semibold text-slate-800">
                                    {isCN ? data.cn_date : isGrouped ? (data.latest_invoice_date || data.po_date || data.wo_date) : data.invoice_date}
                                </p>
                            </div>
                            <div>
                                <span className="text-[11px] font-semibold text-slate-500 uppercase">
                                    {isCN ? "Linked Invoice" : isGrouped ? "PO / WO Number" : (type === "sale" ? "PO Number" : "WO Number")}
                                </span>
                                <p className="font-semibold text-slate-800">
                                    {isCN ? data.invoice_number : (data.po_number || data.wo_number)}
                                </p>
                            </div>
                            <div>
                                <span className="text-[11px] font-semibold text-slate-500 uppercase">Project</span>
                                <p className="font-medium text-slate-700">{data.project || "—"}</p>
                            </div>
                            {!isCN && (
                                <>
                                    <div>
                                        <span className="text-[11px] font-semibold text-slate-500 uppercase">
                                            {isGrouped ? "Total PO Qty" : (type === "sale" ? "PO Qty" : "WO Qty")}
                                        </span>
                                        <p className="font-bold text-slate-800">{qty(data.po_qty)}</p>
                                    </div>
                                    <div>
                                        <span className="text-[11px] font-semibold text-slate-500 uppercase">
                                            {isGrouped ? "Total Dispatched" : "Dispatch Qty"}
                                        </span>
                                        <p className="font-bold text-blue-700">
                                            {qty(isGrouped ? data.total_dispatch_qty : data.dispatch_qty)}
                                        </p>
                                    </div>
                                    {isGrouped && (
                                        <>
                                            <div>
                                                <span className="text-[11px] font-semibold text-slate-500 uppercase">Balance Qty</span>
                                                <p className={`font-bold ${data.balance_qty > 0 ? "text-amber-600" : "text-emerald-700"}`}>
                                                    {qty(data.balance_qty)}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Dispatches</span>
                                                <p className="font-bold text-slate-800">{data.dispatches?.length || 0} Invoices</p>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                            {isCN && (
                                <div className="col-span-2">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Reason</span>
                                    <p className="font-medium text-slate-800">{data.reason}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Financial summary banner */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border bg-white p-3 text-center">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Taxable / Subtotal</span>
                            <p className="text-base font-bold text-slate-800 mt-0.5">
                                {money(isCN ? data.taxable_amount : data.subtotal)}
                            </p>
                        </div>
                        <div className="rounded-lg border bg-white p-3 text-center">
                            <span className="text-[10px] uppercase font-bold text-slate-400">GST Amount</span>
                            <p className="text-base font-bold text-slate-800 mt-0.5">{money(data.gst_amount)}</p>
                        </div>
                        {!isCN && (
                            <div className="rounded-lg border bg-white p-3 text-center">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Freight</span>
                                <p className="text-base font-bold text-slate-800 mt-0.5">{money(data.freight)}</p>
                            </div>
                        )}
                        <div className={`rounded-lg border p-3 text-center ${isCN ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
                            <span className={`text-[10px] uppercase font-bold ${isCN ? "text-rose-600" : "text-emerald-700"}`}>
                                {isCN ? "Credit Note Total" : "Grand Total"}
                            </span>
                            <p className={`text-base font-extrabold mt-0.5 ${isCN ? "text-rose-700" : "text-emerald-700"}`}>
                                {money(isCN ? data.total_amount : data.grand_total)}
                            </p>
                        </div>
                    </div>

                    {/* If Grouped PO: Show all linked Dispatches table */}
                    {isGrouped && data.dispatches && data.dispatches.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                    <Package className="h-4 w-4 text-blue-600" />
                                    <span>All Dispatches for this Order ({data.dispatches.length})</span>
                                </h4>
                                <span className="text-[11px] text-slate-500 font-medium">
                                    Every dispatch invoice recorded for #{data.po_number || data.wo_number}
                                </span>
                            </div>
                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-100 text-left font-semibold text-slate-600 uppercase text-[10px]">
                                        <tr>
                                            <th className="p-2.5 text-center w-8">#</th>
                                            <th className="p-2.5">Invoice No.</th>
                                            <th className="p-2.5">Date</th>
                                            <th className="p-2.5">Dispatched Items</th>
                                            <th className="p-2.5 text-right">Dispatch Qty</th>
                                            <th className="p-2.5 text-right">Subtotal</th>
                                            <th className="p-2.5 text-right">GST</th>
                                            <th className="p-2.5 text-right">Grand Total</th>
                                            <th className="p-2.5 text-center">Payment</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.dispatches.map((disp, dIdx) => (
                                            <tr key={disp.id || dIdx} className="hover:bg-blue-50/30">
                                                <td className="p-2.5 text-center text-slate-400">{dIdx + 1}</td>
                                                <td className="p-2.5 font-mono font-bold text-blue-700">{disp.invoice_number}</td>
                                                <td className="p-2.5 text-slate-600">{disp.invoice_date}</td>
                                                <td className="p-2.5 text-slate-800 font-medium">{disp.items_summary}</td>
                                                <td className="p-2.5 text-right font-bold text-blue-700">{qty(disp.dispatch_qty)} Nos</td>
                                                <td className="p-2.5 text-right">{money(disp.subtotal)}</td>
                                                <td className="p-2.5 text-right">{money(disp.gst_amount)}</td>
                                                <td className="p-2.5 text-right font-bold text-slate-900">{money(disp.grand_total)}</td>
                                                <td className="p-2.5 text-center"><PaymentBadge status={disp.payment_status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Items Breakdown Table */}
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Item Breakdown</h4>
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-100 text-left font-semibold text-slate-600 uppercase">
                                    <tr>
                                        <th className="p-2.5 w-10 text-center">#</th>
                                        <th className="p-2.5">Item Description</th>
                                        <th className="p-2.5 text-right">{isCN ? "Original Qty" : (type === "sale" || isGrouped ? "PO Qty" : "WO Qty")}</th>
                                        <th className="p-2.5 text-right">{isCN ? "Credit Qty" : (isGrouped ? "Total Dispatched" : "Dispatch Qty")}</th>
                                        <th className="p-2.5 text-right">Unit Rate</th>
                                        <th className="p-2.5 text-right">GST %</th>
                                        <th className="p-2.5 text-right">Total Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(data.items || []).map((it, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-2.5 text-center text-slate-400">{idx + 1}</td>
                                            <td className="p-2.5 font-medium text-slate-800">
                                                {it.item || it.item_description}
                                            </td>
                                            <td className="p-2.5 text-right font-medium text-slate-700">
                                                {qty(isCN ? (it.original_qty || it.quantity) : (it.po_qty > 0 ? it.po_qty : data.po_qty))} {it.uom || "Nos"}
                                            </td>
                                            <td className={`p-2.5 text-right font-bold ${isCN ? "text-rose-700" : type === "sale" || isGrouped ? "text-blue-700" : "text-indigo-700"}`}>
                                                {qty(isCN ? it.credit_qty : (it.dispatch_qty ?? it.quantity))} {it.uom || "Nos"}
                                            </td>
                                            <td className="p-2.5 text-right text-slate-600">{money(it.unit_price || it.unit_rate)}</td>
                                            <td className="p-2.5 text-right text-slate-500">{it.gst_rate}%</td>
                                            <td className="p-2.5 text-right font-bold text-slate-900">{money(it.total_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
