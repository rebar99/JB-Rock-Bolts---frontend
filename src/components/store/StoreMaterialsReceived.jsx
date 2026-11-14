import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, FileText, FileUp, PackageCheck, Pencil, Plus, Save, Trash2, Upload, CreditCard, X, Calendar, AlertCircle, Clock, CheckCircle2, ChevronDown, ChevronUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createStoreMaterialReceipt, deleteStoreMaterialReceipt, fetchStoreMaterialReceipts, patchStoreMaterialReceiptBill, patchStoreMaterialReceiptPayment, resolveFileUrl, updateStoreMaterialReceipt, uploadStoreMaterialReceiptBill } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/currentUser";

const today = () => new Date().toISOString().slice(0, 10);
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
const Field = ({ label, children }) => <div className="block text-sm font-medium text-slate-700"><span>{label}</span>{children}</div>;

function fmtDateTime(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (isNaN(d)) return val;
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDate(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (isNaN(d)) return val;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function parsePaymentTermsDays(terms) {
    if (!terms) return null;
    const t = String(terms).trim().toLowerCase();
    if (t.includes("advance") || t.includes("dispatch") || t.includes("immediate")) return 0;
    const rangeMatch = t.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*day/);
    if (rangeMatch) return parseInt(rangeMatch[2], 10);
    const dayMatch = t.match(/(\d+)\s*day/);
    if (dayMatch) return parseInt(dayMatch[1], 10);
    const nums = t.match(/\d+/g);
    if (nums && nums.length > 0) return parseInt(nums[nums.length - 1], 10);
    return null;
}

function calculateDueDate(invDate, terms) {
    if (!invDate) return null;
    const days = parsePaymentTermsDays(terms);
    if (days === null) return null;
    const d = new Date(invDate);
    if (isNaN(d)) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Payment status badge colours */
const PAYMENT_COLORS = {
    "Upcoming":       "border-sky-300 bg-sky-50 text-sky-700",
    "Due Today":      "border-amber-400 bg-amber-50 text-amber-800 font-extrabold shadow-sm",
    "Overdue":        "border-rose-300 bg-rose-50 text-rose-700 font-extrabold shadow-sm",
    "Partially Paid": "border-orange-300 bg-orange-50 text-orange-700",
    "Paid":           "border-emerald-300 bg-emerald-50 text-emerald-700",
    "Unpaid":         "border-slate-300 bg-slate-50 text-slate-700",
};

function PaymentBadge({ status, isOverdue, daysOverdue, daysRemaining }) {
    const st = status || "Upcoming";
    let subtext = "";
    if (st === "Overdue" || isOverdue) {
        if (daysOverdue > 0) subtext = `(${daysOverdue}d overdue)`;
    } else if (st === "Due Today") {
        subtext = "(Today)";
    } else if (st === "Upcoming" && daysRemaining !== undefined && daysRemaining !== null && daysRemaining > 0) {
        subtext = `(in ${daysRemaining}d)`;
    }

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${PAYMENT_COLORS[st] || PAYMENT_COLORS["Upcoming"]}`}>
            <span>{st}</span>
            {subtext && <span className="text-[10px] opacity-80">{subtext}</span>}
        </span>
    );
}

/** Payment edit dialog */
function PaymentDialog({ receipt, onClose, onSave, isSaving }) {
    const invoiceTotal = Number(receipt?.invoice_total || 0);
    const [status, setStatus]   = useState(receipt?.payment_status || "Upcoming");
    const [amount, setAmount]   = useState(String(receipt?.amount_paid || 0));
    const [pDate, setPDate]     = useState(receipt?.payment_date || today());
    const [dueDate, setDueDate] = useState(receipt?.payment_due_date || "");
    const [ref, setRef]         = useState(receipt?.payment_reference || "");

    useEffect(() => {
        if (receipt) {
            setStatus(receipt.payment_status || "Upcoming");
            setAmount(String(receipt.amount_paid || 0));
            setPDate(receipt.payment_date || today());
            setDueDate(receipt.payment_due_date || "");
            setRef(receipt.payment_reference || "");
        }
    }, [receipt]);

    const balance = invoiceTotal - Number(amount || 0);

    const handleAmountChange = val => {
        setAmount(val);
        const num = Number(val || 0);
        if (num >= invoiceTotal && invoiceTotal > 0) {
            setStatus("Paid");
        } else if (num > 0) {
            setStatus("Partially Paid");
        } else {
            const dd = dueDate || receipt?.payment_due_date;
            const curToday = today();
            if (dd) {
                if (dd < curToday) setStatus("Overdue");
                else if (dd === curToday) setStatus("Due Today");
                else setStatus("Upcoming");
            } else {
                setStatus("Upcoming");
            }
        }
    };

    return (
        <Dialog open={!!receipt} onOpenChange={open => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-cyan-700" /> Update Payment
                    </DialogTitle>
                    <DialogDescription>
                        Invoice {receipt?.invoice_number} — {receipt?.vendor_name} ({receipt?.order_number})
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Invoice & Payment terms summary */}
                    <div className="rounded-lg border bg-slate-50 p-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <span className="text-muted-foreground block">Material Received Date</span>
                            <span className="font-semibold text-slate-800">{fmtDate(receipt?.invoice_date)}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">PO Payment Terms</span>
                            <span className="font-semibold text-cyan-700">{receipt?.payment_terms || "Not specified in PO"}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">Invoice Total</span>
                            <span className="font-bold text-slate-900 text-sm">{money(invoiceTotal)}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">Balance Pending</span>
                            <span className={`font-bold text-sm ${balance <= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {money(Math.max(0, balance))}
                            </span>
                        </div>
                    </div>

                    {/* Payment Due Date */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Payment Due Date
                            <span className="text-xs font-normal text-muted-foreground ml-1.5">(Auto-calculated from Received Date + Payment Terms)</span>
                        </label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                            className={input}
                        />
                    </div>

                    {/* Amount Paid */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Amount Paid (₹)</label>
                        <input
                            type="number" min="0" step="0.01" max={invoiceTotal}
                            value={amount} onChange={e => handleAmountChange(e.target.value)}
                            className={input} placeholder="0.00"
                        />
                        <div className="mt-1 flex items-center justify-between text-xs">
                            <span className={balance <= 0 ? "text-emerald-600 font-semibold" : "text-amber-600 font-medium"}>
                                Balance Due: {money(Math.max(0, balance))}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleAmountChange(String(invoiceTotal))}
                                className="text-cyan-700 hover:underline font-semibold"
                            >
                                Pay Full Amount ({money(invoiceTotal)})
                            </button>
                        </div>
                    </div>

                    {/* Payment Status */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment Status *</label>
                        <select value={status} onChange={e => setStatus(e.target.value)} className={input}>
                            <option value="Upcoming">Upcoming (Future due date)</option>
                            <option value="Due Today">Due Today</option>
                            <option value="Overdue">Overdue (Past due date & pending)</option>
                            <option value="Partially Paid">Partially Paid (Partial amount paid)</option>
                            <option value="Paid">Paid (Full payment completed)</option>
                            <option value="Unpaid">Unpaid</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Payment Date */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
                            <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} className={input} />
                        </div>

                        {/* Reference */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Reference (UTR / Cheque / NEFT)</label>
                            <input
                                type="text" value={ref} onChange={e => setRef(e.target.value)}
                                className={input} placeholder="e.g. UTR-20261112-987"
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={isSaving}
                        onClick={() => onSave({
                            payment_status: status,
                            amount_paid: Number(amount || 0),
                            payment_date: pDate || null,
                            payment_reference: ref || null,
                            payment_due_date: dueDate || null
                        })}
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
        <div className="mt-4 border-t pt-3 flex flex-wrap items-start gap-8 sm:gap-12">
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

function MaterialsReceivedList({ admin, isLoading, onAdd, onBack, onDelete, onEdit, onDeleteBill, onView, onPayment, receipts }) {
    const [filterStatus, setFilterStatus] = useState("All");
    const [search, setSearch] = useState("");
    const [expandedItems, setExpandedItems] = useState({});

    const counts = useMemo(() => {
        const c = { All: receipts.length, Overdue: 0, "Due Today": 0, Upcoming: 0, "Partially Paid": 0, Paid: 0 };
        receipts.forEach(r => {
            if (r.payment_status === "Paid") c.Paid++;
            else if (r.payment_status === "Partially Paid") c["Partially Paid"]++;
            else if (r.payment_status === "Due Today") c["Due Today"]++;
            else if (r.payment_status === "Overdue" || r.is_overdue) c.Overdue++;
            else c.Upcoming++;
        });
        return c;
    }, [receipts]);

    const filteredReceipts = useMemo(() => {
        let list = receipts;
        if (filterStatus === "Overdue") {
            list = list.filter(r => r.payment_status === "Overdue" || r.is_overdue);
        } else if (filterStatus !== "All") {
            list = list.filter(r => r.payment_status === filterStatus);
        }

        const q = search.trim().toLowerCase();
        if (!q) return list;

        return list.filter(r => {
            const vendor = (r.vendor_name || r.supplier || "").toLowerCase();
            const po = (r.order_number || "").toLowerCase();
            const inv = (r.invoice_number || "").toLowerCase();
            const code = (r.vendor_code || "").toLowerCase();
            const ref = (r.reference || "").toLowerCase();
            const remarks = (r.remarks || "").toLowerCase();
            const items = (r.lines || []).map(l => l.item_description || "").join(" ").toLowerCase();
            const date = (r.invoice_date || "").toLowerCase();
            const createdBy = (r.created_by || "").toLowerCase();

            return vendor.includes(q) ||
                po.includes(q) ||
                inv.includes(q) ||
                code.includes(q) ||
                ref.includes(q) ||
                remarks.includes(q) ||
                items.includes(q) ||
                date.includes(q) ||
                createdBy.includes(q);
        });
    }, [receipts, filterStatus, search]);

    return (
        <main className="min-h-[calc(100vh-4rem)] w-full bg-slate-50 px-4 py-7 sm:px-6 lg:px-8">
            <div className="w-full">
                {/* Header */}
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-cyan-700">Purchase Order</p>
                        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Materials Received</h1>
                        <p className="mt-2 text-sm text-muted-foreground">Review supplier invoices, received quantities, and automated payment due dates against Purchase Orders.</p>

                        {/* Status Filter Pills */}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            {[
                                { label: "All", count: counts.All, color: "hover:bg-slate-100" },
                                { label: "Overdue", count: counts.Overdue, color: "text-rose-700 bg-rose-50 border-rose-200" },
                                { label: "Due Today", count: counts["Due Today"], color: "text-amber-800 bg-amber-50 border-amber-300" },
                                { label: "Upcoming", count: counts.Upcoming, color: "text-sky-700 bg-sky-50 border-sky-200" },
                                { label: "Partially Paid", count: counts["Partially Paid"], color: "text-orange-700 bg-orange-50 border-orange-200" },
                                { label: "Paid", count: counts.Paid, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                            ].map(item => (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => setFilterStatus(item.label)}
                                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                        filterStatus === item.label
                                            ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                                            : `${item.color || "bg-white text-slate-700 border-slate-200"}`
                                    }`}
                                >
                                    <span>{item.label}</span>
                                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                        filterStatus === item.label ? "bg-white/20 text-white" : "bg-black/5"
                                    }`}>
                                        {item.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {onBack && <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Purchase Order List</Button>}
                        {admin && <Button onClick={onAdd} className="bg-gradient-primary shadow-elegant hover:opacity-90"><Plus className="mr-2 h-4 w-4" />Add Material Received</Button>}
                    </div>
                </div>

                {/* Search Bar */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                            type="text"
                            placeholder="Search vendor, invoice, PO number, item description..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-10 pl-9 pr-9 text-sm bg-white border-slate-200 rounded-lg shadow-sm focus-visible:ring-cyan-500"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                title="Clear search"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {search && (
                        <p className="text-xs text-slate-500">
                            Showing <strong className="text-slate-800">{filteredReceipts.length}</strong> of {receipts.length} receipts
                        </p>
                    )}
                </div>

                {/* List */}
                <div className="mt-5 space-y-4">
                    {isLoading ? (
                        <div className="rounded-xl border bg-white p-12 text-center text-muted-foreground">Loading records…</div>
                    ) : filteredReceipts.length ? filteredReceipts.map((receipt, index) => {
                        const totalQty = (receipt.lines || []).reduce((sum, line) => sum + Number(line.received_quantity || 0), 0);
                        const totalAmount = (receipt.lines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);
                        const freightCharge = Number(receipt.freight_charge || 0);
                        const gstAmount = Number(receipt.gst_amount || 0);
                        const invoiceTotal = Number(receipt.invoice_total ?? totalAmount + freightCharge + gstAmount);
                        const items = (receipt.lines || []).map(line => line.item_description).join(", ");
                        const balance = invoiceTotal - Number(receipt.amount_paid || 0);
                        const isExpanded = !!expandedItems[receipt.id];
                        const lineCount = receipt.lines?.length || 0;

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
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" /> Received: {fmtDate(receipt.invoice_date)}
                                                </span>
                                                {receipt.payment_due_date && (
                                                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded flex items-center gap-1 ${
                                                        receipt.is_overdue || receipt.payment_status === "Overdue"
                                                            ? "bg-rose-100 text-rose-700 border border-rose-200"
                                                            : receipt.payment_status === "Due Today"
                                                            ? "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                                                            : receipt.payment_status === "Paid"
                                                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                                            : "bg-sky-100 text-sky-700 border border-sky-200"
                                                    }`}>
                                                        <Clock className="h-3 w-3" /> Due: {fmtDate(receipt.payment_due_date)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                        Items ({lineCount})
                                                    </span>
                                                    {lineCount > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedItems(prev => ({ ...prev, [receipt.id]: !prev[receipt.id] }))}
                                                            className="inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-xs font-semibold text-cyan-700 transition cursor-pointer"
                                                            title={isExpanded ? "Collapse item list" : "Click arrow to show all items"}
                                                        >
                                                            <span>{isExpanded ? "Collapse" : `View all ${lineCount} items`}</span>
                                                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                        </button>
                                                    )}
                                                </div>

                                                {!isExpanded ? (
                                                    <p className="mt-1 text-sm font-medium text-slate-800">
                                                        {receipt.lines?.[0]?.item_description || items || "—"}
                                                        {lineCount > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedItems(prev => ({ ...prev, [receipt.id]: true }))}
                                                                className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-cyan-700 hover:underline cursor-pointer"
                                                            >
                                                                <span>(+ {lineCount - 1} more)</span>
                                                                <ChevronDown className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </p>
                                                ) : (
                                                    <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                                                        <div className="space-y-1.5">
                                                            {(receipt.lines || []).map((line, lIdx) => (
                                                                <div key={line.id || lIdx} className="flex items-start gap-2 text-xs">
                                                                    <span className="shrink-0 font-bold text-slate-400 w-5 text-right">{lIdx + 1}.</span>
                                                                    <span className="font-medium text-slate-900">{line.item_description}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1">
                                        <span className="mr-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Received</span>
                                        <PaymentBadge status={receipt.payment_status} isOverdue={receipt.is_overdue} daysOverdue={receipt.days_overdue} daysRemaining={receipt.days_remaining} />
                                        <Button type="button" variant="ghost" size="icon" title="View material receipt" onClick={() => onView(receipt)}><Eye className="h-4 w-4" /></Button>
                                        {admin && <Button type="button" variant="ghost" size="icon" title="Edit material receipt" onClick={() => onEdit(receipt)}><Pencil className="h-4 w-4" /></Button>}
                                        {receipt.bill_file_url && (
                                            <a
                                                title="View Bill"
                                                className="grid h-9 w-9 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800 transition-colors"
                                                href={resolveFileUrl(receipt.bill_file_url)}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <FileText className="h-4 w-4" />
                                            </a>
                                        )}
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
                                <div className="mt-4 rounded-lg border bg-slate-50 px-4 py-3 grid grid-cols-2 gap-4 sm:grid-cols-5 text-sm">
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Payment Status</p>
                                        <p className="mt-0.5"><PaymentBadge status={receipt.payment_status} isOverdue={receipt.is_overdue} daysOverdue={receipt.days_overdue} daysRemaining={receipt.days_remaining} /></p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Payment Due Date</p>
                                        <p className="mt-0.5 font-bold text-slate-800">{receipt.payment_due_date ? fmtDate(receipt.payment_due_date) : "—"}</p>
                                        <p className="text-[11px] text-muted-foreground truncate">{receipt.payment_terms || "As per PO"}</p>
                                        {receipt.is_overdue || receipt.payment_status === "Overdue" ? (
                                            <span className="text-[11px] font-bold text-rose-600 flex items-center gap-0.5 mt-0.5">
                                                <AlertCircle className="h-3 w-3" /> Overdue by {receipt.days_overdue || 1}d
                                            </span>
                                        ) : receipt.payment_status === "Due Today" ? (
                                            <span className="text-[11px] font-bold text-amber-600 flex items-center gap-0.5 mt-0.5">
                                                <Clock className="h-3 w-3" /> Due Today
                                            </span>
                                        ) : receipt.payment_status === "Paid" ? (
                                            <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-0.5 mt-0.5">
                                                <CheckCircle2 className="h-3 w-3" /> Paid
                                            </span>
                                        ) : receipt.days_remaining ? (
                                            <span className="text-[11px] text-sky-600 mt-0.5">Due in {receipt.days_remaining}d</span>
                                        ) : null}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount Paid</p>
                                        <p className="mt-0.5 font-semibold text-emerald-700">{money(receipt.amount_paid || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Balance Due</p>
                                        <p className={`mt-0.5 font-bold ${balance > 0 ? (receipt.is_overdue || receipt.payment_status === "Overdue" ? "text-rose-600" : "text-amber-600") : "text-emerald-600"}`}>
                                            {money(Math.max(0, balance))}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Payment Date</p>
                                        <p className="mt-0.5 font-semibold text-slate-700">{receipt.payment_date ? fmtDate(receipt.payment_date) : "—"}</p>
                                        {receipt.payment_reference && <p className="text-[11px] text-muted-foreground truncate">{receipt.payment_reference}</p>}
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
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
                            <p className="font-semibold text-slate-700">
                                {search
                                    ? `No materials received found matching "${search}".`
                                    : filterStatus === "All"
                                        ? "No material receipt records yet. Use Add Material Received to create the first entry."
                                        : `No receipts found with status '${filterStatus}'.`}
                            </p>
                            {search && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Try searching with a different vendor name, invoice number, or PO number.
                                </p>
                            )}
                            {search && (
                                <Button variant="outline" size="sm" onClick={() => setSearch("")} className="mt-4">
                                    Clear Search
                                </Button>
                            )}
                        </div>
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
                    <div className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-cyan-700" /> Payment & Due Date Details</p>
                            <PaymentBadge status={receipt.payment_status} isOverdue={receipt.is_overdue} daysOverdue={receipt.days_overdue} daysRemaining={receipt.days_remaining} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 rounded-lg bg-slate-50 p-3 text-sm">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">PO Payment Terms</p>
                                <p className="mt-1 font-semibold text-cyan-700">{receipt.payment_terms || "Not specified"}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment Due Date</p>
                                <p className="mt-1 font-bold text-slate-900">{receipt.payment_due_date ? fmtDate(receipt.payment_due_date) : "—"}</p>
                                {receipt.is_overdue || receipt.payment_status === "Overdue" ? (
                                    <span className="text-xs font-bold text-rose-600 flex items-center gap-1 mt-0.5">
                                        <AlertCircle className="h-3 w-3" /> Overdue by {receipt.days_overdue || 1} days
                                    </span>
                                ) : receipt.payment_status === "Due Today" ? (
                                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5">
                                        <Clock className="h-3 w-3" /> Due Today
                                    </span>
                                ) : receipt.payment_status === "Paid" ? (
                                    <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 mt-0.5">
                                        <CheckCircle2 className="h-3 w-3" /> Paid in full
                                    </span>
                                ) : receipt.days_remaining ? (
                                    <span className="text-xs text-sky-600 mt-0.5">Due in {receipt.days_remaining} days</span>
                                ) : null}
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount Paid</p>
                                <p className="mt-1 font-bold text-emerald-700">{money(receipt.amount_paid || 0)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance Pending</p>
                                <p className={`mt-1 font-bold ${balance > 0 ? (receipt.is_overdue || receipt.payment_status === "Overdue" ? "text-rose-600" : "text-amber-600") : "text-emerald-600"}`}>
                                    {money(Math.max(0, balance))}
                                </p>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 text-xs">
                            <div>
                                <span className="text-muted-foreground">Payment Date: </span>
                                <span className="font-semibold text-slate-800">{receipt.payment_date ? fmtDate(receipt.payment_date) : "—"}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Payment Reference: </span>
                                <span className="font-semibold text-slate-800">{receipt.payment_reference || "—"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Attached Bill section */}
                    {receipt.bill_file_url && (
                        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                            <div className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-emerald-600" />
                                <div>
                                    <p className="font-semibold text-slate-800">Attached Bill / Invoice</p>
                                    <p className="text-xs text-muted-foreground">Original invoice document uploaded for this receipt</p>
                                </div>
                            </div>
                            <a
                                href={resolveFileUrl(receipt.bill_file_url)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                            >
                                <Eye className="h-4 w-4" /> View Bill
                            </a>
                        </div>
                    )}

                    {/* Remarks */}
                    {receipt.remarks && (
                        <div className="rounded-lg border p-4">
                            <p className="font-semibold">Remarks</p>
                            <p className="mt-1 text-muted-foreground">{receipt.remarks}</p>
                        </div>
                    )}

                    {/* Created / Updated by */}
                    <div className="rounded-lg border bg-slate-50 p-4 flex flex-wrap items-start gap-8 sm:gap-12">
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
    const approvedOrders = useMemo(() => orders.filter(o => ["Approved", "Final Approved", "Finally Approved"].includes(o.status)), [orders]);
    const vendors        = useMemo(() => [...new Set(approvedOrders.map(o => o.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [approvedOrders]);
    const vendorOrders   = useMemo(() => approvedOrders.filter(o => o.supplier === vendorName), [approvedOrders, vendorName]);

    const activeTerms = selected?.payment_terms || editingReceipt?.payment_terms || "";
    const activeTermsDays = parsePaymentTermsDays(activeTerms);
    const calculatedDueDate = calculateDueDate(invoiceDate, activeTerms);

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
            (r.lines || []).forEach(line => {
                // Use description + rate as key so same-name items with different rates are tracked separately
                const key = `${String(line.item_description || "").trim().toLowerCase()}||${Number(line.unit_rate || 0)}`;
                totals[key] = (totals[key] || 0) + Number(line.received_quantity || 0);
            });
            return totals;
        }, {});
        setLines((order?.items || []).map(line => {
            const ordered   = Number(line.quantity || 0);
            const key = `${String(line.item_description || "").trim().toLowerCase()}||${Number(line.unit_rate || 0)}`;
            const alreadyReceived = receivedByItem[key] || 0;
            const remaining = Math.max(0, ordered - alreadyReceived);
            return {
                item_description: line.item_description,
                ordered_quantity: ordered,
                received_quantity: 0,
                remaining_quantity: remaining,
                uom: line.uom || "Nos",
                unit_rate: Number(line.unit_rate || 0)
            };
        }));
    };

    const uploadBill = useMutation({ mutationFn: uploadStoreMaterialReceiptBill, onError: e => toast.error(e.message) });

    const save = useMutation({
        mutationFn: async () => {
            if (!selected)              throw new Error("Select a Purchase Order.");
            if (!invoiceNumber.trim())  throw new Error("Invoice number is required.");
            if (!lines.length)          throw new Error("Selected PO has no item lines.");
            const uploaded = bill ? await uploadBill.mutateAsync(bill) : null;
            const finalBillUrl = uploaded ? uploaded.file_url : (existingBillUrl || null);
            const payload  = { 
                order_id: selected.id, 
                invoice_date: invoiceDate, 
                invoice_number: invoiceNumber.trim(), 
                freight_charge: freightAmount, 
                bill_file_url: finalBillUrl, 
                payment_due_date: calculatedDueDate || null,
                remarks, 
                lines: lines.map(l => ({ ...l, ordered_quantity: Number(l.ordered_quantity || 0), received_quantity: Number(l.received_quantity || 0), unit_rate: Number(l.unit_rate || 0) })) 
            };
            return editingReceipt ? updateStoreMaterialReceipt(editingReceipt.id, payload) : createStoreMaterialReceipt(payload);
        },
        onSuccess: () => {
            invalidate();
            client.invalidateQueries({ queryKey: ["store-inventory"] });
            client.invalidateQueries({ queryKey: ["store-dashboard"] });
            toast.success(editingReceipt ? "Material receipt updated successfully." : "Materials received saved. Inventory and PO received quantities were updated.");
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
        onSuccess: () => {
            invalidate();
            client.invalidateQueries({ queryKey: ["store-inventory"] });
            client.invalidateQueries({ queryKey: ["store-dashboard"] });
            toast.success("Material receipt deleted. Inventory quantity reversed successfully.");
        },
        onError: e => toast.error(e.message),
    });

    const removeBill = useMutation({
        mutationFn: async receipt => {
            return patchStoreMaterialReceiptBill(receipt.id, { file_url: null, updated_by: getCurrentUser() });
        },
        onSuccess: () => { invalidate(); toast.success("Bill deleted successfully."); },
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
                onAdd={() => {
                    setEditingReceipt(null); setExistingBillUrl(null); setVendorName(""); setSelectedId("");
                    setInvoiceDate(today()); setInvoiceNumber(""); setBill(null); setFreightCharge("0"); setLines([]); setRemarks("");
                    setEntryMode(true);
                }}
                onBack={onBack}
                onView={setViewingReceipt} onEdit={openEdit}
                onDeleteBill={receipt => removeBill.mutate(receipt)}
                onPayment={setPaymentReceipt}
                onDelete={receipt => {
                    const inv = receipt.invoice_number ? `Invoice #${receipt.invoice_number}` : "this receipt";
                    if (window.confirm(
                        `Delete Materials Received — ${inv}?\n\n` +
                        `This will:\n` +
                        `• Reverse the received quantity from Inventory\n` +
                        `• Automatically adjust the stock balance\n` +
                        `• Allow the linked PO to be deleted (if no other receipts remain)\n\n` +
                        `Are you sure you want to continue?`
                    )) removeReceipt.mutate(receipt.id);
                }}
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
                        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{editingReceipt ? "Edit Material Received" : "Add Material Received"}</h1>
                        <p className="mt-2 text-sm text-muted-foreground">{editingReceipt ? "Update supplier invoice, bill and received quantities." : "Record supplier invoice and received quantities against a Purchase Order."}</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => setEntryMode(false)}><ArrowLeft className="mr-2 h-4 w-4" />Materials Received List</Button>
                </div>

                {!admin && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">You have view-only access. Only Store Admin can save materials received.</div>}

                <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                    <div className="flex items-center gap-3 border-b pb-4">
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><PackageCheck className="h-5 w-5" /></div>
                        <div><h2 className="font-bold">Vendor & PO Details</h2><p className="text-xs text-muted-foreground">First select vendor, then select a PO number to auto-fill the remaining details.</p></div>
                    </div>
                    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Field label="Vendor Name / M/S. *"><select required disabled={!admin} value={vendorName} onChange={e => chooseVendor(e.target.value)} className={input}><option value="">Select vendor</option>{vendors.map(v => <option key={v} value={v}>{v}</option>)}</select></Field>
                        <Field label="Purchase Order Number *"><select required disabled={!admin || !vendorName} value={selectedId} onChange={e => chooseOrder(e.target.value)} className={input}><option value="">{vendorName ? "Select PO number" : "First select vendor"}</option>{vendorOrders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}</select></Field>
                        <Field label="Reference"><input readOnly value={selected?.reference || ""} placeholder="Auto-filled from PO" className={`${input} bg-slate-50`} /></Field>
                        <Field label="Vendor Code"><input readOnly value={selected?.vendor_code || ""} placeholder="Auto-filled from PO" className={`${input} bg-slate-50`} /></Field>
                        <Field label="PO Date"><input readOnly value={selected?.po_date || ""} className={`${input} bg-slate-50`} /></Field>
                        <Field label="PO Status"><input readOnly value={selected?.status || ""} className={`${input} bg-slate-50`} /></Field>
                        <Field label="GST Rate (from PO)"><input readOnly value={selected ? `${gstRate}%` : ""} placeholder="Auto-filled from PO" className={`${input} bg-slate-50`} /></Field>
                        <Field label="Payment Terms (from PO)"><input readOnly value={activeTerms || ""} placeholder="Auto-filled from PO" className={`${input} bg-slate-50 font-semibold text-cyan-800`} /></Field>
                    </div>
                </section>

                <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-bold">Invoice & Bill Details</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Enter supplier invoice information, verify the auto-calculated payment due date, and attach the bill.</p>
                    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                        <Field label="Invoice Date (Received Date) *"><input required disabled={!admin} type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={input} /></Field>
                        <Field label="Payment Due Date (Auto-calculated)">
                            <div className={`${input} flex items-center justify-between bg-slate-50 font-semibold ${calculatedDueDate ? "text-cyan-800 border-cyan-300" : "text-muted-foreground"}`}>
                                <span className="flex items-center gap-1.5 truncate">
                                    <Clock className="h-4 w-4 shrink-0 text-cyan-700" />
                                    {calculatedDueDate ? fmtDate(calculatedDueDate) : "Select PO & Date"}
                                </span>
                                {calculatedDueDate && (
                                    <span className="text-[11px] font-normal text-slate-500 shrink-0 ml-1">
                                        ({activeTermsDays !== null ? `+${activeTermsDays}d` : "PO terms"})
                                    </span>
                                )}
                            </div>
                        </Field>
                        <Field label="Invoice Number *"><input required disabled={!admin} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Enter invoice number" className={input} /></Field>
                        <Field label="Freight Charge"><input disabled={!admin} type="number" min="0" step="0.01" value={freightCharge} onChange={e => setFreightCharge(e.target.value)} className={input} /></Field>
                        <Field label="Bill Upload">
                            {bill ? (
                                <div className={`${input} flex items-center justify-between gap-2 border-emerald-300 bg-emerald-50/50`}>
                                    <button
                                        type="button"
                                        title="Click to preview selected bill"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            try {
                                                const objUrl = URL.createObjectURL(bill);
                                                window.open(objUrl, "_blank");
                                            } catch (err) {
                                                // ignore
                                            }
                                        }}
                                        className="flex items-center gap-1.5 min-w-0 truncate text-xs font-semibold text-emerald-800 hover:underline text-left cursor-pointer"
                                    >
                                        <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                                        <span className="truncate">{bill.name}</span>
                                    </button>
                                    {admin && (
                                        <button
                                            type="button"
                                            title="Delete / Remove bill"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setBill(null);
                                            }}
                                            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-100 transition shrink-0 cursor-pointer"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            ) : existingBillUrl ? (
                                <div className={`${input} flex items-center justify-between gap-2 border-slate-300 bg-slate-50`}>
                                    <a
                                        href={resolveFileUrl(existingBillUrl)}
                                        target="_blank"
                                        rel="noreferrer"
                                        title="Click to view attached bill"
                                        className="flex items-center gap-1.5 min-w-0 truncate text-xs font-semibold text-cyan-700 hover:underline cursor-pointer"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                                        <span className="truncate">Attached Bill</span>
                                    </a>
                                    {admin && (
                                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                            <label title="Replace attached bill" className="cursor-pointer text-xs font-semibold text-cyan-700 hover:text-cyan-800 hover:underline">
                                                Change
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                                                    onChange={e => setBill(e.target.files?.[0] || null)}
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                title="Delete / Remove bill"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    setExistingBillUrl(null);
                                                }}
                                                className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <label className={`${input} flex cursor-pointer items-center gap-2 ${!admin ? "cursor-not-allowed opacity-60" : ""}`}>
                                    <Upload className="h-4 w-4 text-cyan-700" />
                                    <span className="truncate text-muted-foreground">Upload bill / invoice</span>
                                    <input
                                        disabled={!admin}
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                                        onChange={e => setBill(e.target.files?.[0] || null)}
                                    />
                                </label>
                            )}
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
                                        <td className="px-4 py-2">
                                            {(() => {
                                                const pending = line.remaining_quantity != null ? line.remaining_quantity : line.ordered_quantity;
                                                return (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-right text-xs font-semibold text-red-600">
                                                            Pending: {Number(pending).toFixed(2)}
                                                        </span>
                                                        <input
                                                            disabled={!admin}
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            max={pending}
                                                            value={line.received_quantity}
                                                            onFocus={e => e.target.select()}
                                                            onChange={e => updateLine(idx, e.target.value)}
                                                            className="h-9 w-full rounded border border-slate-200 px-2 text-right focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                                                        />
                                                    </div>
                                                );
                                            })()}
                                        </td>
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
                            {save.isPending ? "Saving…" : uploadBill.isPending ? "Uploading bill…" : editingReceipt ? "Update Materials Received" : "Save Materials Received"}
                        </Button>
                    )}
                </div>
            </div>
        </main>
    );
}
