import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { inr, fmtDate, fmtDateTime, round2 } from "@/lib/format";
import { getCurrentUser } from "@/lib/currentUser";
import { useConstants } from "@/lib/constants";
import {
    fetchWorkOrders, fetchWorkOrderSales, fetchWorkOrderSale, createWorkOrderSale, updateWorkOrderSale,
    deleteWorkOrderSale as deleteWorkOrderSaleApi, bulkDeleteWorkOrderSales, addWorkOrderSaleActivity, addWorkOrderSaleDispatch, openWOInvoiceDocument, downloadWOInvoiceDocument,
    uploadWorkOrderSaleFile, exportWorkOrderSales, importWorkOrderSales,
} from "@/lib/api";
import { toast } from "sonner";
import { Plus, Truck, Clock, CreditCard, Eye, Package, User, Trash2, Search, Download, UploadCloud, FileText, X, Pencil, CheckCircle, Printer, FileDown, Upload, ChevronDown, ChevronUp } from "lucide-react";

const PAYMENT_STATUS = ["Pending", "Partial", "Paid"];

const WorkOrderSales = () => {
    const qc = useQueryClient();
    const { uom_options } = useConstants();

    const { data: orders = [] } = useQuery({
        queryKey: ["work-orders"],
        queryFn: () => fetchWorkOrders(),
    });

    const { data: sales = [], isLoading } = useQuery({
        queryKey: ["work-order-sales"],
        queryFn: () => fetchWorkOrderSales(),
    });

    const invalidateSales = () => {
        qc.invalidateQueries({ queryKey: ["work-order-sales"] });
        qc.invalidateQueries({ queryKey: ["work-orders"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        // Work Order Report (and its footer totals) reads from
        // ["workOrderReport", ...] — it must refetch whenever a Work Order
        // Sale is added/edited/deleted so the displayed totals never go stale.
        qc.invalidateQueries({ queryKey: ["workOrderReport"] });
        qc.invalidateQueries({ queryKey: ["work-order-view"] });
    };

    const createMutation = useMutation({ mutationFn: createWorkOrderSale, onSuccess: invalidateSales });
    const updateMutation = useMutation({ mutationFn: ({ id, body }) => updateWorkOrderSale(id, body), onSuccess: invalidateSales });
    const deleteMutation = useMutation({
        mutationFn: (id) => deleteWorkOrderSaleApi(id, getCurrentUser()),
        onSuccess: () => {
            invalidateSales();
            toast.success("Sale record deleted successfully");
        },
        onError: (err) => {
            toast.error(err.message || "Failed to delete sale record");
        }
    });
    const bulkDeleteMutation = useMutation({
        mutationFn: (ids) => bulkDeleteWorkOrderSales(ids, getCurrentUser()),
        onSuccess: (result) => {
            invalidateSales();
            setSelectedIds(new Set());
            if (result.errors?.length) {
                toast.warning(`Deleted ${result.deleted.length} sale(s), ${result.errors.length} failed`);
            } else {
                toast.success(`Deleted ${result.deleted.length} sale(s)`);
            }
        },
        onError: (err) => {
            toast.error(err.message || "Bulk delete failed");
        }
    });
    const activityMutation = useMutation({ mutationFn: ({ id, body }) => addWorkOrderSaleActivity(id, body), onSuccess: () => qc.invalidateQueries({ queryKey: ["work-order-sales"] }) });

    // Expand/collapse product list per sale card
    const [expandedSales, setExpandedSales] = useState(new Set());
    const toggleExpanded = (id) => setExpandedSales(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // Add Sale dialog
    const [addOpen, setAddOpen] = useState(false);
    const [selectedWO, setSelectedWO] = useState("");
    const [woData, setWoData] = useState(null);
    const [selectedLineItemId, setSelectedLineItemId] = useState("");
    const [manualItem, setManualItem] = useState("");
    const [manualUnitPrice, setManualUnitPrice] = useState("");
    const [manualGstRate, setManualGstRate] = useState("");
    const [manualFreight, setManualFreight] = useState("");
    const [dispatchQty, setDispatchQty] = useState("");
    const [manualUom, setManualUom] = useState("Nos");
    const [paymentStatus, setPaymentStatus] = useState("Pending");
    const [paymentNote, setPaymentNote] = useState("");
    const [invoiceUrl, setInvoiceUrl] = useState("");
    const [dispatchFrom, setDispatchFrom] = useState("");
    const [shipTo, setShipTo] = useState("");
    const [billTo, setBillTo] = useState("");
    const [manualInvoiceNumber, setManualInvoiceNumber] = useState("");
    const [dispatchedThrough, setDispatchedThrough] = useState("");
    const [buyersOrderNo, setBuyersOrderNo] = useState("");
    const [paymentTerms, setPaymentTerms] = useState("");
    const [hsnCode, setHsnCode] = useState("");
    const [uploadingSaleId, setUploadingSaleId] = useState(null);
    const [dispatchItems, setDispatchItems] = useState([]); // List of items for current dispatch
    const [manualTotalGstRate, setManualTotalGstRate] = useState(""); // Manual override for total GST %
    const [dispatchOpen, setDispatchOpen] = useState(false);
    const [dispatchTarget, setDispatchTarget] = useState(null);
    const [viewSale, setViewSale] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [editOpen, setEditOpen] = useState(false);
    const [editingSale, setEditingSale] = useState(null);
    const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
    const [editDispatchedThrough, setEditDispatchedThrough] = useState("");
    const [editBuyersOrderNo, setEditBuyersOrderNo] = useState("");
    const [editDispatchFrom, setEditDispatchFrom] = useState("");
    const [editShipTo, setEditShipTo] = useState("");
    const [editBillTo, setEditBillTo] = useState("");
    const [editPaymentTerms, setEditPaymentTerms] = useState("");
    const [editPaymentNote, setEditPaymentNote] = useState("");
    const [editInvoiceUrl, setEditInvoiceUrl] = useState("");
    const [editPaymentStatus, setEditPaymentStatus] = useState("Pending");
    const [editManualFreight, setEditManualFreight] = useState("");
    const [editManualTotalGstRate, setEditManualTotalGstRate] = useState("");
    const [editHsnCode, setEditHsnCode] = useState("");

    // Mark Delivered dialog
    const [markDeliveredOpen, setMarkDeliveredOpen] = useState(false);
    const [markDeliveredTarget, setMarkDeliveredTarget] = useState(null);
    const [deliveryChallanUrl, setDeliveryChallanUrl] = useState("");

    // Export / Import
    const [salesImportOpen, setSalesImportOpen] = useState(false);
    const [salesImportFile, setSalesImportFile] = useState(null);
    const [salesImportConflict, setSalesImportConflict] = useState("skip");
    const [salesImporting, setSalesImporting] = useState(false);
    const [salesImportResult, setSalesImportResult] = useState(null);
    const salesImportRef = useRef(null);

    const handleSalesExport = async () => {
        const tid = toast.loading("Preparing Excel export…");
        try {
            await exportWorkOrderSales();
            toast.success("Sales exported", { id: tid });
        } catch (err) {
            toast.error("Export failed: " + err.message, { id: tid });
        }
    };

    const handleSalesImport = async () => {
        if (!salesImportFile) return toast.error("Please select an Excel (.xlsx) or CSV file");
        setSalesImporting(true);
        const tid = toast.loading("Importing…");
        try {
            const result = await importWorkOrderSales(salesImportFile, salesImportConflict, getCurrentUser());
            setSalesImportResult(result);
            toast.success(
                `Import done — Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`,
                { id: tid, duration: 6000 }
            );
            invalidateSales();
        } catch (err) {
            toast.error("Import failed: " + err.message, { id: tid });
        } finally {
            setSalesImporting(false);
        }
    };

    const pendingOnWO = (wo) => {
        if (!wo) return 0;
        return parseFloat(Math.max(0, (Number(wo.total_quantity) || 0) - (Number(wo.completed_quantity) || 0)).toFixed(10));
    };

    const getRealTimePending = (lineItemId) => {
        if (!woData) return 0;
        let basePending = 0;
        if (lineItemId === "default" || !lineItemId) {
            basePending = pendingOnWO(woData);
        } else {
            const li = woData.line_items?.find(x => x.id.toString() === lineItemId.toString());
            basePending = li ? Math.max(0, parseFloat((li.quantity - li.completed_quantity).toFixed(10))) : 0;
        }
        const alreadyStaged = dispatchItems
            .filter(item => {
                if (lineItemId === "default" || !lineItemId) return item.line_item_id === null;
                return item.line_item_id?.toString() === lineItemId.toString();
            })
            .reduce((acc, item) => acc + item.quantity, 0);
        return parseFloat(Math.max(0, basePending - alreadyStaged).toFixed(10));
    };

    const calcAmounts = (wo, qty) => {
        const unitPrice = Number(wo.unit_price) || 0;
        const freight = Number(wo.freight) || 0;
        const gstRate = parseFloat((wo.gst || "0").toString().replace("%", "")) || 0;
        const subtotal = unitPrice * qty;
        const gstAmount = Math.round(subtotal * gstRate / 100);
        return { unitPrice, freight, gstRate, gstAmount, subtotal, grandTotal: subtotal + gstAmount + freight };
    };

    const applyManualTotalGstRate = (items, subtotal) => {
        const gst_amount = Math.round(subtotal * (Number(manualTotalGstRate) / 100));
        const currentSum = items.reduce((acc, item) => acc + (Number(item.gst_amount) || 0), 0);
        const diff = gst_amount - currentSum;
        if (diff !== 0 && items.length > 0) {
            const lastIdx = items.length - 1;
            items[lastIdx].gst_amount = (Number(items[lastIdx].gst_amount) || 0) + diff;
            items[lastIdx].total_amount = (Number(items[lastIdx].subtotal) || 0) + items[lastIdx].gst_amount;
        }
        return gst_amount;
    };

    const handleWOChange = (woNumber) => {
        setSelectedWO(woNumber);
        const wo = orders.find((o) => o.wo_number === woNumber);
        setWoData(wo || null);
        setDispatchQty("");
        setManualUom("Nos");
        setSelectedLineItemId("");

        const firstItem = wo?.line_items?.[0];
        if (wo?.line_items?.length > 0) {
            if (wo.line_items.length === 1 && firstItem) {
                setSelectedLineItemId(firstItem.id.toString());
                setManualItem(firstItem.item);
                setManualUnitPrice(Number(firstItem.unit_price).toFixed(2));
            } else {
                setSelectedLineItemId("");
                setManualItem("");
                setManualUnitPrice("");
            }
        } else {
            setSelectedLineItemId("default");
            setManualItem(wo?.item || "");
            setManualUnitPrice(wo?.unit_price ? Number(wo.unit_price).toFixed(2) : "");
            setManualUom(wo?.uom || "Nos");
        }

        let parsedGst = 18;
        if (wo?.gst?.toString().startsWith("₹")) {
            parsedGst = 0; // Fixed amount, so % is 0
        } else {
            const gstVal = parseFloat((wo?.gst ?? "18").toString().replace("%", ""));
            parsedGst = isNaN(gstVal) ? 18 : gstVal;
        }
        setManualGstRate(parsedGst);
        setManualFreight(wo?.freight?.toString() || "0");

        setPaymentStatus("Pending");
        setPaymentNote("");
        setInvoiceUrl("");
        setShipTo(wo?.site_location || "");
        setBillTo(""); // Leave empty as requested (don't fill name here)
        setManualInvoiceNumber("");
        setDispatchedThrough("");
        setBuyersOrderNo("");
        setPaymentTerms("");
        setHsnCode("");
    };

    const handleItemChange = (liId) => {
        setSelectedLineItemId(liId);
        const li = woData?.line_items?.find(x => x.id.toString() === liId);
        if (li) {
            setManualItem(li.item);
            setManualUnitPrice(Number(li.unit_price).toFixed(2));
            setManualUom(li.uom || "Nos");
        }
    };

    const handleRemoveFile = (type, urlToRemove) => {
        if (type === "invoice") {
            const current = invoiceUrl ? invoiceUrl.split(";") : [];
            setInvoiceUrl(current.filter(u => u !== urlToRemove).join(";"));
        } else if (type === "edit-invoice") {
            const current = editInvoiceUrl ? editInvoiceUrl.split(";") : [];
            setEditInvoiceUrl(current.filter(u => u !== urlToRemove).join(";"));
        } else if (type === "challan") {
            const current = deliveryChallanUrl ? deliveryChallanUrl.split(";") : [];
            setDeliveryChallanUrl(current.filter(u => u !== urlToRemove).join(";"));
        }
    };

    const FileItem = ({ url, onRemove, type }) => {
        const fileName = url.split("/").pop();
        const ext = fileName.split(".").pop().toLowerCase();
        const isPdf = ext === "pdf";
        const fullUrl = `http://localhost:8000${url}`;

        const handlePrint = () => {
            const win = window.open(fullUrl, "_blank");
            if (win) {
                if (!isPdf) {
                    win.onload = () => {
                        win.print();
                    };
                } else {
                    win.focus();
                }
            }
        };

        return (
            <div className="flex items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors px-3 py-2 rounded-lg text-xs border border-border/50 group">
                <div className="flex items-center gap-2 overflow-hidden mr-2">
                    {isPdf ? (
                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                        <Eye className="h-4 w-4 text-blue-500 shrink-0" />
                    )}
                    <span className="truncate font-medium text-foreground/80">{fileName}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-primary/10 text-primary" onClick={() => window.open(fullUrl, "_blank")}>
                                <Eye className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Document</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-amber-100 text-amber-600" onClick={handlePrint}>
                                <Printer className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Print Document</TooltipContent>
                    </Tooltip>

                    {onRemove && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={onRemove}>
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove File</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>
        );
    };

    const FilePopover = ({ urls, icon: Icon, label, saleId, onUploadClick }) => {
        if (!urls) {
            return (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onUploadClick}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-red-500 bg-red-50"
                        >
                            <UploadCloud className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent><p>Upload {label}</p></TooltipContent>
                </Tooltip>
            );
        }

        const urlList = urls.split(";").filter(Boolean);
        const isChallan = label.toLowerCase().includes("challan");

        return (
            <Popover>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <button className={`inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors relative ${isChallan ? "text-blue-500 bg-blue-50" : "text-green-500 bg-green-50"}`}>
                                <Icon className="h-4 w-4" />
                                {urlList.length > 1 && (
                                    <span className={`absolute -top-1 -right-1 text-white text-[8px] font-bold h-3.5 w-3.5 rounded-full flex items-center justify-center shadow-sm border border-white ${isChallan ? "bg-blue-600" : "bg-green-600"}`}>
                                        {urlList.length}
                                    </span>
                                )}
                            </button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent><p>View {label} ({urlList.length})</p></TooltipContent>
                </Tooltip>
                <PopoverContent className="w-72 p-2 shadow-2xl border-border bg-card" align="end">
                    <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase text-muted-foreground px-2 py-1 border-b border-border/50 mb-1 flex justify-between items-center">
                            <span>{label} Files</span>
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium">{urlList.length}</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                            {urlList.map((url, i) => (
                                <FileItem key={i} url={url} />
                            ))}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        );
    };

    const handleInvoiceUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const tid = toast.loading(`Uploading ${files.length} invoice(s)...`);
        try {
            const urls = [];
            for (const file of files) {
                const data = await uploadWorkOrderSaleFile(file);
                urls.push(data.file_url);
            }
            const current = invoiceUrl ? invoiceUrl.split(";") : [];
            setInvoiceUrl([...current, ...urls].join(";"));
            toast.success("Invoices uploaded", { id: tid });
        } catch (err) {
            toast.error("Upload failed: " + err.message, { id: tid });
        }
    };

    const handleDirectInvoiceUpload = async (e, saleId) => {
        const file = e.target.files[0];
        if (!file || !saleId) return;
        const tid = toast.loading("Uploading invoice...");
        try {
            const data = await uploadWorkOrderSaleFile(file);
            await updateMutation.mutateAsync({
                id: saleId,
                body: { invoice_url: data.file_url, updated_by: getCurrentUser() }
            });
            toast.success("Invoice updated", { id: tid });
            setUploadingSaleId(null);
        } catch (err) {
            toast.error("Upload failed: " + err.message, { id: tid });
        }
    };

    const handleDeleteInvoice = async (saleId) => {
        if (!window.confirm("Are you sure you want to delete this invoice? You can then upload a new one.")) return;
        const tid = toast.loading("Removing invoice...");
        try {
            await updateMutation.mutateAsync({
                id: saleId,
                body: { invoice_url: null, updated_by: getCurrentUser() }
            });
            await activityMutation.mutateAsync({
                id: saleId,
                body: { action: "Invoice Deleted", note: "Uploaded invoice document was removed", by: getCurrentUser() },
            });
            toast.success("Invoice removed", { id: tid });
        } catch (err) {
            toast.error("Failed to remove invoice: " + err.message, { id: tid });
        }
    };


    const addItemToDispatch = () => {
        if (!manualItem || !dispatchQty || Number(dispatchQty) <= 0 || !manualUom) {
            toast.error("Please select an item, enter valid quantity and UOM");
            return;
        }

        const calc = calcAmounts({
            unit_price: manualUnitPrice,
            gst: manualGstRate,
            freight: 0 // Freight is handled at dispatch level
        }, Number(dispatchQty));

        const pending = getRealTimePending(selectedLineItemId);
        if (Number(dispatchQty) > pending) {
            toast.error(`Only ${pending} remaining for this item in this dispatch`);
            return;
        }

        const newItem = {
            line_item_id: selectedLineItemId === "default" ? null : Number(selectedLineItemId),
            item: manualItem,
            uom: manualUom,
            quantity: Number(dispatchQty),
            wo_pending: pending - Number(dispatchQty), // The NEW pending after this add
            unit_price: Number(manualUnitPrice),
            gst_rate: Number(manualGstRate),
            subtotal: calc.subtotal,
            gst_amount: calc.gstAmount,
            total_amount: calc.grandTotal
        };

        setDispatchItems([...dispatchItems, newItem]);

        // Reset item fields but keep common ones
        setManualItem("");
        setDispatchQty("");
        setSelectedLineItemId("");
        setManualUnitPrice("");
        setManualGstRate("18");
    };

    const removeItemFromDispatch = (index) => {
        setDispatchItems(dispatchItems.filter((_, i) => i !== index));
    };

    const handleAddSale = async () => {
        if (!woData) { toast.error("Select a Work Order first"); return; }
        if (dispatchItems.length === 0) { toast.error("Add at least one item"); return; }

        const subtotal = dispatchItems.reduce((acc, item) => acc + item.subtotal, 0);
        let gst_amount = dispatchItems.reduce((acc, item) => acc + item.gst_amount, 0);

        if (manualTotalGstRate !== "") {
            gst_amount = applyManualTotalGstRate(dispatchItems, subtotal);
        }

        const freight = Number(manualFreight) || 0;
        const grand_total = subtotal + gst_amount + freight;

        try {
            await createMutation.mutateAsync({
                wo_id: woData.id,
                wo_number: woData.wo_number,
                client_name: woData.client_name,
                project: woData.project,
                items: dispatchItems,
                subtotal,
                gst_amount,
                freight,
                grand_total,
                payment_status: paymentStatus,
                payment_note: paymentNote || null,
                invoice_url: invoiceUrl || null,
                invoice_number: manualInvoiceNumber || null,
                dispatch_from: dispatchFrom || null,
                ship_to: shipTo || null,
                bill_to: billTo || null,
                dispatched_through: dispatchedThrough || null,
                buyers_order_no: buyersOrderNo || null,
                payment_terms: paymentTerms || null,
                hsn_code: hsnCode || null,
                created_by: getCurrentUser(),
            });
            toast.success("Work Order Sales Invoice created");
            setAddOpen(false);
            setSelectedWO("");
            setWoData(null);
            setDispatchItems([]);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const openDispatch = (sale) => {
        handleWOChange(sale.wo_number);
        setDispatchTarget(sale);
        setDispatchItems([]);
        setDispatchOpen(true);
    };

    const handleQuickDispatch = async () => {
        if (!woData) { toast.error("Select a Work Order first"); return; }
        if (dispatchItems.length === 0) { toast.error("Add at least one item"); return; }

        if (dispatchTarget) {
            // UPDATE EXISTING SALE — always start from the sale's items as
            // they exist on the server right now, not the possibly-stale
            // `dispatchTarget` snapshot from whenever this dialog's list was
            // last rendered. Two "Dispatch More" actions done back-to-back
            // (or after items changed elsewhere) would otherwise both build
            // off the same outdated item list, silently dropping whichever
            // dispatch's items didn't make it into the last save.
            const freshSale = await fetchWorkOrderSale(dispatchTarget.id);
            const combinedItems = [
                ...(freshSale.items || []),
                ...dispatchItems.map(it => ({
                    line_item_id: it.line_item_id,
                    item: it.item,
                    uom: it.uom,
                    quantity: it.quantity,
                    unit_price: it.unit_price,
                    gst_rate: it.gst_rate,
                    subtotal: it.subtotal,
                    gst_amount: it.gst_amount,
                    total_amount: it.total_amount
                }))
            ];

            // Recalculate totals for perfect consistency
            const subtotal = combinedItems.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
            let gst_amount = combinedItems.reduce((acc, item) => acc + (Number(item.gst_amount) || 0), 0);

            if (manualTotalGstRate !== "") {
                gst_amount = applyManualTotalGstRate(combinedItems, subtotal);
            }

            const freight = Number(freshSale.freight) || 0;
            const grand_total = subtotal + gst_amount + freight;

            // Newly uploaded invoice files from this dispatch session are
            // appended onto whatever was already on the sale — a "Dispatch
            // More" action shouldn't wipe out documents uploaded during an
            // earlier dispatch on the same sale.
            const existingInvoiceUrls = freshSale.invoice_url ? freshSale.invoice_url.split(";") : [];
            const newInvoiceUrls = invoiceUrl ? invoiceUrl.split(";") : [];
            const combinedInvoiceUrl = [...existingInvoiceUrls, ...newInvoiceUrls].filter(Boolean).join(";") || null;

            try {
                await updateMutation.mutateAsync({
                    id: dispatchTarget.id,
                    body: {
                        items: combinedItems,
                        subtotal,
                        gst_amount,
                        grand_total,
                        invoice_url: combinedInvoiceUrl,
                        updated_by: getCurrentUser()
                    }
                });

                const itemsList = dispatchItems.map(i => `${i.quantity} ${i.uom} of ${i.item}`).join(", ");
                await activityMutation.mutateAsync({
                    id: dispatchTarget.id,
                    body: {
                        action: "Items Dispatched",
                        note: `Dispatched more items: ${itemsList}`,
                        payment_status: dispatchTarget.payment_status,
                        by: getCurrentUser()
                    },
                });

                // Record this as its own dispatch event (distinct from the
                // invoice's original dispatch) so the WO Fulfillment Summary
                // can list every dispatch separately, each with its own date.
                await addWorkOrderSaleDispatch(dispatchTarget.id, {
                    quantity: dispatchItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0),
                    uom: dispatchItems[0]?.uom || "Nos",
                    subtotal: dispatchItems.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0),
                    gst_amount: dispatchItems.reduce((acc, i) => acc + (Number(i.gst_amount) || 0), 0),
                    amount: dispatchItems.reduce((acc, i) => acc + (Number(i.total_amount) || 0), 0),
                    invoice_number: manualInvoiceNumber || null,
                    by: getCurrentUser(),
                    // Per-item breakdown — keeps each item's own qty/uom
                    // separate so a dispatch mixing units (e.g. Meter + Nos)
                    // never gets summed into one misleading total.
                    items: dispatchItems.map((i) => ({
                        item: i.item,
                        uom: i.uom,
                        quantity: Number(i.quantity) || 0,
                        subtotal: Number(i.subtotal) || 0,
                        gst_amount: Number(i.gst_amount) || 0,
                        amount: Number(i.total_amount) || 0,
                    })),
                });

                qc.invalidateQueries({ queryKey: ["work-order-view"] });

                toast.success("Items added to existing dispatch");
                setDispatchOpen(false);
                setSelectedWO("");
                setWoData(null);
                setDispatchItems([]);
                setDispatchTarget(null);
            } catch (e) {
                toast.error(e.message);
            }
        } else {
            // CREATE NEW SALE
            const subtotal = dispatchItems.reduce((acc, item) => acc + item.subtotal, 0);
            const calculatedGstAmt = dispatchItems.reduce((acc, item) => acc + item.gst_amount, 0);

            let gst_amount = calculatedGstAmt;
            if (manualTotalGstRate !== "") {
                gst_amount = applyManualTotalGstRate(dispatchItems, subtotal);
            }

            const grand_total = subtotal + gst_amount;

            try {
                await createMutation.mutateAsync({
                    wo_id: woData.id,
                    wo_number: woData.wo_number,
                    client_name: woData.client_name,
                    project: woData.project,
                    items: dispatchItems,
                    subtotal,
                    gst_amount,
                    freight: 0,
                    grand_total,
                    payment_status: "Pending",
                    payment_note: null,
                    invoice_url: invoiceUrl || null,
                    invoice_number: manualInvoiceNumber || null,
                    dispatch_from: dispatchFrom || null,
                    ship_to: woData.site_location || null,
                    bill_to: null,
                    dispatched_through: null,
                    buyers_order_no: null,
                    payment_terms: null,
                    hsn_code: null,
                    created_by: getCurrentUser(),
                });
                toast.success("Quick Dispatch created");
                setDispatchOpen(false);
                setSelectedWO("");
                setWoData(null);
                setDispatchItems([]);
                setDispatchTarget(null);
            } catch (e) {
                toast.error(e.message);
            }
        }
    };

    const handlePaymentUpdate = async (saleId, status) => {
        try {
            await updateMutation.mutateAsync({ id: saleId, body: { payment_status: status, updated_by: getCurrentUser() } });
            await activityMutation.mutateAsync({
                id: saleId,
                body: { action: "Payment Updated", note: `Status changed to ${status}`, payment_status: status, by: getCurrentUser() },
            });
            toast.success(`Payment marked as ${status}`);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const confirmDeleteSale = async () => {
        if (!itemToDelete) return;
        try {
            await deleteMutation.mutateAsync(itemToDelete);
            toast.success("Sale deleted");
        } catch (e) {
            toast.error(e.message);
        }
        setItemToDelete(null);
    };

    const [editItems, setEditItems] = useState([]);
    const [editSubtotal, setEditSubtotal] = useState(0);
    const [editGstAmount, setEditGstAmount] = useState(0);
    const [editGrandTotal, setEditGrandTotal] = useState(0);

    const openEditSale = (sale) => {
        setEditingSale(sale);
        setEditInvoiceNumber(sale.invoice_number || "");
        setEditBuyersOrderNo(sale.buyers_order_no || "");
        setEditDispatchedThrough(sale.dispatched_through || "");
        setEditDispatchFrom(sale.dispatch_from || "");
        setEditShipTo(sale.ship_to || "");
        setEditBillTo(sale.bill_to || "");
        setEditPaymentTerms(sale.payment_terms || "");
        setEditPaymentNote(sale.payment_note || "");
        setEditPaymentStatus(sale.payment_status);
        setEditInvoiceUrl(sale.invoice_url || "");
        setEditHsnCode(sale.hsn_code || "");
        setEditManualFreight(round2(sale.freight || 0).toFixed(2));
        setEditManualTotalGstRate("");

        // Load and recalculate all items to ensure UI consistency. Rounded to
        // 2 decimal places (paisa), never Math.round() — that rounds to a
        // whole rupee and is exactly what was destroying the GST/Total
        // decimals shown on this screen versus the View screen.
        const items = (sale.items || []).map(it => {
            const q = Number(it.quantity) || 0;
            const p = Number(it.unit_price) || 0;
            const g = Number(it.gst_rate) || 0;
            const sub = round2(q * p);
            const gst = round2(sub * g / 100);
            return {
                ...it,
                subtotal: sub,
                gst_amount: gst,
                total_amount: round2(sub + gst)
            };
        });
        setEditItems(items);
        setEditOpen(true);
    };

    const updateEditItem = (idx, field, val) => {
        const newItems = [...editItems];
        const item = { ...newItems[idx], [field]: val };

        // Recalculate this item
        const q = Number(item.quantity) || 0;
        const p = Number(item.unit_price) || 0;
        const g = Number(item.gst_rate) || 0;

        item.subtotal = round2(q * p);
        item.gst_amount = round2(item.subtotal * g / 100);
        item.total_amount = round2(item.subtotal + item.gst_amount);

        newItems[idx] = item;
        setEditItems(newItems);
    };

    const removeEditItem = (idx) => {
        if (editItems.length <= 1) {
            toast.error("A sale must have at least one item");
            return;
        }
        setEditItems(editItems.filter((_, i) => i !== idx));
    };

    useEffect(() => {
        const sub = round2(editItems.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0));
        const itemGst = round2(editItems.reduce((acc, i) => acc + (Number(i.gst_amount) || 0), 0));
        const fr = round2(Number(editManualFreight) || 0);

        let finalGst = itemGst;
        if (editManualTotalGstRate !== "") {
            finalGst = round2(sub * (Number(editManualTotalGstRate) / 100));
        }

        setEditSubtotal(sub);
        setEditGstAmount(finalGst);
        setEditGrandTotal(round2(sub + finalGst + fr));
    }, [editItems, editManualFreight, editManualTotalGstRate]);

    const handleUpdateSale = async () => {
        if (!editingSale) return;
        try {
            await updateMutation.mutateAsync({
                id: Number(editingSale.id),
                body: {
                    freight: Number(editManualFreight),
                    subtotal: editSubtotal,
                    gst_amount: editGstAmount,
                    grand_total: editGrandTotal,
                    items: (() => {
                        const items = [...editItems];
                        if (editManualTotalGstRate !== "") {
                            const currentSum = items.reduce((acc, it) => acc + (Number(it.gst_amount) || 0), 0);
                            const diff = editGstAmount - currentSum;
                            if (diff !== 0 && items.length > 0) {
                                const last = items.length - 1;
                                items[last] = {
                                    ...items[last],
                                    gst_amount: (Number(items[last].gst_amount) || 0) + diff,
                                    total_amount: (Number(items[last].subtotal) || 0) + (Number(items[last].gst_amount) || 0) + diff
                                };
                            }
                        }
                        return items.map(it => {
                            const liId = parseInt(it.line_item_id);
                            return {
                                line_item_id: isNaN(liId) ? null : liId,
                                item: it.item || "Unknown Item",
                                uom: it.uom || "Nos",
                                quantity: parseFloat(it.quantity) || 0,
                                unit_price: parseFloat(it.unit_price) || 0,
                                gst_rate: parseFloat(it.gst_rate) || 0,
                                subtotal: parseFloat(it.subtotal) || 0,
                                gst_amount: parseFloat(it.gst_amount) || 0,
                                total_amount: parseFloat(it.total_amount) || 0
                            };
                        });
                    })(),
                    invoice_number: editInvoiceNumber || null,
                    dispatched_through: editDispatchedThrough || null,
                    buyers_order_no: editBuyersOrderNo || null,
                    dispatch_from: editDispatchFrom || null,
                    ship_to: editShipTo || null,
                    bill_to: editBillTo || null,
                    payment_terms: editPaymentTerms || null,
                    payment_note: editPaymentNote || null,
                    invoice_url: editInvoiceUrl || null,
                    payment_status: editPaymentStatus,
                    hsn_code: editHsnCode || null,
                    updated_by: getCurrentUser(),
                }
            });
            await activityMutation.mutateAsync({
                id: editingSale.id,
                body: { action: "Sale Updated", note: "Sale details were modified", by: getCurrentUser(), payment_status: editPaymentStatus },
            });
            toast.success("Sale details updated");
            setEditOpen(false);
            setEditingSale(null);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const handleEditInvoiceUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const tid = toast.loading(`Uploading ${files.length} invoice(s)...`);
        try {
            const urls = [];
            for (const file of files) {
                const data = await uploadWorkOrderSaleFile(file);
                urls.push(data.file_url);
            }
            const current = editInvoiceUrl ? editInvoiceUrl.split(";") : [];
            setEditInvoiceUrl([...current, ...urls].join(";"));
            toast.success("Invoices updated", { id: tid });
        } catch (err) {
            toast.error("Upload failed: " + err.message, { id: tid });
        }
    };

    const handleDeliveryChallanUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const tid = toast.loading(`Uploading ${files.length} challan(s)...`);
        try {
            const urls = [];
            for (const file of files) {
                const data = await uploadWorkOrderSaleFile(file);
                urls.push(data.file_url);
            }
            const current = deliveryChallanUrl ? deliveryChallanUrl.split(";") : [];
            setDeliveryChallanUrl([...current, ...urls].join(";"));
            toast.success("Challans uploaded", { id: tid });
        } catch (err) {
            toast.error("Upload failed: " + err.message, { id: tid });
        }
    };

    const handleMarkDelivered = async () => {
        if (!markDeliveredTarget) return;
        if (!deliveryChallanUrl) {
            toast.error("Please upload a delivery challan document");
            return;
        }
        try {
            await updateMutation.mutateAsync({
                id: markDeliveredTarget.id,
                body: {
                    delivery_status: "Delivered",
                    delivery_challan_url: deliveryChallanUrl,
                    updated_by: getCurrentUser()
                }
            });
            await activityMutation.mutateAsync({
                id: markDeliveredTarget.id,
                body: { action: "Marked Delivered", note: "Sale marked as delivered with challan document.", payment_status: markDeliveredTarget.payment_status, by: getCurrentUser() },
            });
            toast.success("Sale marked as Delivered");
            setMarkDeliveredOpen(false);
            setMarkDeliveredTarget(null);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const woCalc = useMemo(() => {
        if (!woData || !dispatchQty) return null;
        return calcAmounts({
            unit_price: manualUnitPrice,
            gst: manualGstRate,
            freight: manualFreight
        }, Number(dispatchQty));
    }, [woData, dispatchQty, manualUnitPrice, manualGstRate, manualFreight]);



    const filteredSales = useMemo(() => {
        if (!search.trim()) return sales;
        const q = search.toLowerCase();
        return sales.filter((s) =>
            (s.wo_number || "").toLowerCase().includes(q) ||
            (s.client_name || "").toLowerCase().includes(q) ||
            (s.item || "").toLowerCase().includes(q) ||
            (s.project || "").toLowerCase().includes(q)
        );
    }, [sales, search]);

    const allVisibleSelected = filteredSales.length > 0 && filteredSales.every((s) => selectedIds.has(s.id));
    const toggleSelectAll = () => {
        setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredSales.map((s) => s.id)));
    };
    const toggleSelectOne = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    return (
        <TooltipProvider>
        <div className="space-y-6">
            <div className="text-center space-y-1">
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">Work Order Sales</h2>
                <p className="text-sm text-muted-foreground">Manage dispatch, invoicing, payments and activity tracking for work orders.</p>
            </div>
            {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
                    <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                        <Button variant="destructive" size="sm" onClick={() => setBulkDeleteConfirmOpen(true)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete Selected
                        </Button>
                    </div>
                </div>
            )}
            <div className="flex flex-wrap items-end justify-end gap-3">
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleSalesExport} className="border-green-500 text-green-700 hover:bg-green-50">
                        <Download className="h-4 w-4 mr-2" /> Export Excel
                    </Button>
                    <Button variant="outline" onClick={() => { setSalesImportFile(null); setSalesImportResult(null); setSalesImportOpen(true); }} className="border-blue-500 text-blue-700 hover:bg-blue-50">
                        <Upload className="h-4 w-4 mr-2" /> Import Excel
                    </Button>
                    <Button onClick={() => setAddOpen(true)} className="bg-gradient-primary hover:opacity-90 shadow-elegant">
                        <Plus className="h-4 w-4 mr-2" /> Add New Sale
                    </Button>
                </div>
            </div>

            {/* Add New Sale Dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Add New Work Order Sales Invoice</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label>Work Order No. *</Label>
                            <Select value={selectedWO} onValueChange={handleWOChange}>
                                <SelectTrigger><SelectValue placeholder="Select Work Order Number" /></SelectTrigger>
                                <SelectContent>
                                    {orders.length > 0
                                        ? (
                                            // Fixed-height, independently scrollable list — only this
                                            // inner div scrolls (overscroll-contain stops the scroll
                                            // from "leaking" into the page/dialog behind it once the
                                            // user hits the top/bottom of the list).
                                            <div className="max-h-[280px] overflow-y-auto overscroll-contain scroll-smooth">
                                                {orders.map((o) => (
                                                    <SelectItem key={o.id} value={o.wo_number}>
                                                        {o.wo_number} — {o.client_name}
                                                    </SelectItem>
                                                ))}
                                            </div>
                                        )
                                        : <div className="p-2 text-sm text-muted-foreground">
                                            {qc.isFetching({ queryKey: ["work-orders"] }) ? "Loading Work Orders..." : "No Work Orders available"}
                                          </div>
                                    }
                                </SelectContent>
                            </Select>
                        </div>

                        {woData && (
                            <div className="space-y-6">

                                {/* AUTO-FILLED INFO */}
                                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Auto-filled from Work Order</p>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <Field label="Client" value={woData.client_name} />
                                        <Field label="Project" value={woData.project} />
                                        {(!woData.line_items || woData.line_items.length <= 1) && (
                                            <>
                                                <Field label="Item" value={woData.item} full />
                                                <Field label="Total Qty" value={`${woData.total_quantity} ${woData.uom || "Nos"}`} />
                                                <Field label="Unit Price" value={inr(woData.unit_price)} />
                                            </>
                                        )}
                                        <Field label="GST %" value={`${woData.gst || 0}%`} />
                                        <Field label="Freight" value={inr(woData.freight)} />
                                        <Field label="Site Location" value={woData.site_location} full />
                                        <Field label="Priority" value={woData.priority} />
                                        <Field label="Status" value={woData.status} />
                                        {woData.target_completion_date && <Field label="Target Completion" value={fmtDate(woData.target_completion_date)} />}
                                    </div>
                                </div>


                                {/* 1. Invoice Details */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                                    <div className="space-y-1">
                                        <Label>Invoice Number (Manual)</Label>
                                        <Input
                                            placeholder="Enter invoice number (optional)"
                                            value={manualInvoiceNumber}
                                            onChange={(e) => setManualInvoiceNumber(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Upload Invoice Document(s) {invoiceUrl && <span className="ml-1 text-primary">({invoiceUrl.split(";").filter(Boolean).length})</span>}</Label>
                                        <div className="space-y-2">
                                            <Input type="file" multiple className="hidden" id="wo-invoice-file-upload" onChange={handleInvoiceUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                            <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("wo-invoice-file-upload").click()}>
                                                <FileText className={`h-4 w-4 mr-2 ${invoiceUrl ? "text-green-500" : "text-red-500"}`} />
                                                {invoiceUrl ? `${invoiceUrl.split(";").length} File(s) Uploaded` : "Upload Invoice(s)"}
                                            </Button>
                                            {invoiceUrl && (
                                                <div className="grid grid-cols-1 gap-2 mt-2">
                                                    {invoiceUrl.split(";").map((url, i) => (
                                                        <FileItem key={i} url={url} onRemove={() => handleRemoveFile("invoice", url)} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 3. Buyer's Order & 4. Dispatched Through */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                                    <div className="space-y-1">
                                        <Label>Buyer's Order No. (Manual)</Label>
                                        <Input
                                            placeholder="Enter buyer's order number"
                                            value={buyersOrderNo}
                                            onChange={(e) => setBuyersOrderNo(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Dispatched Through (Manual)</Label>
                                        <Input
                                            placeholder="Enter courier/transport name"
                                            value={dispatchedThrough}
                                            onChange={(e) => setDispatchedThrough(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Addresses */}
                                <div className="space-y-4 pt-2 border-t border-border">
                                    <div className="space-y-1">
                                        <Label>Dispatch From (Source Address)</Label>
                                        <Textarea
                                            placeholder="Enter source address"
                                            value={dispatchFrom}
                                            onChange={(e) => setDispatchFrom(e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label>Ship To (Delivery Address) *</Label>
                                            <Textarea
                                                placeholder="Enter delivery address"
                                                value={shipTo}
                                                onChange={(e) => setShipTo(e.target.value)}
                                                rows={3}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label>Bill To (Billing Address) *</Label>
                                            <Textarea
                                                placeholder="Enter billing address"
                                                value={billTo}
                                                onChange={(e) => setBillTo(e.target.value)}
                                                rows={3}
                                            />
                                        </div>
                                    </div>

                                </div>

                                {/* ITEM DISPATCH SECTION (Form and List) */}
                                <div className="space-y-4">
                                    <div className="space-y-4 pt-4 border-t border-border">
                                        <div className="space-y-1">
                                            <Label>Item Name (Select from Work Order) *</Label>
                                            <Select value={selectedLineItemId} onValueChange={handleItemChange}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={manualItem || "Select an item"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {woData.line_items?.length > 0 ? (
                                                        woData.line_items.map((li) => (
                                                            <SelectItem key={li.id} value={li.id.toString()}>
                                                                {li.item} ({getRealTimePending(li.id)} pending)
                                                            </SelectItem>
                                                        ))
                                                    ) : (
                                                        <SelectItem value="default">{woData.item} ({getRealTimePending("default")} pending)</SelectItem>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                            <div className="space-y-1">
                                                <Label>Rate (Rate)</Label>
                                                <Input type="number" step="0.01" min="0" value={manualUnitPrice} onChange={e => setManualUnitPrice(e.target.value)} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label>GST %</Label>
                                                <Input type="number" value={manualGstRate} onChange={e => setManualGstRate(e.target.value)} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label>UOM (from WO)</Label>
                                                <Input value={manualUom} disabled readOnly className="h-10 bg-muted/50" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between items-center">
                                                    <Label>Qty</Label>
                                                    {selectedLineItemId && (
                                                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                                            Pending: {getRealTimePending(selectedLineItemId)}
                                                        </span>
                                                    )}
                                                </div>
                                                <Input
                                                    type="number"
                                                    placeholder={selectedLineItemId ? `Max: ${getRealTimePending(selectedLineItemId)}` : ""}
                                                    value={dispatchQty}
                                                    onChange={(e) => setDispatchQty(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <Button type="button" variant="outline" className="w-full border-dashed border-primary text-primary hover:bg-primary/5" onClick={addItemToDispatch}>
                                            <Plus className="h-4 w-4 mr-2" /> Add Item to this Dispatch
                                        </Button>
                                    </div>

                                    {dispatchItems.length > 0 && (
                                        <div className="space-y-3 pt-4 border-t border-border">
                                            <Label className="text-xs font-semibold text-primary uppercase">Items in this Dispatch</Label>
                                            <div className="rounded-lg border border-border overflow-hidden">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-muted text-muted-foreground font-medium border-b border-border">
                                                        <tr>
                                                            <th className="p-2">Item Name</th>
                                                            <th className="p-2 text-center">WO Pending</th>
                                                            <th className="p-2 text-center">Dispatch Qty</th>
                                                            <th className="p-2 text-right">Rate</th>
                                                            <th className="p-2 text-right">GST</th>
                                                            <th className="p-2 text-right">Total</th>
                                                            <th className="p-2"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dispatchItems.map((item, idx) => (
                                                            <tr key={idx} className="border-b border-border/50">
                                                                <td className="p-2">
                                                                    <div className="font-medium">{item.item}</div>
                                                                </td>
                                                                <td className="p-2 text-center text-muted-foreground">{item.wo_pending} {item.uom}</td>
                                                                <td className="p-2 text-center font-semibold text-primary">{item.quantity} {item.uom}</td>
                                                                <td className="p-2 text-right">{inr(item.unit_price)}</td>
                                                                <td className="p-2 text-right">{inr(item.gst_amount)} ({item.gst_rate}%)</td>
                                                                <td className="p-2 text-right font-bold">{inr(item.total_amount)}</td>
                                                                <td className="p-2">
                                                                    <Button variant="ghost" size="sm" onClick={() => removeItemFromDispatch(idx)} className="h-6 w-6 p-0 text-destructive">
                                                                        <X className="h-3 w-3" />
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <div className="p-2 bg-primary/5 flex flex-wrap justify-between items-center text-[11px] gap-4">
                                                    {(() => {
                                                        const subtotal = dispatchItems.reduce((acc, i) => acc + i.subtotal, 0);
                                                        const calculatedGstAmt = dispatchItems.reduce((acc, i) => acc + i.gst_amount, 0);
                                                        const freight = Number(manualFreight) || 0;

                                                        let finalGstAmt = calculatedGstAmt;
                                                        if (manualTotalGstRate !== "") {
                                                            finalGstAmt = Math.round(subtotal * (Number(manualTotalGstRate) / 100));
                                                        }

                                                        return (
                                                            <>
                                                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                                                    <span className="text-muted-foreground">Subtotal: <b className="text-foreground">{inr(subtotal)}</b></span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-muted-foreground whitespace-nowrap">GST Rate (%):</span>
                                                                        <Input
                                                                            type="number"
                                                                            className="h-7 w-14 text-[11px] py-0 px-2 text-center"
                                                                            placeholder="Rate"
                                                                            value={manualTotalGstRate}
                                                                            onChange={(e) => setManualTotalGstRate(e.target.value)}
                                                                        />
                                                                        {manualTotalGstRate !== "" && (
                                                                            <span className="text-muted-foreground">({inr(finalGstAmt)})</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-muted-foreground whitespace-nowrap">Freight:</span>
                                                                        <Input
                                                                            type="number"
                                                                            className="h-7 w-20 text-[11px] py-0 px-2"
                                                                            placeholder="0"
                                                                            value={manualFreight}
                                                                            onChange={(e) => setManualFreight(e.target.value)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="font-bold text-primary text-sm">
                                                                    Total Payable: {inr(subtotal + finalGstAmt + (Number(manualFreight) || 0))}
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* HSN/SAC */}
                                <div className="space-y-1 pt-2 border-t border-border">
                                    <Label>HSN/SAC</Label>
                                    <Input
                                        placeholder="Enter HSN/SAC code"
                                        value={hsnCode}
                                        onChange={(e) => setHsnCode(e.target.value)}
                                    />
                                </div>

                                {/* Payment Status */}
                                <div className="space-y-1 pt-2 border-t border-border">
                                    <Label>Payment Status</Label>
                                    <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {PAYMENT_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddSale} className="bg-gradient-primary" disabled={createMutation.isPending}>Add Sales Invoice</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Sale Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Edit Sale: {editingSale?.wo_number}</DialogTitle></DialogHeader>
                            {editingSale && (
                                <div className="space-y-4 py-2">
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <Field label="Items" value={editingSale.item} full />
                                        <Field label="Dispatched Qty" value={`${editingSale.dispatched_qty} ${editingSale.uom || "Nos"}`} />
                                    </div>
                                    <div className="rounded-lg border border-border bg-muted/50 overflow-hidden">
                                        <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider">Item Details (Editable)</div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead className="bg-muted/30">
                                                    <tr>
                                                        <th className="text-left p-2">Item</th>
                                                        <th className="text-center p-2 w-16">UOM</th>
                                                        <th className="text-center p-2 w-24">Qty</th>
                                                        <th className="text-right p-2 w-24">Rate</th>
                                                        <th className="text-right p-2 w-20">GST %</th>
                                                        <th className="text-right p-2 w-28">Total</th>
                                                        <th className="text-center p-2 w-10"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {editItems.map((item, idx) => (
                                                        <tr key={idx} className="border-t border-border/50">
                                                            <td className="p-2">
                                                                <Input className="h-8 text-xs bg-background" value={item.item} onChange={e => updateEditItem(idx, "item", e.target.value)} />
                                                            </td>
                                                            <td className="p-2 text-center">
                                                                <Select value={item.uom} onValueChange={v => updateEditItem(idx, "uom", v)}>
                                                                    <SelectTrigger className="h-8 text-[10px] px-1 bg-background">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {uom_options.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                            </td>
                                                            <td className="p-2 text-center">
                                                                <Input type="number" className="h-8 text-xs text-center bg-background px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={item.quantity} onChange={e => updateEditItem(idx, "quantity", e.target.value)} />
                                                            </td>
                                                            <td className="p-2 text-right">
                                                                <Input type="number" step="0.01" min="0" className="h-8 text-xs text-right bg-background px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={item.unit_price} onChange={e => updateEditItem(idx, "unit_price", e.target.value)} />
                                                            </td>
                                                            <td className="p-2 text-right">
                                                                <Input type="number" className="h-8 text-xs text-right bg-background px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={item.gst_rate} onChange={e => updateEditItem(idx, "gst_rate", e.target.value)} />
                                                            </td>
                                                            <td className="p-2 text-right font-bold">{inr((Number(item.subtotal) || 0) + (Number(item.gst_amount) || 0))}</td>
                                                            <td className="p-2 text-center">
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                                    onClick={() => removeEditItem(idx)}
                                                                    title="Remove item"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="bg-primary/5 p-3 flex flex-wrap justify-between items-center text-[11px] border-t border-border">
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                                <span className="text-muted-foreground">Subtotal: <b className="text-foreground">{inr(editSubtotal)}</b></span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground whitespace-nowrap">GST (%):</span>
                                                    <Input
                                                        type="number"
                                                        className="h-7 w-14 text-[11px] py-0 px-2 text-center bg-background"
                                                        placeholder="Rate"
                                                        value={editManualTotalGstRate}
                                                        onChange={(e) => setEditManualTotalGstRate(e.target.value)}
                                                    />
                                                    <span className="text-muted-foreground">({inr(editGstAmount)})</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground whitespace-nowrap">Freight:</span>
                                                    <Input
                                                        type="number"
                                                        className="h-7 w-20 text-right text-[11px] bg-background"
                                                        value={editManualFreight}
                                                        onChange={(e) => setEditManualFreight(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-sm font-bold text-primary">
                                                Grand Total: {inr(editGrandTotal)}
                                            </div>
                                        </div>
                                    </div>
                            {/* 1. Invoice Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                                <div className="space-y-1">
                                    <Label>Invoice Number</Label>
                                    <Input value={editInvoiceNumber} onChange={(e) => setEditInvoiceNumber(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Upload Updated Invoice Document(s) {editInvoiceUrl && <span className="ml-1 text-primary">({editInvoiceUrl.split(";").filter(Boolean).length})</span>}</Label>
                                    <div className="space-y-2">
                                        <Input type="file" multiple className="hidden" id="wo-edit-invoice-file-upload" onChange={handleEditInvoiceUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                        <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("wo-edit-invoice-file-upload").click()}>
                                            <FileText className={`h-4 w-4 mr-2 ${editInvoiceUrl ? "text-green-500" : "text-red-500"}`} />
                                            {editInvoiceUrl ? `${editInvoiceUrl.split(";").length} File(s) Uploaded` : "Upload Invoice(s)"}
                                        </Button>
                                        {editInvoiceUrl && (
                                            <div className="grid grid-cols-1 gap-2 mt-2">
                                                {editInvoiceUrl.split(";").map((url, i) => (
                                                    <FileItem key={i} url={url} onRemove={() => handleRemoveFile("edit-invoice", url)} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 3. Buyer's Order & 4. Dispatched Through */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                                <div className="space-y-1">
                                    <Label>Buyer's Order No.</Label>
                                    <Input value={editBuyersOrderNo} onChange={(e) => setEditBuyersOrderNo(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Dispatched Through</Label>
                                    <Input value={editDispatchedThrough} onChange={(e) => setEditDispatchedThrough(e.target.value)} />
                                </div>
                            </div>

                            {/* Addresses */}
                            <div className="space-y-4 pt-2 border-t border-border">
                                <div className="space-y-1">
                                    <Label>Dispatch From (Source Address)</Label>
                                    <Textarea value={editDispatchFrom} onChange={(e) => setEditDispatchFrom(e.target.value)} rows={2} />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label>Ship To (Delivery Address)</Label>
                                        <Textarea value={editShipTo} onChange={(e) => setEditShipTo(e.target.value)} rows={3} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Bill To (Billing Address)</Label>
                                        <Textarea value={editBillTo} onChange={(e) => setEditBillTo(e.target.value)} rows={3} />
                                    </div>
                                </div>
                            </div>

                            {/* HSN/SAC */}
                            <div className="space-y-1 pt-2 border-t border-border">
                                <Label>HSN/SAC</Label>
                                <Input
                                    placeholder="Enter HSN/SAC code"
                                    value={editHsnCode}
                                    onChange={(e) => setEditHsnCode(e.target.value)}
                                />
                            </div>

                            {/* Payment Status */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                                <div className="space-y-1">
                                    <Label>Payment Status</Label>
                                    <Select value={editPaymentStatus} onValueChange={setEditPaymentStatus}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {PAYMENT_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label>Update Note</Label>
                                    <Input placeholder="Optional note about this edit" value={editPaymentNote} onChange={(e) => setEditPaymentNote(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateSale} className="bg-gradient-primary" disabled={updateMutation.isPending}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>



            {/* Dispatch More Dialog */}
            <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {dispatchTarget ? "Add Items to Existing Dispatch" : "Quick Dispatch"}: {dispatchTarget?.wo_number || woData?.wo_number}
                        </DialogTitle>
                    </DialogHeader>
                    {woData && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <Label>Item Name (Select from Work Order) *</Label>
                                    <Select value={selectedLineItemId} onValueChange={handleItemChange}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={manualItem || "Select an item"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {woData.line_items?.length > 0 ? (
                                                woData.line_items.map((li) => (
                                                    <SelectItem key={li.id} value={li.id.toString()}>
                                                        {li.item} ({getRealTimePending(li.id)} pending)
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <SelectItem value="default">{woData.item} ({getRealTimePending("default")} pending)</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label>Invoice No.</Label>
                                        <Input placeholder="Enter invoice number" value={manualInvoiceNumber} onChange={e => setManualInvoiceNumber(e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Upload Invoice Document(s) {invoiceUrl && <span className="ml-1 text-primary">({invoiceUrl.split(";").filter(Boolean).length})</span>}</Label>
                                        <div className="space-y-2">
                                            <Input type="file" multiple className="hidden" id="dispatch-wo-invoice-file-upload" onChange={handleInvoiceUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                            <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("dispatch-wo-invoice-file-upload").click()}>
                                                <FileText className={`h-4 w-4 mr-2 ${invoiceUrl ? "text-green-500" : "text-red-500"}`} />
                                                {invoiceUrl ? `${invoiceUrl.split(";").length} File(s) Uploaded` : "Upload Invoice(s)"}
                                            </Button>
                                            {invoiceUrl && (
                                                <div className="grid grid-cols-1 gap-2 mt-2">
                                                    {invoiceUrl.split(";").map((url, i) => (
                                                        <FileItem key={i} url={url} onRemove={() => handleRemoveFile("invoice", url)} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                    <div className="space-y-1">
                                        <Label>Rate (Rate)</Label>
                                        <Input type="number" value={manualUnitPrice} onChange={e => setManualUnitPrice(e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>GST %</Label>
                                        <Input type="number" value={manualGstRate} onChange={e => setManualGstRate(e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>UOM (from WO)</Label>
                                        <Input value={manualUom} disabled readOnly className="h-10 bg-muted/50" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center">
                                            <Label>Qty</Label>
                                            {selectedLineItemId && (
                                                <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                                    Pending: {getRealTimePending(selectedLineItemId)}
                                                </span>
                                            )}
                                        </div>
                                        <Input
                                            type="number"
                                            placeholder={selectedLineItemId ? `Max: ${getRealTimePending(selectedLineItemId)}` : ""}
                                            value={dispatchQty}
                                            onChange={(e) => setDispatchQty(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <Button type="button" variant="outline" className="w-full border-dashed border-primary text-primary hover:bg-primary/5" onClick={addItemToDispatch}>
                                    <Plus className="h-4 w-4 mr-2" /> Add Item to this Dispatch
                                </Button>
                            </div>

                            {dispatchItems.length > 0 && (
                                <div className="space-y-3 pt-4 border-t border-border">
                                    <Label className="text-xs font-semibold text-primary uppercase">Items to Dispatch</Label>
                                    <div className="rounded-lg border border-border overflow-hidden">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-muted text-muted-foreground font-medium border-b border-border">
                                                <tr>
                                                    <th className="p-2">Item Name</th>
                                                    <th className="p-2 text-center">Dispatch Qty</th>
                                                    <th className="p-2 text-right">Total</th>
                                                    <th className="p-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dispatchItems.map((item, idx) => (
                                                    <tr key={idx} className="border-b border-border/50">
                                                        <td className="p-2">
                                                            <div className="font-medium">{item.item}</div>
                                                        </td>
                                                        <td className="p-2 text-center font-semibold text-primary">{item.quantity} {item.uom}</td>
                                                        <td className="p-2 text-right font-bold">{inr(item.total_amount)}</td>
                                                        <td className="p-2">
                                                            <Button variant="ghost" size="sm" onClick={() => removeItemFromDispatch(idx)} className="h-6 w-6 p-0 text-destructive">
                                                                <X className="h-3 w-3" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDispatchOpen(false)}>Cancel</Button>
                        <Button onClick={handleQuickDispatch} className="bg-gradient-primary" disabled={createMutation.isPending}>Confirm Quick Dispatch</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Activity Dialog */}
            <Dialog open={!!viewSale} onOpenChange={(o) => !o && setViewSale(null)}>
                <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Sale Activity Log</DialogTitle></DialogHeader>
                    {viewSale && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <Field label="WO Number" value={viewSale.wo_number} />
                                <Field label="Client" value={viewSale.client_name} />
                                <Field label="Items" value={viewSale.item} full />
                                <Field label="Invoice #" value={viewSale.invoice_number} />
                                <Field label="Dispatched Qty" value={`${viewSale.dispatched_qty} ${viewSale.uom || "Nos"}`} />
                                <Field label="Grand Total" value={inr(viewSale.grand_total)} />
                                <Field label="Payment Status" value={viewSale.payment_status} />
                                <Field label="Delivery Status" value={viewSale.delivery_status} />
                                <Field label="Dispatch From" value={viewSale.dispatch_from} full />
                                <Field label="Ship To" value={viewSale.ship_to} full />
                                <Field label="Bill To" value={viewSale.bill_to} full />
                                <Field label="Dispatched Through" value={viewSale.dispatched_through} full />
                            </div>
                            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item Details</p>
                                <div className="rounded-md border border-border overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-muted text-muted-foreground font-medium border-b border-border">
                                            <tr>
                                                <th className="p-2">Item</th>
                                                <th className="p-2 text-center">Qty</th>
                                                <th className="p-2 text-right">Rate</th>
                                                <th className="p-2 text-right">GST</th>
                                                <th className="p-2 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(viewSale.items || []).map((it, idx) => (
                                                <tr key={idx} className="border-b border-border/50">
                                                    <td className="p-2 font-medium">{it.item}</td>
                                                    <td className="p-2 text-center">{it.quantity} {it.uom}</td>
                                                    <td className="p-2 text-right">{inr(it.unit_price)}</td>
                                                    <td className="p-2 text-right">{inr(it.gst_amount)} ({it.gst_rate}%)</td>
                                                    <td className="p-2 text-right font-bold">{inr(it.total_amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {/* Subtotal/GST/Grand Total below come straight from the
                                            API (single source of truth) — not recomputed here — so
                                            this Invoice Preview always matches every other view. */}
                                        <tfoot className="bg-muted/50 font-semibold">
                                            <tr>
                                                <td colSpan="4" className="p-2 text-right">Subtotal:</td>
                                                <td className="p-2 text-right">{inr(viewSale.subtotal)}</td>
                                            </tr>
                                            <tr>
                                                <td colSpan="4" className="p-2 text-right">Total GST:</td>
                                                <td className="p-2 text-right">{inr(viewSale.gst_amount)}</td>
                                            </tr>
                                            <tr>
                                                <td colSpan="4" className="p-2 text-right">Freight:</td>
                                                <td className="p-2 text-right">{inr(viewSale.freight)}</td>
                                            </tr>
                                            <tr className="text-primary bg-primary/5 text-sm">
                                                <td colSpan="4" className="p-2 text-right">Grand Total:</td>
                                                <td className="p-2 text-right">{inr(viewSale.grand_total)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="space-y-1">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Invoice Doc(s)</div>
                                    {viewSale.invoice_urls?.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-2 mt-1">
                                            {viewSale.invoice_urls.map((url, i) => (
                                                <FileItem key={i} url={url} />
                                            ))}
                                        </div>
                                    ) : <span className="text-xs text-muted-foreground">—</span>}
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Delivery Challan</div>
                                    {viewSale.delivery_challan_urls?.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-2 mt-1">
                                            {viewSale.delivery_challan_urls.map((url, i) => (
                                                <FileItem key={i} url={url} />
                                            ))}
                                        </div>
                                    ) : <span className="text-xs text-muted-foreground">—</span>}
                                </div>
                                <Field label="Buyer's Order No." value={viewSale.buyers_order_no} full />
                                <Field label="HSN/SAC" value={viewSale.hsn_code} />
                                <Field label="Payment Terms" value={viewSale.payment_terms} full />
                            </div>
                            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <Clock className="h-4 w-4 text-accent" /> Activities
                                </div>
                                {(viewSale.activities || []).map((act, i) => (
                                    <div key={i} className="text-xs border-l-2 border-primary/40 pl-3 space-y-0.5">
                                        <div className="font-semibold text-foreground">{act.action}</div>
                                        <div className="text-muted-foreground">{act.note}</div>
                                        <div className="flex items-center gap-1 text-muted-foreground">
                                            <User className="h-3 w-3" />
                                            <span>{act.by || "—"}</span>
                                            <span>·</span>
                                            <span>{fmtDateTime(act.at)}</span>
                                        </div>
                                        <div><StatusBadge status={act.payment_status === "Paid" ? "Delivered" : act.payment_status === "Partial" ? "Partial" : "Pending"} label={act.payment_status} /></div>
                                    </div>
                                ))}
                                {(!viewSale.activities || viewSale.activities.length === 0) && (
                                    <p className="text-xs text-muted-foreground">No activities recorded.</p>
                                )}
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewSale(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Search bar */}
            {sales.length > 1 && (
                <Card className="p-4 shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input className="pl-9" placeholder="Search by WO number, client, item, project..."
                                value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        {filteredSales.length > 0 && (
                            <label className="flex items-center gap-2 text-sm text-muted-foreground shrink-0 cursor-pointer">
                                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                                Select All
                            </label>
                        )}
                    </div>
                </Card>
            )}

            {/* Sales List */}
            {isLoading && sales.length === 0 ? (
                <Card className="p-12 text-center shadow-card"><p className="text-muted-foreground">Loading sales records...</p></Card>
            ) : filteredSales.length === 0 ? (
                <Card className="p-12 text-center shadow-card">
                    <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                        {sales.length === 0 ? <>No sales yet. Click <b>Add New Sale</b> to get started.</> : "No sales match your search."}
                    </p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {(filteredSales || []).map((sale) => {
                        const wo = (orders || []).find((o) => o.id === sale.wo_id);
                        const totalDispatched = (sale.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0) || 0;
                        // Subtotal/GST/Grand Total come straight from the API (single
                        // source of truth, computed once on the backend) — never
                        // recalculated here, so they always match every other view.
                        return (
                            <Card key={sale.id} className={`p-5 shadow-card space-y-4${sale.payment_note ? " bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                        <Checkbox checked={selectedIds.has(sale.id)} onCheckedChange={() => toggleSelectOne(sale.id)} aria-label={`Select sale ${sale.invoice_number || sale.wo_number}`} />
                                        <div>
                                        <span className="font-semibold text-foreground">{sale.wo_number}</span>
                                        <span className="ml-2 text-sm text-muted-foreground">— {sale.client_name}</span>
                                        {sale.invoice_number && (
                                            <span className="ml-2 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{sale.invoice_number}</span>
                                        )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <StatusBadge
                                            status={sale.payment_status === "Paid" ? "Delivered" : sale.payment_status === "Partial" ? "Partial" : "Pending"}
                                            label={sale.payment_status}
                                        />
                                        <StatusBadge
                                            status={sale.delivery_status === "Delivered" ? "Delivered" : "Not Delivered"}
                                            label={sale.delivery_status}
                                        />
                                        {wo?.status && (
                                            <StatusBadge status={wo.status} label={`WO: ${wo.status}`} />
                                        )}
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button onClick={() => setViewSale(sale)}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors">
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>View Activity</p></TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button onClick={() => openEditSale(sale)}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-blue-500">
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>Edit Sale</p></TooltipContent>
                                        </Tooltip>

                                        <FilePopover
                                            urls={sale.invoice_url}
                                            icon={FileText}
                                            label="Invoice"
                                            saleId={sale.id}
                                            onUploadClick={() => {
                                                setUploadingSaleId(sale.id);
                                                document.getElementById("wo-direct-invoice-upload").click();
                                            }}
                                        />

                                        {sale.delivery_challan_url && (
                                            <FilePopover
                                                urls={sale.delivery_challan_url}
                                                icon={FileText}
                                                label="Delivery Challan"
                                                saleId={sale.id}
                                            />
                                        )}

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button onClick={() => setItemToDelete(sale.id)}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-destructive/10 text-destructive transition-colors">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>Delete Sale</p></TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
                                    {/* Items — expandable when more than one product */}
                                    {(() => {
                                        const items = sale.items || [];
                                        const isExpanded = expandedSales.has(sale.id);
                                        if (items.length <= 1) {
                                            return <Field label="Items" value={sale.item} full />;
                                        }
                                        return (
                                            <div className="col-span-2">
                                                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Items</div>
                                                {isExpanded ? (
                                                    <div>
                                                        <div className="space-y-0.5">
                                                            {items.map((it, idx) => (
                                                                <div key={idx} className="text-sm">
                                                                    <span className="font-medium text-foreground">{it.item}</span>
                                                                    <span className="text-muted-foreground ml-2">— {it.quantity} {it.uom}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <button onClick={() => toggleExpanded(sale.id)} className="flex items-center gap-1 text-xs text-primary mt-1.5 hover:underline">
                                                            <ChevronUp className="h-3 w-3" /> Show less
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-foreground">{items[0].item}</span>
                                                        <button onClick={() => toggleExpanded(sale.id)} className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
                                                            <ChevronDown className="h-3 w-3" /> and {items.length - 1} more
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    <Field label="Dispatched Qty" value={`${sale.dispatched_qty} ${sale.uom || "Nos"}`} />
                                    <Field label="Project" value={sale.project} />
                                    <Field label="Total Docs" value={`${(sale.invoice_url?.split(";")?.filter(Boolean)?.length || 0) + (sale.delivery_challan_url?.split(";")?.filter(Boolean)?.length || 0)} File(s)`} />
                                    <Field label="Invoice Total" value={inr(sale.grand_total)} />
                                    <Field label="Subtotal" value={inr(sale.subtotal)} />
                                    <Field label="Total GST" value={inr(sale.gst_amount)} />
                                    <Field label="Freight" value={inr(sale.freight)} />
                                    <Field label="Dispatched Through" value={sale.dispatched_through} />
                                    <Field label="HSN/SAC" value={sale.hsn_code} />
                                    <Field label="Buyer's Order No." value={sale.buyers_order_no} />
                                </div>

                                <div className="flex flex-wrap gap-6 text-xs border-t border-border pt-3">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Created By</div>
                                        <div className="font-semibold text-foreground">{sale.created_by || "—"}</div>
                                        <div className="text-muted-foreground">{fmtDateTime(sale.created_at)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Last Updated By</div>
                                        <div className="font-semibold text-foreground">{sale.updated_by || "—"}</div>
                                        <div className="text-muted-foreground">{fmtDateTime(sale.updated_at)}</div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button size="xs" variant="outline" className="border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => openDispatch(sale)}>
                                        <Truck className="h-3 w-3 mr-1" /> Dispatch More
                                    </Button>
                                    <Button size="xs" variant="outline" className="border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => openWOInvoiceDocument(sale.id)}>
                                        <Package className="h-3 w-3 mr-1" /> Generate Invoice
                                    </Button>
                                    <Button size="xs" variant="outline" className="border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => downloadWOInvoiceDocument(sale.id)}>
                                        <Download className="h-3 w-3 mr-1" /> Download Invoice
                                    </Button>
                                    {(() => {
                                        const hasValidChallan = (url) => {
                                            if (!url) return false;
                                            return url.split(";").filter(u => u && u.trim() !== "").length > 0;
                                        };

                                        const currentSaleHasChallan = hasValidChallan(sale.delivery_challan_url);
                                        const isFullyComplete = wo?.status === "Completed";

                                        let finalBtnClass = "bg-red-600 border-red-600 text-white hover:bg-red-700"; // Default: Red (No challan)

                                        if (currentSaleHasChallan) {
                                            if (isFullyComplete) {
                                                finalBtnClass = "bg-green-600 border-green-600 text-white hover:bg-green-700"; // Success: Everything done
                                            } else {
                                                finalBtnClass = "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"; // Progress: Current done, but others pending
                                            }
                                        }

                                        return (
                                            <Button
                                                size="xs"
                                                className={finalBtnClass}
                                                onClick={() => {
                                                    setMarkDeliveredTarget(sale);
                                                    setDeliveryChallanUrl(sale.delivery_challan_url || "");
                                                    setMarkDeliveredOpen(true);
                                                }}
                                            >
                                                <CheckCircle className="h-3 w-3 mr-1" /> Mark Delivered
                                            </Button>
                                        );
                                    })()}
                                    {PAYMENT_STATUS.filter((s) => s !== sale.payment_status).map((s) => (
                                        <Button key={s} size="xs" variant="outline" className="border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => handlePaymentUpdate(sale.id, s)}>
                                            <CreditCard className="h-3 w-3 mr-1" /> Mark {s}
                                        </Button>
                                    ))}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Confirm Deletion</DialogTitle></DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">Are you sure you want to delete this sale? This action cannot be undone.</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setItemToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDeleteSale} disabled={deleteMutation.isPending}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Confirm Bulk Deletion</DialogTitle></DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">
                            Delete {selectedIds.size} selected sale{selectedIds.size === 1 ? "" : "s"}? This action cannot be undone.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDeleteConfirmOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            disabled={bulkDeleteMutation.isPending}
                            onClick={() => { bulkDeleteMutation.mutate(Array.from(selectedIds)); setBulkDeleteConfirmOpen(false); }}
                        >
                            Delete Selected
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Mark Delivered Confirmation Dialog */}
            <Dialog open={markDeliveredOpen} onOpenChange={(open) => !open && setMarkDeliveredOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Mark as Delivered</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">Upload the delivery challan document to mark this sale as Delivered.</p>
                        <div className="space-y-2">
                            <Label>Delivery Challan Document(s) * {deliveryChallanUrl && <span className="ml-1 text-primary">({deliveryChallanUrl.split(";").filter(Boolean).length})</span>}</Label>
                            <div className="space-y-2">
                                <Input type="file" multiple className="hidden" id="wo-challan-file-upload" onChange={handleDeliveryChallanUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("wo-challan-file-upload").click()}>
                                    <FileText className={`h-4 w-4 mr-2 ${deliveryChallanUrl ? "text-green-500" : "text-red-500"}`} />
                                    {deliveryChallanUrl ? `${deliveryChallanUrl.split(";").filter(Boolean).length} File(s) Uploaded` : "Upload Challan(s)"}
                                </Button>
                                {deliveryChallanUrl && (
                                    <div className="grid grid-cols-1 gap-2 mt-2">
                                        {deliveryChallanUrl.split(";").map((url, i) => (
                                            <FileItem key={i} url={url} onRemove={() => handleRemoveFile("challan", url)} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMarkDeliveredOpen(false)}>Cancel</Button>
                        <Button onClick={handleMarkDelivered} className="bg-gradient-primary" disabled={!deliveryChallanUrl || updateMutation.isPending}>Mark Delivered</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <input
                type="file"
                id="wo-direct-invoice-upload"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleDirectInvoiceUpload(e, uploadingSaleId)}
            />
            {/* Sales Import Dialog */}
            <Dialog open={salesImportOpen} onOpenChange={(o) => { setSalesImportOpen(o); if (!o) { setSalesImportFile(null); setSalesImportResult(null); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-blue-600" /> Import Work Order Sales
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                            Upload an Excel (.xlsx) file exported from this system. All Sales fields will be auto-populated including Invoice Number, E-Way Bill, dispatch info, and items.
                        </p>
                        <div className="space-y-2">
                            <Label>Select File (.xlsx or .csv)</Label>
                            <div
                                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                                onClick={() => salesImportRef.current?.click()}
                            >
                                {salesImportFile ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-green-700">
                                        <FileText className="h-4 w-4" />
                                        <span className="font-medium">{salesImportFile.name}</span>
                                        <span className="text-muted-foreground">({(salesImportFile.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                ) : (
                                    <div className="text-muted-foreground text-sm">
                                        <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                                        Click to choose or drop a file here
                                    </div>
                                )}
                            </div>
                            <input
                                ref={salesImportRef}
                                type="file"
                                className="hidden"
                                accept=".xlsx,.csv,.json"
                                onChange={(e) => { setSalesImportFile(e.target.files[0] || null); setSalesImportResult(null); }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>If Invoice Number already exists</Label>
                            <Select value={salesImportConflict} onValueChange={setSalesImportConflict}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="skip">Skip — keep existing record (safe)</SelectItem>
                                    <SelectItem value="update">Update — overwrite payment / dispatch fields</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {salesImportResult && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
                                <div className="font-semibold text-foreground mb-2">Import Results</div>
                                <div className="flex gap-4 flex-wrap">
                                    <span className="text-green-700">Created: <strong>{salesImportResult.created}</strong></span>
                                    <span className="text-blue-700">Updated: <strong>{salesImportResult.updated}</strong></span>
                                    <span className="text-orange-600">Skipped: <strong>{salesImportResult.skipped}</strong></span>
                                </div>
                                {salesImportResult.errors?.length > 0 && (
                                    <div className="mt-2">
                                        <div className="text-destructive font-medium text-xs mb-1">Errors ({salesImportResult.errors.length}):</div>
                                        <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                                            {salesImportResult.errors.map((e, i) => (
                                                <li key={i} className="text-destructive text-xs">• {e}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSalesImportOpen(false)}>Close</Button>
                        <Button
                            onClick={handleSalesImport}
                            disabled={!salesImportFile || salesImporting}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {salesImporting ? "Importing…" : "Import"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
        </TooltipProvider>
    );
};

const Field = ({ label, value, full }) => (
    <div className={full ? "col-span-2" : ""}>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground break-words">{value ?? "—"}</div>
    </div>
);

export default WorkOrderSales;
