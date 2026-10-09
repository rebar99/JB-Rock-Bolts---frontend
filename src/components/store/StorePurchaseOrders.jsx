import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownUp, CheckCircle2, ChevronDown, ChevronUp, Clock3, Eye, FileText, GripVertical, Package, Pencil, Plus, Printer, Search, Trash2, Truck, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import PurchaseOrderForm from "@/components/store/PurchaseOrderForm";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { completeStoreOrder, deleteStoreOrder } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import jbEngineeringLogo from "@/assets/jb-engineering-logo.jpg";

const columns = [
    { key: "select", label: "Select", width: 52, min: 52, align: "center" },
    { key: "sno", label: "S.No.", width: 100, min: 100, align: "center" },
    { key: "supplier", label: "Vendor", width: 250, min: 150 },
    { key: "item", label: "Item", width: 310, min: 160 },
    { key: "order_number", label: "PO #", width: 150, min: 110 },
    { key: "date", label: "PO Date", width: 140, min: 115 },
    { key: "quantity", label: "Order Quantity", width: 145, min: 110, align: "right" },
    { key: "received_quantity", label: "Received Qty", width: 135, min: 105, align: "right" },
    { key: "amount", label: "Amount", width: 155, min: 110, align: "right" },
    { key: "status", label: "Status", width: 145, min: 110, align: "center" },
    { key: "activity", label: "Activity", width: 150, min: 120 },
    { key: "actions", label: "Actions", width: 230, min: 200, align: "center" },
];
const defaultWidths = Object.fromEntries(columns.map(column => [column.key, column.width]));
const formatNumber = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const formatDate = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const itemText = order => (order.items || []).map(item => item.item_description).join(", ");
const latestActivity = order => order.activities?.[0] || {
    action: "Created",
    performed_by: order.created_by,
    created_at: order.created_at,
};
const quantityFor = order => (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
const pendingApproversFor = order => {
    const stages = {};
    (order.approval_history || []).forEach(row => { (stages[row.level_order] ||= []).push(row); });
    for (const rows of Object.values(stages).sort((left, right) => Number(left[0].level_order) - Number(right[0].level_order))) {
        const done = rows[0].rule === "any" ? rows.some(row => row.action === "Approved") : rows.every(row => row.action === "Approved");
        if (!done) return rows.filter(row => row.action === "Pending").map(row => row.approver_name).filter(Boolean);
    }
    return [];
};
const escapeHtml = value => String(value ?? "—").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

function printPurchaseOrder(order) {
    const items = (order.items || []).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.item_description)}</td><td>${formatNumber(item.quantity)}</td><td>${escapeHtml(item.uom)}</td><td class="right">&#8377;${formatNumber(item.unit_rate)}</td><td class="right">&#8377;${formatNumber(item.amount)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><title>PO ${escapeHtml(order.order_number)}</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}html,body{width:100%;min-height:100%;background:#fff}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#0c2348;font-size:11px;line-height:1.35}.sheet{width:100%;min-height:273mm}.company{display:flex;align-items:center;gap:14px;padding:4px 0 9px;border-bottom:2px solid #12386c}.logo{width:70px;height:54px;border:1px solid #d2dbe8;object-fit:contain;border-radius:2px}.company h1{margin:0;color:#e5222b;font-size:20px;line-height:1.1}.company p{margin:2px 0;font-size:10px;font-weight:600}.title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #365780;padding:8px 0}.title strong{font-size:18px;letter-spacing:.2px}.meta{display:grid;grid-template-columns:1.65fr 1fr;gap:12px;border-bottom:1px solid #9aacca;padding:10px 0;line-height:1.55}.meta p{margin:0}.intro{margin:8px 0;font-size:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #6480a4;padding:6px;vertical-align:top}th{background:#e8eff8;font-size:9px;text-align:center}.right{text-align:right}.totals{width:43%;margin-left:auto;border:1px solid #6480a4;border-top:0}.totals div{display:flex;justify-content:space-between;padding:6px;border-top:1px solid #b5c3d5}.totals .grand{background:#d8e9ff;font-weight:bold}.terms-container{margin-top:12px;border:1px solid #6480a4;width:100%}.terms-body{padding:7px 9px;line-height:1.55}.terms-body h3{margin:0 0 4px;font-size:11px}.terms-body p{margin:1px 0}.remark-red{color:#e5222b !important;font-weight:bold !important}.sign-block{border-top:1px solid #6480a4;padding:8px 12px 10px;font-size:10px}.sign-block .company-for{text-align:right;font-weight:bold;font-size:11px}.sign-block .sign-row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:48px;font-weight:bold;font-size:10px;padding:0 5px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.remark-red, .remark-red font{color:#e5222b !important;font-weight:bold !important}}</style></head><body><main class="sheet"><section class="company"><img class="logo" src="${jbEngineeringLogo}" alt="JB Engineering"/><div><h1>RE-Bar Couplers India Private Limited</h1><p>VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220</p><p>HO: 10 A&amp;B, Block 23, Industrial Area, Nangal Jarialan, Distt. Una, Himachal Pradesh - 177212</p><p>Cell No. +91 9888603791 &middot; seema@jbengineeringcorporation.com</p><p>www.jbengineeringcorporation.com &middot; GST No. 02AAFCR5621L1ZG</p></div></section><section class="title"><span>Vendor Code: ${escapeHtml(order.vendor_code)}</span><strong>PURCHASE ORDER</strong></section><section class="meta"><div><p><b>Vendor Name:</b> ${escapeHtml(order.supplier)}</p><p><b>Vendor Address:</b> ${escapeHtml(order.vendor_address || "Vendor address not provided").replace(/\n/g, "<br/>")}</p><p><b>Contact Person / Phone:</b> ${escapeHtml(order.vendor_contact)}</p><p><b>Vendor GST No.:</b> ${escapeHtml(order.vendor_gst)}</p></div><div><p><b>PO No:</b> ${escapeHtml(order.order_number)}</p><p><b>PO Date:</b> ${formatDate(order.po_date || order.created_at)}</p><p><b>Reference:</b> ${escapeHtml(order.reference)}</p><p><b>Status:</b> ${escapeHtml(order.status)}</p></div></section><p class="intro">Please supply the following goods subject to the terms and conditions mentioned herein.</p><table><thead><tr><th>Sr. No.</th><th>Item Description</th><th>Quantity</th><th>U/M</th><th>Unit Rate (INR)</th><th>Amount (INR)</th></tr></thead><tbody>${items}</tbody></table><section class="totals"><div><span>Total</span><b>&#8377;${formatNumber(order.subtotal)}</b></div><div><span>IGST (${order.gst_rate || 0}%)</span><b>&#8377;${formatNumber(order.gst_amount)}</b></div><div><span>Rounded off</span><b>&#8377;${formatNumber(order.round_off)}</b></div><div class="grand"><span>Total Amount Including Taxes</span><b>&#8377;${formatNumber(order.grand_total)}</b></div></section><section class="terms-container"><div class="terms-body"><h3>Terms and Conditions</h3><p><b>Price:</b> ${escapeHtml(order.price_basis)}</p><p><b>Packing &amp; Forwarding:</b> ${escapeHtml(order.packing_terms)}</p><p><b>Freight &amp; Transportation:</b> ${escapeHtml(order.freight_terms)}</p><p><b>Insurance:</b> ${escapeHtml(order.insurance_terms)}</p><p><b>Delivery:</b> ${escapeHtml(order.delivery_terms)}</p><p><b>Inspection:</b> ${escapeHtml(order.inspection_terms)}</p><p><b>Guarantee / Warranty:</b> ${escapeHtml(order.warranty_terms)}</p><p><b>Payment Terms:</b> ${escapeHtml(order.payment_terms)}</p><p><b>Quantity Variance:</b> ${escapeHtml(order.quantity_variance)}</p>${order.notes ? `<p><b>Notes:</b> ${escapeHtml(order.notes)}</p>` : ""}${order.remark_1 ? `<p style="margin-top:3px;"><b>Remarks:</b> ${escapeHtml(order.remark_1)}</p>` : ""}${order.remark_2 ? `<p class="remark-red" style="color:#e5222b !important;font-weight:bold !important;margin-top:3px;"><font color="#e5222b"><b>Remarks:</b> ${escapeHtml(order.remark_2)}</font></p>` : ""}</div><div class="sign-block"><div class="company-for">For RE-Bar Couplers India Private Limited</div><div class="sign-row"><span>Prepared By</span><span>Checked By</span><span>Approved By</span></div></div></section></main></body></html>`;
    // Use hidden iframe so the main app is never blocked
    let iframe = document.getElementById("_po_print_iframe");
    if (!iframe) { iframe = document.createElement("iframe"); iframe.id = "_po_print_iframe"; iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;"; document.body.appendChild(iframe); }
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
        const els = doc.querySelectorAll(".remark-red");
        els.forEach(el => { el.style.setProperty("color", "#e5222b", "important"); el.style.setProperty("font-weight", "bold", "important"); });
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 300);
}

