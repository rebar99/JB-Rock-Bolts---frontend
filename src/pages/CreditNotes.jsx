import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { inr, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import {
    fetchCreditNotes, createCreditNote, updateCreditNote, cancelCreditNote,
    fetchAllSalesForCN, fetchAllWOSalesForCN,
    fetchAlreadyCreditedSale, fetchAlreadyCreditedWOSale,
    fetchItemMasterList,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ItemCombobox } from "@/components/ItemCombobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Eye, Pencil, Trash2, Search, FileText, Info, Printer, ClipboardList } from "lucide-react";

const REASONS = [
    "Quantity Less", "Quantity Excess", "Wrong Quantity",
    "Wrong Amount", "Wrong Product",
    "Wrong Address", "GST Correction", "Other",
];

const STATUS_BADGE = {
    Issued: "bg-green-100 text-green-700 border-green-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
};

// What fields to show per reason
const REASON_CONFIG = {
    "Quantity Less":    { showItems: true,  qtyEditable: true,  rateEditable: false, gstEditable: false, showAddress: false },
    "Quantity Excess":  { showItems: true,  qtyEditable: true,  rateEditable: false, gstEditable: false, showAddress: false },
    "Wrong Quantity":   { showItems: true,  qtyEditable: true,  rateEditable: false, gstEditable: false, showAddress: false },
    "Wrong Amount":     { showItems: true,  qtyEditable: true,  rateEditable: true,  gstEditable: false, showAddress: false },
    "Wrong Product":    { showItems: true,  qtyEditable: true,  rateEditable: true,  productEditable: true, gstEditable: false, showAddress: false },
    "Wrong Address":    { showItems: false, qtyEditable: false, rateEditable: false, gstEditable: false, showAddress: true  },
    "GST Correction":   { showItems: true,  qtyEditable: true,  rateEditable: false, gstEditable: true,  showAddress: false },
    "Other":            { showItems: false, qtyEditable: false, rateEditable: false, gstEditable: false, showAddress: false },
};

const REASON_HINTS = {
    "Quantity Less":   "A lower quantity was delivered — enter the credit quantity for the shortfall.",
    "Quantity Excess": "An excess quantity was delivered — enter the credit quantity for the excess.",
    "Wrong Quantity":  "The invoiced quantity was incorrect — enter the correct credit quantity.",
    "Wrong Amount":    "The amount was incorrect — enter the credit quantity and rate.",
    "Wrong Product":   "An incorrect product was delivered or invoiced — select the correct product and enter the credit quantity.",
    "Wrong Address":   "The address was incorrect — review the original address below and enter the correct address in the note.",
    "GST Correction":  "The GST rate was incorrect — edit the correct GST rate here; the credit amount is calculated automatically.",
    "Other":           "For any other reason, provide the details in the note below.",
};

const calcItem = (it) => {
    const sub = parseFloat(it.credit_qty || 0) * parseFloat(it.unit_price || 0);
    const gst = sub * parseFloat(it.gst_rate || 0) / 100;
    return { ...it, subtotal: sub, gst_amount: gst, total_amount: sub + gst };
};

const today = () => new Date().toISOString().slice(0, 10);

const escapeHtml = (value) => String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const printCreditNote = (cn) => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
        toast.error("Please allow pop-ups to print the credit note.");
        return;
    }

    const itemRows = (cn.items || []).map(it => `
        <tr>
            <td>${escapeHtml(it.item)}</td><td>${escapeHtml(it.uom)}</td>
            <td class="number">${escapeHtml(it.original_qty)}</td><td class="number">${escapeHtml(it.credit_qty)}</td>
            <td class="number">${escapeHtml(inr(it.unit_price))}</td><td class="number">${escapeHtml(it.gst_rate)}%</td>
            <td class="number">${escapeHtml(inr(it.subtotal))}</td><td class="number">${escapeHtml(inr(it.gst_amount))}</td>
            <td class="number">${escapeHtml(inr(it.total_amount))}</td>
        </tr>`).join("");

    printWindow.document.write(`<!doctype html>
        <html><head><title>Credit Note ${escapeHtml(cn.cn_number)}</title>
        <style>
            body { font-family: Arial, sans-serif; color: #172033; margin: 36px; font-size: 12px; }
            h1 { margin: 0 0 6px; font-size: 24px; } .muted { color: #5f6b7a; }
            .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 28px 0; }
            .meta b { display: block; font-size: 10px; color: #5f6b7a; text-transform: uppercase; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; } th, td { border: 1px solid #d5dbe5; padding: 8px; text-align: left; }
            th { background: #f3f5f8; font-size: 10px; text-transform: uppercase; } .number { text-align: right; }
            .totals { margin: 20px 0 0 auto; width: 260px; } .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
            .total { border-top: 1px solid #172033; font-size: 14px; font-weight: bold; }
            @media print { body { margin: 20px; } }
        </style></head><body>
        <h1>Credit Note</h1><div class="muted">${escapeHtml(cn.cn_number)}</div>
        <div class="meta">
            <div><b>Credit Note Date</b>${escapeHtml(fmtDate(cn.cn_date))}</div>
            <div><b>Invoice Number</b>${escapeHtml(cn.invoice_number)}</div>
            <div><b>PO / WO Number</b>${escapeHtml(cn.po_number)}</div>
            <div><b>Client</b>${escapeHtml(cn.client_name)}</div>
            <div><b>Project</b>${escapeHtml(cn.project)}</div>
            <div><b>Reason</b>${escapeHtml(cn.reason)}</div>
        </div>
        ${itemRows ? `<table><thead><tr><th>Product</th><th>UOM</th><th>Orig Qty</th><th>Credit Qty</th><th>Rate</th><th>GST%</th><th>Taxable</th><th>GST Amt</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table>` : ""}
        <div class="totals"><div><span>Taxable Amount</span><span>${escapeHtml(inr(cn.taxable_amount))}</span></div><div><span>GST Amount</span><span>${escapeHtml(inr(cn.gst_amount))}</span></div><div class="total"><span>Credit Note Total</span><span>${escapeHtml(inr(cn.total_amount))}</span></div></div>
        </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
};

function ReasonHint({ reason }) {
    if (!reason || !REASON_HINTS[reason]) return null;
    return (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{REASON_HINTS[reason]}</span>
        </div>
    );
}

// ---- CN Form ----------------------------------------------------------------
function CreditNoteForm({ saleType, editing, onClose }) {
    const { user } = useAuth();
    const qc = useQueryClient();

    const { data: poSales = [] } = useQuery({ queryKey: ["all-sales-for-cn"], queryFn: fetchAllSalesForCN, enabled: saleType === "PO" });
    const { data: woSales = [] } = useQuery({ queryKey: ["all-wo-sales-for-cn"], queryFn: fetchAllWOSalesForCN, enabled: saleType === "WO" });
    const { data: itemMasterList = [] } = useQuery({
        queryKey: ["item-master", saleType],
        queryFn: () => fetchItemMasterList(saleType),
    });
    const invoiceList = saleType === "PO" ? poSales : woSales;

    const [selectedSaleId, setSelectedSaleId] = useState(editing?.sale_id || editing?.wo_sale_id || null);
    const [manualEntry, setManualEntry] = useState(Boolean(editing && !(editing.sale_id || editing.wo_sale_id)));
    const [manualInvoice, setManualInvoice] = useState({
        invoice_number: editing?.invoice_number || "",
        po_number: editing?.po_number || "",
        client_name: editing?.client_name || "",
        project: editing?.project || "",
    });
    const [cnDate, setCnDate] = useState(editing?.cn_date || today());
    const [reason, setReason] = useState(editing?.reason || "");
    const [items, setItems] = useState(editing?.items?.map(it => ({ ...it, source_item: it.item })) || []);
    const [note, setNote] = useState("");
    const [search, setSearch] = useState("");

    const selectedSale = invoiceList.find(s => s.id === selectedSaleId);
    const cfg = REASON_CONFIG[reason] || {};

    const { data: alreadyCredited = [] } = useQuery({
        queryKey: ["already-credited", saleType, selectedSaleId],
        queryFn: () => saleType === "PO" ? fetchAlreadyCreditedSale(selectedSaleId) : fetchAlreadyCreditedWOSale(selectedSaleId),
        enabled: !!selectedSaleId,
    });
    const creditedMap = useMemo(() => {
        const m = {};
        alreadyCredited.forEach(x => { m[x.item] = x.already_credited_qty; });
        return m;
    }, [alreadyCredited]);

    const handleSaleSelect = (id) => {
        const numId = parseInt(id);
        setSelectedSaleId(numId);
        const sale = invoiceList.find(s => s.id === numId);
        if (!sale) return;
        setItems((sale.items || []).map(it => ({
            item: it.item,
            source_item: it.item,
            uom: it.uom || "Nos",
            original_qty: it.quantity || 0,
            credit_qty: 0,
            unit_price: parseFloat(it.unit_price) || 0,
            original_unit_price: parseFloat(it.unit_price) || 0,
            gst_rate: parseFloat(it.gst_rate) || 0,
            original_gst_rate: parseFloat(it.gst_rate) || 0,
            subtotal: 0,
            gst_amount: 0,
            total_amount: 0,
        })));
    };

    const updateItem = (idx, field, value) => {
        setItems(prev => {
            const next = [...prev];
            const itemValue = ["item", "uom"].includes(field) ? value : (value === "" ? 0 : (parseFloat(value) || 0));
            next[idx] = calcItem({ ...next[idx], [field]: itemValue });
            return next;
        });
    };

    const totals = useMemo(() => {
        // Positive Quantity Less input means a reduction; Quantity Excess
        // means an increase. Other reasons honour a manually typed +/- sign.
        const signedQty = (q) => reason === "Quantity Less" ? -Math.abs(q) : reason === "Quantity Excess" ? Math.abs(q) : q;
        const taxable = items.reduce((s, it) => s + signedQty(parseFloat(it.credit_qty || 0)) * parseFloat(it.unit_price || 0), 0);
        const gst = items.reduce((s, it) => {
            const sub = signedQty(parseFloat(it.credit_qty || 0)) * parseFloat(it.unit_price || 0);
            return s + sub * parseFloat(it.gst_rate || 0) / 100;
        }, 0);
        return { taxable, gst, total: taxable + gst };
    }, [items, reason]);

    const { mutate: save, isPending } = useMutation({
        mutationFn: (data) => editing ? updateCreditNote(editing.id, data) : createCreditNote(data),
        onSuccess: (cn) => {
            qc.invalidateQueries({ queryKey: ["credit-notes"] });
            qc.invalidateQueries({ queryKey: ["credit-notes-by-sale"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
            qc.invalidateQueries({ queryKey: ["report"] });
            qc.invalidateQueries({ queryKey: ["workOrderSalesReport"] });
            toast.success(editing ? "Credit Note updated" : `Credit Note ${cn.cn_number} created`);
            onClose();
        },
        onError: (e) => toast.error(e.message),
    });

    const handleSubmit = () => {
        if (!manualEntry && !selectedSaleId) return toast.error("Please select an invoice");
        if (manualEntry && (!manualInvoice.invoice_number.trim() || !manualInvoice.client_name.trim())) return toast.error("Manual invoice number and client name are required");
        if (!reason) return toast.error("Please select a reason");
        const activeItems = cfg.showItems
            ? items
                .filter(it => it.credit_qty !== 0 && it.credit_qty !== undefined)
                .map(({ source_item, original_unit_price, original_gst_rate, ...item }) => item)
            : [];
        if (cfg.showItems && activeItems.length === 0) return toast.error("At least one item must have a non-zero Credit Qty");

        save({
            cn_date: cnDate,
            sale_type: saleType,
            ...(!manualEntry && (saleType === "PO" ? { sale_id: selectedSaleId } : { wo_sale_id: selectedSaleId })),
            invoice_number: manualEntry ? manualInvoice.invoice_number : selectedSale?.invoice_number,
            po_number: manualEntry ? manualInvoice.po_number : (selectedSale?.po_number || selectedSale?.wo_number),
            client_name: manualEntry ? manualInvoice.client_name : (selectedSale?.client_name || ""),
            project: manualEntry ? manualInvoice.project : selectedSale?.project,
            reason,
            taxable_amount: cfg.showItems ? totals.taxable : 0,
            gst_amount: cfg.showItems ? totals.gst : 0,
            total_amount: cfg.showItems ? totals.total : 0,
            items: cfg.showItems ? activeItems : [],
            created_by: user?.username || user?.email,
        });
    };

    const filteredInvoices = useMemo(() => {
        const s = search.toLowerCase();
        return invoiceList.filter(inv =>
            (inv.invoice_number || "").toLowerCase().includes(s) ||
            (inv.client_name || "").toLowerCase().includes(s) ||
            (inv.po_number || inv.wo_number || "").toLowerCase().includes(s)
        ).sort((a, b) => {
            const invoiceComparison = (a.invoice_number || "").localeCompare(
                b.invoice_number || "",
                undefined,
                { numeric: true, sensitivity: "base" },
            );
            return invoiceComparison || a.id - b.id;
        });
    }, [invoiceList, search]);

    return (
        <div className="space-y-5">

            {/* STEP 1 - Invoice */}
            <div className="rounded-lg border border-border p-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 1 &mdash; Invoice</h4>
                {!editing && <div className="flex gap-2">
                    <Button type="button" variant={!manualEntry ? "default" : "outline"} size="sm" onClick={() => setManualEntry(false)}>Select Invoice</Button>
                    <Button type="button" variant={manualEntry ? "default" : "outline"} size="sm" onClick={() => { setManualEntry(true); setSelectedSaleId(null); setItems([]); }}>Manual Invoice Entry</Button>
                </div>}
                {!manualEntry ? <>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search invoice / client / PO..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={selectedSaleId?.toString() || ""} onValueChange={handleSaleSelect} disabled={!!editing}>
                    <SelectTrigger><SelectValue placeholder="Select invoice number..." /></SelectTrigger>
                    <SelectContent className="max-h-60">
                        {filteredInvoices.map(inv => (
                            <SelectItem key={inv.id} value={inv.id.toString()}>
                                <span className="font-mono font-semibold mr-1">{inv.invoice_number || "No Inv"}</span>
                                | {inv.client_name} | {inv.po_number || inv.wo_number || ""}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {selectedSale && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border">
                        {[
                            ["Client", selectedSale.client_name],
                            [saleType === "PO" ? "PO Number" : "WO Number", selectedSale.po_number || selectedSale.wo_number || "—"],
                            ["Project", selectedSale.project || "—"],
                            ["Invoice Date", selectedSale.invoice_date ? fmtDate(selectedSale.invoice_date) : "—"],
                            ["Invoice Total", inr(selectedSale.grand_total)],
                            ["GST Amount", inr(selectedSale.gst_amount)],
                            ["Ship To", selectedSale.ship_to || "—"],
                            ["Bill To", selectedSale.bill_to || "—"],
                        ].map(([label, val]) => (
                            <div key={label}>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</div>
                                <div className="text-xs font-medium truncate" title={String(val)}>{val}</div>
                            </div>
                        ))}
                    </div>
                )}
                </> : <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {[["invoice_number", "Invoice Number *"], ["po_number", saleType === "PO" ? "PO Number" : "WO Number"], ["client_name", "Client Name *"], ["project", "Project / Site"]].map(([field, label]) => (
                        <div key={field}>
                            <label className="text-sm font-medium mb-1 block">{label}</label>
                            <Input value={manualInvoice[field]} onChange={e => setManualInvoice(prev => ({ ...prev, [field]: e.target.value }))} />
                        </div>
                    ))}
                    <p className="md:col-span-2 text-xs text-muted-foreground">Historical invoice details are entered here and are not fetched from the system.</p>
                </div>}
            </div>

            {/* STEP 2 - Date + Reason */}
            <div className="rounded-lg border border-border p-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 2 &mdash; Credit Note Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">Credit Note Date <span className="text-destructive">*</span></label>
                        <Input type="date" value={cnDate} onChange={e => setCnDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">Correction Reason <span className="text-destructive">*</span></label>
                        <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                            <SelectContent>
                                {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <ReasonHint reason={reason} />
            </div>

            {/* STEP 3 - Dynamic section based on reason */}
            {reason && (
                <div className="rounded-lg border border-border p-4 space-y-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 3 &mdash; Correction Details</h4>

                    {/* Wrong Address: show original addresses */}
                    {cfg.showAddress && selectedSale && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                ["Original Ship To", selectedSale.ship_to],
                                ["Original Bill To", selectedSale.bill_to],
                                ["Original Dispatch From", selectedSale.dispatch_from],
                                ["Dispatched Through", selectedSale.dispatched_through],
                            ].map(([label, val]) => (
                                <div key={label} className="p-3 bg-muted/40 rounded-lg">
                                    <div className="text-xs text-muted-foreground mb-1 font-medium">{label}</div>
                                    <div className="text-sm whitespace-pre-wrap">{val || "—"}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Items table */}
                    {cfg.showItems && (items.length > 0 || manualEntry) && (
                        <>
                        {manualEntry && <Button type="button" variant="outline" size="sm" onClick={() => setItems(prev => [...prev, calcItem({ item: "", uom: "Nos", original_qty: 0, credit_qty: 0, unit_price: 0, gst_rate: 0 })])}>Add invoice item</Button>}
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm min-w-[700px]">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Product</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">UOM</th>
                                        {!manualEntry && <>
                                            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Orig Qty</th>
                                            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Credited</th>
                                            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Remaining</th>
                                        </>}
                                        {manualEntry && <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Invoice Qty</th>}
                                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Adjustment Qty</th>
                                        {manualEntry ? (
                                            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Rate</th>
                                        ) : cfg.rateEditable ? (
                                            <>
                                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Orig Rate</th>
                                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Credit Rate</th>
                                            </>
                                        ) : (
                                            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Rate</th>
                                        )}
                                        {manualEntry ? (
                                            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">GST%</th>
                                        ) : cfg.gstEditable ? (
                                            <>
                                                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Orig GST%</th>
                                                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Credit GST%</th>
                                            </>
                                        ) : (
                                            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">GST%</th>
                                        )}
                                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Taxable</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">GST Amt</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                                        {manualEntry && <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Action</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((it, idx) => {
                                        const alrCredited = creditedMap[it.source_item || it.item] || 0;
                                        const remaining = Math.max(0, it.original_qty - alrCredited);
                                        const rawQty = parseFloat(it.credit_qty || 0);
                                        const adjustmentQty = reason === "Quantity Less" ? -Math.abs(rawQty) : reason === "Quantity Excess" ? Math.abs(rawQty) : rawQty;
                                        const taxable = adjustmentQty * parseFloat(it.unit_price || 0);
                                        const gstAmount = taxable * parseFloat(it.gst_rate || 0) / 100;
                                        const totalAmount = taxable + gstAmount;
                                        return (
                                            <tr key={idx} className="border-t border-border hover:bg-muted/20">
                                                <td className="px-3 py-2 text-xs font-medium max-w-[180px]" title={it.item}>
                                                    {(cfg.productEditable || manualEntry) ? (
                                                        <ItemCombobox
                                                            value={it.item}
                                                            onChange={value => updateItem(idx, "item", value)}
                                                            items={itemMasterList}
                                                            placeholder="Select product..."
                                                            popoverClassName="w-[320px]"
                                                        />
                                                    ) : (
                                                        <span className="block truncate">{it.item}</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-xs text-muted-foreground">{manualEntry ? <Input value={it.uom || ""} onChange={e => updateItem(idx, "uom", e.target.value)} className="w-16 h-7 text-xs" /> : it.uom}</td>
                                                {manualEntry ? (
                                                    <td className="px-3 py-2 text-xs text-center"><Input type="number" value={it.original_qty || ""} onChange={e => updateItem(idx, "original_qty", e.target.value)} className="w-20 h-7 text-xs" /></td>
                                                ) : <>
                                                    <td className="px-3 py-2 text-xs text-center">{it.original_qty}</td>
                                                    <td className="px-3 py-2 text-xs text-center text-amber-600 font-medium">{alrCredited}</td>
                                                    <td className="px-3 py-2 text-xs text-center text-blue-600 font-semibold">{remaining}</td>
                                                </>}
                                                <td className="px-3 py-2">
                                                    <Input type="number" value={it.credit_qty || ""}
                                                        onChange={e => updateItem(idx, "credit_qty", e.target.value)}
                                                        className="w-20 h-7 text-xs" />
                                                </td>
                                                {manualEntry ? (
                                                    <td className="px-3 py-2"><Input type="number" min={0} value={it.unit_price || ""} onChange={e => updateItem(idx, "unit_price", e.target.value)} className="w-24 h-7 text-xs" /></td>
                                                ) : cfg.rateEditable ? (
                                                    <>
                                                        <td className="px-3 py-2 text-xs text-right text-muted-foreground line-through">{inr(it.original_unit_price)}</td>
                                                        <td className="px-3 py-2">
                                                            <Input type="number" min={0} value={it.unit_price || ""}
                                                                onChange={e => updateItem(idx, "unit_price", e.target.value)}
                                                                className="w-24 h-7 text-xs" />
                                                        </td>
                                                    </>
                                                ) : (
                                                    <td className="px-3 py-2 text-xs text-right">{inr(it.unit_price)}</td>
                                                )}
                                                {manualEntry ? (
                                                    <td className="px-3 py-2"><Input type="number" min={0} max={100} value={it.gst_rate || ""} onChange={e => updateItem(idx, "gst_rate", e.target.value)} className="w-16 h-7 text-xs" /></td>
                                                ) : cfg.gstEditable ? (
                                                    <>
                                                        <td className="px-3 py-2 text-xs text-center text-muted-foreground line-through">{it.original_gst_rate}%</td>
                                                        <td className="px-3 py-2">
                                                            <Input type="number" min={0} max={100} value={it.gst_rate || ""}
                                                                onChange={e => updateItem(idx, "gst_rate", e.target.value)}
                                                                className="w-16 h-7 text-xs" />
                                                        </td>
                                                    </>
                                                ) : (
                                                    <td className="px-3 py-2 text-xs text-center">{it.gst_rate}%</td>
                                                )}
                                                <td className="px-3 py-2 text-xs text-right">{inr(taxable)}</td>
                                                <td className="px-3 py-2 text-xs text-right">{inr(gstAmount)}</td>
                                                <td className="px-3 py-2 text-xs text-right font-semibold text-primary">{inr(totalAmount)}</td>
                                                {manualEntry && <td className="px-3 py-2 text-center">
                                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Remove item" onClick={() => setItems(prev => prev.filter((_, itemIndex) => itemIndex !== idx))}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </td>}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}

                    {/* Note / Remark */}
                    <div>
                        <label className="text-sm font-medium mb-1 block">
                            {cfg.showAddress ? "Correct Address / Note" : "Remark (optional)"}
                        </label>
                        <Textarea rows={3}
                            placeholder={cfg.showAddress ? "Sahi address yahan likhein..." : "Additional details..."}
                            value={note} onChange={e => setNote(e.target.value)} />
                    </div>

                    {/* Summary */}
                    {cfg.showItems && items.length > 0 && (
                        <div className="flex justify-end">
                            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 min-w-[240px] space-y-1.5 text-sm">
                                <div className="flex justify-between"><span className="text-muted-foreground">Taxable Amount</span><span className="font-medium">{inr(totals.taxable)}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">GST Amount</span><span className="font-medium">{inr(totals.gst)}</span></div>
                                <div className="flex justify-between font-bold text-base border-t border-primary/20 pt-1.5">
                                    <span>Credit Note Total</span>
                                    <span className="text-primary">{inr(totals.total)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={isPending}>
                    {isPending ? "Saving..." : editing ? "Update Credit Note" : "Create Credit Note"}
                </Button>
            </div>
        </div>
    );
}

// ---- CN View ----------------------------------------------------------------
function CreditNoteView({ cn, onClose }) {
    const cfg = REASON_CONFIG[cn.reason] || {};
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[["CN Number", cn.cn_number], ["CN Date", fmtDate(cn.cn_date)], ["Status", cn.status],
                  ["Client", cn.client_name], ["Invoice", cn.invoice_number || "—"], ["PO / WO No.", cn.po_number || "—"],
                  ["Project", cn.project || "—"], ["Reason", cn.reason], ["Type", cn.sale_type === "PO" ? "Purchase Order" : "Work Order"],
                ].map(([label, val]) => (
                    <div key={label}>
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="text-sm font-medium">{val}</div>
                    </div>
                ))}
            </div>
            {cfg.showItems && cn.items?.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                {["Product", "UOM", "Orig Qty", "Credit Qty", "Rate", "GST%", "Taxable", "GST Amt", "Total"].map(h => (
                                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {cn.items.map(it => (
                                <tr key={it.id} className="border-t border-border">
                                    <td className="px-3 py-2 text-xs font-medium">{it.item}</td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{it.uom}</td>
                                    <td className="px-3 py-2 text-xs text-center">{it.original_qty}</td>
                                    <td className="px-3 py-2 text-xs text-center text-primary font-bold">{it.credit_qty}</td>
                                    <td className="px-3 py-2 text-xs text-right">{inr(it.unit_price)}</td>
                                    <td className="px-3 py-2 text-xs text-center">{it.gst_rate}%</td>
                                    <td className="px-3 py-2 text-xs text-right">{inr(it.subtotal)}</td>
                                    <td className="px-3 py-2 text-xs text-right">{inr(it.gst_amount)}</td>
                                    <td className="px-3 py-2 text-xs text-right font-semibold">{inr(it.total_amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="flex justify-end">
                <div className="bg-muted/40 rounded-lg p-4 min-w-[220px] space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Taxable Amount</span><span>{inr(cn.taxable_amount)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">GST Amount</span><span>{inr(cn.gst_amount)}</span></div>
                    <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>Credit Note Total</span><span className="text-primary">{inr(cn.total_amount)}</span></div>
                </div>
            </div>
            <div className="flex justify-end">
                <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
        </div>
    );
}

// ---- Tab Panel --------------------------------------------------------------
function CNTabPanel({ saleType }) {
    const { user } = useAuth();
    const isAdmin = user?.is_admin;
    const qc = useQueryClient();
    const [searchText, setSearchText] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [viewCN, setViewCN] = useState(null);
    const [editCN, setEditCN] = useState(null);

    const { data: creditNotes = [], isLoading } = useQuery({
        queryKey: ["credit-notes", saleType],
        queryFn: () => fetchCreditNotes({ sale_type: saleType }),
    });

    const { mutate: doCancel } = useMutation({
        mutationFn: (id) => cancelCreditNote(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["credit-notes"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); qc.invalidateQueries({ queryKey: ["report"] }); qc.invalidateQueries({ queryKey: ["workOrderSalesReport"] }); toast.success("Credit Note cancelled"); },
        onError: (e) => toast.error(e.message),
    });

    const filtered = useMemo(() => {
        const s = searchText.toLowerCase();
        return creditNotes.filter(cn =>
            (cn.cn_number || "").toLowerCase().includes(s) ||
            (cn.client_name || "").toLowerCase().includes(s) ||
            (cn.invoice_number || "").toLowerCase().includes(s) ||
            (cn.po_number || "").toLowerCase().includes(s) ||
            (cn.reason || "").toLowerCase().includes(s)
        );
    }, [creditNotes, searchText]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search CN No, client, invoice..." value={searchText} onChange={e => setSearchText(e.target.value)} />
                </div>
                <Button onClick={() => { setEditCN(null); setFormOpen(true); }} className="shrink-0">
                    <Plus className="h-4 w-4 mr-2" />Add New Credit Note
                </Button>
            </div>

            <Card className="overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />No credit notes found.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b border-border">
                                <tr>
                                    {["CN No.", "Date", "Invoice", "Client", saleType === "PO" ? "PO No." : "WO No.", "Reason", "Amount", "Status", "Actions"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(cn => (
                                    <tr key={cn.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{cn.cn_number}</td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(cn.cn_date)}</td>
                                        <td className="px-4 py-3 font-mono text-xs">{cn.invoice_number || "—"}</td>
                                        <td className="px-4 py-3 truncate max-w-[140px] text-xs" title={cn.client_name}>{cn.client_name}</td>
                                        <td className="px-4 py-3 text-xs">{cn.po_number || "—"}</td>
                                        <td className="px-4 py-3"><span className="text-xs bg-muted px-2 py-0.5 rounded whitespace-nowrap">{cn.reason}</span></td>
                                        <td className="px-4 py-3 font-semibold text-primary text-xs">{inr(cn.total_amount)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[cn.status] || "bg-muted"}`}>{cn.status}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewCN(cn)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => printCreditNote(cn)} title="Print"><Printer className="h-3.5 w-3.5" /></Button>
                                                {isAdmin && cn.status !== "Cancelled" && (
                                                    <>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => { setEditCN(cn); setFormOpen(true); }} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("Cancel CN " + cn.cn_number + "?")) doCancel(cn.id); }} title="Cancel"><Trash2 className="h-3.5 w-3.5" /></Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editCN ? "Edit Credit Note — " + editCN.cn_number : "New " + (saleType === "PO" ? "Purchase Order" : "Work Order") + " Credit Note"}</DialogTitle>
                    </DialogHeader>
                    <CreditNoteForm saleType={saleType} editing={editCN} onClose={() => setFormOpen(false)} />
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewCN} onOpenChange={() => setViewCN(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Credit Note — {viewCN?.cn_number}</DialogTitle></DialogHeader>
                    {viewCN && <CreditNoteView cn={viewCN} onClose={() => setViewCN(null)} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ---- Main Page --------------------------------------------------------------
const CreditNotes = () => (
    <div className="space-y-6">
        <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Credit Notes</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage adjustment credit notes for Purchase Order and Work Order sales.</p>
        </div>
        <Tabs defaultValue="PO" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 p-1 bg-muted/50 rounded-xl">
                <TabsTrigger value="PO" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                    <FileText className="h-4 w-4 mr-2" /> Purchase Order Credit Notes
                </TabsTrigger>
                <TabsTrigger value="WO" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                    <ClipboardList className="h-4 w-4 mr-2" /> Work Order Credit Notes
                </TabsTrigger>
            </TabsList>
            <TabsContent value="PO"><CNTabPanel saleType="PO" /></TabsContent>
            <TabsContent value="WO"><CNTabPanel saleType="WO" /></TabsContent>
        </Tabs>
    </div>
);

export default CreditNotes;
