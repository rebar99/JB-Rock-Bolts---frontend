import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Download, PackageCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchStoreMaterialReceipts } from "@/lib/api";

const qty = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
function Card({ label, value, detail, icon: Icon, color }) { return <div className="rounded-xl border bg-white p-5 shadow-card"><div className="flex gap-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 text-2xl font-bold">{value}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div></div></div>; }
const csv = (filename, rows) => { const value = x => `"${String(x ?? "").replaceAll('"', '""')}"`; const text = rows.map(row => row.map(value).join(",")).join("\n"); const blob = new Blob([text], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };

export default function StoreReports({ inventory = [], orders = [] }) {
    const [tab, setTab] = useState("stock"); const [search, setSearch] = useState("");
    const totals = useMemo(() => ({ stock: inventory.reduce((sum, x) => sum + Number(x.available_quantity || 0), 0), value: inventory.reduce((sum, x) => sum + Number(x.remaining_stock_amount || 0), 0), issued: inventory.reduce((sum, x) => sum + Number(x.issued_quantity || 0), 0), low: inventory.filter(x => x.status !== "In Stock").length, poValue: orders.reduce((sum, x) => sum + Number(x.grand_total || x.subtotal || 0), 0) }), [inventory, orders]);
    const stockRows = inventory.filter(x => `${x.name} ${x.stock_item || ""} ${x.location || ""}`.toLowerCase().includes(search.toLowerCase()));
    const alerts = stockRows.filter(x => x.status !== "In Stock");
    const consumption = stockRows.filter(x => Number(x.issued_quantity) > 0);

    const { data: allReceipts = [] } = useQuery({ queryKey: ["store-material-receipts"], queryFn: fetchStoreMaterialReceipts });

    // Group inventory item names for group/item split
    const groupNames = useMemo(() => [...new Set(inventory.map(i => i.name?.trim()).filter(Boolean))].sort((a, b) => b.length - a.length), [inventory]);
    const splitGroup = raw => { const v = String(raw || "").trim(); const g = groupNames.find(n => v.toLowerCase() === n.toLowerCase() || v.toLowerCase().startsWith(`${n} `.toLowerCase())); return { group: g || v || "—", item: g ? (v.slice(g.length).trim() || "General") : (v || "—") }; };

    // Supplier Purchases: one row per receipt line
    const supplierPurchaseRows = useMemo(() => {
        const q = search.toLowerCase();
        const rows = [];
        allReceipts.forEach(receipt => {
            const poOrder = orders.find(o => String(o.id) === String(receipt.order_id));
            (receipt.lines || []).forEach(line => {
                const parts = splitGroup(line.item_description);
                const poQty = Number((poOrder?.items || []).find(i => i.item_description === line.item_description)?.quantity || 0);
                const amountPaid = Number(receipt.amount_paid || 0);
                const invoiceTotal = Number(receipt.invoice_total || 0);
                const pending = Math.max(0, invoiceTotal - amountPaid);
                const row = {
                    vendor: receipt.vendor_name || poOrder?.supplier || "—",
                    po_number: receipt.order_number || poOrder?.order_number || "—",
                    group: parts.group,
                    item: parts.item,
                    po_qty: poQty,
                    received_qty: Number(line.received_quantity || 0),
                    amount_paid: amountPaid,
                    amount_pending: pending,
                    payment_status: receipt.payment_status || "Unpaid",
                };
                if (!q || `${row.vendor} ${row.po_number} ${row.group} ${row.item}`.toLowerCase().includes(q)) rows.push(row);
            });
        });
        return rows;
    }, [allReceipts, orders, groupNames, search]);

    const suppliers = useMemo(() => { const map = new Map(); orders.forEach(order => { const name = order.supplier || "Not specified"; const existing = map.get(name) || { name, orders: 0, qty: 0, value: 0 }; existing.orders += 1; existing.qty += (order.items || []).reduce((sum, x) => sum + Number(x.quantity || 0), 0); existing.value += Number(order.grand_total || order.subtotal || 0); map.set(name, existing); }); return [...map.values()].filter(x => x.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.value - a.value); }, [orders, search]);
    const exportCurrent = () => { if (tab === "stock") csv("stock-valuation-report.csv", [["Groups Name", "Items Name", "U/M", "Location", "Total Received", "Issued", "Available", "Rate", "Available Value", "Status"], ...stockRows.map(x => [x.name, x.stock_item, x.uom, x.location, x.total_quantity, x.issued_quantity, x.available_quantity, x.rate, x.remaining_stock_amount, x.status])]); else if (tab === "alerts") csv("stock-alerts-report.csv", [["Groups Name", "Location", "Available", "Reorder Level", "Status"], ...alerts.map(x => [x.name, x.location, x.available_quantity, x.reorder_level, x.status])]); else if (tab === "consumption") csv("material-consumption-report.csv", [["Groups Name", "Items Name", "Issued Quantity", "Available", "Rate", "Issued Value"], ...consumption.map(x => [x.name, x.stock_item, x.issued_quantity, x.available_quantity, x.rate, Number(x.issued_quantity || 0) * Number(x.rate || 0)])]); else csv("supplier-purchase-report.csv", [["Vendors Name", "Purchase Orders", "Quantity", "Purchase Value"], ...suppliers.map(x => [x.name, x.orders, x.qty, x.value])]); };
    const tabs = [{ id: "stock", label: "Stock Valuation" }, { id: "alerts", label: "Low Stock Alerts" }, { id: "suppliers", label: "Supplier Purchases" }];
    return <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8"><div className="w-full"><div className="flex flex-col gap-4 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left"><div className="sm:pl-0"><h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Store Reports</h1><p className="mt-2 text-sm text-muted-foreground">Stock, valuation, material consumption and purchase analysis.</p></div><Button onClick={exportCurrent}><Download className="mr-2 h-4 w-4" />Export Current Report</Button></div><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Card label="Available Stock" value={qty(totals.stock)} detail="Current quantity across materials" icon={PackageCheck} color="bg-emerald-50 text-emerald-700" /><Card label="Issued Quantity" value={qty(totals.issued)} detail="Total material consumption" icon={BarChart3} color="bg-amber-50 text-amber-700" /><Card label="Stock Alerts" value={qty(totals.low)} detail="Low stock or out of stock" icon={AlertTriangle} color="bg-rose-50 text-rose-700" /></div><section className="mt-5 rounded-xl border bg-white shadow-card"><div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">{tabs.map(x => <button key={x.id} onClick={() => setTab(x.id)} className={`rounded-md px-3 py-2 text-sm font-medium transition ${tab === x.id ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{x.label}</button>)}</div><div className="relative w-full lg:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search current report..." className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm" /></div></div>{tab === "stock" && <ReportTable headers={["Groups Name", "Items Name", "U/M", "Location", "Total Received", "Issued", "Available", "Rate", "Available Value", "Status"]} rows={stockRows.map(x => [x.name, x.stock_item || "—", x.uom || "Nos", x.location || "—", qty(x.total_quantity), qty(x.issued_quantity), <strong className="text-emerald-700">{qty(x.available_quantity)}</strong>, money(x.rate), <strong>{money(x.remaining_stock_amount)}</strong>, <Status value={x.status} />])} empty="No material stock records found." />} {tab === "alerts" && <ReportTable headers={["Groups Name", "Items Name", "Location", "Available", "Reorder Level", "Status", "Action Required"]} rows={alerts.map(x => [x.name, x.stock_item || "—", x.location || "—", qty(x.available_quantity), qty(x.reorder_level), <Status value={x.status} />, x.status === "Out of Stock" ? "Receive stock immediately" : "Plan reorder / purchase"])} empty="No low-stock or out-of-stock materials." />} {tab === "suppliers" && <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500"><tr><th className="border-b px-3 py-3 w-14 text-center">S.No.</th><th className="border-b px-4 py-3">PO No.</th><th className="border-b px-4 py-3">Group Name</th><th className="border-b px-4 py-3">Item Name</th><th className="border-b px-4 py-3 text-right">Total PO Qty</th><th className="border-b px-4 py-3 text-right">Received Qty</th><th className="border-b px-4 py-3 text-right">Amount Paid</th><th className="border-b px-4 py-3 text-right">Amount Pending</th></tr></thead><tbody>{supplierPurchaseRows.length ? supplierPurchaseRows.map((row, i) => <tr key={i} className="border-b hover:bg-slate-50"><td className="px-3 py-4 text-center text-muted-foreground">{i + 1}</td><td className="px-4 py-4 font-medium text-cyan-700">{row.po_number}</td><td className="px-4 py-4">{row.group}</td><td className="px-4 py-4">{row.item}</td><td className="px-4 py-4 text-right font-semibold">{row.po_qty || "—"}</td><td className="px-4 py-4 text-right font-semibold text-emerald-700">{row.received_qty}</td><td className="px-4 py-4 text-right font-semibold text-emerald-700">{money(row.amount_paid)}</td><td className="px-4 py-4 text-right font-semibold text-rose-700">{money(row.amount_pending)}</td></tr>) : <tr><td colSpan="8" className="p-12 text-center text-muted-foreground">No materials received from suppliers yet.</td></tr>}</tbody></table></div>}</section></div></main>;
}
function Status({ value }) { return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${value === "In Stock" ? "bg-emerald-50 text-emerald-700" : value === "Low Stock" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{value}</span>; }
function ReportTable({ headers, rows, empty }) { return <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500"><tr>{headers.map(x => <th key={x} className="border-b px-4 py-3">{x}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i} className="border-b hover:bg-slate-50">{row.map((cell, j) => <td key={j} className="px-4 py-4">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="p-12 text-center text-muted-foreground">{empty}</td></tr>}</tbody></table></div>; }
