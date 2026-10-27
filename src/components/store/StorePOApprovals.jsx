import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Printer, Clock3, Eye, FileCheck, AlertCircle } from "lucide-react";
import { actOnPOApproval, fetchMyPendingPOApprovals, fetchItemMasterList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PurchaseOrderSheet, { printPurchaseOrder, formatNumber, formatDate } from "@/components/store/PurchaseOrderSheet";
import { toast } from "sonner";

const money = v => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function StorePOApprovals() {
    const qc = useQueryClient();
    const location = useLocation();
    const { data: orders = [], isLoading } = useQuery({
        queryKey: ["my-pending-po-approvals"],
        queryFn: fetchMyPendingPOApprovals,
    });

    const { data: itemMasterList = [] } = useQuery({
        queryKey: ["item-master", "STORE"],
        queryFn: () => fetchItemMasterList("STORE"),
    });

    const [selected, setSelected] = useState(null);
    const [reason, setReason] = useState("");
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [justActioned, setJustActioned] = useState(false);
    const [initialStateHandled, setInitialStateHandled] = useState(false);

    useEffect(() => {
        // After an action (approve/reject), don't auto-select anything
        if (justActioned) return;

        if (location.state?.order && !initialStateHandled) {
            setSelected(location.state.order);
            setInitialStateHandled(true);
        } else if (location.state?.poId && orders.length > 0 && !initialStateHandled) {
            const found = orders.find(o => o.id === location.state.poId);
            if (found) setSelected(found);
            setInitialStateHandled(true);
        } else if (orders.length === 1 && !selected && !initialStateHandled) {
            setSelected(orders[0]);
        }
    }, [location.state, orders, justActioned]);

    const action = useMutation({
        mutationFn: ({ id, action, rejection_reason }) => actOnPOApproval(id, { action, rejection_reason }),
        onSuccess: (_, args) => {
            setJustActioned(true);
            qc.invalidateQueries({ queryKey: ["my-pending-po-approvals"] });
            qc.invalidateQueries({ queryKey: ["store-orders"] });
            setSelected(null);
            setReason("");
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
                action.mutate({ id: selected.id, action: "Rejected", rejection_reason: reason.trim() });
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
                action.mutate({ id: selected.id, action: "Approved" });
                setConfirmDialog(null);
            },
        });
    };

    return (
        <main className="min-h-[calc(100vh-4rem)] bg-white p-5 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">PO Approvals</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Purchase orders assigned to you for approval. Review the complete PO before approving or rejecting.
                    </p>
                </div>
                {orders.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {orders.length} PO{orders.length > 1 ? "s" : ""} pending approval
                    </span>
                )}
            </div>

            <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left border-b border-border">
                            <tr>
                                <th className="p-4 font-semibold text-slate-700">PO #</th>
                                <th className="p-4 font-semibold text-slate-700">Vendor</th>
                                <th className="p-4 font-semibold text-slate-700 text-right">Amount</th>
                                <th className="p-4 font-semibold text-slate-700">Requested by</th>
                                <th className="p-4 font-semibold text-slate-700 text-center">Status</th>
                                <th className="p-4 font-semibold text-slate-700 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className="p-10 text-center text-muted-foreground">
                                        Loading pending approvals…
                                    </td>
                                </tr>
                            ) : orders.map(order => (
                                <tr key={order.id} className="border-t hover:bg-slate-50/80 transition-colors">
                                    <td className="p-4 font-bold text-primary">{order.order_number}</td>
                                    <td className="p-4 font-medium text-slate-900">{order.supplier}</td>
                                    <td className="p-4 font-bold text-slate-900 text-right">{money(order.grand_total)}</td>
                                    <td className="p-4 text-slate-600">{order.created_by || "—"}</td>
                                    <td className="p-4 text-center">
                                        <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
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
                                    </td>
                                </tr>
                            ))}
                            {!isLoading && !orders.length && (
                                <tr>
                                    <td colSpan="6" className="p-12 text-center text-muted-foreground">
                                        <FileCheck className="mx-auto h-8 w-8 text-emerald-500 mb-2 opacity-80" />
                                        <p className="font-semibold text-slate-800">All caught up!</p>
                                        <p className="text-xs text-muted-foreground mt-1">No Purchase Orders are currently waiting for your approval.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Complete Proper PO Review & Approval Modal */}
            <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
                <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto bg-slate-100 p-4 sm:p-6">
                    <DialogHeader className="mb-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
                            <div>
                                <DialogTitle className="text-xl font-bold text-slate-950">
                                    Review Purchase Order {selected?.order_number}
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
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                                    <Clock3 className="h-4 w-4 text-primary" />
                                    <h3 className="font-bold text-slate-900 text-sm">Approval Workflow &amp; History</h3>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {(selected.approval_history || []).map(row => (
                                        <div key={row.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50/70">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{row.level}</span>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                    row.action === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                                                    row.action === 'Rejected' ? 'bg-rose-100 text-rose-800' :
                                                    'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {row.action}
                                                </span>
                                            </div>
                                            <p className="font-semibold text-slate-900 text-sm mt-1">{row.approver_name}</p>
                                            {row.action_at && (
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                    Actioned: {formatDate(row.action_at)}
                                                </p>
                                            )}
                                            {row.rejection_reason && (
                                                <p className="text-xs text-rose-700 mt-1.5 bg-rose-50 border border-rose-200 p-1.5 rounded">
                                                    <b>Reason:</b> {row.rejection_reason}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                    {(!selected.approval_history || selected.approval_history.length === 0) && (
                                        <p className="text-xs text-muted-foreground col-span-full">No previous approval logs recorded.</p>
                                    )}
                                </div>
                            </div>

                            {/* Approver Action Panel */}
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
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            {/* Confirm Dialog — uses Radix Dialog so it portals above the PO review dialog */}
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
                            variant="outline"
                            onClick={() => setConfirmDialog(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className={confirmDialog?.confirmClass}
                            onClick={confirmDialog?.onConfirm}
                        >
                            {confirmDialog?.confirmLabel}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </main>
    );
}
