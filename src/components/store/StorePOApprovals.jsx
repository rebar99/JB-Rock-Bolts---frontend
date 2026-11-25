import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Printer, Clock3, Eye, FileCheck, AlertCircle, ArrowLeft } from "lucide-react";
import { actOnPOApproval, fetchMyPendingPOApprovals, fetchItemMasterList, fetchStoreOrders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PurchaseOrderSheet, { printPurchaseOrder, formatNumber, formatDate } from "@/components/store/PurchaseOrderSheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const money = v => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const pendingApproversFor = (order) => {
    if (!order) return [];
    if ((order.status || "").startsWith("Rejected")) return [];
    const stages = {};
    (order.approval_history || []).filter(row => Number(row.approval_cycle || 1) === Number(order.approval_cycle || 1)).forEach(row => { (stages[row.level_order] ||= []).push(row); });
    for (const rows of Object.values(stages).sort((left, right) => Number(left[0].level_order) - Number(right[0].level_order))) {
        const done = rows[0].rule === "any" ? rows.some(row => row.action === "Approved") : rows.every(row => row.action === "Approved");
        if (!done) return rows.filter(row => row.action === "Pending").map(row => row.approver_name).filter(Boolean);
    }
    return [];
};

export default function StorePOApprovals() {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const location = useLocation();

    // Orders assigned specifically to current logged in user
    const { data: myOrders = [], isLoading: isLoadingMy } = useQuery({
        queryKey: ["my-pending-po-approvals"],
        queryFn: fetchMyPendingPOApprovals,
    });

    // All orders in the system to capture all pending POs
    const { data: allStoreOrders = [], isLoading: isLoadingAll } = useQuery({
        queryKey: ["store-orders"],
        queryFn: fetchStoreOrders,
    });

    const allPendingOrders = useMemo(() => {
        return allStoreOrders.filter(o =>
            !["Approved", "Final Approved", "Finally Approved", "Completed"].includes(o.status) &&
            !(o.status || "").startsWith("Rejected")
        );
    }, [allStoreOrders]);

    const { data: itemMasterList = [] } = useQuery({
        queryKey: ["item-master", "STORE"],
        queryFn: () => fetchItemMasterList("STORE"),
    });

    const [tabOverride, setTabOverride] = useState(null);
    // If user has orders directly waiting for them, default to "my", otherwise default to "all"
    const currentTab = tabOverride ?? (myOrders.length > 0 ? "my" : "all");
    const displayedOrders = currentTab === "my" ? myOrders : allPendingOrders;
    const isLoading = currentTab === "my" ? isLoadingMy : isLoadingAll;

    const [selected, setSelected] = useState(null);
    const [reason, setReason] = useState("");
    const [remarks, setRemarks] = useState("");
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [justActioned, setJustActioned] = useState(false);
    const [initialStateHandled, setInitialStateHandled] = useState(false);

    useEffect(() => {
        if (justActioned) return;
        if (location.state?.order && !initialStateHandled) {
            setSelected(location.state.order);
            setInitialStateHandled(true);
        } else if (location.state?.poId && displayedOrders.length > 0 && !initialStateHandled) {
            const found = displayedOrders.find(o => o.id === location.state.poId);
            if (found) setSelected(found);
            setInitialStateHandled(true);
        } else if (displayedOrders.length === 1 && !selected && !initialStateHandled) {
            setSelected(displayedOrders[0]);
        }
    }, [location.state, displayedOrders, justActioned, initialStateHandled, selected]);

    const action = useMutation({
        mutationFn: ({ id, action, rejection_reason, remarks }) => actOnPOApproval(id, { action, rejection_reason, remarks }),
        onSuccess: (_, args) => {
            setJustActioned(true);
            qc.invalidateQueries({ queryKey: ["my-pending-po-approvals"] });
            qc.invalidateQueries({ queryKey: ["store-orders"] });
            setSelected(null);
            setReason("");
            setRemarks("");
            toast.success(`Purchase Order ${args.action.toLowerCase()} successfully.`);
        },
        onError: e => toast.error(e.message || "Failed to process approval action."),
    });

    const handleReject = () => {
        if (!reason.trim()) {
            toast.error("Rejection reason is required before rejecting.");
            return;
        }
        setConfirmDialog({
            title: "Reject Purchase Order",
            message: `Are you sure you want to reject Purchase Order ${selected?.order_number}? This action cannot be undone.`,
            confirmLabel: "Yes, Reject",
            confirmClass: "bg-rose-600 hover:bg-rose-700 text-white",
            onConfirm: () => {
                action.mutate({ id: selected.id, action: "Rejected", rejection_reason: reason.trim(), remarks });
                setConfirmDialog(null);
            },
        });
    };

    const handleApprove = () => {
        setConfirmDialog({
            title: "Approve Purchase Order",
            message: `Are you sure you want to approve Purchase Order ${selected?.order_number} for ${money(selected?.grand_total)}?`,
            confirmLabel: "Yes, Approve",
            confirmClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
            onConfirm: () => {
                action.mutate({ id: selected.id, action: "Approved", remarks });
                setConfirmDialog(null);
            },
        });
    };

    const isActionableByMe = (order) => {
        if (!order) return false;
        return myOrders.some(m => m.id === order.id);
    };

    return (
        <main className="min-h-[calc(100vh-4rem)] bg-white p-5 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate("/store-purchase/purchase")}
                            className="text-slate-600 hover:text-slate-900 -ml-2 h-8 px-2"
                        >
                            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Purchase Orders
                        </Button>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 mt-1">PO Approvals</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Review pending purchase orders, approval stages and authorize purchases.
                    </p>
                </div>
                {allPendingOrders.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {allPendingOrders.length} Total Pending PO{allPendingOrders.length > 1 ? "s" : ""}
                    </span>
                )}
            </div>

            {/* Tabs */}
            <div className="mt-6 flex items-center gap-2 border-b border-border">
                <button
                    type="button"
                    onClick={() => setTabOverride("all")}
                    className={cn(
                        "pb-3 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2",
                        currentTab === "all"
                            ? "border-amber-600 text-amber-800 font-bold"
                            : "border-transparent text-slate-500 hover:text-slate-800"
                    )}
                >
                    <span>All Pending POs</span>
                    <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">
                        {allPendingOrders.length}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setTabOverride("my")}
                    className={cn(
                        "pb-3 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2",
                        currentTab === "my"
                            ? "border-amber-600 text-amber-800 font-bold"
                            : "border-transparent text-slate-500 hover:text-slate-800"
                    )}
                >
                    <span>Waiting for My Approval</span>
                    <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-bold">
                        {myOrders.length}
                    </span>
                </button>
            </div>

            <section className="mt-5 overflow-hidden rounded-xl border bg-white shadow-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left border-b border-border">
                            <tr>
                                <th className="p-4 font-semibold text-slate-700">PO #</th>
                                <th className="p-4 font-semibold text-slate-700">Vendor</th>
                                <th className="p-4 font-semibold text-slate-700 text-right">Amount</th>
                                <th className="p-4 font-semibold text-slate-700">Requested by</th>
                                <th className="p-4 font-semibold text-slate-700">Current Approver</th>
                                <th className="p-4 font-semibold text-slate-700 text-center">Status</th>
                                <th className="p-4 font-semibold text-slate-700 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" className="p-10 text-center text-muted-foreground">
                                        Loading pending approvals…
                                    </td>
                                </tr>
                            ) : displayedOrders.map(order => {
                                const awaiting = pendingApproversFor(order);
                                const canApprove = isActionableByMe(order);
                                return (
                                    <tr key={order.id} className="border-t hover:bg-slate-50/80 transition-colors">
                                        <td className="p-4 font-bold text-primary">{order.order_number}</td>
                                        <td className="p-4 font-medium text-slate-900">{order.supplier}</td>
                                        <td className="p-4 font-bold text-slate-900 text-right">{money(order.grand_total)}</td>
                                        <td className="p-4 text-slate-600">{order.created_by || "—"}</td>
                                        <td className="p-4">
                                            {awaiting.length > 0 ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                    <Clock3 className="h-3 w-3 text-amber-600" />
                                                    {awaiting.join(", ")}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            {canApprove ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelected(order);
                                                        setReason("");
                                                    }}
                                                    className="gap-1.5 bg-gradient-primary shadow-sm hover:opacity-90 font-medium"
                                                >
                                                    <Eye className="h-4 w-4" /> Review &amp; Approve
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setSelected(order);
                                                        setReason("");
                                                    }}
                                                    className="gap-1.5 text-slate-700 hover:text-slate-900"
                                                >
                                                    <Eye className="h-4 w-4" /> View Details
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!isLoading && !displayedOrders.length && (
                                <tr>
                                    <td colSpan="7" className="p-12 text-center text-muted-foreground">
                                        <FileCheck className="mx-auto h-8 w-8 text-emerald-500 mb-2 opacity-80" />
                                        <p className="font-semibold text-slate-800">
                                            {currentTab === "my" ? "No POs waiting for your approval" : "No pending purchase orders"}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {currentTab === "my"
                                                ? "You have actioned all purchase orders assigned to you."
                                                : "All purchase orders have been approved or completed."}
                                        </p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Complete Proper PO Review Modal */}
            <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
                <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto bg-slate-100 p-4 sm:p-6">
                    <DialogHeader className="mb-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
                            <div>
                                <DialogTitle className="text-xl font-bold text-slate-950">
                                    Purchase Order {selected?.order_number}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-600 mt-0.5">
                                    Vendor: <span className="font-semibold text-slate-800">{selected?.supplier}</span> · Total Value: <span className="font-bold text-slate-900">{money(selected?.grand_total)}</span> · Requested by: <span className="font-medium text-slate-800">{selected?.created_by || "—"}</span>
                                </DialogDescription>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => printPurchaseOrder(selected, itemMasterList)}
                                className="gap-1.5 shadow-sm"
                            >
                                <Printer className="h-3.5 w-3.5" /> Print / Save PDF
                            </Button>
                        </div>
                    </DialogHeader>

                    {selected && (
                        <div className="space-y-6">
                            {/* The Official Full Proper PO Document */}
                            <PurchaseOrderSheet order={selected} itemMasterList={itemMasterList} />

                            {/* Approval Workflow & History */}
                            <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
                                <h3 className="font-bold text-slate-950 text-sm mb-3">Approval Workflow &amp; Audit Trail</h3>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {(selected.approval_history || []).map((step, idx) => (
                                        <div key={idx} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                                            <div className="mt-0.5">
                                                {step.action === "Approved" ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                ) : step.action === "Rejected" ? (
                                                    <XCircle className="h-4 w-4 text-rose-600" />
                                                ) : (
                                                    <Clock3 className="h-4 w-4 text-amber-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-semibold text-slate-900 truncate">{step.approver_name || `Approver #${step.approver_id}`}</span>
                                                    <span className={cn(
                                                        "font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded",
                                                        step.action === "Approved" ? "bg-emerald-100 text-emerald-800" :
                                                        step.action === "Rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                                                    )}>
                                                        {step.action || "Pending"}
                                                    </span>
                                                </div>
                                                <p className="text-slate-600 mt-1">{step.remarks || step.rejection_reason || (step.action === "Pending" ? "Awaiting review and action" : "No remarks recorded")}</p>
                                                {step.action_at && (
                                                    <p className="text-[10px] text-muted-foreground mt-1">{formatDate(step.action_at)}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {(!selected.approval_history || selected.approval_history.length === 0) && (
                                        <p className="text-xs text-muted-foreground col-span-full">No previous approval logs recorded.</p>
                                    )}
                                </div>
                            </div>

                            {/* Approver Action Panel or Status Banner */}
                            {isActionableByMe(selected) ? (
                                <div className="rounded-xl border-2 border-slate-300 bg-white p-5 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                        <div>
                                            <h3 className="font-bold text-slate-950 text-base">Your Approval Decision</h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">Please verify the order items, rates, taxes and terms above before deciding.</p>
                                        </div>
                                        <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200">
                                            Action Required
                                        </span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-800 mb-1.5">
                                            Rejection Reason <span className="font-normal text-slate-500">(Required only when rejecting this PO)</span>
                                        </label>
                                        <textarea
                                            value={reason}
                                            onChange={e => setReason(e.target.value)}
                                            placeholder="If you are rejecting, please write the specific reason here..."
                                            rows={3}
                                            className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-800 mb-1.5">Approval Remarks <span className="font-normal text-slate-500">(Optional)</span></label>
                                        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Add your review remarks..." rows={2} className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50" />
                                    </div>

                                    <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setSelected(null)}
                                            disabled={action.isPending}
                                        >
                                            Close
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            disabled={action.isPending}
                                            onClick={handleReject}
                                            className="gap-2 font-semibold"
                                        >
                                            <XCircle className="h-4 w-4" /> Reject PO
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={action.isPending}
                                            onClick={handleApprove}
                                            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow"
                                        >
                                            <CheckCircle2 className="h-4 w-4" /> Approve PO
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="font-bold flex items-center gap-1.5">
                                            <Clock3 className="h-4 w-4 text-amber-600" />
                                            Awaiting Approval
                                        </p>
                                        <p className="text-xs text-amber-800 mt-0.5">
                                            Assigned to: <span className="font-semibold">{pendingApproversFor(selected).join(", ") || "Other Approvers"}</span>
                                        </p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                                        Close
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Confirm Dialog */}
            <Dialog open={!!confirmDialog} onOpenChange={open => !open && setConfirmDialog(null)}>
                <DialogContent className="max-w-sm rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-slate-900">
                            {confirmDialog?.title}
                        </DialogTitle>
                        <DialogDescription className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                            {confirmDialog?.message}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmDialog(null)}
                            disabled={action.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className={confirmDialog?.confirmClass}
                            onClick={confirmDialog?.onConfirm}
                            disabled={action.isPending}
                        >
                            {confirmDialog?.confirmLabel}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </main>
    );
}
