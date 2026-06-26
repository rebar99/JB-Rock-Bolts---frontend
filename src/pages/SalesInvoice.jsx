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
import { StatusBadge } from "@/components/StatusBadge";
import { inr, fmtDate, fmtDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/currentUser";
import { useConstants } from "@/lib/constants";
import {
    fetchPurchaseOrders, fetchSales, createSale, updateSale,
    deleteSale as deleteSaleApi, addSaleActivity, openInvoiceDocument, downloadInvoiceDocument,
    uploadInvoiceFile, exportSales, importSales,
} from "@/lib/api";
import { toast } from "sonner";
import { Plus, Truck, Clock, CreditCard, Eye, Package, User, Trash2, Search, Download, UploadCloud, FileText, X, Pencil, Receipt, CheckCircle, Printer, FileDown, Upload } from "lucide-react";

const PAYMENT_STATUS = ["Pending", "Partial", "Paid"];

const SalesInvoice = () => {
    const qc = useQueryClient();
    const { uom_options } = useConstants();

    const { data: orders = [] } = useQuery({
        queryKey: ["purchase-orders"],
        queryFn: () => fetchPurchaseOrders(),
    });

    const { data: sales = [], isLoading } = useQuery({
        queryKey: ["sales"],
        queryFn: () => fetchSales(),
    });

    const invalidateSales = () => {
        qc.invalidateQueries({ queryKey: ["sales"] });
        qc.invalidateQueries({ queryKey: ["purchase-orders"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    };

    

    const createMutation = useMutation({ mutationFn: createSale, onSuccess: invalidateSales });
    const updateMutation = useMutation({ mutationFn: ({ id, body }) => updateSale(id, body), onSuccess: invalidateSales });
    const deleteMutation = useMutation({
        mutationFn: (id) => deleteSaleApi(id, getCurrentUser()),
        onSuccess: () => {
            invalidateSales();
            toast.success("Sale record deleted successfully");
        },
        onError: (err) => {
            toast.error(err.message || "Failed to delete sale record");
        }
    });
    const activityMutation = useMutation({ mutationFn: ({ id, body }) => addSaleActivity(id, body), onSuccess: () => qc.invalidateQueries({ queryKey: ["sales"] }) });

    // Add Sale dialog
    const [addOpen, setAddOpen] = useState(false);
    const [selectedPO, setSelectedPO] = useState("");
    const [poData, setPoData] = useState(null);
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
    const [eWayBillUrl, setEWayBillUrl] = useState("");
    const [dispatchFrom, setDispatchFrom] = useState("");
    const [shipTo, setShipTo] = useState("");
    const [billTo, setBillTo] = useState("");
    const [manualInvoiceNumber, setManualInvoiceNumber] = useState("");
    const [dispatchedThrough, setDispatchedThrough] = useState("");
    const [eWayBillNo, setEWayBillNo] = useState("");
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
    const [search, setSearch] = useState("");
    const [editOpen, setEditOpen] = useState(false);
    const [editingSale, setEditingSale] = useState(null);
    const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
    const [editDispatchedThrough, setEditDispatchedThrough] = useState("");
    const [editEWayBillNo, setEditEWayBillNo] = useState("");
    const [editBuyersOrderNo, setEditBuyersOrderNo] = useState("");
    const [editDispatchFrom, setEditDispatchFrom] = useState("");
    const [editShipTo, setEditShipTo] = useState("");
    const [editBillTo, setEditBillTo] = useState("");
    const [editPaymentTerms, setEditPaymentTerms] = useState("");
    const [editPaymentNote, setEditPaymentNote] = useState("");
    const [editInvoiceUrl, setEditInvoiceUrl] = useState("");
    const [editEWayBillUrl, setEditEWayBillUrl] = useState("");
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
            await exportSales();
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
            const result = await importSales(salesImportFile, salesImportConflict);
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

    const pendingOnPO = (po) => {
        if (!po) return 0;
        return Math.max(0, (Number(po.total_quantity) || 0) - (Number(po.delivered_quantity) || 0));
    };

    const getRealTimePending = (lineItemId) => {
        if (!poData) return 0;
        let basePending = 0;
        if (lineItemId === "default" || !lineItemId) {
            basePending = pendingOnPO(poData);
        } else {
            const li = poData.line_items?.find(x => x.id.toString() === lineItemId.toString());
            basePending = li ? Math.max(0, li.quantity - li.delivered_quantity) : 0;
        }
        const alreadyStaged = dispatchItems
            .filter(item => {
                if (lineItemId === "default" || !lineItemId) return item.line_item_id === null;
                return item.line_item_id?.toString() === lineItemId.toString();
            })
            .reduce((acc, item) => acc + item.quantity, 0);
        return Math.max(0, basePending - alreadyStaged);
    };

    const calcAmounts = (po, qty) => {
        const unitPrice = Number(po.unit_price) || 0;
        const freight = Number(po.freight) || 0;
        const gstRate = parseFloat((po.gst || "0").toString().replace("%", "")) || 0;
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

    const handlePOChange = (poNumber) => {
        setSelectedPO(poNumber);
        const po = orders.find((o) => o.po_number === poNumber);
        setPoData(po || null);
        setDispatchQty("");
        setManualUom("Nos");
        setSelectedLineItemId("");

        const firstItem = po?.line_items?.[0];
        if (po?.line_items?.length > 0) {
            if (po.line_items.length === 1 && firstItem) {
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
            setManualItem(po?.item || "");
            setManualUnitPrice(po?.unit_price ? Number(po.unit_price).toFixed(2) : "");
            setManualUom(po?.uom || "Nos");
        }

        let parsedGst = 18;
        if (po?.gst?.toString().startsWith("₹")) {
            parsedGst = 0; // Fixed amount, so % is 0
        } else {
            const gstVal = parseFloat((po?.gst ?? "18").toString().replace("%", ""));
            parsedGst = isNaN(gstVal) ? 18 : gstVal;
        }
        setManualGstRate(parsedGst);
        setManualFreight(po?.freight?.toString() || "0");

        setPaymentStatus("Pending");
        setPaymentNote("");
        setInvoiceUrl("");
        setEWayBillUrl("");
        setShipTo(po?.location || "");
        setBillTo(""); // Leave empty as requested (don't fill name here)
        setManualInvoiceNumber("");
        setDispatchedThrough("");
        setEWayBillNo("");
        setBuyersOrderNo("");
        setPaymentTerms(po?.payment_terms || "");
        setHsnCode("");
    };

    const handleItemChange = (liId) => {
        setSelectedLineItemId(liId);
        const li = poData?.line_items?.find(x => x.id.toString() === liId);
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
        } else if (type === "eway") {
            const current = eWayBillUrl ? eWayBillUrl.split(";") : [];
            setEWayBillUrl(current.filter(u => u !== urlToRemove).join(";"));
        } else if (type === "edit-invoice") {
            const current = editInvoiceUrl ? editInvoiceUrl.split(";") : [];
            setEditInvoiceUrl(current.filter(u => u !== urlToRemove).join(";"));
        } else if (type === "edit-eway") {
            const current = editEWayBillUrl ? editEWayBillUrl.split(";") : [];
            setEditEWayBillUrl(current.filter(u => u !== urlToRemove).join(";"));
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
                const data = await uploadInvoiceFile(file);
                urls.push(data.file_url);
            }
            const current = invoiceUrl ? invoiceUrl.split(";") : [];
            setInvoiceUrl([...current, ...urls].join(";"));
            toast.success("Invoices uploaded", { id: tid });
        } catch (err) {
            toast.error("Upload failed: " + err.message, { id: tid });
        }
    };

    const handleEWayBillUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const tid = toast.loading(`Uploading ${files.length} e-way bill(s)...`);
        try {
            const urls = [];
            for (const file of files) {
                const data = await uploadInvoiceFile(file);
                urls.push(data.file_url);
            }
            const current = eWayBillUrl ? eWayBillUrl.split(";") : [];
            setEWayBillUrl([...current, ...urls].join(";"));
            toast.success("e-Way bills uploaded", { id: tid });
        } catch (err) {
            toast.error("Upload failed: " + err.message, { id: tid });
        }
    };

    const handleDirectInvoiceUpload = async (e, saleId) => {
        const file = e.target.files[0];
        if (!file || !saleId) return;
        const tid = toast.loading("Uploading invoice...");
        try {
            const data = await uploadInvoiceFile(file);
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

        const li = poData.line_items?.find(x => x.id.toString() === selectedLineItemId);

        const newItem = {
            line_item_id: selectedLineItemId === "default" ? null : Number(selectedLineItemId),
            item: manualItem,
            uom: manualUom,
            quantity: Number(dispatchQty),
            po_pending: pending - Number(dispatchQty), // The NEW pending after this add
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
        if (!poData) { toast.error("Select a PO first"); return; }
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
                po_id: poData.id,
                po_number: poData.po_number,
                client_name: poData.client_name,
                project: poData.project,
                items: dispatchItems,
                subtotal,
                gst_amount,
                freight,
                grand_total,
                payment_status: paymentStatus,
                payment_note: paymentNote || null,
                invoice_url: invoiceUrl || null,
                e_way_bill_url: eWayBillUrl || null,
                invoice_number: manualInvoiceNumber || null,
                dispatch_from: dispatchFrom || null,
                ship_to: shipTo || null,
                bill_to: billTo || null,
                dispatched_through: dispatchedThrough || null,
                e_way_bill_no: eWayBillNo || null,
                buyers_order_no: buyersOrderNo || null,
                payment_terms: paymentTerms || null,
                hsn_code: hsnCode || null,
                created_by: getCurrentUser(),
            });
            toast.success("Sales Invoice created");
            setAddOpen(false);
            setSelectedPO("");
            setPoData(null);
            setDispatchItems([]);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const openDispatch = (sale) => { 
        handlePOChange(sale.po_number); 
        setDispatchTarget(sale);
        setDispatchItems([]);
        setDispatchOpen(true); 
    };

    const handleQuickDispatch = async () => {
        if (!poData) { toast.error("Select a PO first"); return; }
        if (dispatchItems.length === 0) { toast.error("Add at least one item"); return; }

        if (dispatchTarget) {
            // UPDATE EXISTING SALE
            const combinedItems = [
                ...(dispatchTarget.items || []),
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

            const freight = Number(dispatchTarget.freight) || 0;
            const grand_total = subtotal + gst_amount + freight;

            try {
                await updateMutation.mutateAsync({
                    id: dispatchTarget.id,
                    body: {
                        items: combinedItems,
                        subtotal,
                        gst_amount,
                        grand_total,
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

                toast.success("Items added to existing dispatch");
                setDispatchOpen(false);
                setSelectedPO("");
                setPoData(null);
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
                    po_id: poData.id,
                    po_number: poData.po_number,
                    client_name: poData.client_name,
                    project: poData.project,
                    items: dispatchItems,
                    subtotal,
                    gst_amount,
                    freight: 0,
                    grand_total,
                    payment_status: "Pending",
                    payment_note: null,
                    invoice_url: null,
                    e_way_bill_url: null,
                    invoice_number: null,
                    dispatch_from: dispatchFrom || null,
                    ship_to: poData.location || null,
                    bill_to: null,
                    dispatched_through: null,
                    e_way_bill_no: null,
                    buyers_order_no: null,
                    payment_terms: poData.payment_terms || null,
                    hsn_code: null,
                    created_by: getCurrentUser(),
                });
                toast.success("Quick Dispatch created");
                setDispatchOpen(false);
                setSelectedPO("");
                setPoData(null);
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
        setEditEWayBillNo(sale.e_way_bill_no || "");
        setEditBuyersOrderNo(sale.buyers_order_no || "");
        setEditDispatchedThrough(sale.dispatched_through || "");
        setEditDispatchFrom(sale.dispatch_from || "");
        setEditShipTo(sale.ship_to || "");
        setEditBillTo(sale.bill_to || "");
        setEditPaymentTerms(sale.payment_terms || "");
        setEditPaymentNote(sale.payment_note || "");
        setEditPaymentStatus(sale.payment_status);
        setEditInvoiceUrl(sale.invoice_url || "");
        setEditEWayBillUrl(sale.e_way_bill_url || "");
        setEditHsnCode(sale.hsn_code || "");
        setEditManualFreight(sale.freight?.toString() || "0");
        setEditManualTotalGstRate("");
        
        // Load and recalculate all items to ensure UI consistency
        const items = (sale.items || []).map(it => {
            const q = Number(it.quantity) || 0;
            const p = Number(it.unit_price) || 0;
            const g = Number(it.gst_rate) || 0;
            const sub = q * p;
            const gst = Math.round(sub * g / 100);
            return { 
                ...it, 
                subtotal: sub,
                gst_amount: gst,
                total_amount: sub + gst
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
        
        item.subtotal = q * p;
        item.gst_amount = Math.round(item.subtotal * g / 100);
        item.total_amount = item.subtotal + item.gst_amount;
        
        newItems[idx] = item;
        setEditItems(newItems);
    };

    useEffect(() => {
        const sub = editItems.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0);
        const itemGst = editItems.reduce((acc, i) => acc + (Number(i.gst_amount) || 0), 0);
        const fr = Number(editManualFreight) || 0;
        
        let finalGst = itemGst;
        if (editManualTotalGstRate !== "") {
            finalGst = Math.round(sub * (Number(editManualTotalGstRate) / 100));
        }

        setEditSubtotal(sub);
        setEditGstAmount(finalGst);
        setEditGrandTotal(sub + finalGst + fr);
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
                    e_way_bill_no: editEWayBillNo || null,
                    buyers_order_no: editBuyersOrderNo || null,
                    dispatch_from: editDispatchFrom || null,
                    ship_to: editShipTo || null,
                    bill_to: editBillTo || null,
                    payment_terms: editPaymentTerms || null,
                    payment_note: editPaymentNote || null,
                    invoice_url: editInvoiceUrl || null,
                    e_way_bill_url: editEWayBillUrl || null,
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
                const data = await uploadInvoiceFile(file);
                urls.push(data.file_url);
            }
            const current = editInvoiceUrl ? editInvoiceUrl.split(";") : [];
            setEditInvoiceUrl([...current, ...urls].join(";"));
            toast.success("Invoices updated", { id: tid });
        } catch (err) {
            toast.error("Upload failed: " + err.message, { id: tid });
        }
    };

    const handleEditEWayBillUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const tid = toast.loading(`Uploading ${files.length} e-way bill(s)...`);
        try {
            const urls = [];
            for (const file of files) {
                const data = await uploadInvoiceFile(file);
                urls.push(data.file_url);
            }
            const current = editEWayBillUrl ? editEWayBillUrl.split(";") : [];
            setEditEWayBillUrl([...current, ...urls].join(";"));
            toast.success("e-Way bills updated", { id: tid });
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
                const data = await uploadInvoiceFile(file);
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

    const poCalc = useMemo(() => {
        if (!poData || !dispatchQty) return null;
        return calcAmounts({
            unit_price: manualUnitPrice,
            gst: manualGstRate,
            freight: manualFreight
        }, Number(dispatchQty));
    }, [poData, dispatchQty, manualUnitPrice, manualGstRate, manualFreight]);



    const filteredSales = useMemo(() => {
        if (!search.trim()) return sales;
        const q = search.toLowerCase();
        return sales.filter((s) =>
            (s.po_number || "").toLowerCase().includes(q) ||
            (s.client_name || "").toLowerCase().includes(q) ||
            (s.item || "").toLowerCase().includes(q) ||
            (s.project || "").toLowerCase().includes(q)
        );
    }, [sales, search]);

    return (
        <TooltipProvider>
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Sales</h2>
                    <p className="text-sm text-muted-foreground mt-1">Manage dispatch, invoicing, payments and activity tracking.</p>
                </div>
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
                    <DialogHeader><DialogTitle>Add New Sales Invoice</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label>Purchase Order No. *</Label>
                            <Select value={selectedPO} onValueChange={handlePOChange}>
                                <SelectTrigger><SelectValue placeholder="Select PO Number" /></SelectTrigger>
                                <SelectContent>
                                    {orders.length > 0
                                        ? orders.map((o) => (
                                            <SelectItem key={o.id} value={o.po_number}>
                                                {o.po_number} — {o.client_name}
                                            </SelectItem>
                                        ))
                                        : <div className="p-2 text-sm text-muted-foreground">
                                            {qc.isFetching({ queryKey: ["purchase-orders"] }) ? "Loading Purchase Orders..." : "No POs available"}
                                          </div>
                                    }
                                </SelectContent>
                            </Select>
                        </div>

                        {poData && (
                            <div className="space-y-6">

                                {/* AUTO-FILLED INFO */}
                                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Auto-filled from PO</p>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <Field label="Client" value={poData.client_name} />
                                        <Field label="Project" value={poData.project} />
                                        {(!poData.line_items || poData.line_items.length <= 1) && (
                                            <>
                                                <Field label="Item" value={poData.item} full />
                                                <Field label="Total Qty" value={`${poData.total_quantity} ${poData.uom || "Nos"}`} />
                                                <Field label="Unit Price" value={inr(poData.unit_price)} />
                                            </>
                                        )}
                                        <Field label="GST %" value={`${poData.gst || 0}%`} />
                                        <Field label="Freight" value={inr(poData.freight)} />
                                        <Field label="Payment Terms" value={poData.payment_terms} full />
                                        {poData.validity_date && <Field label="Validity" value={fmtDate(poData.validity_date)} />}
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
                                            <Input type="file" multiple className="hidden" id="invoice-file-upload" onChange={handleInvoiceUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                            <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("invoice-file-upload").click()}>
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

                                {/* 2. e-Way Bill Details */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                                    <div className="space-y-1">
                                        <Label>e-Way Bill No.</Label>
                                        <Input
                                            placeholder="Enter e-Way bill number"
                                            value={eWayBillNo}
                                            onChange={(e) => setEWayBillNo(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Upload e-Way Bill Document(s) {eWayBillUrl && <span className="ml-1 text-primary">({eWayBillUrl.split(";").filter(Boolean).length})</span>}</Label>
                                        <div className="space-y-2">
                                            <Input type="file" multiple className="hidden" id="eway-file-upload" onChange={handleEWayBillUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                            <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("eway-file-upload").click()}>
                                                <Receipt className={`h-4 w-4 mr-2 ${eWayBillUrl ? "text-green-500" : "text-red-500"}`} />
                                                {eWayBillUrl ? `${eWayBillUrl.split(";").length} File(s) Uploaded` : "Upload e-Way Bill(s)"}
                                            </Button>
                                            {eWayBillUrl && (
                                                <div className="grid grid-cols-1 gap-2 mt-2">
                                                    {eWayBillUrl.split(";").map((url, i) => (
                                                        <FileItem key={i} url={url} onRemove={() => handleRemoveFile("eway", url)} />
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
                                            <Label>Item Name (Select from PO) *</Label>
                                            <Select value={selectedLineItemId} onValueChange={handleItemChange}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={manualItem || "Select an item"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {poData.line_items?.length > 0 ? (
                                                        poData.line_items.map((li) => (
                                                            <SelectItem key={li.id} value={li.id.toString()}>
                                                                {li.item} ({getRealTimePending(li.id)} pending)
                                                            </SelectItem>
                                                        ))
                                                    ) : (
                                                        <SelectItem value="default">{poData.item} ({getRealTimePending("default")} pending)</SelectItem>
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
                                                <Label>UOM</Label>
                                                <Select value={manualUom} onValueChange={setManualUom}>
                                                    <SelectTrigger className="h-10">
                                                        <SelectValue placeholder="UOM" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {uom_options.map((u) => (
                                                            <SelectItem key={u} value={u}>{u}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
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
                                                            <th className="p-2 text-center">PO Pending</th>
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
                                                                <td className="p-2 text-center text-muted-foreground">{item.po_pending} {item.uom}</td>
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
                    <DialogHeader><DialogTitle>Edit Sale: {editingSale?.po_number}</DialogTitle></DialogHeader>
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
                                                        <th className="text-center p-2 w-20">Qty</th>
                                                        <th className="text-right p-2 w-24">Rate</th>
                                                        <th className="text-right p-2 w-20">GST %</th>
                                                        <th className="text-right p-2 w-24">Total</th>
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
                                                                <Input type="number" className="h-8 text-xs text-center bg-background" value={item.quantity} onChange={e => updateEditItem(idx, "quantity", e.target.value)} />
                                                            </td>
                                                            <td className="p-2 text-right">
                                                                <Input type="number" step="0.01" min="0" className="h-8 text-xs text-right bg-background" value={item.unit_price} onChange={e => updateEditItem(idx, "unit_price", e.target.value)} />
                                                            </td>
                                                            <td className="p-2 text-right">
                                                                <Input type="number" className="h-8 text-xs text-right bg-background" value={item.gst_rate} onChange={e => updateEditItem(idx, "gst_rate", e.target.value)} />
                                                            </td>
                                                            <td className="p-2 text-right font-bold">{inr((Number(item.subtotal) || 0) + (Number(item.gst_amount) || 0))}</td>
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
                                        <Input type="file" multiple className="hidden" id="edit-invoice-file-upload" onChange={handleEditInvoiceUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                        <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("edit-invoice-file-upload").click()}>
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

                            {/* 2. e-Way Bill Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                                <div className="space-y-1">
                                    <Label>e-Way Bill No.</Label>
                                    <Input value={editEWayBillNo} onChange={(e) => setEditEWayBillNo(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Upload Updated e-Way Bill Document(s) {editEWayBillUrl && <span className="ml-1 text-primary">({editEWayBillUrl.split(";").filter(Boolean).length})</span>}</Label>
                                    <div className="space-y-2">
                                        <Input type="file" multiple className="hidden" id="edit-eway-file-upload" onChange={handleEditEWayBillUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                        <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("edit-eway-file-upload").click()}>
                                            <Receipt className={`h-4 w-4 mr-2 ${editEWayBillUrl ? "text-green-500" : "text-red-500"}`} />
                                            {editEWayBillUrl ? `${editEWayBillUrl.split(";").length} File(s) Uploaded` : "Upload e-Way Bill(s)"}
                                        </Button>
                                        {editEWayBillUrl && (
                                            <div className="grid grid-cols-1 gap-2 mt-2">
                                                {editEWayBillUrl.split(";").map((url, i) => (
                                                    <FileItem key={i} url={url} onRemove={() => handleRemoveFile("edit-eway", url)} />
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
                            {dispatchTarget ? "Add Items to Existing Dispatch" : "Quick Dispatch"}: {dispatchTarget?.po_number || poData?.po_number}
                        </DialogTitle>
                    </DialogHeader>
                    {poData && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <Label>Item Name (Select from PO) *</Label>
                                    <Select value={selectedLineItemId} onValueChange={handleItemChange}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={manualItem || "Select an item"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {poData.line_items?.length > 0 ? (
                                                poData.line_items.map((li) => (
                                                    <SelectItem key={li.id} value={li.id.toString()}>
                                                        {li.item} ({getRealTimePending(li.id)} pending)
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <SelectItem value="default">{poData.item} ({getRealTimePending("default")} pending)</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
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
                                        <Label>UOM</Label>
                                        <Select value={manualUom} onValueChange={setManualUom}>
                                            <SelectTrigger className="h-10">
                                                <SelectValue placeholder="UOM" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {uom_options.map((u) => (
                                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
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
                                <Field label="PO Number" value={viewSale.po_number} />
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
                                <Field label="e-Way Bill No." value={viewSale.e_way_bill_no} />
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
                                                    <td className="p-2 text-right font-bold">{inr((Number(it.subtotal) || 0) + (Number(it.gst_amount) || 0))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-muted/50 font-semibold">
                                            {(() => {
                                                const items = viewSale.items || [];
                                                const calcSubtotal = items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
                                                const calcGst = items.reduce((acc, it) => acc + (Number(it.gst_amount) || 0), 0);
                                                const freight = Number(viewSale.freight) || 0;
                                                return (
                                                    <>
                                                        <tr>
                                                            <td colSpan="4" className="p-2 text-right">Subtotal:</td>
                                                            <td className="p-2 text-right">{inr(calcSubtotal)}</td>
                                                        </tr>
                                                        <tr>
                                                            <td colSpan="4" className="p-2 text-right">Total GST:</td>
                                                            <td className="p-2 text-right">{inr(calcGst)}</td>
                                                        </tr>
                                                        <tr>
                                                            <td colSpan="4" className="p-2 text-right">Freight:</td>
                                                            <td className="p-2 text-right">{inr(freight)}</td>
                                                        </tr>
                                                        <tr className="text-primary bg-primary/5 text-sm">
                                                            <td colSpan="4" className="p-2 text-right">Grand Total:</td>
                                                            <td className="p-2 text-right">{inr(calcSubtotal + calcGst + freight)}</td>
                                                        </tr>
                                                    </>
                                                );
                                            })()}
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
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">e-Way Bill Doc(s)</div>
                                    {viewSale.e_way_bill_urls?.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-2 mt-1">
                                            {viewSale.e_way_bill_urls.map((url, i) => (
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
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Search by PO number, client, item, project..."
                            value={search} onChange={(e) => setSearch(e.target.value)} />
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
                        const po = (orders || []).find((o) => o.id === sale.po_id);
                        const currentPending = po ? pendingOnPO(po) : 0;
                        const totalDispatched = (sale.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0) || 0;
                        const calcSubtotal = (sale.items || []).reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
                        const calcGst = (sale.items || []).reduce((acc, it) => acc + (Number(it.gst_amount) || 0), 0);
                        const calcGrand = calcSubtotal + calcGst + (Number(sale.freight) || 0);
                        return (
                            <Card key={sale.id} className="p-5 shadow-card space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <span className="font-semibold text-foreground">{sale.po_number}</span>
                                        <span className="ml-2 text-sm text-muted-foreground">— {sale.client_name}</span>
                                        {sale.invoice_number && (
                                            <span className="ml-2 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{sale.invoice_number}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <StatusBadge
                                            status={sale.payment_status === "Paid" ? "Delivered" : sale.payment_status === "Partial" ? "Partial" : "Pending"}
                                            label={sale.payment_status}
                                        />
                                        <StatusBadge
                                            status={
                                                (po?.all_dispatches_marked && po?.delivery_status === "Delivered") ? "Delivered" :
                                                (sale.delivery_status === "Delivered" || po?.delivery_status === "Partial") ? "Partial" :
                                                "Not Delivered"
                                            }
                                            label={
                                                (po?.all_dispatches_marked && po?.delivery_status === "Delivered") ? "Delivered" :
                                                sale.delivery_status === "Delivered" ? "Partially Delivered" : 
                                                "Not Delivered"
                                            }
                                        />
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
                                                document.getElementById("direct-invoice-upload").click();
                                            }}
                                        />

                                        <FilePopover
                                            urls={sale.e_way_bill_url}
                                            icon={Receipt}
                                            label="e-Way Bill"
                                            saleId={sale.id}
                                            onUploadClick={() => {
                                                setUploadingSaleId(sale.id);
                                                document.getElementById("direct-eway-upload").click();
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
                                    <Field label="Items" value={sale.item} full />
                                    <Field label="Dispatched Qty" value={`${sale.dispatched_qty} ${sale.uom || "Nos"}`} />
                                    <Field label="Project" value={sale.project} />
                                    <Field label="Total Docs" value={`${(sale.invoice_url?.split(";")?.filter(Boolean)?.length || 0) + (sale.e_way_bill_url?.split(";")?.filter(Boolean)?.length || 0) + (sale.delivery_challan_url?.split(";")?.filter(Boolean)?.length || 0)} File(s)`} />
                                    <Field label="Invoice Total" value={inr(calcGrand)} />
                                    <Field label="Subtotal" value={inr(calcSubtotal)} />
                                    <Field label="Total GST" value={inr(calcGst)} />
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
                                    <Button size="xs" variant="outline" className="border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => openInvoiceDocument(sale.id)}>
                                        <Package className="h-3 w-3 mr-1" /> Generate Invoice
                                    </Button>
                                    <Button size="xs" variant="outline" className="border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => downloadInvoiceDocument(sale.id)}>
                                        <Download className="h-3 w-3 mr-1" /> Download Invoice
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="outline"
                                        onClick={() => {
                                            if (sale.e_way_bill_url) {
                                                window.open(`http://localhost:8000${sale.e_way_bill_url}`, "_blank");
                                            } else {
                                                setUploadingSaleId(sale.id);
                                                document.getElementById("direct-eway-upload").click();
                                            }
                                        }}
                                        className="border-slate-900 text-slate-900 hover:bg-slate-50"
                                    >
                                        <Receipt className="h-3 w-3 mr-1" />
                                        {sale.e_way_bill_url ? "View e-Way Bill" : "Upload e-Way Bill"}
                                    </Button>
                                    {(() => {
                                        // 1. Helper to verify if a sale has a valid challan document
                                        const hasValidChallan = (url) => {
                                            if (!url) return false;
                                            return url.split(";").filter(u => u && u.trim() !== "").length > 0;
                                        };

                                        const currentSaleHasChallan = hasValidChallan(sale.delivery_challan_url);

                                        // 2. Final decision for the button color using backend-provided flags
                                        const isFullyComplete = po?.all_dispatches_marked && po?.delivery_status === "Delivered";

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

            {/* Mark Delivered Confirmation Dialog */}
            <Dialog open={markDeliveredOpen} onOpenChange={(open) => !open && setMarkDeliveredOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Mark as Delivered</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">Upload the delivery challan document to mark this sale as Delivered.</p>
                        <div className="space-y-2">
                            <Label>Delivery Challan Document(s) * {deliveryChallanUrl && <span className="ml-1 text-primary">({deliveryChallanUrl.split(";").filter(Boolean).length})</span>}</Label>
                            <div className="space-y-2">
                                <Input type="file" multiple className="hidden" id="challan-file-upload" onChange={handleDeliveryChallanUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                <Button type="button" variant="outline" className="w-full border-slate-900 text-slate-900 hover:bg-slate-50" onClick={() => document.getElementById("challan-file-upload").click()}>
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
                id="direct-invoice-upload"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleDirectInvoiceUpload(e, uploadingSaleId)}
            />
            <input
                type="file"
                id="direct-eway-upload"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file || !uploadingSaleId) return;
                    const tid = toast.loading("Uploading e-way bill...");
                    try {
                        const data = await uploadInvoiceFile(file);
                        await updateMutation.mutateAsync({
                            id: uploadingSaleId,
                            body: { e_way_bill_url: data.file_url, updated_by: getCurrentUser() }
                        });
                        toast.success("e-Way bill updated", { id: tid });
                        setUploadingSaleId(null);
                    } catch (err) {
                        toast.error("Upload failed: " + err.message, { id: tid });
                    }
                }}
            />
            {/* Sales Import Dialog */}
            <Dialog open={salesImportOpen} onOpenChange={(o) => { setSalesImportOpen(o); if (!o) { setSalesImportFile(null); setSalesImportResult(null); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-blue-600" /> Import Sales
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

export default SalesInvoice;