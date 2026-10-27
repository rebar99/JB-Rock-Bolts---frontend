import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownUp, CheckCircle2, ChevronDown, ChevronUp, Clock3, Eye, FileText, GripVertical, Package, Pencil, Plus, Printer, Search, Trash2, Truck, ClipboardCheck, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import PurchaseOrderForm from "@/components/store/PurchaseOrderForm";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { completeStoreOrder, deleteStoreOrder, fetchItemMasterList, fetchMyPendingPOApprovals } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import PurchaseOrderSheet, { printPurchaseOrder, getItemOnlyName, formatNumber, formatDate, escapeHtml } from "@/components/store/PurchaseOrderSheet";
export { getItemOnlyName };
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


function StatCard({ label, value, icon: Icon, color, onClick }) {
    return <div onClick={onClick} className={`rounded-xl border bg-white p-5 shadow-card transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:border-amber-300 active:scale-[0.99]" : ""}`}><div className="flex items-center gap-3"><div className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 text-2xl font-bold text-foreground">{value}</p></div></div></div>;
}

function SortHeader({ column, sort, onSort, width, onResizeStart }) {
    const active = sort.key === column.key;
    const Icon = active ? (sort.direction === "asc" ? ChevronUp : ChevronDown) : ArrowDownUp;
    const quantityHeader = column.key === "quantity" || column.key === "received_quantity";
    return <th style={{ width }} className={`group relative border-r border-border bg-slate-50 px-3 py-3 last:border-r-0 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}><button type="button" onClick={() => onSort(column.key)} className={`inline-flex max-w-full items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${column.key === "sno" || quantityHeader ? "whitespace-nowrap" : ""} ${active ? "text-primary" : "text-foreground"}`}><span className={column.key === "sno" || quantityHeader ? "whitespace-nowrap" : "truncate"}>{column.label}</span><Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} /></button><button type="button" aria-label={`Resize ${column.label} column`} onMouseDown={event => onResizeStart(event, column)} className="absolute -right-2 top-0 z-10 grid h-full w-4 cursor-col-resize place-items-center opacity-0 transition-opacity group-hover:opacity-100"><GripVertical className="h-4 w-4 text-primary" /></button></th>;
}

export default function StorePurchaseOrders({ orders = [], admin = false }) {
    const queryClient = useQueryClient();
    const { data: itemMasterList = [] } = useQuery({
        queryKey: ["item-master", "STORE"],
        queryFn: () => fetchItemMasterList("STORE"),
    });

    useEffect(() => {
        if (itemMasterList && itemMasterList.length) {
            window.__STORE_ITEM_MASTERS__ = itemMasterList;
        }
    }, [itemMasterList]);
    const navigate = useNavigate();
    const [screen, setScreen] = useState("list");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState({ key: "date", direction: "desc" });
    const [widths, setWidths] = useState(defaultWidths);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [viewOrder, setViewOrder] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);
    const [createType, setCreateType] = useState(null);
    const { data: myPendingApprovals = [] } = useQuery({
        queryKey: ["my-pending-po-approvals"],
        queryFn: fetchMyPendingPOApprovals,
        refetchInterval: 30_000,
    });
    const [approvalPopupOpen, setApprovalPopupOpen] = useState(false);
    const [dismissedThisSession, setDismissedThisSession] = useState(false);

    useEffect(() => {
        if (myPendingApprovals.length > 0 && !dismissedThisSession) {
            setApprovalPopupOpen(true);
        }
    }, [myPendingApprovals.length, dismissedThisSession]);
    const deleteOrder = useMutation({ mutationFn: deleteStoreOrder, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["store-orders"] }); queryClient.invalidateQueries({ queryKey: ["store-inventory"] }); queryClient.invalidateQueries({ queryKey: ["store-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["recently-deleted"] }); toast.success("Purchase Order moved to Recently Deleted."); }, onError: error => toast.error(error.message) });
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total Purchase Orders" value={formatNumber(totals.count)} icon={FileText} color="bg-primary/10 text-primary" /><StatCard label="No. of PO Quantity" value={formatNumber(totals.quantity)} icon={Package} color="bg-accent/15 text-accent" /><StatCard label="Total Purchase Value" value={`₹${formatNumber(totals.value)}`} icon={Truck} color="bg-success/15 text-success" /><StatCard label="Pending POs" value={formatNumber(totals.pending)} icon={Clock3} color="bg-warning/15 text-warning" onClick={() => { if (myPendingApprovals.length > 0) setApprovalPopupOpen(true); else navigate("/store-purchase/approvals"); }} /></div>
        {myPendingApprovals.length > 0 && (
            <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200 text-amber-900 shadow-sm">
                        <BellRing className="h-5 w-5 animate-bounce" />
                    </div>
                    <div>
                        <p className="font-bold text-amber-950 text-sm">
                            {myPendingApprovals.length} Purchase Order{myPendingApprovals.length > 1 ? "s" : ""} Waiting For Your Approval
                        </p>
                        <p className="text-xs text-amber-800">
                            Action required: Review and take action on the pending PO(s) assigned to you.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm"
                        onClick={() => setApprovalPopupOpen(true)}
                    >
                        View Alert
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-400 bg-white hover:bg-amber-100 text-amber-950 font-semibold"
                        onClick={() => navigate("/store-purchase/approvals")}
                    >
                        <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                        PO Approvals ({myPendingApprovals.length})
                    </Button>
                </div>
            </div>
        )}
        <section className="mt-5 rounded-xl border bg-white p-4 shadow-card"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by vendor, PO number, item or reference..." className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" /></div></section>
        {selectedIds.size > 0 && <div className="mt-5 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm"><span className="font-medium">{selectedIds.size} purchase order{selectedIds.size === 1 ? "" : "s"} selected</span><Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear selection</Button></div>}
        <section className="mt-5 overflow-hidden rounded-xl border bg-white shadow-card"><div className="overflow-x-auto"><table className="store-purchase-orders-table w-full table-fixed text-sm" style={{ minWidth: columns.reduce((sum, column) => sum + widths[column.key], 0) }}><colgroup>{columns.map(column => <col key={column.key} style={{ width: widths[column.key] }} />)}</colgroup><thead><tr>{columns.map(column => column.key === "select" ? <th key={column.key} className="border-r border-border bg-slate-50 px-3 py-3 text-center"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all purchase orders" /></th> : column.key === "actions" ? <th key={column.key} className="border-r border-border bg-slate-50 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider">Actions</th> : <SortHeader key={column.key} column={column} sort={sort} onSort={toggleSort} width={widths[column.key]} onResizeStart={startResize} />)}</tr></thead><tbody>{filtered.length ? filtered.map((order, index) => { const items = order.items || []; const quantity = quantityFor(order); const activity = latestActivity(order); const awaiting = pendingApproversFor(order); return <tr key={order.id} className="border-t transition-colors hover:bg-slate-50"><td className="px-3 py-4 text-center"><Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelected(order.id)} aria-label={`Select ${order.order_number}`} /></td><td className="px-3 py-4 text-center text-muted-foreground">{index + 1}</td><td className="px-3 py-4"><p className="truncate font-semibold text-foreground" title={order.supplier}>{order.supplier}</p><p className="mt-1 truncate text-xs text-muted-foreground" title={order.vendor_gst || "GST not added"}>{order.vendor_gst || "GST not added"}</p></td><td className="px-3 py-4"><p className="truncate font-medium" title={itemText(order)}>{items.length ? itemText(order) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</p></td><td className="truncate px-3 py-4 font-semibold text-primary" title={order.order_number}>{order.order_number}</td><td className="px-3 py-4 whitespace-nowrap">{formatDate(order.po_date || order.created_at)}</td><td className="px-3 py-4 text-right font-medium">{formatNumber(quantity)}</td><td className="px-3 py-4 text-right font-medium">{formatNumber(order.received_quantity)}</td><td className="px-3 py-4 text-right font-semibold">₹{formatNumber(order.grand_total)}</td><td className="px-3 py-4 text-center"><span className="inline-block max-w-full truncate rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{order.status}</span>{awaiting.length > 0 && <p className="mt-1 w-full break-words text-[10px] font-medium text-amber-700" title={`Awaiting approval from: ${awaiting.join(", ")}`}>Awaiting: {awaiting.join(", ")}</p>}</td><td className="px-3 py-4"><p className="truncate text-xs font-semibold text-foreground" title={activity.performed_by || "Not recorded"}>{activity.performed_by || "Not recorded"}</p><p className="mt-1 truncate text-xs font-medium">{activity.action}</p><p className="mt-1 truncate text-xs text-muted-foreground">{formatDate(activity.created_at)}</p></td><td className="px-3 py-4 text-center"><div className="flex items-center justify-center gap-1"><Button type="button" variant="ghost" size="icon" title="View full PO" onClick={() => setViewOrder(order)}><Eye className="h-4 w-4" /></Button>{admin && order.status !== "Completed" && <Button type="button" variant="ghost" size="icon" title="Edit PO" onClick={() => { setEditingOrder(order); setScreen("edit"); }}><Pencil className="h-4 w-4" /></Button>}<Button type="button" variant="ghost" size="icon" title={["Approved", "Completed"].includes(order.status) ? "Print / Save PDF" : "Print disabled (Approval pending)"} disabled={!["Approved", "Completed"].includes(order.status)} className={!["Approved", "Completed"].includes(order.status) ? "opacity-30 cursor-not-allowed" : ""} onClick={() => printPurchaseOrder(order, itemMasterList)}><Printer className="h-4 w-4" /></Button>{admin && order.status !== "Completed" && <Button type="button" variant="ghost" size="icon" title="Mark PO as Completed" className="text-emerald-700 hover:text-emerald-700" disabled={completeOrder.isPending} onClick={() => { if (window.confirm(`Mark Purchase Order ${order.order_number} as Completed? This only closes the PO; Items/Stock will not change.`)) completeOrder.mutate(order.id); }}><CheckCircle2 className="h-4 w-4" /></Button>}{admin && <Button type="button" variant="ghost" size="icon" title="Delete PO" className="text-destructive hover:text-destructive" disabled={deleteOrder.isPending} onClick={() => { if (window.confirm(`Move Purchase Order ${order.order_number} to Recently Deleted? It will be kept for 24 hours.`)) deleteOrder.mutate(order.id); }}><Trash2 className="h-4 w-4" /></Button>}</div></td></tr>; }) : <tr><td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-muted-foreground">{search ? "No Purchase Order matched your search." : "No Purchase Orders yet. Use Create PO to create the first vendor purchase order."}</td></tr>}</tbody></table></div><p className="border-t bg-slate-50 px-4 py-2.5 text-xs text-muted-foreground">Click a header to sort. Drag the right edge of a column to change its width.</p></section><Dialog open={!!viewOrder} onOpenChange={open => !open && setViewOrder(null)}>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto bg-slate-100 p-4 sm:p-6">
                <DialogHeader className="mb-2">
                    <DialogTitle className="flex items-center justify-between pr-6">
                        <span>Purchase Order {viewOrder?.order_number}</span>
                        {["Approved", "Completed"].includes(viewOrder?.status) ? (
                            <Button size="sm" variant="outline" onClick={() => printPurchaseOrder(viewOrder, itemMasterList)}>
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
                        <PurchaseOrderSheet order={viewOrder} itemMasterList={itemMasterList} />

                        <ActivityLog order={viewOrder} />
                    </div>
                )}
            </DialogContent>
        </Dialog>
        <Dialog open={approvalPopupOpen} onOpenChange={setApprovalPopupOpen}>
            <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto border-amber-300 bg-white p-6 shadow-2xl">
                <DialogHeader className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm">
                            <BellRing className="h-6 w-6" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold text-slate-900">
                                Pending PO Approval Required
                            </DialogTitle>
                            <DialogDescription className="text-sm text-slate-600">
                                You have <span className="font-bold text-amber-700">{myPendingApprovals.length}</span> Purchase Order{myPendingApprovals.length > 1 ? "s" : ""} waiting for your approval.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                    {myPendingApprovals.map(order => (
                        <div key={order.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 transition-all hover:border-amber-300">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-extrabold text-primary text-base">
                                            {order.order_number}
                                        </span>
                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                                            {order.status}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 truncate">
                                        Vendor: {order.supplier}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Requested by: <span className="font-medium text-slate-700">{order.created_by || "—"}</span> · Date: {formatDate(order.po_date || order.created_at)}
                                    </p>
                                    {order.items && order.items.length > 0 && (
                                        <p className="text-xs text-slate-600 mt-1 truncate">
                                            Item: {order.items.map(i => i.item_description).join(", ")}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[11px] text-muted-foreground uppercase font-semibold">Grand Total</p>
                                    <p className="text-base font-extrabold text-slate-900 mt-0.5">
                                        ₹{Number(order.grand_total || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                    </p>
                                    <Button
                                        size="sm"
                                        className="mt-2 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                                        onClick={() => {
                                            setApprovalPopupOpen(false);
                                            navigate("/store-purchase/approvals", { state: { poId: order.id, order } });
                                        }}
                                    >
                                        Review &amp; Approve
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-3 border-t pt-4">
                    <Button
                        variant="outline"
                        className="w-full sm:w-auto text-slate-600"
                        onClick={() => {
                            setApprovalPopupOpen(false);
                            setDismissedThisSession(true);
                        }}
                    >
                        Remind Me Later
                    </Button>
                    <Button
                        className="w-full sm:w-auto bg-gradient-primary text-white font-bold shadow-md hover:opacity-95"
                        onClick={() => {
                            setApprovalPopupOpen(false);
                            navigate("/store-purchase/approvals");
                        }}
                    >
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        Go to PO Approvals ({myPendingApprovals.length})
                    </Button>
                </div>
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






