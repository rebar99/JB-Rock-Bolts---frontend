import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, FileUp, PackageCheck, Pencil, Plus, Save, Trash2, Upload, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createStoreMaterialReceipt, deleteStoreMaterialReceipt, fetchStoreMaterialReceipts, patchStoreMaterialReceiptBill, patchStoreMaterialReceiptPayment, resolveFileUrl, updateStoreMaterialReceipt, uploadStoreMaterialReceiptBill } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/currentUser";

const today = () => new Date().toISOString().slice(0, 10);
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
const Field = ({ label, children }) => <label className="block text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;

function fmtDateTime(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (isNaN(d)) return val;
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

/** Payment status badge colours */
const PAYMENT_COLORS = {
    "Unpaid":         "border-rose-200 bg-rose-50 text-rose-700",
    "Partially Paid": "border-amber-200 bg-amber-50 text-amber-700",
    "Paid":           "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function PaymentBadge({ status }) {
    return (
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${PAYMENT_COLORS[status] || PAYMENT_COLORS["Unpaid"]}`}>
            {status || "Unpaid"}
        </span>
    );
}

/** Payment edit dialog */
function PaymentDialog({ receipt, onClose, onSave, isSaving }) {
    const invoiceTotal = Number(receipt?.invoice_total || 0);
    const [status, setStatus]   = useState(receipt?.payment_status || "Unpaid");
    const [amount, setAmount]   = useState(String(receipt?.amount_paid || 0));
    const [pDate, setPDate]     = useState(receipt?.payment_date || today());
    const [ref, setRef]         = useState(receipt?.payment_reference || "");

    const balance = invoiceTotal - Number(amount || 0);

    return (
        <Dialog open={!!receipt} onOpenChange={open => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-cyan-700" /> Update Payment
                    </DialogTitle>
                    <DialogDescription>
                        Invoice {receipt?.invoice_number} — {receipt?.vendor_name}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Invoice Total (read-only) */}
                    <div className="rounded-lg border bg-slate-50 px-4 py-3 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Invoice Total</span>
                        <span className="font-bold text-slate-800">{money(invoiceTotal)}</span>
                    </div>

                    {/* Payment Status */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment Status *</label>
                        <select value={status} onChange={e => setStatus(e.target.value)} className={input}>
                            <option value="Unpaid">Unpaid</option>
                            <option value="Partially Paid">Partially Paid</option>
                            <option value="Paid">Paid</option>
                        </select>
                    </div>

                    {/* Amount Paid */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Amount Paid (₹)</label>
                        <input
                            type="number" min="0" step="0.01" max={invoiceTotal}
                            value={amount} onChange={e => setAmount(e.target.value)}
                            className={input} placeholder="0.00"
                        />
                        {Number(amount) > 0 && (
                            <p className={`mt-1 text-xs font-medium ${balance <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                                Balance Due: {money(Math.max(0, balance))}
                            </p>
                        )}
                    </div>

                    {/* Payment Date */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
                        <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} className={input} />
                    </div>

                    {/* Reference */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Reference (Cheque / NEFT / UTR)</label>
                        <input
                            type="text" value={ref} onChange={e => setRef(e.target.value)}
                            className={input} placeholder="e.g. NEFT-20241001-001"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={isSaving}
                        onClick={() => onSave({ payment_status: status, amount_paid: Number(amount || 0), payment_date: pDate || null, payment_reference: ref || null })}
                    >
                        {isSaving ? "Saving…" : "Save Payment"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ActivityRow({ createdBy, createdAt, updatedBy, updatedAt }) {
    return (
        <div className="mt-4 border-t pt-3 grid gap-4 sm:grid-cols-2">
            <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Created By</p>
                <p className="mt-0.5 font-semibold text-slate-800">{createdBy || "—"}</p>
                <p className="text-xs text-muted-foreground">{fmtDateTime(createdAt)}</p>
            </div>
            <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Last Updated By</p>
                <p className="mt-0.5 font-semibold text-slate-800">{updatedBy || "—"}</p>
                <p className="text-xs text-muted-foreground">{updatedBy ? fmtDateTime(updatedAt) : "—"}</p>
            </div>
        </div>
    );
}

function Metric({ label, value }) {
    return (
        <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 font-semibold text-slate-950">{value}</p>
        </div>
    );
}

function MaterialsReceivedList({ admin, isLoading, onAdd, onBack, onDelete, onEdit, onUploadBill, onView, onPayment, receipts }) {
    return (
        <main className="min-h-[calc(100vh-4rem)] w-full bg-slate-50 px-4 py-7 sm:px-6 lg:px-8">
            <div className="w-full">
                {/* Header */}
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-cyan-700">Purchase Order</p>
                        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Materials Received</h1>
                        <p className="mt-2 text-sm text-muted-foreground">Review supplier invoices and received quantities against Purchase Orders.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {onBack && <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Purchase Order List</Button>}
                        {admin && <Button onClick={onAdd} className="bg-gradient-primary shadow-elegant hover:opacity-90"><Plus className="mr-2 h-4 w-4" />Add Material Received</Button>}
                    </div>
                </div>

                {/* List */}
                <div className="mt-6 space-y-4">
                    {isLoading ? (
                        <div className="rounded-xl border bg-white p-12 text-center text-muted-foreground">Loading records…</div>
                    ) : receipts.length ? receipts.map((receipt, index) => {
                        const totalQty = (receipt.lines || []).reduce((sum, line) => sum + Number(line.received_quantity || 0), 0);
                        const totalAmount = (receipt.lines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);
                        const freightCharge = Number(receipt.freight_charge || 0);
                        const gstAmount = Number(receipt.gst_amount || 0);
                        const invoiceTotal = Number(receipt.invoice_total ?? totalAmount + freightCharge + gstAmount);
                        const items = (receipt.lines || []).map(line => line.item_description).join(", ");
                        const balance = invoiceTotal - Number(receipt.amount_paid || 0);

                        return (
                            <section key={receipt.id} className="rounded-xl border bg-white p-5 shadow-card transition-shadow hover:shadow-elegant">
                                {/* Top row: title + action buttons */}
                                <div className="flex flex-col gap-4 border-b pb-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-primary text-[11px] font-bold text-primary">{index + 1}</span>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="font-bold text-slate-950">{receipt.order_number} — M/s. {receipt.vendor_name}</h2>
                                                <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Invoice: {receipt.invoice_number}</span>
                                                <span className="text-xs text-muted-foreground">{receipt.invoice_date}</span>
                                            </div>
                                            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Items</p>
                                            <p className="mt-1 text-sm font-medium text-slate-800">{items || "—"}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1">
                                        <span className="mr-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Received</span>
                                        {/* Payment badge */}
                                        <PaymentBadge status={receipt.payment_status} />
                                        <Button type="button" variant="ghost" size="icon" title="View material receipt" onClick={() => onView(receipt)}><Eye className="h-4 w-4" /></Button>
                                        {admin && <Button type="button" variant="ghost" size="icon" title="Edit material receipt" onClick={() => onEdit(receipt)}><Pencil className="h-4 w-4" /></Button>}
                                        {admin && (
                                            <label title="Upload or replace bill" className="grid h-9 w-9 cursor-pointer place-items-center rounded-md text-cyan-700 hover:bg-cyan-50">
                                                <Upload className="h-4 w-4" />
                                                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={event => { const file = event.target.files?.[0]; if (file) onUploadBill(receipt, file); event.target.value = ""; }} />
                                            </label>
                                        )}
                                        {receipt.bill_file_url && <a title="View bill" className="grid h-9 w-9 place-items-center rounded-md text-primary hover:bg-primary/5" href={resolveFileUrl(receipt.bill_file_url)} target="_blank" rel="noreferrer"><FileUp className="h-4 w-4" /></a>}
                                        {admin && (
                                            <Button type="button" variant="ghost" size="icon" title="Update payment status" className="text-cyan-700 hover:text-cyan-800" onClick={() => onPayment(receipt)}>
                                                <CreditCard className="h-4 w-4" />
                                            </Button>
                                        )}
                                        {admin && <Button type="button" variant="ghost" size="icon" title="Delete material receipt" className="text-destructive hover:text-destructive" onClick={() => onDelete(receipt)}><Trash2 className="h-4 w-4" /></Button>}
                                    </div>
                                </div>

                                {/* Metrics row */}
                                <div className="grid gap-5 pt-4 sm:grid-cols-2 xl:grid-cols-7">
                                    <Metric label="Vendor Code" value={receipt.vendor_code || "—"} />
                                    <Metric label="Reference" value={receipt.reference || "—"} />
                                    <Metric label="Received Quantity" value={totalQty.toLocaleString("en-IN")} />
                                    <Metric label="Freight Charge" value={money(freightCharge)} />
                                    <Metric label={`GST (${Number(receipt.gst_rate || 0)}%)`} value={money(gstAmount)} />
                                    <Metric label="Invoice Total" value={money(invoiceTotal)} />
                                    <Metric label="Receipt Items" value={`${receipt.lines?.length || 0} item(s)`} />
                                </div>

                                {/* Payment summary row */}
                                <div className="mt-4 rounded-lg border bg-slate-50 px-4 py-3 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Payment Status</p>
                                        <p className="mt-0.5 font-semibold"><PaymentBadge status={receipt.payment_status} /></p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount Paid</p>
                                        <p className="mt-0.5 font-semibold text-emerald-700">{money(receipt.amount_paid || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Balance Due</p>
                                        <p className={`mt-0.5 font-semibold ${balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(Math.max(0, balance))}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Payment Date</p>
                                        <p className="mt-0.5 font-semibold text-slate-700">{receipt.payment_date || "—"}</p>
                                    </div>
                                </div>

                                {/* Remarks */}
                                {receipt.remarks && (
                                    <div className="mt-4 border-t pt-3 text-sm">
                                        <span className="font-medium">Remarks: </span>
                                        <span className="text-muted-foreground">{receipt.remarks}</span>
                                    </div>
                                )}

                                {/* Created / Updated By */}
                                <ActivityRow createdBy={receipt.created_by} createdAt={receipt.created_at} updatedBy={receipt.updated_by} updatedAt={receipt.updated_at} />
                            </section>
                        );
                    }) : (
                        <div className="rounded-xl border bg-white p-12 text-center text-muted-foreground">No material receipt records yet. Use Add Material Received to create the first entry.</div>
                    )}
                </div>
            </div>
        </main>
    );
}

function ReceiptViewDialog({ receipt, onClose }) {
    if (!receipt) return null;
    const invoiceTotal = Number(receipt.invoice_total || 0);
    const balance = invoiceTotal - Number(receipt.amount_paid || 0);

    return (
        <Dialog open={!!receipt} onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Material Received — {receipt.invoice_number}</DialogTitle>
                    <DialogDescription>{receipt.order_number} · M/s. {receipt.vendor_name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-5 text-sm">
                    {/* Basic info */}
                    <div className="grid gap-4 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Metric label="Vendor Code" value={receipt.vendor_code || "—"} />
                        <Metric label="Reference" value={receipt.reference || "—"} />
                        <Metric label="Invoice Date" value={receipt.invoice_date} />
                        <Metric label="Invoice Number" value={receipt.invoice_number} />
                    </div>

                    {/* Lines table */}
                    <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[650px]">
                            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                <tr>
                                    <th className="p-3">Item</th>
                                    <th className="p-3 text-right">Ordered</th>
                                    <th className="p-3 text-right">Received</th>
                                    <th className="p-3">U/M</th>
                                    <th className="p-3 text-right">Rate</th>
                                    <th className="p-3 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(receipt.lines || []).map(line => (
                                    <tr key={line.id} className="border-t">
                                        <td className="p-3 font-medium">{line.item_description}</td>
                                        <td className="p-3 text-right">{line.ordered_quantity}</td>
                                        <td className="p-3 text-right">{line.received_quantity}</td>
                                        <td className="p-3">{line.uom}</td>
                                        <td className="p-3 text-right">{money(line.unit_rate)}</td>
                                        <td className="p-3 text-right font-semibold">{money(line.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals */}
                    <div className="grid gap-4 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Metric label="Taxable Amount" value={money(receipt.taxable_amount)} />
                        <Metric label="Freight Charge" value={money(receipt.freight_charge)} />
                        <Metric label={`GST (${Number(receipt.gst_rate || 0)}%)`} value={money(receipt.gst_amount)} />
                        <Metric label="Total incl. GST" value={money(receipt.invoice_total)} />
                    </div>

                    {/* Payment section */}
                    <div className="rounded-lg border p-4 space-y-3">
                        <p className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-cyan-700" /> Payment Details</p>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
                                <div className="mt-1"><PaymentBadge status={receipt.payment_status} /></div>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount Paid</p>
                                <p className="mt-1 font-semibold text-emerald-700">{money(receipt.amount_paid || 0)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance Due</p>
                                <p className={`mt-1 font-semibold ${balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(Math.max(0, balance))}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment Date</p>
                                <p className="mt-1 font-semibold">{receipt.payment_date || "—"}</p>
                            </div>
                        </div>
                        {receipt.payment_reference && (
                            <p className="text-sm text-muted-foreground">Reference: <span className="font-medium text-slate-700">{receipt.payment_reference}</span></p>
                        )}
                    </div>

                    {/* Remarks */}
                    {receipt.remarks && (
                        <div className="rounded-lg border p-4">
                            <p className="font-semibold">Remarks</p>
                            <p className="mt-1 text-muted-foreground">{receipt.remarks}</p>
                        </div>
                    )}

                    {/* Created / Updated by */}
                    <div className="rounded-lg border bg-slate-50 p-4 grid gap-4 sm:grid-cols-2">
                        <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Created By</p>
                            <p className="mt-0.5 font-semibold text-slate-800">{receipt.created_by || "—"}</p>
                            <p className="text-xs text-muted-foreground">{fmtDateTime(receipt.created_at)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Last Updated By</p>
                            <p className="mt-0.5 font-semibold text-slate-800">{receipt.updated_by || "—"}</p>
                            <p className="text-xs text-muted-foreground">{receipt.updated_by ? fmtDateTime(receipt.updated_at) : "—"}</p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function StoreMaterialsReceived({ orders = [], admin = false, onBack }) {
    const client = useQueryClient();
    const [entryMode, setEntryMode]         = useState(false);
    const [editingReceipt, setEditingReceipt] = useState(null);
    const [existingBillUrl, setExistingBillUrl] = useState(null);
    const [viewingReceipt, setViewingReceipt] = useState(null);
    const [paymentReceipt, setPaymentReceipt] = useState(null);
    const [vendorName, setVendorName]       = useState("");
    const [selectedId, setSelectedId]       = useState("");
    const [invoiceDate, setInvoiceDate]     = useState(today());
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [freightCharge, setFreightCharge] = useState("0");
    const [bill, setBill]                   = useState(null);
    const [lines, setLines]                 = useState([]);
    const [remarks, setRemarks]             = useState("");

    const { data: receipts = [], isLoading } = useQuery({ queryKey: ["store-material-receipts"], queryFn: fetchStoreMaterialReceipts });
    const selected = useMemo(() => orders.find(order => String(order.id) === String(selectedId)), [orders, selectedId]);
    const taxableAmount = useMemo(() => lines.reduce((sum, line) => sum + Number(line.received_quantity || 0) * Number(line.unit_rate || 0), 0), [lines]);
    const freightAmount = Number(freightCharge || 0);
    const gstRate       = Number(selected?.gst_rate || 0);
    const gstAmount     = (taxableAmount + freightAmount) * gstRate / 100;
    const approvedOrders = useMemo(() => orders.filter(o => o.status === "Approved"), [orders]);
    const vendors        = useMemo(() => [...new Set(approvedOrders.map(o => o.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [approvedOrders]);
    const vendorOrders   = useMemo(() => approvedOrders.filter(o => o.supplier === vendorName), [approvedOrders, vendorName]);

    const invalidate = () => {
        client.invalidateQueries({ queryKey: ["store-material-receipts"] });
        client.invalidateQueries({ queryKey: ["store-orders"] });
    };

    const chooseVendor = value => { setVendorName(value); setSelectedId(""); setLines([]); setFreightCharge("0"); };
    const chooseOrder  = id => {
        setSelectedId(id);
        const order = orders.find(row => String(row.id) === String(id));
        setVendorName(order?.supplier || vendorName); setFreightCharge("0");
        const receivedByItem = (receipts || []).filter(r => String(r.order_id) === String(id)).reduce((totals, r) => {
            (r.lines || []).forEach(line => { const key = String(line.item_description || "").trim().toLowerCase(); totals[key] = (totals[key] || 0) + Number(line.received_quantity || 0); });
            return totals;
        }, {});
        setLines((order?.items || []).map(line => {
            const ordered   = Number(line.quantity || 0);
            const remaining = Math.max(0, ordered - (receivedByItem[String(line.item_description || "").trim().toLowerCase()] || 0));
            return { item_description: line.item_description, ordered_quantity: ordered, received_quantity: remaining, uom: line.uom || "Nos", unit_rate: Number(line.unit_rate || 0) };
        }));
    };

    const uploadBill = useMutation({ mutationFn: uploadStoreMaterialReceiptBill, onError: e => toast.error(e.message) });

    const save = useMutation({
        mutationFn: async () => {
            if (!selected)              throw new Error("Select a Purchase Order.");
            if (!invoiceNumber.trim())  throw new Error("Invoice number is required.");
            if (!lines.length)          throw new Error("Selected PO has no item lines.");
            const uploaded = bill ? await uploadBill.mutateAsync(bill) : null;
            const payload  = { order_id: selected.id, invoice_date: invoiceDate, invoice_number: invoiceNumber.trim(), freight_charge: freightAmount, bill_file_url: uploaded?.file_url || existingBillUrl || null, remarks, lines: lines.map(l => ({ ...l, ordered_quantity: Number(l.ordered_quantity || 0), received_quantity: Number(l.received_quantity || 0), unit_rate: Number(l.unit_rate || 0) })) };
            return editingReceipt ? updateStoreMaterialReceipt(editingReceipt.id, payload) : createStoreMaterialReceipt(payload);
        },
        onSuccess: () => {
            invalidate();
            client.invalidateQueries({ queryKey: ["store-inventory"] });
            client.invalidateQueries({ queryKey: ["store-dashboard"] });
            toast.success("Materials received saved. Inventory and PO received quantities were updated.");
            setEntryMode(false); setEditingReceipt(null); setExistingBillUrl(null); setVendorName(""); setSelectedId(""); setInvoiceDate(today()); setInvoiceNumber(""); setBill(null); setFreightCharge("0"); setLines([]); setRemarks("");
        },
        onError: e => toast.error(e.message),
    });

    const updateLine = (index, value) => setLines(cur => cur.map((l, i) => i === index ? { ...l, received_quantity: value } : l));

    const openEdit = receipt => {
        setEditingReceipt(receipt); setExistingBillUrl(receipt.bill_file_url || null); setVendorName(receipt.vendor_name); setSelectedId(String(receipt.order_id));
        setInvoiceDate(receipt.invoice_date || today()); setInvoiceNumber(receipt.invoice_number || ""); setFreightCharge(String(receipt.freight_charge || 0)); setBill(null); setRemarks(receipt.remarks || "");
        setLines((receipt.lines || []).map(l => ({ item_description: l.item_description, ordered_quantity: Number(l.ordered_quantity || 0), received_quantity: Number(l.received_quantity || 0), uom: l.uom || "Nos", unit_rate: Number(l.unit_rate || 0) })));
        setEntryMode(true);
    };

    const removeReceipt = useMutation({
        mutationFn: deleteStoreMaterialReceipt,
        onSuccess: () => { invalidate(); toast.success("Material Received and linked Purchase Order deleted."); },
        onError: e => toast.error(e.message),
    });

    const replaceBill = useMutation({
        mutationFn: async ({ receipt, file }) => {
            const uploaded = await uploadStoreMaterialReceiptBill(file);
            return patchStoreMaterialReceiptBill(receipt.id, { file_url: uploaded.file_url, updated_by: getCurrentUser() });
        },
        onSuccess: () => { invalidate(); toast.success("Bill uploaded successfully."); },
        onError: e => toast.error(e.message),
    });

    const updatePayment = useMutation({
        mutationFn: ({ id, data }) => patchStoreMaterialReceiptPayment(id, data),
        onSuccess: () => { invalidate(); setPaymentReceipt(null); toast.success("Payment status updated."); },
        onError: e => toast.error(e.message),
    });

    if (!entryMode) return (
        <>
            <MaterialsReceivedList
                admin={admin} isLoading={isLoading}
                onAdd={() => setEntryMode(true)} onBack={onBack}
                onView={setViewingReceipt} onEdit={openEdit}
                onUploadBill={(receipt, file) => replaceBill.mutate({ receipt, file })}
                onPayment={setPaymentReceipt}
                onDelete={receipt => { if (window.confirm(`Delete Material Received for invoice ${receipt.invoice_number}? Its linked Purchase Order and all receipts against that PO will also be deleted.`)) removeReceipt.mutate(receipt.id); }}
                receipts={receipts}
            />
            <ReceiptViewDialog receipt={viewingReceipt} onClose={() => setViewingReceipt(null)} />
            <PaymentDialog
                receipt={paymentReceipt}
                onClose={() => setPaymentReceipt(null)}
                isSaving={updatePayment.isPending}
                onSave={data => updatePayment.mutate({ id: paymentReceipt.id, data })}
            />
        </>
    );

    return (
        <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-cyan-700">Purchase Order</p>
                        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Add Material Received</h1>
                        <p className="mt-2 text-sm text-muted-foreground">Record supplier invoice and received quantities against a Purchase Order.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => setEntryMode(false)}><ArrowLeft className="mr-2 h-4 w-4" />Materials Received List</Button>
                </div>

                {!admin && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">You have view-only access. Only Store Admin can save materials received.</div>}

                <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                    <div className="flex items-center gap-3 border-b pb-4">
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><PackageCheck className="h-5 w-5" /></div>
                        <div><h2 className="font-bold">Vendor & PO Details</h2><p className="text-xs text-muted-foreground">First select vendor, then select a PO number to auto-fill the remaining details.</p></div>
                    </div>
                    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Field label="Vendor Name / M/S. *"><select required disabled={!admin} value={vendorName} onChange={e => chooseVendor(e.target.value)} className={input}><option value="">Select vendor</option>{vendors.map(v => <option key={v} value={v}>{v}</option>)}</select></Field>
                        <Field label="Purchase Order Number *"><select required disabled={!admin || !vendorName} value={selectedId} onChange={e => chooseOrder(e.target.value)} className={input}><option value="">{vendorName ? "Select PO number" : "First select vendor"}</option>{vendorOrders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}</select></Field>
                        <Field label="Reference"><input readOnly value={selected?.reference || ""} placeholder="Auto-filled from PO" className={`${input} bg-slate-50`} /></Field>
                        <Field label="Vendor Code"><input readOnly value={selected?.vendor_code || ""} placeholder="Auto-filled from PO" className={`${input} bg-slate-50`} /></Field>
                        <Field label="PO Date"><input readOnly value={selected?.po_date || ""} className={`${input} bg-slate-50`} /></Field>
                        <Field label="PO Status"><input readOnly value={selected?.status || ""} className={`${input} bg-slate-50`} /></Field>
                        <Field label="GST Rate (from PO)"><input readOnly value={selected ? `${gstRate}%` : ""} placeholder="Auto-filled from PO" className={`${input} bg-slate-50`} /></Field>
                    </div>
                </section>

                <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-bold">Invoice & Bill Details</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Enter supplier invoice information and attach the bill.</p>
                    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Field label="Invoice Date *"><input required disabled={!admin} type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={input} /></Field>
                        <Field label="Invoice Number *"><input required disabled={!admin} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Enter invoice number" className={input} /></Field>
                        <Field label="Freight Charge"><input disabled={!admin} type="number" min="0" step="0.01" value={freightCharge} onChange={e => setFreightCharge(e.target.value)} className={input} /></Field>
                        <Field label="Bill Upload">
                            <label className={`${input} flex cursor-pointer items-center gap-2 ${!admin ? "cursor-not-allowed opacity-60" : ""}`}>
                                <Upload className="h-4 w-4 text-cyan-700" /><span className="truncate">{bill?.name || "Upload bill / invoice"}</span>
                                <input disabled={!admin} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={e => setBill(e.target.files?.[0] || null)} />
                            </label>
                        </Field>
                    </div>
                    <Field label="Remarks"><textarea disabled={!admin} value={remarks} onChange={e => setRemarks(e.target.value)} className="mt-1.5 min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-cyan-500" placeholder="Delivery challan, condition or other remarks" /></Field>
                </section>

                <section className="mt-6 overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b p-5">
                        <div><h2 className="font-bold">PO Item Details</h2><p className="text-xs text-muted-foreground">Items are loaded from the selected PO. Edit only received quantity if needed.</p></div>
                        <FileUp className="h-5 w-5 text-cyan-700" />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[850px] text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                                <tr><th className="w-14 px-4 py-3 text-center">S.No.</th><th className="px-4 py-3">Item Description</th><th className="px-4 py-3 text-right">Ordered Qty</th><th className="px-4 py-3 text-right">Received Qty</th><th className="px-4 py-3">U/M</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3 text-right">Amount</th></tr>
                            </thead>
                            <tbody>
                                {lines.length ? lines.map((line, idx) => (
                                    <tr key={`${line.item_description}-${idx}`} className="border-t">
                                        <td className="px-4 py-3 text-center text-muted-foreground">{idx + 1}</td>
                                        <td className="px-4 py-3 font-medium">{line.item_description}</td>
                                        <td className="px-4 py-3 text-right">{line.ordered_quantity}</td>
                                        <td className="px-4 py-2"><input disabled={!admin} type="number" min="0" step="0.01" max={line.ordered_quantity} value={line.received_quantity} onChange={e => updateLine(idx, e.target.value)} className="h-9 w-full rounded border border-slate-200 px-2 text-right" /></td>
                                        <td className="px-4 py-3">{line.uom}</td>
                                        <td className="px-4 py-3 text-right">{money(line.unit_rate)}</td>
                                        <td className="px-4 py-3 text-right font-semibold">{money(Number(line.received_quantity || 0) * Number(line.unit_rate || 0))}</td>
                                    </tr>
                                )) : <tr><td colSpan="7" className="px-4 py-14 text-center text-muted-foreground">Select a Purchase Order to load its item details.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap justify-end gap-4 border-t bg-slate-50 p-4 text-sm">
                        <div><span className="text-muted-foreground">Taxable Amount: </span><strong>{money(taxableAmount)}</strong></div>
                        <div><span className="text-muted-foreground">Freight Charge: </span><strong>{money(freightAmount)}</strong></div>
                        <div><span className="text-muted-foreground">GST ({gstRate}%): </span><strong>{money(gstAmount)}</strong></div>
                        <div><span className="text-muted-foreground">Total incl. GST: </span><strong>{money(taxableAmount + freightAmount + gstAmount)}</strong></div>
                    </div>
                </section>

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setEntryMode(false)}>Cancel</Button>
                    {admin && (
                        <Button disabled={save.isPending || uploadBill.isPending || !selected} onClick={() => save.mutate()}>
                            <Save className="mr-2 h-4 w-4" />
                            {save.isPending ? "Saving…" : uploadBill.isPending ? "Uploading bill…" : "Save Materials Received"}
                        </Button>
                    )}
                </div>
            </div>
        </main>
    );
}
