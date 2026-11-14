import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, ChevronDown, ChevronUp, Download, PackageCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchStoreMaterialReceipts } from "@/lib/api";

const qty = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Card({ label, value, detail, icon: Icon, color }) {
    return (
        <div className="rounded-xl border bg-white p-5 shadow-card">
            <div className="flex gap-3">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${color}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-2xl font-bold">{value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                </div>
            </div>
        </div>
    );
}

const csv = (filename, rows) => {
    const value = x => `"${String(x ?? "").replaceAll('"', '""')}"`;
    const text = rows.map(row => row.map(value).join(",")).join("\n");
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

export default function StoreReports({ inventory = [], orders = [] }) {
    const [tab, setTab] = useState("stock");
    const [search, setSearch] = useState("");
    const [expandedRows, setExpandedRows] = useState({}); // track which vendor+po rows are expanded

    const totals = useMemo(() => ({
        stock: inventory.reduce((sum, x) => sum + Number(x.available_quantity || 0), 0),
        value: inventory.reduce((sum, x) => sum + Number(x.remaining_stock_amount || 0), 0),
        issued: inventory.reduce((sum, x) => sum + Number(x.issued_quantity || 0), 0),
        low: inventory.filter(x => x.status !== "In Stock").length,
        poValue: orders.reduce((sum, x) => sum + Number(x.grand_total || x.subtotal || 0), 0)
    }), [inventory, orders]);

    const stockRows = inventory.filter(x => `${x.name} ${x.stock_item || ""} ${x.location || ""}`.toLowerCase().includes(search.toLowerCase()));
    const alerts = stockRows.filter(x => x.status !== "In Stock");
    const consumption = stockRows.filter(x => Number(x.issued_quantity) > 0);

    const { data: allReceipts = [] } = useQuery({ queryKey: ["store-material-receipts"], queryFn: fetchStoreMaterialReceipts });

    // Supplier Purchases: Vendor+PO grouped rows (items as dropdown list)
    const supplierPurchaseRows = useMemo(() => {
        const q = search.toLowerCase();
        const poMap = new Map();
        allReceipts.forEach(receipt => {
            const poOrder = orders.find(o => String(o.id) === String(receipt.order_id) || (receipt.order_number && o.order_number === receipt.order_number));
            const key = `${receipt.vendor_name || poOrder?.supplier || ""}__${receipt.order_number || receipt.order_id || ""}`;
            const amountPaid = Number(receipt.amount_paid || 0);
            const invoiceTotal = Number(receipt.invoice_total || 0);
            const pending = Math.max(0, invoiceTotal - amountPaid);
            const existing = poMap.get(key) || {
                vendor: receipt.vendor_name || poOrder?.supplier || "—",
                po_number: receipt.order_number || poOrder?.order_number || "—",
                items: [], // { name, po_qty, received_qty, value }
                value: invoiceTotal > 0 ? invoiceTotal : Number(poOrder?.grand_total || 0),
                po_qty: 0,
                received_qty: 0,
                amount_paid: amountPaid,
                amount_pending: pending,
                payment_status: receipt.payment_status || (pending <= 0 && amountPaid > 0 ? "Paid" : amountPaid > 0 ? "Partially Paid" : "Unpaid"),
            };
            (receipt.lines || []).forEach(line => {
                const poItem = (poOrder?.items || []).find(i => i.item_description === line.item_description);
                const lineAmt = Number(line.amount || (Number(line.received_quantity || 0) * Number(line.unit_rate || 0)) || poItem?.amount || 0);
                existing.received_qty += Number(line.received_quantity || 0);
                existing.po_qty += Number(poItem?.quantity || 0);
                const existItem = existing.items.find(it => it.name === line.item_description);
                if (existItem) {
                    existItem.received_qty += Number(line.received_quantity || 0);
                    existItem.po_qty += Number(poItem?.quantity || 0);
                    existItem.value += lineAmt;
                } else {
                    existing.items.push({
                        name: line.item_description || "—",
                        po_qty: Number(poItem?.quantity || 0),
                        received_qty: Number(line.received_quantity || 0),
                        value: lineAmt,
                    });
                }
            });
            poMap.set(key, existing);
        });
        const rows = [];
        poMap.forEach(row => {
            if (!q || `${row.vendor} ${row.po_number} ${row.items.map(i => i.name).join(" ")}`.toLowerCase().includes(q)) {
                rows.push(row);
            }
        });
        return rows;
    }, [allReceipts, orders, search]);

    // supplierPoRows not needed anymore (table is unified)
    // const supplierPoRows = supplierPurchaseRows;

    const exportCurrent = () => {
        if (tab === "stock") {
            csv("stock-valuation-report.csv", [
                ["Groups Name", "Items Name", "U/M", "Location", "Total Received", "Issued", "Available", "Rate", "Available Value", "Status"],
                ...stockRows.map(x => [x.name, x.stock_item, x.uom, x.location, x.total_quantity, x.issued_quantity, x.available_quantity, x.rate, x.remaining_stock_amount, x.status])
            ]);
        } else if (tab === "alerts") {
            csv("stock-alerts-report.csv", [
                ["Groups Name", "Location", "Available", "Reorder Level", "Status"],
                ...alerts.map(x => [x.name, x.location, x.available_quantity, x.reorder_level, x.status])
            ]);
        } else if (tab === "consumption") {
            csv("material-consumption-report.csv", [
                ["Groups Name", "Items Name", "Issued Quantity", "Available", "Rate", "Issued Value"],
                ...consumption.map(x => [x.name, x.stock_item, x.issued_quantity, x.available_quantity, x.rate, Number(x.issued_quantity || 0) * Number(x.rate || 0)])
            ]);
        } else if (tab === "suppliers") {
            csv("supplier-purchases-report.csv", [
                ["S.No.", "Vendor Name", "PO No.", "Items", "Value", "Total PO Qty", "Materials Received Qty", "Amount Paid", "Payment Outstanding", "Status"],
                ...supplierPurchaseRows.map((x, i) => [i + 1, x.vendor, x.po_number, x.items.map(it => it.name).join("; "), x.value, x.po_qty, x.received_qty, x.amount_paid, x.amount_pending, x.payment_status])
            ]);
        }
    };

    const tabs = [
        { id: "stock", label: "Stock Valuation" },
        { id: "alerts", label: "Low Stock Alerts" },
        { id: "suppliers", label: "Supplier Purchases" }
    ];

    return (
        <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8">
            <div className="w-full">
                {/* Header */}
                <div className="flex flex-col gap-4 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
                    <div className="sm:pl-0">
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Store Reports</h1>
                        <p className="mt-2 text-sm text-muted-foreground">Stock, valuation, material consumption and purchase analysis.</p>
                    </div>
                    <Button onClick={exportCurrent}>
                        <Download className="mr-2 h-4 w-4" />
                        Export Current Report
                    </Button>
                </div>

                {/* Top KPI Cards */}
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <Card label="Available Stock" value={qty(totals.stock)} detail="Current quantity across materials" icon={PackageCheck} color="bg-emerald-50 text-emerald-700" />
                    <Card label="Issued Quantity" value={qty(totals.issued)} detail="Total material consumption" icon={BarChart3} color="bg-amber-50 text-amber-700" />
                    <Card label="Stock Alerts" value={qty(totals.low)} detail="Low stock or out of stock" icon={AlertTriangle} color="bg-rose-50 text-rose-700" />
                </div>

                {/* Main Tabs Container */}
                <section className="mt-5 rounded-xl border bg-white shadow-card">
                    <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
                            {tabs.map(x => (
                                <button
                                    key={x.id}
                                    onClick={() => setTab(x.id)}
                                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                                        tab === x.id ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {x.label}
                                </button>
                            ))}
                        </div>

                        <div className="relative w-full lg:w-80">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search current report..."
                                className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm"
                            />
                        </div>
                    </div>

                    {tab === "stock" && (
                        <ReportTable
                            headers={["Groups Name", "Items Name", "U/M", "Location", "Total Received", "Issued", "Available", "Rate", "Available Value", "Status"]}
                            rows={stockRows.map(x => [
                                x.name,
                                x.stock_item || "—",
                                x.uom || "Nos",
                                x.location || "—",
                                qty(x.total_quantity),
                                qty(x.issued_quantity),
                                <strong className="text-emerald-700">{qty(x.available_quantity)}</strong>,
                                money(x.rate),
                                <strong>{money(x.remaining_stock_amount)}</strong>,
                                <Status value={x.status} />
                            ])}
                            empty="No material stock records found."
                        />
                    )}

                    {tab === "alerts" && (
                        <ReportTable
                            headers={["Groups Name", "Items Name", "Location", "Available", "Reorder Level", "Status", "Action Required"]}
                            rows={alerts.map(x => [
                                x.name,
                                x.stock_item || "—",
                                x.location || "—",
                                qty(x.available_quantity),
                                qty(x.reorder_level),
                                <Status value={x.status} />,
                                x.status === "Out of Stock" ? "Receive stock immediately" : "Plan reorder / purchase"
                            ])}
                            empty="No low-stock or out-of-stock materials."
                        />
                    )}

                    {tab === "suppliers" && (
                        <div className="p-4 sm:p-5">
                            {/* Count */}
                            <div className="mb-4 flex items-center justify-end">
                                <div className="text-xs text-muted-foreground">
                                    Showing <strong>{supplierPurchaseRows.length}</strong> records
                                </div>
                            </div>

                            {/* Single unified table: Vendor+PO grouped, Items as expandable dropdown */}
                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full min-w-[1000px] text-sm">
                                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="border-b px-3 py-3 w-14 text-center">S.No.</th>
                                            <th className="border-b px-4 py-3">Vendor Name</th>
                                            <th className="border-b px-4 py-3">PO No.</th>
                                            <th className="border-b px-4 py-3">Items</th>
                                            <th className="border-b px-4 py-3 text-right">Value</th>
                                            <th className="border-b px-4 py-3 text-right">Total PO Qty</th>
                                            <th className="border-b px-4 py-3 text-right">Materials Received</th>
                                            <th className="border-b px-4 py-3 text-right">Amount Paid</th>
                                            <th className="border-b px-4 py-3 text-right">Payment Outstanding</th>
                                            <th className="border-b px-4 py-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {supplierPurchaseRows.length ? supplierPurchaseRows.map((row, i) => {
                                            const isOpen = !!expandedRows[i];
                                            const itemCount = row.items.length;
                                            return (
                                                <>
                                                    <tr key={`row-${i}`} className="hover:bg-slate-50">
                                                        <td className="px-3 py-3.5 text-center text-muted-foreground">{i + 1}</td>
                                                        <td className="px-4 py-3.5 font-semibold text-slate-900">{row.vendor}</td>
                                                        <td className="px-4 py-3.5 font-medium text-cyan-700">{row.po_number}</td>
                                                        {/* Items column — dropdown trigger */}
                                                        <td className="px-4 py-3.5">
                                                            {itemCount === 0 ? (
                                                                <span className="text-slate-400">—</span>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExpandedRows(prev => ({ ...prev, [i]: !prev[i] }))}
                                                                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
                                                                >
                                                                    <span className="truncate max-w-[180px]" title={row.items[0]?.name}>{row.items[0]?.name}</span>
                                                                    {itemCount > 1 && (
                                                                        <span className="shrink-0 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700">+{itemCount - 1}</span>
                                                                    )}
                                                                    {itemCount > 1 && (isOpen
                                                                        ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                                                        : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                                                    )}
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right font-bold text-slate-900">{money(row.value)}</td>
                                                        <td className="px-4 py-3.5 text-right font-semibold text-slate-600">{row.po_qty || "—"}</td>
                                                        <td className="px-4 py-3.5 text-right font-bold text-emerald-700">{row.received_qty}</td>
                                                        <td className="px-4 py-3.5 text-right font-semibold text-emerald-700">{money(row.amount_paid)}</td>
                                                        <td className="px-4 py-3.5 text-right font-bold text-rose-700">{money(row.amount_pending)}</td>
                                                        <td className="px-4 py-3.5 text-center">
                                                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                                                row.payment_status === "Paid"
                                                                    ? "bg-emerald-100 text-emerald-800"
                                                                    : row.payment_status === "Partially Paid"
                                                                        ? "bg-amber-100 text-amber-800"
                                                                        : "bg-rose-100 text-rose-800"
                                                            }`}>
                                                                {row.payment_status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                    {/* Expanded items dropdown rows */}
                                                    {isOpen && itemCount > 1 && row.items.slice(1).map((it, j) => (
                                                        <tr key={`row-${i}-item-${j}`} className="bg-slate-50/60">
                                                            <td className="px-3 py-2.5 text-center text-muted-foreground/50 text-xs">{j + 2}</td>
                                                            <td className="px-4 py-2.5 text-slate-400 text-xs italic"></td>
                                                            <td className="px-4 py-2.5 text-slate-400 text-xs italic"></td>
                                                            <td className="px-4 py-2.5">
                                                                <span className="ml-3 text-xs text-slate-600 font-medium border-l-2 border-cyan-200 pl-2">{it.name}</span>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-slate-500">{it.value > 0 ? money(it.value) : "—"}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-slate-500">{it.po_qty || "—"}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-600">{it.received_qty}</td>
                                                            <td colSpan="3" className="px-4 py-2.5 text-xs text-slate-400 text-center"></td>
                                                        </tr>
                                                    ))}
                                                </>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan="10" className="p-12 text-center text-muted-foreground">
                                                    No materials received from suppliers yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}

function Status({ value }) {
    return (
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
            value === "In Stock" ? "bg-emerald-50 text-emerald-700" : value === "Low Stock" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
        }`}>
            {value}
        </span>
    );
}

function ReportTable({ headers, rows, empty }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                        {headers.map(x => <th key={x} className="border-b px-4 py-3">{x}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.length ? rows.map((row, i) => (
                        <tr key={i} className="border-b hover:bg-slate-50">
                            {row.map((cell, j) => <td key={j} className="px-4 py-4">{cell}</td>)}
                        </tr>
                    )) : (
                        <tr><td colSpan={headers.length} className="p-12 text-center text-muted-foreground">{empty}</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
