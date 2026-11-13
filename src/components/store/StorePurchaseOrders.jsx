import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowDownUp, CheckCircle2, ChevronDown, ChevronUp, Clock3, Eye, FileText, GripVertical, Package, Pencil, Plus, Printer, Search, Trash2, Truck, ClipboardCheck, BellRing, AlertCircle, XCircle, PackageCheck, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PurchaseOrderForm from "@/components/store/PurchaseOrderForm";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { completeStoreOrder, deleteStoreOrder, fetchItemMasterList, fetchMyPendingPOApprovals, fetchMyPONotifications, markPONotificationsRead, openLogStream, resolveFileUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import PurchaseOrderSheet, { printPurchaseOrder, getItemOnlyName, formatNumber, formatDate, escapeHtml } from "@/components/store/PurchaseOrderSheet";
export { getItemOnlyName };
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
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
    { key: "status", label: "Status", width: 200, min: 160, align: "center" },
    { key: "activity", label: "Activity", width: 150, min: 120 },
    { key: "actions", label: "Actions", width: 170, min: 140, align: "center" },
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
    if ((order.status || "").startsWith("Rejected")) return [];
    const stages = {};
    (order.approval_history || []).filter(row => Number(row.approval_cycle || 1) === Number(order.approval_cycle || 1)).forEach(row => { (stages[row.level_order] ||= []).push(row); });
    for (const rows of Object.values(stages).sort((left, right) => Number(left[0].level_order) - Number(right[0].level_order))) {
        const done = rows[0].rule === "any" ? rows.some(row => row.action === "Approved") : rows.every(row => row.action === "Approved");
        if (!done) return rows.filter(row => row.action === "Pending").map(row => row.approver_name).filter(Boolean);
    }
    return [];
};
const approvalFlowFor = order => {
    const cycle = order.approval_cycle || 1;
    const hist = (order.approval_history || []).filter(r => Number(r.approval_cycle || 1) === Number(cycle));
    const s1 = hist.find(r => r.level_order === 1 || r.workflow_role === "checked_by");
    const s2 = hist.find(r => r.level_order === 2 || r.workflow_role === "approved_by");
    const firstName = s1 ? (s1.approver_name || "Approved By") : null;
    const secondName = s2 ? (s2.approver_name || "Final Approved By") : (s1 && s1.next_approver_name ? s1.next_approver_name : null);
    const s1Raw = s1 ? (s1.action || "Pending") : "Pending";
    const s1Status = s1Raw === "Approved" ? "Approved" : s1Raw === "Rejected" ? "Rejected" : "Pending";
    let s2Status = "Waiting";
    if (s2) { s2Status = s2.action === "Approved" ? "Approved" : s2.action === "Rejected" ? "Rejected" : "Pending"; }
    else if (s1Status === "Rejected") { s2Status = "Cancelled"; }
    else if (["Finally Approved", "Approved", "Final Approved", "Completed"].includes(order.status)) { s2Status = "Approved"; }
    return { firstName: firstName || "Approved By", secondName: secondName || "Final Approved By", s1Status, s2Status };
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

export default function StorePurchaseOrders({ orders = [], ordersError = null, admin = false }) {
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
    const location = useLocation();
    const { user: currentUser } = useAuth();
    const [screen, setScreen] = useState("list");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState({ key: "date", direction: "desc" });
    const [widths, setWidths] = useState(defaultWidths);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [viewOrder, setViewOrder] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);
    const [createType, setCreateType] = useState(null);
    const [reorderItem, setReorderItem] = useState(null);

    // Auto-open PO form pre-filled when navigated here via Re-Order button from Inventory
    useEffect(() => {
        if (location.state?.reorderItem) {
            setReorderItem(location.state.reorderItem);
            setCreateType("Regular Vendor PO");
            setScreen("create");
            // Clear the navigation state so a page refresh doesn't re-trigger
            window.history.replaceState({}, document.title);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const { data: myPendingApprovals = [] } = useQuery({
        queryKey: ["my-pending-po-approvals"],
        queryFn: fetchMyPendingPOApprovals,
        refetchInterval: 30_000,
    });
    const { data: myPoNotifications = [] } = useQuery({
        queryKey: ["my-po-notifications"],
        queryFn: fetchMyPONotifications,
        refetchInterval: 15_000,
    });
    const [approvalPopupOpen, setApprovalPopupOpen] = useState(false);
    const [dismissedThisSession, setDismissedThisSession] = useState(false);
    const [realtimePopup, setRealtimePopup] = useState(null);

    const [dismissedNotifKeys, setDismissedNotifKeys] = useState(() => new Set());

    const handleDismissPopup = async (popupToDismiss = realtimePopup) => {
        if (!popupToDismiss) return;
        // 1. Immediately record key in state so it can NEVER re-trigger on close!
        const key = popupToDismiss.notifId ? `id_${popupToDismiss.notifId}` : `order_${popupToDismiss.order_id}_${popupToDismiss.title}`;
        setDismissedNotifKeys(prev => {
            const next = new Set(prev);
            next.add(key);
            if (popupToDismiss.order_id) next.add(`order_${popupToDismiss.order_id}`);
            if (popupToDismiss.notifId) next.add(`id_${popupToDismiss.notifId}`);
            return next;
        });
        setRealtimePopup(null);

        // 2. Mark read in database
        try {
            const ids = popupToDismiss.notifId ? [popupToDismiss.notifId] : [];
            await markPONotificationsRead(ids);
        } catch (_) {}
        queryClient.invalidateQueries({ queryKey: ["my-po-notifications"] });
    };

    // When persistent unread notifications exist in DB, show popup immediately on login
    // ONLY if not already dismissed in this session!
    useEffect(() => {
        if (!myPoNotifications.length || realtimePopup) return;
        const nextNotif = myPoNotifications.find(n => {
            if (dismissedNotifKeys.has(`id_${n.id}`) || dismissedNotifKeys.has(`order_${n.order_id}`)) {
                return false;
            }
            // Do NOT show rejection popup to Final Approved By (they are the one who rejected it!)
            if (n.title?.includes("Rejected") && n.message?.includes("by Final Approved By")) {
                const isFinalApprover = (currentUser?.name || "").toLowerCase() === "savita" || Number(currentUser?.id) === 16;
                if (isFinalApprover) return false;
            }
            return true;
        });
        if (nextNotif) {
            setRealtimePopup({
                notifId: nextNotif.id,
                title: nextNotif.title,
                message: nextNotif.message,
                order_id: nextNotif.order_id,
            });
        }
    }, [myPoNotifications, realtimePopup, dismissedNotifKeys]);

    useEffect(() => {
        if (!currentUser) return;
        const es = openLogStream((data) => {
            if (data?.type === "PO_NOTIFICATION") {
                const isRejByFinal = data.title?.includes("Rejected") && data.message?.includes("by Final Approved By");
                const isFinalApprover = (currentUser?.name || "").toLowerCase() === "savita" || Number(currentUser?.id) === 16;
                const sseKey = `order_${data.order_id}`;
                if (!dismissedNotifKeys.has(sseKey) && !(isRejByFinal && isFinalApprover)) {
                    setRealtimePopup(data);
                }
                queryClient.invalidateQueries({ queryKey: ["store-orders"] });
                queryClient.invalidateQueries({ queryKey: ["my-pending-po-approvals"] });
                queryClient.invalidateQueries({ queryKey: ["my-po-notifications"] });
                queryClient.invalidateQueries({ queryKey: ["store-dashboard"] });
                if (!(isRejByFinal && isFinalApprover)) {
                    toast.info(`${data.title}: ${data.message}`);
                }
            }
        }, undefined, currentUser, "Store");
        return () => es.close();
    }, [currentUser, queryClient]);

    useEffect(() => {
        if (myPendingApprovals.length > 0 && !dismissedThisSession) {
            setApprovalPopupOpen(true);
        }
    }, [myPendingApprovals.length, dismissedThisSession]);

    const rejectedMyOrders = useMemo(() => {
        return orders.filter(order => {
            const isRejected = (order.status || "").startsWith("Rejected");
            if (!isRejected) return false;
            const isPreparedBy = Number(order.created_by_user_id) === Number(currentUser?.id) ||
                (order.created_by_user_id == null && Boolean(currentUser?.name && order.created_by) &&
                 (order.created_by || "").toLowerCase() === (currentUser?.name || "").toLowerCase());
            return isPreparedBy;
        });
    }, [orders, currentUser]);
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
    const totals = useMemo(() => ({ count: orders.length, quantity: orders.reduce((sum, order) => sum + quantityFor(order), 0), value: orders.reduce((sum, order) => sum + Number(order.grand_total || 0), 0), pending: orders.filter(order => !["Approved", "Final Approved", "Finally Approved", "Completed"].includes(order.status) && !(order.status || "").startsWith("Rejected")).length }), [orders]);
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
    if (screen === "create" && !createType) return <main className="mx-auto max-w-3xl p-5 sm:p-8"><section className="rounded-2xl border bg-white p-6 shadow-card sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Create PO</p><h1 className="mt-2 text-2xl font-extrabold text-slate-950">Select Purchase Order Type</h1><p className="mt-2 text-sm text-muted-foreground">Choose the flow that fits this vendor before filling the Purchase Order.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><button type="button" onClick={() => setCreateType("Regular Vendor PO")} className="rounded-xl border-2 border-slate-200 p-5 text-left transition hover:border-cyan-600 hover:bg-cyan-50"><h2 className="font-bold text-slate-950">Regular Vendor PO</h2><p className="mt-2 text-sm text-muted-foreground">Complete vendor details, GST, delivery address and standard terms.</p></button><button type="button" onClick={() => setCreateType("One Time Vendor PO")} className="rounded-xl border-2 border-slate-200 p-5 text-left transition hover:border-cyan-600 hover:bg-cyan-50"><h2 className="font-bold text-slate-950">One Time Vendor PO</h2><p className="mt-2 text-sm text-muted-foreground">A clean, quick form with only the essential purchase details.</p></button></div><div className="mt-6"><Button type="button" variant="outline" onClick={() => setScreen("list")}>Cancel</Button></div></section></main>;
    if (screen === "create" || screen === "edit") return <PurchaseOrderForm orders={orders} admin={admin || (editingOrder && ["Rejected by Approved By", "Rejected by Final Approved By", "Rejected"].includes(editingOrder.status) && (Number(editingOrder.created_by_user_id) === Number(currentUser?.id) || (editingOrder.created_by_user_id == null && Boolean(currentUser?.name && editingOrder.created_by) && (editingOrder.created_by || "").toLowerCase() === (currentUser?.name || "").toLowerCase())))} editingOrder={editingOrder} initialPoType={createType} initialItem={reorderItem} backLabel={reorderItem ? "Back to Inventory" : "PO List"} onBack={() => { setScreen("list"); setEditingOrder(null); setCreateType(null); if (reorderItem) { setReorderItem(null); navigate("/store-purchase/items"); } else { setReorderItem(null); } }} />;
    return <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8"><div className="w-full"><div className="relative text-center"><h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Purchase Orders</h1><p className="mt-2 text-sm text-muted-foreground">Create vendor POs, track ordered quantities and view purchase details.</p><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => navigate("/store-purchase/approvals")}><ClipboardCheck className="mr-2 h-4 w-4" />PO Approvals</Button>{admin && <Button onClick={() => { setCreateType(null); setScreen("create"); }} className="bg-gradient-primary shadow-elegant hover:opacity-90"><Plus className="mr-2 h-4 w-4" />Create PO</Button>}</div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3"><StatCard label="Total Purchase Orders" value={formatNumber(totals.count)} icon={FileText} color="bg-primary/10 text-primary" /><StatCard label="Total Purchase Value" value={`₹${formatNumber(totals.value)}`} icon={Truck} color="bg-success/15 text-success" /><StatCard label="Approval Pending PO" value={formatNumber(totals.pending)} icon={Clock3} color="bg-warning/15 text-warning" onClick={() => { if (myPendingApprovals.length > 0) setApprovalPopupOpen(true); else navigate("/store-purchase/approvals"); }} /></div>
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
        {rejectedMyOrders.length > 0 && (
            <div className="mt-4 space-y-3">
                {rejectedMyOrders.map(ro => {
                    const lastRejection = (ro.approval_history || []).slice().reverse().find(a => a.action === "Rejected");
                    const reason = lastRejection?.rejection_reason || "No rejection reason provided.";
                    return (
                        <div key={ro.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50/95 p-4 shadow-sm">
                            <div className="flex items-start sm:items-center gap-3">
                                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rose-200 text-rose-900 shadow-sm">
                                    <AlertCircle className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-rose-950 text-sm">
                                        PO {ro.order_number} was {ro.status}
                                    </p>
                                    <p className="text-xs text-rose-800 mt-0.5">
                                        <b>Rejection Reason:</b> {reason}
                                    </p>
                                    <p className="text-[11px] text-rose-700 mt-0.5">
                                        As Prepared By, you can edit and resubmit this PO, or delete it.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                <Button
                                    size="sm"
                                    className="bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-sm"
                                    onClick={() => { setEditingOrder(ro); setScreen("edit"); }}
                                >
                                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit &amp; Resubmit
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-rose-300 bg-white hover:bg-rose-100 text-rose-900 font-semibold"
                                    onClick={() => {
                                        if (window.confirm(`Delete rejected Purchase Order ${ro.order_number}?`)) {
                                            deleteOrder.mutate(ro.id);
                                        }
                                    }}
                                >
                                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
        <section className="mt-5 rounded-xl border bg-white p-4 shadow-card"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by vendor, PO number, item or reference..." className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" /></div></section>
        {selectedIds.size > 0 && <div className="mt-5 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm"><span className="font-medium">{selectedIds.size} purchase order{selectedIds.size === 1 ? "" : "s"} selected</span><Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear selection</Button></div>}
        <section className="mt-5 overflow-hidden rounded-xl border bg-white shadow-card"><div className="overflow-x-auto"><table className="store-purchase-orders-table w-full table-fixed text-sm" style={{ minWidth: columns.reduce((sum, column) => sum + widths[column.key], 0) }}><colgroup>{columns.map(column => <col key={column.key} style={{ width: widths[column.key] }} />)}</colgroup><thead><tr>{columns.map(column => column.key === "select" ? <th key={column.key} className="border-r border-border bg-slate-50 px-3 py-3 text-center"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all purchase orders" /></th> : column.key === "actions" ? <th key={column.key} className="border-r border-border bg-slate-50 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider">Actions</th> : <SortHeader key={column.key} column={column} sort={sort} onSort={toggleSort} width={widths[column.key]} onResizeStart={startResize} />)}</tr></thead><tbody>{filtered.length ? filtered.map((order, index) => { const items = order.items || []; const quantity = quantityFor(order); const activity = latestActivity(order); const awaiting = pendingApproversFor(order); const flow = approvalFlowFor(order); const rejected = ["Rejected by Approved By", "Rejected by Final Approved By", "Rejected"].includes(order.status); const isPreparedBy = Number(order.created_by_user_id) === Number(currentUser?.id) || (order.created_by_user_id == null && Boolean(currentUser?.name && order.created_by) && (order.created_by || "").toLowerCase() === (currentUser?.name || "").toLowerCase()) || admin; const isBothApproved = ["Finally Approved", "Approved", "Final Approved", "Completed"].includes(order.status); const canEditOrder = !isBothApproved && ((rejected && isPreparedBy) || (isPreparedBy && order.status === "Pending Approval") || admin); return <tr key={order.id} className="border-t transition-colors hover:bg-slate-50"><td className="px-3 py-4 text-center"><Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelected(order.id)} aria-label={`Select ${order.order_number}`} /></td><td className="px-3 py-4 text-center text-muted-foreground">{index + 1}</td><td className="px-3 py-4 cursor-pointer hover:bg-slate-100/70 transition-colors" title={`Click to view PO ${order.order_number}`} onClick={() => setViewOrder(order)}><p className="truncate font-semibold text-primary hover:underline" title={order.supplier}>{order.supplier}</p><p className="mt-1 truncate text-xs text-muted-foreground" title={order.vendor_gst || "GST not added"}>{order.vendor_gst || "GST not added"}</p></td><td className="px-3 py-4 cursor-pointer hover:bg-slate-100/70 transition-colors" title={`Click to view PO ${order.order_number}`} onClick={() => setViewOrder(order)}><p className="truncate font-medium hover:text-primary hover:underline" title={itemText(order)}>{items.length ? itemText(order) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</p></td><td className="truncate px-3 py-4 font-semibold text-primary cursor-pointer hover:underline hover:bg-slate-100/70 transition-colors" title={`Click to view PO ${order.order_number}`} onClick={() => setViewOrder(order)}>{order.order_number}</td><td className="px-3 py-4 whitespace-nowrap">{formatDate(order.po_date || order.created_at)}</td><td className="px-3 py-4 text-right font-medium">{formatNumber(quantity)}</td><td className="px-3 py-4 text-right font-medium">{formatNumber(order.received_quantity)}</td><td className="px-3 py-4 text-right font-semibold">₹{formatNumber(order.grand_total)}</td><td className="px-3 py-4 text-center"><span className={`inline-block max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-bold ${ ["Finally Approved","Approved","Final Approved","Completed"].includes(order.status) ? "bg-green-50 text-green-700" : (order.status||"").startsWith("Rejected") ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700" }`}>{order.status}</span><div className="mt-1.5 space-y-0.5 text-[10px]"><div className="flex flex-wrap items-center justify-center gap-0.5"><span className="font-semibold text-slate-500">1st:</span><span className="truncate text-slate-700 max-w-[70px]" title={flow.firstName}>{flow.firstName}</span><span className={`rounded px-1 font-bold ${flow.s1Status === "Approved" ? "bg-green-50 text-green-600" : flow.s1Status === "Rejected" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>{flow.s1Status}</span></div><div className="flex flex-wrap items-center justify-center gap-0.5"><span className="font-semibold text-slate-500">2nd:</span><span className="truncate text-slate-700 max-w-[70px]" title={flow.secondName}>{flow.secondName}</span><span className={`rounded px-1 font-bold ${flow.s2Status === "Approved" ? "bg-green-50 text-green-600" : flow.s2Status === "Rejected" ? "bg-red-50 text-red-600" : flow.s2Status === "Cancelled" ? "bg-slate-100 text-slate-400" : flow.s2Status === "Waiting" ? "bg-slate-50 text-slate-400" : "bg-amber-50 text-amber-600"}`}>{flow.s2Status}</span></div>{(quantity > 0 && Number(order.received_quantity || 0) >= quantity) && <div className="mt-1.5 flex items-center justify-center"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Fully Received</span></div>}</div></td><td className="px-3 py-4"><p className="truncate text-xs font-semibold text-foreground" title={activity.performed_by || "Not recorded"}>{activity.performed_by || "Not recorded"}</p><p className="mt-1 truncate text-xs font-medium">{activity.action}</p><p className="mt-1 truncate text-xs text-muted-foreground">{formatDate(activity.created_at)}</p></td><td className="px-3 py-4 text-center"><div className="flex items-center justify-center gap-1.5"><Button type="button" variant="ghost" size="icon" title="View full PO" onClick={() => setViewOrder(order)}><Eye className="h-4 w-4 text-slate-700 hover:text-primary" /></Button><Button type="button" variant="ghost" size="icon" title={isBothApproved ? "Editing disabled (Finally Approved)" : canEditOrder ? (rejected ? "Edit and resubmit rejected PO" : "Edit PO") : "Editing not permitted"} disabled={!canEditOrder} className={canEditOrder ? "text-blue-600 hover:text-blue-800" : "opacity-30 cursor-not-allowed text-slate-400"} onClick={() => { if (canEditOrder) { setEditingOrder(order); setScreen("edit"); } }}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" title={isBothApproved ? "Print / Save PDF" : "Print disabled (Approval pending)"} disabled={!isBothApproved} className={isBothApproved ? "text-slate-700 hover:text-primary" : "opacity-30 cursor-not-allowed text-slate-400"} onClick={() => { if (isBothApproved) printPurchaseOrder(order, itemMasterList); }}><Printer className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" title="Delete PO" className="text-destructive hover:text-destructive" disabled={deleteOrder.isPending} onClick={() => { if (window.confirm(`Move Purchase Order ${order.order_number} to Recently Deleted? It will be kept for 24 hours.`)) deleteOrder.mutate(order.id); }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>; }) : <tr><td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-muted-foreground">{search ? "No Purchase Order matched your search." : "No Purchase Orders yet. Use Create PO to create the first vendor purchase order."}</td></tr>}</tbody></table></div><p className="border-t bg-slate-50 px-4 py-2.5 text-xs text-muted-foreground">Click a header to sort. Drag the right edge of a column to change its width.</p></section><Dialog open={!!viewOrder} onOpenChange={open => !open && setViewOrder(null)}>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto bg-slate-100 p-4 sm:p-6">
                <DialogHeader className="mb-2">
                    <DialogTitle className="flex items-center justify-between pr-6">
                        <span>Purchase Order {viewOrder?.order_number}</span>
                        {["Approved", "Final Approved", "Finally Approved", "Completed"].includes(viewOrder?.status) ? (
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
                        {(() => {
                            const isRejected = (viewOrder.status || "").startsWith("Rejected");
                            if (!isRejected) return null;
                            const lastRej = (viewOrder.approval_history || []).slice().reverse().find(a => a.action === "Rejected");
                            const reason = lastRej?.rejection_reason || "No rejection reason provided.";
                            const rejectedBy = lastRej?.approver_name;
                            const role = (viewOrder.status || "").includes("Final") ? "Final Approved By" : "Approved By";
                            return (
                                <div className="rounded-xl border-2 border-rose-300 bg-rose-50/95 p-4 shadow-sm">
                                    <div className="flex items-start gap-3">
                                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700">
                                            <AlertCircle className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                                                    {viewOrder.status}
                                                </span>
                                                {lastRej?.action_at && (
                                                    <span className="text-xs text-rose-700 font-medium">
                                                        Actioned: {formatDate(lastRej.action_at)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-2 text-sm font-bold text-rose-950">
                                                Rejected by: <span className="text-rose-700">{role}</span>{rejectedBy ? ` (${rejectedBy})` : ""}
                                            </p>
                                            <div className="mt-2 rounded-lg border border-rose-200 bg-white p-3 shadow-inner">
                                                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Rejection Reason:</p>
                                                <p className="mt-1 text-sm font-semibold text-slate-900 leading-relaxed whitespace-pre-line">
                                                    {reason}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                        <PurchaseOrderSheet order={viewOrder} itemMasterList={itemMasterList} />

                        <ReceivedMaterialsSection order={viewOrder} />

                        <ActivityLog order={viewOrder} />
                        {viewOrder.status?.startsWith("Rejected by") && (Number(viewOrder.created_by_user_id) === Number(currentUser?.id) || (viewOrder.created_by_user_id == null && (viewOrder.created_by || "").toLowerCase() === (currentUser?.name || "").toLowerCase())) && <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditingOrder(viewOrder); setViewOrder(null); setScreen("edit"); }}><Pencil className="mr-2 h-4 w-4" />Edit and Resubmit</Button><Button variant="destructive" disabled={deleteOrder.isPending} onClick={() => { if (window.confirm(`Delete rejected Purchase Order ${viewOrder.order_number}?`)) { deleteOrder.mutate(viewOrder.id); setViewOrder(null); } }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div>}
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
        </Dialog>
        <Dialog open={!!realtimePopup} onOpenChange={(open) => !open && handleDismissPopup()}>
            <DialogContent className="sm:max-w-lg border-2 bg-white p-6 shadow-2xl">
                <DialogHeader className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                            realtimePopup?.title?.includes("Rejected") ? "bg-rose-100 text-rose-700" :
                            realtimePopup?.title?.includes("Approved") ? "bg-emerald-100 text-emerald-700" :
                            realtimePopup?.title?.includes("Stock Alert") ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"
                        }`}>
                            {realtimePopup?.title?.includes("Rejected") ? <AlertCircle className="h-6 w-6" /> :
                             realtimePopup?.title?.includes("Approved") ? <CheckCircle2 className="h-6 w-6" /> :
                             realtimePopup?.title?.includes("Stock Alert") ? <AlertTriangle className="h-6 w-6" /> : <BellRing className="h-6 w-6" />}
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-slate-900">
                                {realtimePopup?.title}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                {realtimePopup?.title?.includes("Stock Alert")
                                    ? "Inventory Low Stock / Out of Stock Alert"
                                    : "Purchase Order Workflow Notification"}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <div className={`my-2 rounded-xl border p-4 ${
                    realtimePopup?.title?.includes("Stock Alert")
                        ? "border-orange-200 bg-orange-50"
                        : "border-slate-200 bg-slate-50"
                }`}>
                    <p className="text-sm font-medium text-slate-800 leading-relaxed">
                        {realtimePopup?.message}
                    </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => handleDismissPopup()}>
                        Dismiss
                    </Button>
                    {realtimePopup?.title?.includes("Stock Alert") && (
                        <Button
                            className="bg-orange-600 text-white font-semibold hover:bg-orange-700"
                            onClick={() => { navigate("/store-purchase/items"); handleDismissPopup(); }}
                        >
                            <Package className="mr-1.5 h-4 w-4" />
                            View Inventory
                        </Button>
                    )}
                    {(() => {
                        if (realtimePopup?.title?.includes("Stock Alert")) return null;
                        const target = realtimePopup?.order_id ? orders.find(o => o.id === realtimePopup.order_id) : null;
                        const isPreparedBy = target && (
                            Number(target.created_by_user_id) === Number(currentUser?.id) ||
                            (Boolean(currentUser?.name && target.created_by) &&
                             (target.created_by || "").toLowerCase() === (currentUser?.name || "").toLowerCase()) ||
                            admin
                        );
                        const isRejected = realtimePopup?.title?.includes("Rejected");

                        if (target && isRejected && isPreparedBy) {
                            return (
                                <>
                                    <Button
                                        variant="outline"
                                        className="text-destructive hover:bg-destructive/10"
                                        disabled={deleteOrder.isPending}
                                        onClick={() => {
                                            if (window.confirm(`Delete rejected Purchase Order ${target.order_number}?`)) {
                                                deleteOrder.mutate(target.id);
                                                handleDismissPopup();
                                            }
                                        }}
                                    >
                                        <Trash2 className="mr-1.5 h-4 w-4" />
                                        Delete
                                    </Button>
                                    <Button
                                        className="bg-primary text-white font-semibold"
                                        onClick={() => {
                                            setEditingOrder(target);
                                            setScreen("edit");
                                            handleDismissPopup();
                                        }}
                                    >
                                        <Pencil className="mr-1.5 h-4 w-4" />
                                        Edit & Resubmit
                                    </Button>
                                </>
                            );
                        }
                        if (target) {
                            return (
                                <Button
                                    className="bg-primary text-white font-semibold"
                                    onClick={() => {
                                        setViewOrder(target);
                                        handleDismissPopup();
                                    }}
                                >
                                    <Eye className="mr-1.5 h-4 w-4" />
                                    View PO
                                </Button>
                            );
                        }
                        return null;
                    })()}
                </div>
            </DialogContent>
        </Dialog></div></main>;
}

function Detail({ label, value, full }) { return <div className={full ? "sm:col-span-2 lg:col-span-3" : ""}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-line font-medium">{value || "—"}</p></div>; }

function ReceivedMaterialsSection({ order }) {
    const receipts = order.material_receipts || [];
    const money = (val) => `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const PAYMENT_COLORS = {
        "Unpaid": "border-rose-200 bg-rose-50 text-rose-700",
        "Partially Paid": "border-amber-200 bg-amber-50 text-amber-700",
        "Paid": "border-emerald-200 bg-emerald-50 text-emerald-700",
    };

    if (!receipts || receipts.length === 0) {
        return (
            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-2">
                    <PackageCheck className="h-5 w-5 text-cyan-700" />
                    <div>
                        <h3 className="font-semibold text-slate-900">Materials Received</h3>
                        <p className="text-xs text-muted-foreground">Goods received records against this Purchase Order.</p>
                    </div>
                </div>
                <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white/70 p-4 text-center text-xs text-muted-foreground">
                    No materials have been received yet against this Purchase Order.
                </div>
            </section>
        );
    }

    return (
        <section className="rounded-xl border border-cyan-200/90 bg-gradient-to-b from-cyan-50/30 to-slate-50/40 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-600 text-white shadow-sm">
                        <PackageCheck className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900">Materials Received</h3>
                            <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-bold text-cyan-800">
                                {receipts.length} {receipts.length === 1 ? "Receipt" : "Receipts"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Goods received records and invoice details against this Purchase Order
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {receipts.map((receipt, idx) => {
                    const totalQty = (receipt.lines || []).reduce((sum, l) => sum + Number(l.received_quantity || 0), 0);
                    const invTotal = Number(receipt.invoice_total || 0);
                    const amtPaid = Number(receipt.amount_paid || 0);
                    const balance = invTotal - amtPaid;

                    return (
                        <div key={receipt.id || idx} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            {/* Receipt Header Banner */}
                            <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800">
                                        {idx + 1}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium text-slate-500">Invoice:</span>
                                        <span className="rounded bg-slate-900 px-2.5 py-1 text-xs font-bold text-white tracking-wide">
                                            {receipt.invoice_number || "—"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-slate-600">
                                        <span className="font-medium text-slate-500">Date:</span>
                                        <span className="font-semibold text-slate-900">{formatDate(receipt.invoice_date) || receipt.invoice_date || "—"}</span>
                                    </div>
                                    {receipt.vendor_code && (
                                        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                                            Vendor Code: <strong className="text-slate-800">{receipt.vendor_code}</strong>
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                        Received
                                    </span>
                                    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${PAYMENT_COLORS[receipt.payment_status] || PAYMENT_COLORS["Unpaid"]}`}>
                                        {receipt.payment_status || "Unpaid"}
                                    </span>
                                    {receipt.bill_file_url && (
                                        <a
                                            href={resolveFileUrl(receipt.bill_file_url)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 transition hover:bg-cyan-100"
                                            title="View / Download Bill"
                                        >
                                            <FileText className="h-3.5 w-3.5" />
                                            <span>View Bill</span>
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Lines Table */}
                            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                        <tr>
                                            <th className="px-3 py-2.5 text-center w-12">#</th>
                                            <th className="px-3 py-2.5">Item Description</th>
                                            <th className="px-3 py-2.5 text-right">Ordered Qty</th>
                                            <th className="px-3 py-2.5 text-right">Received Qty</th>
                                            <th className="px-3 py-2.5 text-center">U/M</th>
                                            <th className="px-3 py-2.5 text-right">Unit Rate</th>
                                            <th className="px-3 py-2.5 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(receipt.lines || []).map((line, lIdx) => (
                                            <tr key={line.id || lIdx} className="hover:bg-slate-50/50">
                                                <td className="px-3 py-2 text-center text-slate-500 font-medium">{line.line_number || lIdx + 1}</td>
                                                <td className="px-3 py-2 font-medium text-slate-900">{line.item_description}</td>
                                                <td className="px-3 py-2 text-right text-slate-600">{Number(line.ordered_quantity || 0).toLocaleString("en-IN")}</td>
                                                <td className="px-3 py-2 text-right font-bold text-emerald-700">{Number(line.received_quantity || 0).toLocaleString("en-IN")}</td>
                                                <td className="px-3 py-2 text-center text-slate-600">{line.uom || "Nos"}</td>
                                                <td className="px-3 py-2 text-right text-slate-700">{money(line.unit_rate)}</td>
                                                <td className="px-3 py-2 text-right font-bold text-slate-900">{money(line.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Receipt Metrics & Totals */}
                            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Received Qty</p>
                                    <p className="mt-0.5 font-bold text-slate-900">{totalQty.toLocaleString("en-IN")}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Taxable Value</p>
                                    <p className="mt-0.5 font-semibold text-slate-900">{money(receipt.taxable_amount)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Freight</p>
                                    <p className="mt-0.5 font-semibold text-slate-900">{money(receipt.freight_charge)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">GST ({Number(receipt.gst_rate || 0)}%)</p>
                                    <p className="mt-0.5 font-semibold text-slate-900">{money(receipt.gst_amount)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Invoice Total</p>
                                    <p className="mt-0.5 font-bold text-cyan-800">{money(receipt.invoice_total)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment Info</p>
                                    <p className="mt-0.5 font-semibold">
                                        <span className="text-emerald-700">{money(receipt.amount_paid || 0)}</span>
                                        {balance > 0 && <span className="text-rose-600 ml-1">({money(balance)} due)</span>}
                                    </p>
                                </div>
                            </div>

                            {/* Receipt Footer: Remarks & Activity */}
                            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-muted-foreground">
                                <div>
                                    {receipt.remarks ? (
                                        <span><strong className="text-slate-700">Remarks:</strong> {receipt.remarks}</span>
                                    ) : (
                                        receipt.reference ? <span><strong className="text-slate-700">Ref:</strong> {receipt.reference}</span> : null
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    {receipt.created_by && (
                                        <span>Received By: <strong className="text-slate-700">{receipt.created_by}</strong></span>
                                    )}
                                    {receipt.created_at && (
                                        <span>{formatDate(receipt.created_at)}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

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