function StatCard({ label, value, icon: Icon, color }) {
    return <div className="rounded-xl border bg-white p-5 shadow-card"><div className="flex items-center gap-3"><div className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 text-2xl font-bold text-foreground">{value}</p></div></div></div>;
}

function SortHeader({ column, sort, onSort, width, onResizeStart }) {
    const active = sort.key === column.key;
    const Icon = active ? (sort.direction === "asc" ? ChevronUp : ChevronDown) : ArrowDownUp;
    const quantityHeader = column.key === "quantity" || column.key === "received_quantity";
    return <th style={{ width }} className={`group relative border-r border-border bg-slate-50 px-3 py-3 last:border-r-0 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}><button type="button" onClick={() => onSort(column.key)} className={`inline-flex max-w-full items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${column.key === "sno" || quantityHeader ? "whitespace-nowrap" : ""} ${active ? "text-primary" : "text-foreground"}`}><span className={column.key === "sno" || quantityHeader ? "whitespace-nowrap" : "truncate"}>{column.label}</span><Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} /></button><button type="button" aria-label={`Resize ${column.label} column`} onMouseDown={event => onResizeStart(event, column)} className="absolute -right-2 top-0 z-10 grid h-full w-4 cursor-col-resize place-items-center opacity-0 transition-opacity group-hover:opacity-100"><GripVertical className="h-4 w-4 text-primary" /></button></th>;
}

export default function StorePurchaseOrders({ orders = [], admin = false }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [screen, setScreen] = useState("list");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState({ key: "date", direction: "desc" });
    const [widths, setWidths] = useState(defaultWidths);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [viewOrder, setViewOrder] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);
    const [createType, setCreateType] = useState(null);
    const deleteOrder = useMutation({ mutationFn: deleteStoreOrder, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["store-orders"] }); queryClient.invalidateQueries({ queryKey: ["store-inventory"] }); queryClient.invalidateQueries({ queryKey: ["store-dashboard"] }); toast.success("Purchase Order deleted."); }, onError: error => toast.error(error.message) });
    const completeOrder = useMutation({ mutationFn: completeStoreOrder, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["store-orders"] }); toast.success("Purchase Order marked as Completed."); }, onError: error => toast.error(error.message) });
    // Purchase Orders already owns its Select + S.No. columns and native sort /
    // resize controls. Remove any earlier shared-table controls left by hot reload.
    useEffect(() => {
        const table = document.querySelector(".store-purchase-orders-table");
        if (!table) return;
        table.querySelectorAll(".store-sno-header, .store-sno-cell, .store-filter-trigger, .store-resize-handle").forEach(node => node.remove());
        table.querySelectorAll(".store-filter-header").forEach(node => node.classList.remove("store-filter-header"));
        table.dataset.storeEnhanced = "purchase-native";
    }, []);
    const filtered = useMemo(() => orders.filter(order => {
        const text = `${order.order_number} ${order.supplier} ${order.reference || ""} ${itemText(order)}`.toLowerCase();
        return text.includes(search.toLowerCase());
    }).sort((a, b) => {
        const values = {
            supplier: [a.supplier, b.supplier], item: [itemText(a), itemText(b)], order_number: [a.order_number, b.order_number],
            date: [a.po_date || a.created_at || "", b.po_date || b.created_at || ""], quantity: [quantityFor(a), quantityFor(b)], received_quantity: [Number(a.received_quantity || 0), Number(b.received_quantity || 0)],
            amount: [Number(a.grand_total || 0), Number(b.grand_total || 0)], status: [a.status, b.status],
            activity: [a.created_at || "", b.created_at || ""],
        };
        const pair = values[sort.key];
        if (!pair) return 0;
        const [left, right] = pair;
        const result = typeof left === "number" ? left - right : String(left || "").localeCompare(String(right || ""));
        return sort.direction === "asc" ? result : -result;
    }), [orders, search, sort]);
    const totals = useMemo(() => ({ count: orders.length, quantity: orders.reduce((sum, order) => sum + quantityFor(order), 0), value: orders.reduce((sum, order) => sum + Number(order.grand_total || 0), 0), pending: orders.filter(order => !["Approved", "Completed"].includes(order.status)).length }), [orders]);
    const toggleSort = key => setSort(current => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
    const toggleSelected = id => setSelectedIds(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
    const toggleAll = checked => setSelectedIds(checked ? new Set(filtered.map(order => order.id)) : new Set());
    const allSelected = filtered.length > 0 && filtered.every(order => selectedIds.has(order.id));
    const startResize = (event, column) => {
        event.preventDefault();
        const initialX = event.clientX; const initialWidth = widths[column.key];
        const onMove = moveEvent => setWidths(current => ({ ...current, [column.key]: Math.max(column.min, initialWidth + moveEvent.clientX - initialX) }));
        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
        window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
    };
    if (screen === "create" && !createType) return <main className="mx-auto max-w-3xl p-5 sm:p-8"><section className="rounded-2xl border bg-white p-6 shadow-card sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Create PO</p><h1 className="mt-2 text-2xl font-extrabold text-slate-950">Select Purchase Order Type</h1><p className="mt-2 text-sm text-muted-foreground">Choose the flow that fits this vendor before filling the Purchase Order.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><button type="button" onClick={() => setCreateType("Approval Vendor PO")} className="rounded-xl border-2 border-slate-200 p-5 text-left transition hover:border-cyan-600 hover:bg-cyan-50"><h2 className="font-bold text-slate-950">Approval Vendor PO</h2><p className="mt-2 text-sm text-muted-foreground">Complete vendor details, GST, delivery address and standard terms.</p></button><button type="button" onClick={() => setCreateType("One Time Vendor PO")} className="rounded-xl border-2 border-slate-200 p-5 text-left transition hover:border-cyan-600 hover:bg-cyan-50"><h2 className="font-bold text-slate-950">One Time Vendor PO</h2><p className="mt-2 text-sm text-muted-foreground">A clean, quick form with only the essential purchase details.</p></button></div><div className="mt-6"><Button type="button" variant="outline" onClick={() => setScreen("list")}>Cancel</Button></div></section></main>;
    if (screen === "create" || screen === "edit") return <PurchaseOrderForm orders={orders} admin={admin} editingOrder={editingOrder} initialPoType={createType} onBack={() => { setScreen("list"); setEditingOrder(null); setCreateType(null); }} />;
    return <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8"><div className="w-full"><div className="relative text-center"><h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Purchase Orders</h1><p className="mt-2 text-sm text-muted-foreground">Create vendor POs, track ordered quantities and view purchase details.</p><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => navigate("/store-purchase/approvals")}><ClipboardCheck className="mr-2 h-4 w-4" />PO Approvals</Button>{admin && <Button onClick={() => { setCreateType(null); setScreen("create"); }} className="bg-gradient-primary shadow-elegant hover:opacity-90"><Plus className="mr-2 h-4 w-4" />Create PO</Button>}</div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total Purchase Orders" value={formatNumber(totals.count)} icon={FileText} color="bg-primary/10 text-primary" /><StatCard label="No. of PO Quantity" value={formatNumber(totals.quantity)} icon={Package} color="bg-accent/15 text-accent" /><StatCard label="Total Purchase Value" value={`₹${formatNumber(totals.value)}`} icon={Truck} color="bg-success/15 text-success" /><StatCard label="Pending POs" value={formatNumber(totals.pending)} icon={Clock3} color="bg-warning/15 text-warning" /></div>
        <section className="mt-5 rounded-xl border bg-white p-4 shadow-card"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by vendor, PO number, item or reference..." className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" /></div></section>
        {selectedIds.size > 0 && <div className="mt-5 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm"><span className="font-medium">{selectedIds.size} purchase order{selectedIds.size === 1 ? "" : "s"} selected</span><Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear selection</Button></div>}
        <section className="mt-5 overflow-hidden rounded-xl border bg-white shadow-card"><div className="overflow-x-auto"><table className="store-purchase-orders-table w-full table-fixed text-sm" style={{ minWidth: columns.reduce((sum, column) => sum + widths[column.key], 0) }}><colgroup>{columns.map(column => <col key={column.key} style={{ width: widths[column.key] }} />)}</colgroup><thead><tr>{columns.map(column => column.key === "select" ? <th key={column.key} className="border-r border-border bg-slate-50 px-3 py-3 text-center"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all purchase orders" /></th> : column.key === "actions" ? <th key={column.key} className="border-r border-border bg-slate-50 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider">Actions</th> : <SortHeader key={column.key} column={column} sort={sort} onSort={toggleSort} width={widths[column.key]} onResizeStart={startResize} />)}</tr></thead><tbody>{filtered.length ? filtered.map((order, index) => { const items = order.items || []; const quantity = quantityFor(order); const activity = latestActivity(order); const awaiting = pendingApproversFor(order); return <tr key={order.id} className="border-t transition-colors hover:bg-slate-50"><td className="px-3 py-4 text-center"><Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelected(order.id)} aria-label={`Select ${order.order_number}`} /></td><td className="px-3 py-4 text-center text-muted-foreground">{index + 1}</td><td className="px-3 py-4"><p className="truncate font-semibold text-foreground" title={order.supplier}>{order.supplier}</p><p className="mt-1 truncate text-xs text-muted-foreground" title={order.vendor_gst || "GST not added"}>{order.vendor_gst || "GST not added"}</p></td><td className="px-3 py-4"><p className="truncate font-medium" title={itemText(order)}>{items.length ? itemText(order) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</p></td><td className="truncate px-3 py-4 font-semibold text-primary" title={order.order_number}>{order.order_number}</td><td className="px-3 py-4 whitespace-nowrap">{formatDate(order.po_date || order.created_at)}</td><td className="px-3 py-4 text-right font-medium">{formatNumber(quantity)}</td><td className="px-3 py-4 text-right font-medium">{formatNumber(order.received_quantity)}</td><td className="px-3 py-4 text-right font-semibold">₹{formatNumber(order.grand_total)}</td><td className="px-3 py-4 text-center"><span className="inline-block max-w-full truncate rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{order.status}</span>{awaiting.length > 0 && <p className="mt-1 max-w-[140px] truncate text-[10px] font-medium text-amber-700" title={`Awaiting approval from: ${awaiting.join(", ")}`}>Awaiting: {awaiting.join(", ")}</p>}</td><td className="px-3 py-4"><p className="truncate text-xs font-semibold text-foreground" title={activity.performed_by || "Not recorded"}>{activity.performed_by || "Not recorded"}</p><p className="mt-1 truncate text-xs font-medium">{activity.action}</p><p className="mt-1 truncate text-xs text-muted-foreground">{formatDate(activity.created_at)}</p></td><td className="px-3 py-4 text-center"><div className="flex items-center justify-center gap-1"><Button type="button" variant="ghost" size="icon" title="View full PO" onClick={() => setViewOrder(order)}><Eye className="h-4 w-4" /></Button>{admin && order.status !== "Completed" && <Button type="button" variant="ghost" size="icon" title="Edit PO" onClick={() => { setEditingOrder(order); setScreen("edit"); }}><Pencil className="h-4 w-4" /></Button>}<Button type="button" variant="ghost" size="icon" title={["Approved", "Completed"].includes(order.status) ? "Print / Save PDF" : "Print disabled (Approval pending)"} disabled={!["Approved", "Completed"].includes(order.status)} className={!["Approved", "Completed"].includes(order.status) ? "opacity-30 cursor-not-allowed" : ""} onClick={() => printPurchaseOrder(order)}><Printer className="h-4 w-4" /></Button>{admin && order.status !== "Completed" && <Button type="button" variant="ghost" size="icon" title="Mark PO as Completed" className="text-emerald-700 hover:text-emerald-700" disabled={completeOrder.isPending} onClick={() => { if (window.confirm(`Mark Purchase Order ${order.order_number} as Completed? This only closes the PO; Items/Stock will not change.`)) completeOrder.mutate(order.id); }}><CheckCircle2 className="h-4 w-4" /></Button>}{admin && <Button type="button" variant="ghost" size="icon" title="Delete PO" className="text-destructive hover:text-destructive" disabled={deleteOrder.isPending} onClick={() => { if (window.confirm(`Delete Purchase Order ${order.order_number}? This will not change Items or Stock records.`)) deleteOrder.mutate(order.id); }}><Trash2 className="h-4 w-4" /></Button>}</div></td></tr>; }) : <tr><td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-muted-foreground">{search ? "No Purchase Order matched your search." : "No Purchase Orders yet. Use Create PO to create the first vendor purchase order."}</td></tr>}</tbody></table></div><p className="border-t bg-slate-50 px-4 py-2.5 text-xs text-muted-foreground">Click a header to sort. Drag the right edge of a column to change its width.</p></section><Dialog open={!!viewOrder} onOpenChange={open => !open && setViewOrder(null)}>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto bg-slate-100 p-4 sm:p-6">
                <DialogHeader className="mb-2">
                    <DialogTitle className="flex items-center justify-between pr-6">
                        <span>Purchase Order {viewOrder?.order_number}</span>
                        {["Approved", "Completed"].includes(viewOrder?.status) ? (
                            <Button size="sm" variant="outline" onClick={() => printPurchaseOrder(viewOrder)}>
                                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / Save PDF
                            </Button>
                        ) : (
                            <span className="text-xs font-normal text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                Print disabled (Approval pending)
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>
                {viewOrder && (
                    <div className="space-y-6 text-slate-900">
                        <div className="mx-auto rounded-xl border border-slate-300 bg-white p-6 shadow-sm text-xs text-[#0c2348]">
                            <div className="flex items-center gap-4 border-b-2 border-[#12386c] pb-3">
                                <img className="h-14 w-20 object-contain rounded border border-slate-200" src={jbEngineeringLogo} alt="JB Engineering" />
                                <div>
                                    <h1 className="text-xl font-bold text-[#e5222b] leading-tight">RE-Bar Couplers India Private Limited</h1>
                                    <p className="text-[11px] font-semibold text-slate-700 mt-0.5">VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220</p>
                                    <p className="text-[10px] text-slate-600">HO: 10 A&amp;B, Block 23, Industrial Area, Nangal Jarialan, Distt. Una, Himachal Pradesh - 177212</p>
                                    <p className="text-[10px] text-slate-600">Cell: +91 9888603791 · seema@jbengineeringcorporation.com · GST No. 02AAFCR5621L1ZG</p>
                                </div>
                            </div>

                            <div className="flex justify-between items-center border-b border-[#365780] py-2 font-bold text-sm">
                                <span>Vendor Code: {viewOrder.vendor_code || "—"}</span>
                                <span className="text-base tracking-wide">PURCHASE ORDER</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border-b border-[#9aacca] py-3 text-xs leading-relaxed">
                                <div>
                                    <p><b>Vendor Name:</b> {viewOrder.supplier || "—"}</p>
                                    <p className="whitespace-pre-line"><b>Vendor Address:</b> {viewOrder.vendor_address || "Vendor address not provided"}</p>
                                    <p><b>Contact Person / Phone:</b> {viewOrder.vendor_contact || "—"}</p>
                                    <p><b>Vendor GST No.:</b> {viewOrder.vendor_gst || "—"}</p>
                                </div>
                                <div>
                                    <p><b>PO No:</b> {viewOrder.order_number}</p>
                                    <p><b>PO Date:</b> {formatDate(viewOrder.po_date || viewOrder.created_at)}</p>
                                    <p><b>Reference:</b> {viewOrder.reference || "—"}</p>
                                    <p><b>Status:</b> <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">{viewOrder.status}</span></p>
                                    {viewOrder.delivery_address && <p className="mt-1 whitespace-pre-line"><b>Delivery Address:</b> {viewOrder.delivery_address}</p>}
                                </div>
                            </div>

                            <p className="py-2 text-[11px] text-slate-600">Please supply the following goods subject to the terms and conditions mentioned herein.</p>

                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-[#6480a4] text-xs">
                                    <thead className="bg-[#e8eff8] text-center font-bold">
                                        <tr>
                                            <th className="border border-[#6480a4] px-2 py-1.5 w-12 text-center">Sr. No.</th>
                                            <th className="border border-[#6480a4] px-3 py-1.5 text-left">Item Description</th>
                                            <th className="border border-[#6480a4] px-2 py-1.5 w-20 text-center">Quantity</th>
                                            <th className="border border-[#6480a4] px-2 py-1.5 w-16 text-center">U/M</th>
                                            <th className="border border-[#6480a4] px-2 py-1.5 w-24 text-right">Unit Rate (INR)</th>
                                            <th className="border border-[#6480a4] px-2 py-1.5 w-24 text-right">Amount (INR)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(viewOrder.items || []).map((item, index) => (
                                            <tr key={item.id || item.line_number || index} className="border-t border-[#6480a4]">
                                                <td className="border border-[#6480a4] px-2 py-1.5 text-center">{index + 1}</td>
                                                <td className="border border-[#6480a4] px-3 py-1.5 font-medium">{item.item_description}</td>
                                                <td className="border border-[#6480a4] px-2 py-1.5 text-center">{formatNumber(item.quantity)}</td>
                                                <td className="border border-[#6480a4] px-2 py-1.5 text-center">{item.uom}</td>
                                                <td className="border border-[#6480a4] px-2 py-1.5 text-right">₹{formatNumber(item.unit_rate)}</td>
                                                <td className="border border-[#6480a4] px-2 py-1.5 text-right font-semibold">₹{formatNumber(item.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="ml-auto w-1/2 border border-t-0 border-[#6480a4] text-xs">
                                <div className="flex justify-between border-t border-[#b5c3d5] p-1.5 px-2.5">
                                    <span>Total</span><b>₹{formatNumber(viewOrder.subtotal)}</b>
                                </div>
                                <div className="flex justify-between border-t border-[#b5c3d5] p-1.5 px-2.5">
                                    <span>IGST ({viewOrder.gst_rate || 0}%)</span><b>₹{formatNumber(viewOrder.gst_amount)}</b>
                                </div>
                                <div className="flex justify-between border-t border-[#b5c3d5] p-1.5 px-2.5">
                                    <span>Rounded off</span><b>₹{formatNumber(viewOrder.round_off)}</b>
                                </div>
                                <div className="flex justify-between border-t border-[#6480a4] bg-[#d8e9ff] p-2 px-2.5 text-sm font-bold text-[#0c2348]">
                                    <span>Total Amount Including Taxes</span><b>₹{formatNumber(viewOrder.grand_total)}</b>
                                </div>
                            </div>

                            <div className="mt-4 border border-[#6480a4] text-xs">
                                <div className="p-2.5 leading-relaxed">
                                    <h3 className="font-bold text-[11px] mb-1">Terms and Conditions</h3>
                                    <p><b>Price:</b> {viewOrder.price_basis || "—"}</p>
                                    <p><b>Packing &amp; Forwarding:</b> {viewOrder.packing_terms || "—"}</p>
                                    <p><b>Freight &amp; Transportation:</b> {viewOrder.freight_terms || "—"}</p>
                                    <p><b>Insurance:</b> {viewOrder.insurance_terms || "—"}</p>
                                    <p><b>Delivery:</b> {viewOrder.delivery_terms || "—"}</p>
                                    <p><b>Inspection:</b> {viewOrder.inspection_terms || "—"}</p>
                                    <p><b>Guarantee / Warranty:</b> {viewOrder.warranty_terms || "—"}</p>
                                    <p><b>Payment Terms:</b> {viewOrder.payment_terms || "—"}</p>
                                    <p><b>Quantity Variance:</b> {viewOrder.quantity_variance || "—"}</p>
                                    {viewOrder.notes && <p><b>Notes:</b> {viewOrder.notes}</p>}
                                    {viewOrder.remark_1 && <p className="mt-1 font-medium"><b>Remarks:</b> {viewOrder.remark_1}</p>}
                                    {viewOrder.remark_2 && <p className="mt-1 font-bold text-red-600"><b>Remarks:</b> {viewOrder.remark_2}</p>}
                                </div>
                                <div className="border-t border-[#6480a4] p-3 text-[11px]">
                                    <div className="text-right font-bold">For RE-Bar Couplers India Private Limited</div>
                                    <div className="mt-10 flex justify-between font-bold text-slate-700">
                                        <span>Prepared By</span>
                                        <span>Checked By</span>
                                        <span>Approved By</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <ActivityLog order={viewOrder} />
                    </div>
                )}
            </DialogContent>
        </Dialog></div></main>;
}

function Detail({ label, value, full }) { return <div className={full ? "sm:col-span-2 lg:col-span-3" : ""}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-line font-medium">{value || "—"}</p></div>; }

function ActivityLog({ order }) {
    const recorded = order.activities || [];
    // Older POs may have update entries recorded before the audit table was
    // introduced. Always show their original creator alongside later changes.
    const hasCreatedEntry = recorded.some(activity => String(activity.action).toLowerCase() === "created");
    const activities = hasCreatedEntry
        ? recorded
        : [...recorded, { action: "PO Created", details: "Purchase Order created.", performed_by: order.created_by, created_at: order.created_at }];
    return <section className="rounded-xl border bg-slate-50/70 p-4"><div className="mb-4 flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><div><h3 className="font-semibold">Activity Log</h3><p className="text-xs text-muted-foreground">Creator and every user who updates this Purchase Order.</p></div></div><div className="space-y-3">{activities.map((activity, index) => <div key={activity.id || `${activity.action}-${activity.created_at}-${index}`} className="border-l-2 border-primary/30 pl-3"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{activity.action}</p><p className="mt-0.5 font-medium">{activity.performed_by || "Not recorded"}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDate(activity.created_at)}{activity.details ? ` · ${activity.details}` : ""}</p></div>)}</div></section>;
}






