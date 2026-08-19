import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { ItemCombobox } from "@/components/ItemCombobox";
import { ItemMasterManageDialog } from "@/components/ItemMasterManageDialog";
import { UomManageDialog } from "@/components/UomManageDialog";
import { inr, fmtDate, fmtDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/currentUser";
import { useConstants } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";
import {
    fetchPurchaseOrders, createPurchaseOrder, updatePurchaseOrder,
    deletePurchaseOrder, bulkDeletePurchaseOrders, fetchPurchaseOrder, openPODocument,
    createClient, createProject, fetchProjects, uploadPOFile, fetchItemMasterList,
    exportPurchaseOrders, importPurchaseOrders, shortClosePurchaseOrder, fetchPOFulfillmentSummary,
    fetchClients, mergeClients, deleteClient
} from "@/lib/api";
import { Pencil, Plus, Search, Trash2, Eye, FileText, Package, Truck, Clock, Printer, X, UploadCloud, Download, Upload, Settings } from "lucide-react";
import { toast } from "sonner";
import { useSortableRows } from "@/hooks/useSortableRows";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { useResizableRows } from "@/hooks/useResizableRows";
import { useColumnFilters } from "@/hooks/useColumnFilters";
import { SortableHeader } from "@/components/SortableHeader";
import { FilterableHeader } from "@/components/FilterableHeader";
import { StickyScrollArea } from "@/components/StickyScrollArea";

const emptyLineItem = () => ({ item: "", quantity: "", uom: "Nos", unit_price: "", gst: "0", freight: 0 });

const PO_TABLE_WIDTHS = {
    sno: 56, client_name: 140, project: 120, item: 150, po_number: 130,
    po_date: 110, total_quantity: 100, delivered_quantity: 100, pending_quantity: 100,
    validity_date: 110, status: 120, activity: 120, actions: 180,
};

const empty = () => ({
    clientName: "", clientDropdown: "",
    poNumber: "",
    poDate: new Date().toISOString().slice(0, 10),
    validityDate: new Date().toISOString().slice(0, 10),
    gst: "18", freight: 0,
    project: "",
    paymentTerms: "",
    fileUrl: "",
    remark: "",
    lineItems: [emptyLineItem()],
});

// Pulls the calendar date straight off the ISO string (e.g. "2026-07-02" from
// "2026-07-02T00:00:00") instead of round-tripping through `new Date()` — a
// browser not in UTC would otherwise shift the date by a day (local midnight
// converted to UTC can land on the previous day), which made an untouched
// date field look "changed" on every save.
const isoToDateInput = (iso) => (iso ? String(iso).slice(0, 10) : "");

const poStatusLabel = (o) =>
    o.short_closed ? "Short Closed" :
    (o.delivery_status === "Delivered" && o.all_dispatches_marked) ? "Delivered" :
    (o.delivery_status === "Delivered" || o.delivery_status === "Partial") ? "Partial" :
    "Not Delivered";


// Same keyword families the backend's parse_item_type_and_size() groups by
// (app/utils/helpers.py) — kept in sync manually since this is a client-side
// port used only for the quick quantity-breakdown popup, not for anything
// that needs byte-identical size parsing.
const KNOWN_PRODUCT_KEYWORDS = [
    ["sda cross bit", "SDA Cross Bit"],
    ["sda rod", "SDA Rod"],
    ["sda nut", "SDA Nut"],
    ["sda plate", "SDA Plate"],
    ["sda coupler", "SDA Coupler"],
    ["coupler", "Coupler"],
    ["pipe", "Pipe"],
];
const PO_CODE_PREFIX_RE = /^[A-Za-z0-9]{4,}\s*-+\s*/;
const PO_MAKE_SUFFIX_RE = /\bmake\s*[:-].*$/i;

const simpleProductType = (itemName) => {
    const raw = (itemName || "").trim();
    if (!raw) return "Uncategorized";
    let working = raw.replace(PO_CODE_PREFIX_RE, "").trim();
    if (!working) working = raw;
    let remainder = working.replace(PO_MAKE_SUFFIX_RE, "").trim();
    remainder = remainder.replace(/^[\s\-,/:]+/, "").replace(/[\s\-,/:]+$/, "").trim();
    const fallback = remainder || working;
    const lower = fallback.toLowerCase();
    for (const [kw, canonical] of KNOWN_PRODUCT_KEYWORDS) {
        if (lower.includes(kw)) return canonical;
    }
    return fallback.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
};

// Column accessors shared by sorting and the Excel-style filter checklists —
// each returns the same value the column sorts by, so "Sort A to Z" and the
// filter's distinct-value list always agree with each other.
const poItemDisplay = (o) => (o.line_items?.length > 0 ? o.line_items.map((l) => l.item).join(", ") : o.item);
const POColumnAccessors = {
    client_name: (o) => o.client_name,
    project: (o) => o.project || "",
    item: poItemDisplay,
    po_number: (o) => o.po_number,
    po_date: (o) => (o.po_date ? fmtDate(o.po_date) : ""),
    total_quantity: (o) => o.total_quantity,
    delivered_quantity: (o) => o.delivered_quantity,
    pending_quantity: (o) => o.pending_quantity,
    validity_date: (o) => (o.validity_date ? fmtDate(o.validity_date) : ""),
    status: poStatusLabel,
};

const PurchaseOrders = () => {
    const qc = useQueryClient();
    const location = useLocation();
    const navigate = useNavigate();
    const { products, clients, projects, payment_terms, uom_options } = useConstants();
    const { user } = useAuth();
    const isAdmin = !!user?.is_admin;
    const [manageItemsOpen, setManageItemsOpen] = useState(false);
    const [manageUomOpen, setManageUomOpen] = useState(false);

    // Item Master — the only source for the Item Name field below. Read by
    // both Admin and User (matches the backend's GET /api/item-master,
    // which has no role gate); only Add/Edit/Delete (inside
    // ItemMasterManageDialog) are Admin-only, enforced server-side too.
    const { data: itemMasterList = [] } = useQuery({
        queryKey: ["item-master", "PO"],
        queryFn: () => fetchItemMasterList("PO"),
    });

    // Fetch the complete Purchase Order list (no pagination cap) — this is the
    // single source of truth for both the table rows below and the dashboard
    // summary cards, so the two can never disagree.
    const { data: orders = [], isLoading } = useQuery({
        queryKey: ["purchase-orders"],
        queryFn: () => fetchPurchaseOrders({ limit: 100000 }),
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["purchase-orders"] });
        // Fulfillment/Pending reports (and their footer totals) are built
        // from Purchase Order records — they must refetch whenever a PO is
        // added/edited/deleted/short-closed so their totals never go stale.
        qc.invalidateQueries({ queryKey: ["fulfillmentReport"] });
        qc.invalidateQueries({ queryKey: ["pendingPOsReport"] });
    };

    const createMutation = useMutation({ mutationFn: createPurchaseOrder, onSuccess: invalidate });
    const updateMutation = useMutation({ mutationFn: ({ id, body }) => updatePurchaseOrder(id, body), onSuccess: invalidate });
    const deleteMutation = useMutation({
        mutationFn: (id) => deletePurchaseOrder(id, getCurrentUser()),
        onSuccess: () => {
            invalidate();
            toast.success("Purchase Order deleted");
        },
        onError: (err) => {
            toast.error(err.message || "Failed to delete Purchase Order");
        }
    });
    const bulkDeleteMutation = useMutation({
        mutationFn: (ids) => bulkDeletePurchaseOrders(ids, getCurrentUser()),
        onSuccess: (result) => {
            invalidate();
            setSelectedIds(new Set());
            if (result.errors?.length) {
                toast.warning(`Deleted ${result.deleted.length} purchase order(s), ${result.errors.length} failed`);
            } else {
                toast.success(`Deleted ${result.deleted.length} purchase order(s)`);
            }
        },
        onError: (err) => {
            toast.error(err.message || "Bulk delete failed");
        }
    });
    const markOpenedMutation = useMutation({ mutationFn: (id) => fetchPurchaseOrder(id, getCurrentUser()), onSuccess: invalidate });
    const shortCloseMutation = useMutation({
        mutationFn: ({ id, body }) => shortClosePurchaseOrder(id, body),
        onSuccess: () => {
            invalidate();
            toast.success("Purchase Order Short Closed successfully");
            setShortCloseItem(null);
            setShortCloseRemark("");
        },
        onError: (err) => {
            toast.error(err.message || "Failed to short close Purchase Order");
        }
    });

    const clientMutation = useMutation({
        mutationFn: (body) => createClient({ ...body, created_by: getCurrentUser() }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["constants"] });
            qc.invalidateQueries({ queryKey: ["clients"] });
            qc.invalidateQueries({ queryKey: ["client-stats"] });
        },
    });
    const projectMutation = useMutation({ mutationFn: (body) => createProject({ ...body, created_by: getCurrentUser() }), onSuccess: () => qc.invalidateQueries({ queryKey: ["constants"] }) });

    const [searchParams] = useSearchParams();
    const querySearch = searchParams.get("search") || "";
    const [search, setSearch] = useState(querySearch);

    useEffect(() => {
        if (querySearch) {
            setSearch(querySearch);
        }
    }, [querySearch]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(empty());
    const [viewing, setViewing] = useState(null);
    const [uploadingPoId, setUploadingPoId] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

    const [shortCloseItem, setShortCloseItem] = useState(null);
    const [shortCloseRemark, setShortCloseRemark] = useState("");

    const { data: poFulfillment, isLoading: poFulfillmentLoading } = useQuery({
        queryKey: ["po-fulfillment-summary", viewing?.id],
        queryFn: () => fetchPOFulfillmentSummary(viewing.id),
        enabled: !!viewing?.id,
    });

    const { data: fullClients = [] } = useQuery({
        queryKey: ["clients"],
        queryFn: fetchClients,
        enabled: isAdmin,
    });

    const [mergeOpen, setMergeOpen] = useState(false);
    const [mergeData, setMergeData] = useState({ masterId: "", duplicateId: "" });
    const mergeMutation = useMutation({ 
        mutationFn: (body) => mergeClients({ ...body, merged_by: getCurrentUser() }), 
        onSuccess: () => {
            invalidate();
            qc.invalidateQueries({ queryKey: ["constants"] });
            qc.invalidateQueries({ queryKey: ["clients"] });
            qc.invalidateQueries({ queryKey: ["client-stats"] });
        }
    });

    const handleMerge = async () => {
        if (!mergeData.masterId || !mergeData.duplicateId) return;
        if (mergeData.masterId === mergeData.duplicateId) {
            toast.error("Master and duplicate cannot be the same");
            return;
        }
        try {
            await mergeMutation.mutateAsync({
                master_id: parseInt(mergeData.masterId),
                duplicate_ids: [parseInt(mergeData.duplicateId)],
            });
            toast.success("Clients merged successfully");
            setMergeOpen(false);
            setMergeData({ masterId: "", duplicateId: "" });
        } catch (e) {
            toast.error(e.message);
        }
    };

    const handleClientDelete = async () => {
        if (!mergeData.duplicateId) {
            toast.error("Please select a client to delete in the 'Duplicate Client' dropdown.");
            return;
        }
        try {
            await deleteClient(parseInt(mergeData.duplicateId), getCurrentUser());
            toast.success("Client deleted successfully");
            invalidate();
            qc.invalidateQueries({ queryKey: ["constants"] });
            qc.invalidateQueries({ queryKey: ["clients"] });
            qc.invalidateQueries({ queryKey: ["client-stats"] });
            setMergeOpen(false);
            setMergeData({ masterId: "", duplicateId: "" });
        } catch (e) {
            toast.error(e.message || "Cannot delete client. It might have existing records.");
        }
    };

    const poDeliveryStatusBadge = (status) =>
        status === "Completed" ? "Delivered" : status === "Short Closed" ? "Short Closed" : status;

    const [importOpen, setImportOpen] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importConflict, setImportConflict] = useState("skip");
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const importFileRef = useRef(null);

    const handleExport = async () => {
        const tid = toast.loading("Preparing Excel export…");
        try {
            await exportPurchaseOrders();
            toast.success("Purchase Orders exported", { id: tid });
        } catch (err) {
            toast.error("Export failed: " + err.message, { id: tid });
        }
    };

    const handleImport = async () => {
        if (!importFile) return toast.error("Please select an Excel (.xlsx) or CSV file");
        setImporting(true);
        const tid = toast.loading("Importing…");
        try {
            const result = await importPurchaseOrders(importFile, importConflict, getCurrentUser());
            setImportResult(result);
            toast.success(
                `Import done — Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`,
                { id: tid, duration: 6000 }
            );
            invalidate();
            qc.invalidateQueries({ queryKey: ["report"] });
            qc.invalidateQueries({ queryKey: ["fulfillmentReport"] });
            qc.invalidateQueries({ queryKey: ["pendingPOsReport"] });
        } catch (err) {
            toast.error("Import failed: " + err.message, { id: tid });
        } finally {
            setImporting(false);
        }
    };

    const [addClientOpen, setAddClientOpen] = useState(false);
    const [addProjectOpen, setAddProjectOpen] = useState(false);
    const [newClientName, setNewClientName] = useState("");
    const [newClientSalutation, setNewClientSalutation] = useState("M/s.");
    const [newClientLocation, setNewClientLocation] = useState("");
    const [newProjectName, setNewProjectName] = useState("");

    const filtered = useMemo(() => {
        const s = search.toLowerCase();
        if (!s) return orders;
        return orders.filter(
            (o) =>
                (o.client_name || "").toLowerCase().includes(s) ||
                (o.po_number || "").toLowerCase().includes(s) ||
                (o.item || "").toLowerCase().includes(s) ||
                (o.project || "").toLowerCase().includes(s)
        );
    }, [orders, search]);

    const { filters: poFilters, setFilter: setPoFilter } = useColumnFilters();

    // Excel-style column filters (checklists) narrow the search-filtered
    // array further — every active column's Set of allowed values must match.
    const columnFiltered = useMemo(() => {
        const keys = Object.keys(poFilters);
        if (keys.length === 0) return filtered;
        return filtered.filter((o) =>
            keys.every((k) => {
                const v = POColumnAccessors[k](o);
                return poFilters[k].has(v == null || v === "" ? "—" : String(v));
            })
        );
    }, [filtered, poFilters]);

    // Single source of truth: sum the exact rows the table below renders
    // (post-search-filter and post-column-filter), reading each row's
    // PO/Delivered/Pending Quantity straight off the same PurchaseOrder
    // objects — no separate SQL query.
    const totals = useMemo(() => ({
        tot: columnFiltered.reduce((s, o) => s + (o.total_quantity || 0), 0),
        del: columnFiltered.reduce((s, o) => s + (o.delivered_quantity || 0), 0),
        pending: columnFiltered.reduce((s, o) => s + (o.pending_quantity || 0), 0),
    }), [columnFiltered]);

    // Product-type breakdown behind the "Total Pos Quantity" card — same
    // keyword grouping the Overview report uses server-side
    // (parse_item_type_and_size), ported here so the breakdown always adds
    // up to exactly the number on the card (same columnFiltered rows/qty,
    // no separate API call or re-filtering).
    const [qtyBreakdownOpen, setQtyBreakdownOpen] = useState(false);
    const qtyBreakdown = useMemo(() => {
        const totals = new Map(); // product_type -> qty
        for (const o of columnFiltered) {
            const items = (o.line_items && o.line_items.length > 0)
                ? o.line_items
                : [{ item: o.item, quantity: o.total_quantity }];
            for (const li of items) {
                const type = simpleProductType(li.item);
                totals.set(type, (totals.get(type) || 0) + (li.quantity || 0));
            }
        }
        return Array.from(totals.entries())
            .map(([product_type, qty]) => ({ product_type, qty }))
            .sort((a, b) => b.qty - a.qty);
    }, [columnFiltered]);

    const { widths: poWidths, startResize: startPoResize } = useResizableColumns("colw:purchase-orders", PO_TABLE_WIDTHS);
    const { sortedRows: sortedOrders, sortConfig: poSortConfig, requestSort: requestPoSort, setSort: setPoSort } = useSortableRows(columnFiltered);
    const { getHeight: getPoRowHeight, startResize: startPoRowResize } = useResizableRows("rowh:purchase-orders", 52);

    const allVisibleSelected = sortedOrders.length > 0 && sortedOrders.every((o) => selectedIds.has(o.id));
    const toggleSelectAll = () => {
        setSelectedIds(allVisibleSelected ? new Set() : new Set(sortedOrders.map((o) => o.id)));
    };
    const toggleSelectOne = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const effectiveClient = form.clientName?.trim() || form.clientDropdown;
    const effectiveProject = form.project;

    const { data: clientProjects = [], isLoading: isLoadingProjects } = useQuery({
        queryKey: ["projects", effectiveClient],
        queryFn: () => fetchProjects({ client_name: effectiveClient }),
        enabled: !!effectiveClient,
    });

    const openNew = () => { setEditingId(null); setForm(empty()); setDialogOpen(true); };
    const openEdit = (o) => {
        markOpenedMutation.mutate(o.id);
        setEditingId(o.id);
        const li = (o.line_items && o.line_items.length > 0)
            ? o.line_items.map(l => ({ id: l.id, item: l.item, quantity: l.quantity, uom: l.uom, unit_price: l.unit_price ? Number(l.unit_price).toFixed(2) : "", gst: l.gst || "0", freight: l.freight || "" }))
            : [{ item: o.item || "", quantity: o.total_quantity, uom: o.uom || "Nos", unit_price: o.unit_price ? Number(o.unit_price).toFixed(2) : "", gst: o.gst || "0", freight: "" }];
        setForm({
            clientName: "", clientDropdown: o.client_name,
            poNumber: o.po_number,
            poDate: isoToDateInput(o.po_date) || new Date().toISOString().slice(0, 10),
            item: "", itemDropdown: o.item,
            uom: o.uom || "Nos",
            totalQuantity: o.total_quantity, deliveredQuantity: o.delivered_quantity,
            unitPrice: o.unit_price, gst: o.gst || "", freight: o.freight,
            project: o.project || "",
            paymentTerms: o.payment_terms || "",
            validityDate: isoToDateInput(o.validity_date),
            fileUrl: o.file_url || "",
            remark: o.remark || "",
            lineItems: li,
        });
        setDialogOpen(true);
    };
    const openView = (o) => { markOpenedMutation.mutate(o.id); setViewing(o); };
    const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

    const handleCreateClient = async () => {
        if (!newClientName || !newClientLocation) return toast.error("Name and Location are required");
        try {
            const fullName = `${newClientSalutation} ${newClientName}`.trim();
            await clientMutation.mutateAsync({ 
                name: fullName, 
                location: newClientLocation,
            });
            set("clientDropdown", fullName);
            setAddClientOpen(false);
            setNewClientName("");
            setNewClientSalutation("M/s.");
            setNewClientLocation("");
            toast.success("Client added successfully");
        } catch (e) { toast.error(e.message); }
    };

    const handleCreateProject = async () => {
        if (!effectiveClient) return toast.error("Select a client first");
        if (!newProjectName) return toast.error("Project name is required");
        try {
            await projectMutation.mutateAsync({ name: newProjectName, client_name: effectiveClient });
            set("project", newProjectName);
            setAddProjectOpen(false);
            setNewProjectName("");
            toast.success("Project added successfully");
            qc.invalidateQueries({ queryKey: ["projects", effectiveClient] });
        } catch (e) { toast.error(e.message); }
    };

    const setLineItem = (idx, field, val) => {
        setForm(f => {
            const items = [...(f.lineItems || [])];
            if (!items[idx]) items[idx] = emptyLineItem();
            items[idx] = { ...items[idx], [field]: val };
            return { ...f, lineItems: items };
        });
    };
    const addLineItem = () => setForm(f => ({ 
        ...f, 
        lineItems: [...(f.lineItems || [emptyLineItem()]), emptyLineItem()] 
    }));
    const removeLineItem = (idx) => {
        setForm(f => {
            const items = f.lineItems || [];
            if (items.length <= 1) return f;
            return { ...f, lineItems: items.filter((_, i) => i !== idx) };
        });
    };

    const subtotal = (form.lineItems || []).reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);
    
    let isGlobalGstAmount = (form.gst || "").toString().startsWith("₹");
    let globalGstAmount = 0;
    if (isGlobalGstAmount) {
        globalGstAmount = parseFloat(form.gst.toString().replace("₹", "").replace(/,/g, "")) || 0;
    } else if (form.gst && form.gst !== "") {
        const gstPercent = parseFloat((form.gst || "0").toString().replace("%", "")) || 0;
        globalGstAmount = subtotal * gstPercent / 100;
    }

    const itemsGstAmount = (form.lineItems || []).reduce((s, li) => {
        const lineSub = (Number(li.quantity) || 0) * (Number(li.unit_price) || 0);
        if ((li.gst || "").toString().startsWith("₹")) {
            return s + (parseFloat(li.gst.toString().replace("₹", "").replace(/,/g, "")) || 0);
        } else {
            const pct = parseFloat((li.gst || "18").toString().replace("%", "")) || 0;
            return s + (lineSub * pct / 100);
        }
    }, 0);

    const gstAmount = form.gst ? globalGstAmount : itemsGstAmount;
    const itemsFreight = (form.lineItems || []).reduce((s, li) => s + (Number(li.freight) || 0), 0);
    const grandTotal = subtotal + gstAmount + (Number(form.freight) || 0) + itemsFreight;

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const data = await uploadPOFile(file);
            set("fileUrl", data.file_url);
            toast.success("PO File uploaded");
        } catch (err) {
            toast.error("File upload failed: " + err.message);
        }
    };

    const handleDirectUpload = async (e, poId) => {
        const file = e.target.files[0];
        if (!file || !poId) return;
        const tid = toast.loading("Uploading file...");
        try {
            const data = await uploadPOFile(file);
            await updateMutation.mutateAsync({ 
                id: poId, 
                body: { file_url: data.file_url, last_updated_by: getCurrentUser() } 
            });
            toast.success("PO Document updated", { id: tid });
            setUploadingPoId(null);
        } catch (err) {
            toast.error("Upload failed: " + err.message, { id: tid });
        }
    };

    const handleDeleteFile = async (poId) => {
        if (!window.confirm("Are you sure you want to delete this document? You can then upload a new one.")) return;
        const tid = toast.loading("Removing document...");
        try {
            await updateMutation.mutateAsync({ 
                id: poId, 
                body: { file_url: null, last_updated_by: getCurrentUser() } 
            });
            toast.success("Document removed", { id: tid });
        } catch (err) {
            toast.error("Failed to remove document: " + err.message, { id: tid });
        }
    };

    


    const submit = async () => {
        const hasItems = (form.lineItems || []).some(li => li.item.trim());
        if (!effectiveClient || !form.poNumber || !hasItems) {
            toast.error("Client, PO Number and at least one Item are required");
            return;
        }
        const payload = {
            client_name: effectiveClient,
            po_number: form.poNumber,
            po_date: form.poDate ? new Date(form.poDate).toISOString() : null,
            project: form.project || null,
            gst: form.gst || "0",
            freight: Number(form.freight) || 0,
            payment_terms: form.paymentTerms || null,
            validity_date: form.validityDate ? new Date(form.validityDate).toISOString() : null,
            file_url: form.fileUrl || null,
            remark: form.remark || null,
            created_by: getCurrentUser(),
            last_updated_by: getCurrentUser(),
            line_items: (form.lineItems || []).map(li => ({
                id: li.id || null,
                item: li.item.trim(),
                quantity: Number(li.quantity) || 0,
                uom: li.uom || "Nos",
                unit_price: Number(li.unit_price) || 0,
                gst: li.gst || "0",
                freight: Number(li.freight) || 0
            })).filter(li => li.item)
        };
        try {
            const tid = toast.loading(editingId ? "Updating PO..." : "Creating PO...");
            const result = editingId
                ? await updateMutation.mutateAsync({ id: editingId, body: payload })
                : await createMutation.mutateAsync(payload);
            if (editingId && result?.no_changes) {
                toast.info("No changes to save", { id: tid });
            } else {
                toast.success("Purchase Order " + (editingId ? "updated" : "created"), { id: tid });
            }
            invalidate();
            setDialogOpen(false);
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center space-y-1">
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">Purchase Orders</h2>
                <p className="text-sm text-muted-foreground">Track POs with quantities, delivery progress and activity log.</p>
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
                    <Button variant="outline" onClick={handleExport} className="border-green-500 text-green-700 hover:bg-green-50">
                        <Download className="h-4 w-4 mr-2" /> Export Excel
                    </Button>
                    <Button variant="outline" onClick={() => { setImportFile(null); setImportResult(null); setImportOpen(true); }} className="border-blue-500 text-blue-700 hover:bg-blue-50">
                        <Upload className="h-4 w-4 mr-2" /> Import Excel
                    </Button>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={openNew} className="bg-gradient-primary hover:opacity-90 shadow-elegant">
                                <Plus className="h-4 w-4 mr-2" /> New Purchase Order
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Edit Purchase Order" : "Create Purchase Order"}</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Name of Client *</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Select value={form.clientDropdown} onValueChange={(v) => { set("clientDropdown", v); set("clientName", ""); }}>
                                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                                        <SelectContent>
                                            {clients.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <div className="flex gap-2">
                                        <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="flex-1">Add New Client</Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
                                                <div className="space-y-4 py-4">
                                                    <div className="space-y-2">
                                                        <Label>Client Name</Label>
                                                        <div className="flex gap-2">
                                                            <Select value={newClientSalutation} onValueChange={setNewClientSalutation}>
                                                                <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="Mr.">Mr.</SelectItem>
                                                                    <SelectItem value="Mrs.">Mrs.</SelectItem>
                                                                    <SelectItem value="Ms.">Ms.</SelectItem>
                                                                    <SelectItem value="M/s.">M/s.</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <Input className="flex-1" placeholder="Enter name" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2"><Label>Location</Label><Input value={newClientLocation} onChange={e => setNewClientLocation(e.target.value)} /></div>
                                                </div>
                                                <DialogFooter>
                                                    <Button variant="outline" onClick={() => setAddClientOpen(false)}>Cancel</Button>
                                                    <Button onClick={handleCreateClient} disabled={clientMutation.isPending}>Add Client</Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                        {isAdmin && (
                                            <Button variant="outline" className="flex-1" onClick={() => setMergeOpen(true)}>Merge Duplicates</Button>
                                        )}
                                    </div>
                                </div>
                                {effectiveClient && <p className="text-xs text-muted-foreground">Using: <span className="font-medium text-foreground">{effectiveClient}</span></p>}
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Name of Project</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Select value={form.project} onValueChange={(v) => set("project", v)} disabled={!effectiveClient || isLoadingProjects}>
                                        <SelectTrigger><SelectValue placeholder={effectiveClient ? "Select project" : "Select client first"} /></SelectTrigger>
                                        <SelectContent>
                                            {clientProjects.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline">Add New Project</Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader><DialogTitle>Add New Project</DialogTitle></DialogHeader>
                                            <div className="space-y-4 py-4">
                                                <div className="space-y-2"><Label>Project Name</Label><Input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} /></div>
                                            </div>
                                            <DialogFooter>
                                                <Button variant="outline" onClick={() => setAddProjectOpen(false)}>Cancel</Button>
                                                <Button onClick={handleCreateProject} disabled={projectMutation.isPending}>Add Project</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                {effectiveProject && <p className="text-xs text-muted-foreground">Using: <span className="font-medium text-foreground">{effectiveProject}</span></p>}
                            </div>

                            <div className="space-y-2">
                                <Label>Purchase Order No. *</Label>
                                <Input value={form.poNumber} onChange={(e) => set("poNumber", e.target.value)} placeholder="PO-2025-XXXX" />
                            </div>

                            <div className="space-y-2">
                                <Label>PO Date</Label>
                                <Input type="date" value={form.poDate} onChange={(e) => set("poDate", e.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label>PO Validity Date</Label>
                                <Input type="date" value={form.validityDate} onChange={(e) => set("validityDate", e.target.value)} />
                            </div>

                            <div className="space-y-3 sm:col-span-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-semibold">Items *</Label>
                                    <div className="flex items-center gap-2">
                                        {isAdmin && (
                                            <>
                                                <Button type="button" size="sm" variant="outline" onClick={() => setManageItemsOpen(true)}>
                                                    <Settings className="h-3.5 w-3.5 mr-1" /> Manage Items
                                                </Button>
                                                <Button type="button" size="sm" variant="outline" onClick={() => setManageUomOpen(true)}>
                                                    <Settings className="h-3.5 w-3.5 mr-1" /> Manage UOM
                                                </Button>
                                            </>
                                        )}
                                        <Button type="button" size="sm" variant="outline" onClick={addLineItem}>
                                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {(form.lineItems || []).map((li, idx) => (
                                        <div key={idx} className="relative rounded-lg border border-border bg-muted/20 p-4 pt-8 sm:pt-4">
                                            {form.lineItems.length > 1 && (
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="absolute top-1 right-1 h-7 w-7 text-destructive hover:bg-destructive/10"
                                                    onClick={() => removeLineItem(idx)}
                                                    title="Remove item"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}

                                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                                <div className="sm:col-span-2 space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Item Name</Label>
                                                    <ItemCombobox
                                                        value={li.item}
                                                        onChange={(v) => setLineItem(idx, "item", v)}
                                                        items={itemMasterList}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Quantity</Label>
                                                    <div className="flex gap-1">
                                                        <Input 
                                                            type="number" 
                                                            min="0" 
                                                            placeholder="Qty" 
                                                            className="flex-1" 
                                                            value={li.quantity || ""} 
                                                            onChange={(e) => setLineItem(idx, "quantity", e.target.value)} 
                                                        />
                                                        <Select value={li.uom} onValueChange={(v) => setLineItem(idx, "uom", v)}>
                                                            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {uom_options.length > 0 ? uom_options.map((u) => (
                                                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                                                )) : <SelectItem value="Nos">Nos</SelectItem>}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Unit Price</Label>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        value={li.unit_price || ""}
                                                        onChange={(e) => setLineItem(idx, "unit_price", e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end mt-4 pt-4 border-t border-slate-200">
                                                <div className="text-right">
                                                    <div className="text-[10px] uppercase text-muted-foreground font-semibold">Subtotal</div>
                                                    <div className="font-bold text-sm text-slate-800">{inr((li.quantity || 0) * (li.unit_price || 0))}</div>
                                                </div>
                                            </div>

                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Inline Financial Summary Bar */}
                            <div className="sm:col-span-2 mt-4 p-3 rounded-lg bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-600">Subtotal:</span>
                                        <span className="text-sm font-bold text-slate-900">{inr(subtotal)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-medium text-slate-600">GST:</span>
                                        <div className="flex items-center rounded-md border border-slate-300 bg-white h-8 overflow-hidden shadow-sm">
                                            <input 
                                                type="text" 
                                                className="w-12 h-full px-2 text-right font-bold text-slate-900 outline-none border-r border-slate-200"
                                                value={(form.gst?.toString().replace("%", "") || "")}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (/^\d{0,2}%?$/.test(val)) set("gst", val);
                                                }}
                                            />
                                            <span className="bg-slate-100 px-1.5 py-1 h-full text-xs font-bold text-slate-700 select-none flex items-center justify-center">%</span>
                                        </div>
                                        <span className="text-sm font-bold text-slate-900 ml-1">({inr(globalGstAmount)})</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-600">Freight:</span>
                                        <Input 
                                            type="number" 
                                            min="0" 
                                            value={form.freight || ""} 
                                            onChange={(e) => set("freight", e.target.value)} 
                                            className="h-8 w-24 text-right bg-white border-slate-300 font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-md border border-primary/20">
                                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Grand Total:</span>
                                    <span className="text-base font-black text-primary">{inr(grandTotal)}</span>
                                </div>
                            </div>

                            <div className="space-y-2 sm:col-span-1">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Payment Terms</Label>
                                <Select value={form.paymentTerms} onValueChange={(v) => set("paymentTerms", v)}>
                                    <SelectTrigger className="h-8"><SelectValue placeholder="Select terms" /></SelectTrigger>
                                    <SelectContent>
                                        {payment_terms.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Remark</Label>
                                <Textarea
                                    placeholder="Optional remarks for this Purchase Order..."
                                    value={form.remark || ""}
                                    onChange={(e) => set("remark", e.target.value)}
                                    rows={2}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Upload PO Document</Label>
                                <div className="flex items-center gap-2">
                                    <Input type="file" className="hidden" id="po-file-upload" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                    <Button type="button" variant="outline" className="w-full" onClick={() => document.getElementById("po-file-upload").click()}>
                                        <FileText className={`h-4 w-4 mr-2 ${form.fileUrl ? "text-green-500" : "text-red-500"}`} />
                                        {form.fileUrl ? "File Uploaded ✓" : "Upload File"}
                                    </Button>
                                    {form.fileUrl && (
                                        <div className="flex flex-col gap-1 w-full">
                                            <div className="flex items-center gap-2">
                                                <Button type="button" variant="ghost" size="sm" onClick={() => set("fileUrl", "")} className="text-destructive hover:bg-destructive/10">
                                                    <Trash2 className="h-4 w-4 mr-2" /> Remove upload file
                                                </Button>
                                                <Button type="button" variant="link" size="sm" className="text-primary text-xs" onClick={() => window.open(`http://localhost:8000${form.fileUrl}`, "_blank")}>
                                                    View current file
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>


                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button onClick={submit} className="bg-gradient-primary" disabled={createMutation.isPending || updateMutation.isPending}>
                                {editingId ? "Save changes" : "Create PO"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-5 shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center"><FileText className="h-5 w-5 text-primary" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total Pending POs</div><div className="text-2xl font-bold text-foreground">{orders.length}</div></div>
                    </div>
                </Card>
                <Card className="p-5 shadow-card cursor-pointer hover:shadow-elegant transition-shadow" onClick={() => setQtyBreakdownOpen(true)}>
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-accent/15 grid place-items-center"><Package className="h-5 w-5 text-accent" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total Pos Quantity</div><div className="text-2xl font-bold text-foreground">{totals.tot.toLocaleString()}</div></div>
                    </div>
                </Card>
                <Card className="p-5 shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-success/15 grid place-items-center"><Truck className="h-5 w-5 text-success" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total Delivered Quantity</div><div className="text-2xl font-bold text-foreground">{totals.del.toLocaleString()}</div></div>
                    </div>
                </Card>
                <Card className="p-5 shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-warning/15 grid place-items-center"><Clock className="h-5 w-5 text-warning" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total Pending Quantity</div><div className="text-2xl font-bold text-foreground">{totals.pending.toLocaleString()}</div></div>
                    </div>
                </Card>
            </div>

            <Dialog open={qtyBreakdownOpen} onOpenChange={setQtyBreakdownOpen}>
                <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
                    <DialogHeader><DialogTitle>Total Pos Quantity — Product-wise</DialogTitle></DialogHeader>
                    <div className="overflow-y-auto -mx-1 px-1 space-y-1.5">
                        {qtyBreakdown.map((p) => (
                            <div key={p.product_type} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-muted/40 text-sm">
                                <span className="font-medium text-foreground truncate" title={p.product_type}>{p.product_type}</span>
                                <span className="font-bold text-foreground shrink-0">{p.qty.toLocaleString()}</span>
                            </div>
                        ))}
                        {qtyBreakdown.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">No items found.</div>
                        )}
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-bold text-foreground">
                        <span>Total</span>
                        <span>{totals.tot.toLocaleString()}</span>
                    </div>
                </DialogContent>
            </Dialog>

            <Card className="p-4 shadow-card">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by client, PO number, item, project..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
            </Card>

            <Card className="shadow-card">
                <StickyScrollArea>
                    <table className="w-full text-sm table-fixed">
                        <thead className="bg-muted/50 text-foreground text-sm font-bold uppercase tracking-wider">
                            <tr>
                                <th className="px-1.5 py-3 text-center" style={{ width: 40, minWidth: 40 }}>
                                    <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                                </th>
                                <SortableHeader label="S.No." width={poWidths.sno} onResizeStart={startPoResize("sno")} />
                                <FilterableHeader label="Client" columnKey="client_name" accessor={POColumnAccessors.client_name} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.client_name} onResizeStart={startPoResize("client_name")} rows={filtered} filterValue={poFilters.client_name} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="Project" columnKey="project" accessor={POColumnAccessors.project} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.project} onResizeStart={startPoResize("project")} rows={filtered} filterValue={poFilters.project} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="Item" columnKey="item" accessor={POColumnAccessors.item} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.item} onResizeStart={startPoResize("item")} rows={filtered} filterValue={poFilters.item} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="PO #" columnKey="po_number" accessor={POColumnAccessors.po_number} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.po_number} onResizeStart={startPoResize("po_number")} rows={filtered} filterValue={poFilters.po_number} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="PO Date" columnKey="po_date" type="date" accessor={POColumnAccessors.po_date} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.po_date} onResizeStart={startPoResize("po_date")} rows={filtered} filterValue={poFilters.po_date} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="Qty" columnKey="total_quantity" type="number" align="right" accessor={POColumnAccessors.total_quantity} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.total_quantity} onResizeStart={startPoResize("total_quantity")} rows={filtered} filterValue={poFilters.total_quantity} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="Del." columnKey="delivered_quantity" type="number" align="right" accessor={POColumnAccessors.delivered_quantity} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.delivered_quantity} onResizeStart={startPoResize("delivered_quantity")} rows={filtered} filterValue={poFilters.delivered_quantity} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="Pend." columnKey="pending_quantity" type="number" align="right" accessor={POColumnAccessors.pending_quantity} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.pending_quantity} onResizeStart={startPoResize("pending_quantity")} rows={filtered} filterValue={poFilters.pending_quantity} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="Validity" columnKey="validity_date" type="date" accessor={POColumnAccessors.validity_date} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.validity_date} onResizeStart={startPoResize("validity_date")} rows={filtered} filterValue={poFilters.validity_date} onApplyFilter={setPoFilter} />
                                <FilterableHeader label="Status" columnKey="status" accessor={POColumnAccessors.status} sortConfig={poSortConfig} setSort={setPoSort} width={poWidths.status} onResizeStart={startPoResize("status")} rows={filtered} filterValue={poFilters.status} onApplyFilter={setPoFilter} />
                                <SortableHeader label="Activity" width={poWidths.activity} onResizeStart={startPoResize("activity")} />
                                <SortableHeader label="Actions" align="right" width={poWidths.actions} onResizeStart={startPoResize("actions")} />
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && (
                                <tr><td colSpan={14} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
                            )}
                            {sortedOrders.map((o, idx) => {
                                // Only a real edit should change who's shown here — merely opening/
                                // viewing a PO (last_opened_at/by) must never override this, or the
                                // name would flip just from someone looking at the record.
                                const lastAct = o.last_updated_at || o.created_at;
                                const lastBy = o.last_updated_by || o.created_by || "—";
                                return (
                                    <tr
                                        key={o.id}
                                        style={{ height: getPoRowHeight(o.id) }}
                                        className={`relative border-t border-border hover:bg-muted/30 text-sm${o.remark ? " bg-amber-50 dark:bg-amber-950/20" : ""}`}
                                    >
                                        <td className="px-1.5 py-3 text-center">
                                            <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggleSelectOne(o.id)} aria-label={`Select PO ${o.po_number}`} />
                                        </td>
                                        <td className="relative px-1.5 py-3 text-center text-muted-foreground">
                                            {idx + 1}
                                            <div
                                                onMouseDown={startPoRowResize(o.id)}
                                                className="group absolute left-0 bottom-0 w-full h-2.5 cursor-row-resize hover:bg-primary/20 active:bg-primary/40 z-10 flex items-end"
                                                title="Drag to resize row"
                                            >
                                                <div className="w-full h-[3px] bg-border group-hover:bg-primary group-active:bg-primary rounded-full transition-colors" />
                                            </div>
                                        </td>
                                        <td className={`px-1.5 py-3 text-center font-semibold truncate cursor-pointer hover:underline ${o.short_closed ? "text-destructive" : "text-foreground"}`} title={o.client_name} onClick={() => setViewing(o)}>{o.client_name}</td>
                                        <td className={`px-1.5 py-3 text-center truncate cursor-pointer hover:underline ${o.short_closed ? "text-destructive" : "text-muted-foreground"}`} title={o.project} onClick={() => setViewing(o)}>{o.project}</td>
                                        <td
                                            className={`px-1.5 py-3 text-center truncate cursor-pointer hover:underline ${o.short_closed ? "text-destructive" : "text-muted-foreground"}`}
                                            title={(o.line_items?.length > 0) ? o.line_items.map(l => l.item).join(", ") : o.item}
                                            onClick={() => setViewing(o)}
                                        >
                                            {(o.line_items?.length > 0) ? o.line_items[0].item : o.item}
                                            {(o.line_items?.length > 1) && <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">+{o.line_items.length - 1}</span>}
                                        </td>
                                        <td className={`px-1.5 py-3 text-center font-medium truncate text-xs cursor-pointer hover:underline ${o.short_closed ? "text-destructive" : "text-foreground"}`} title={o.po_number} onClick={() => setViewing(o)}>{o.po_number}</td>
                                        <td className={`px-1.5 py-3 text-center whitespace-nowrap text-xs ${o.short_closed ? "text-destructive" : "text-muted-foreground"}`}>{o.po_date ? fmtDate(o.po_date) : "—"}</td>
                                        <td className={`px-1.5 py-3 text-center font-semibold whitespace-nowrap ${o.short_closed ? "text-destructive" : ""}`}>{o.total_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className={`px-1.5 py-3 text-center font-bold whitespace-nowrap ${o.short_closed ? "text-destructive" : "text-success"}`}>{o.delivered_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className={`px-1.5 py-3 text-center font-bold whitespace-nowrap ${o.short_closed ? "text-destructive" : "text-warning"}`}>{o.pending_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className={`px-1.5 py-3 text-center whitespace-nowrap text-xs ${o.short_closed ? "text-destructive" : "text-muted-foreground"}`}>{o.validity_date ? fmtDate(o.validity_date) : "—"}</td>
                                        <td className="px-1.5 py-3">
                                            <div className="flex justify-center">
                                                <StatusBadge
                                                    status={poStatusLabel(o)}
                                                    label={
                                                        o.short_closed ? "Short Closed" :
                                                        (o.delivery_status === "Delivered" && o.all_dispatches_marked) ? "Delivered" :
                                                        o.delivery_status === "Delivered" ? "Dispatched (Pending Challans)" :
                                                        o.delivery_status
                                                    }
                                                />
                                            </div>
                                        </td>
                                        <td className="px-1.5 py-3">
                                            <div className="text-[11px] leading-tight text-center">
                                                <div className="font-bold text-foreground truncate">{lastBy}</div>
                                                <div className="text-muted-foreground whitespace-nowrap">{lastAct ? fmtDate(lastAct) : "—"}</div>
                                            </div>
                                        </td>
                                        <td className="px-1.5 py-3 text-center">
                                            <div className="flex gap-0.5 justify-center">
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setViewing(o)} title="View details"><Eye className="h-3 w-3" /></Button>
                                                <Button size="icon" variant="ghost" className="h-6 w-6"
                                                    onClick={() => {
                                                        if (o.file_url) {
                                                            window.open(`http://localhost:8000${o.file_url}`, "_blank");
                                                        } else {
                                                            setUploadingPoId(o.id);
                                                            document.getElementById("direct-file-upload").click();
                                                        }
                                                    }}
                                                    title={o.file_url ? "View Uploaded PO" : "Upload PO Document"}
                                                >
                                                    {o.file_url ? (
                                                        <FileText className="h-3 w-3 text-green-500" />
                                                    ) : (
                                                        <UploadCloud className="h-3 w-3 text-red-500" />
                                                    )}
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openPODocument(o.id)} title="Print PO"><Printer className="h-3 w-3" /></Button>
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(o)} disabled={o.short_closed} title="Edit">
                                                    <Pencil className={`h-3 w-3 ${o.short_closed ? "text-muted-foreground" : "text-blue-500"}`} />
                                                </Button>
                                                {isAdmin && o.delivery_status !== "Delivered" && !o.short_closed && (
                                                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100" onClick={() => setShortCloseItem(o)} title="Short Close PO">
                                                        Close
                                                    </Button>
                                                )}
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setItemToDelete(o.id)} title="Delete"><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!isLoading && sortedOrders.length === 0 && (
                                <tr><td colSpan={14} className="px-5 py-12 text-center text-muted-foreground">No purchase orders found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </StickyScrollArea>
            </Card>

            <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Purchase Order Details</DialogTitle>
                    </DialogHeader>
                    {viewing && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">

                            {/* Client */}
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Name of Client</Label>
                                <Input value={viewing.client_name} disabled className="opacity-100 font-medium" />
                            </div>

                            {/* Project */}
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Name of Project</Label>
                                <Input value={viewing.project || ""} disabled placeholder="—" className="opacity-100" />
                            </div>

                            {/* PO Number */}
                            <div className="space-y-2">
                                <Label>Purchase Order No.</Label>
                                <Input value={viewing.po_number} disabled className="opacity-100 font-medium" />
                            </div>

                            {/* PO Date */}
                            <div className="space-y-2">
                                <Label>PO Date</Label>
                                <Input type="date" value={viewing.po_date ? isoToDateInput(viewing.po_date) : ""} disabled className="opacity-100" />
                            </div>

                            {/* Validity Date */}
                            <div className="space-y-2">
                                <Label>PO Validity Date</Label>
                                <Input type="date" value={viewing.validity_date ? isoToDateInput(viewing.validity_date) : ""} disabled className="opacity-100" />
                            </div>

                            {/* Items */}
                            <div className="space-y-3 sm:col-span-2">
                                <Label className="text-sm font-semibold">Items</Label>
                                <div className="space-y-2">
                                    {(viewing.line_items?.length > 0
                                        ? viewing.line_items
                                        : [{ item: viewing.item, quantity: viewing.total_quantity, uom: viewing.uom || "Nos", unit_price: viewing.unit_price, gst: viewing.gst || "0", freight: viewing.freight || 0 }]
                                    ).map((li, idx) => (
                                        <div key={idx} className="rounded-lg border border-border bg-muted/20 p-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                                <div className="sm:col-span-2 space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Item Name</Label>
                                                    <Input value={li.item} disabled className="opacity-100" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Quantity</Label>
                                                    <div className="flex gap-1">
                                                        <Input value={li.quantity ?? ""} disabled className="flex-1 opacity-100" />
                                                        <Input value={li.uom || "Nos"} disabled className="w-20 opacity-100 text-center" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Unit Price</Label>
                                                    <Input value={li.unit_price ? Number(li.unit_price).toFixed(2) : "0.00"} disabled className="opacity-100" />
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end mt-4 pt-4 border-t border-slate-200">
                                                <div className="text-right">
                                                    <div className="text-[10px] uppercase text-muted-foreground font-semibold">Subtotal</div>
                                                    <div className="font-bold text-sm text-slate-800">{inr((li.quantity || 0) * (li.unit_price || 0))}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Financial Summary Bar */}
                            <div className="sm:col-span-2 mt-2 p-3 rounded-lg bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-600">Subtotal:</span>
                                        <span className="text-sm font-bold text-slate-900">{inr(viewing.subtotal || 0)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-600">GST:</span>
                                        <span className="text-sm font-bold text-slate-900">
                                            {viewing.gst && viewing.gst !== "0" ? viewing.gst : "Per Item"} ({inr(viewing.gst_amount || 0)})
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-600">Freight:</span>
                                        <span className="text-sm font-bold text-slate-900">{inr(viewing.freight || 0)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-md border border-primary/20">
                                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Grand Total:</span>
                                    <span className="text-base font-black text-primary">{inr(viewing.grand_total || 0)}</span>
                                </div>
                            </div>

                            {/* Payment Terms */}
                            <div className="space-y-2 sm:col-span-1">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Payment Terms</Label>
                                <Input value={viewing.payment_terms || ""} disabled placeholder="—" className="h-8 opacity-100" />
                            </div>

                            {/* Remark — highlighted */}
                            <div className="space-y-2 sm:col-span-2">
                                <Label className="font-semibold text-amber-700 dark:text-amber-400">Remark</Label>
                                <Textarea
                                    value={viewing.remark || ""}
                                    disabled
                                    rows={2}
                                    placeholder="No remarks"
                                    className="opacity-100 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 text-foreground"
                                />
                            </div>

                            {/* Document */}
                            {viewing.file_url && (
                                <div className="sm:col-span-2">
                                    <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(`http://localhost:8000${viewing.file_url}`, "_blank")}>
                                        <FileText className="h-4 w-4 mr-2" /> View Attached PO Document
                                    </Button>
                                </div>
                            )}

                            {/* PO Fulfillment Summary section */}
                            {poFulfillmentLoading && <div className="sm:col-span-2 py-4 text-center text-muted-foreground text-sm">Loading fulfillment summary…</div>}
                            {poFulfillment && !poFulfillmentLoading && (() => {
                                const po = poFulfillment;
                                return (
                                    <div className="sm:col-span-2 space-y-5 py-4 border-t border-border mt-4">
                                        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                            <Package className="h-4 w-4 text-primary" /> PO Fulfillment Summary
                                        </h3>
                                        
                                        {/* Quantity summary */}
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">PO Quantity</div>
                                                <div className="text-lg font-bold text-foreground">{po.po_quantity} <span className="text-xs font-normal text-muted-foreground">{po.uom}</span></div>
                                            </div>
                                            <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Delivered Quantity</div>
                                                <div className="text-lg font-bold text-success">{po.delivered_quantity} <span className="text-xs font-normal text-muted-foreground">{po.uom}</span></div>
                                            </div>
                                            <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pending Quantity</div>
                                                <div className="text-lg font-bold text-warning">{po.pending_quantity} <span className="text-xs font-normal text-muted-foreground">{po.uom}</span></div>
                                            </div>
                                        </div>

                                        {/* Dispatch history */}
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold">Dispatch History</Label>
                                            <div className="rounded-lg border border-border overflow-x-auto">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-muted text-muted-foreground font-medium border-b border-border">
                                                        <tr>
                                                            <th className="p-2">Dispatch Date</th>
                                                            <th className="p-2">Invoice No.</th>
                                                            <th className="p-2">Item</th>
                                                            <th className="p-2 text-right">Dispatch Qty</th>
                                                            <th className="p-2 text-right">Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {po.dispatch_history?.map((d, idx) => (
                                                            <tr key={idx} className="border-b border-border/50">
                                                                <td className="p-2 whitespace-nowrap">{d.date}</td>
                                                                <td className="p-2">{d.invoice_number || "—"}</td>
                                                                <td className="p-2 max-w-[200px] truncate" title={d.item || ""}>{d.item || "—"}</td>
                                                                <td className="p-2 text-right whitespace-nowrap">{d.dispatch_qty} <span className="text-muted-foreground">{d.uom}</span></td>
                                                                <td className="p-2 text-right font-medium">{inr(d.amount)}</td>
                                                            </tr>
                                                        ))}
                                                        {(!po.dispatch_history || po.dispatch_history.length === 0) && (
                                                            <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No dispatches yet.</td></tr>
                                                        )}
                                                    </tbody>
                                                    {po.dispatch_history?.length > 0 && (
                                                        <tfoot>
                                                            <tr className="border-t border-border bg-muted/30 font-semibold">
                                                                <td className="p-2" colSpan={4}>Total <span className="font-normal text-muted-foreground">(Incl. GST)</span></td>
                                                                <td className="p-2 text-right">
                                                                    {inr(po.dispatch_history.reduce((sum, d) => sum + (d.amount || 0), 0))}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    )}
                                                </table>
                                            </div>
                                        </div>

                                        {/* Dispatch / payment / status summary */}
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-b border-border pb-4">
                                            <Field label="Total Dispatches" value={po.total_dispatches} />
                                            <Field label="Last Dispatch Date" value={po.last_dispatch_date || "—"} />
                                            <div>
                                                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Delivery Status</div>
                                                <StatusBadge status={poDeliveryStatusBadge(po.delivery_status)} label={po.delivery_status} />
                                            </div>
                                            <Field label="Payment Received" value={inr(po.payment_received)} />
                                            <Field label="Pending Payment" value={inr(po.pending_payment)} />
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Activity Log */}
                            <div className="sm:col-span-2 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <Clock className="h-4 w-4 text-accent" /> Activity Log
                                </div>
                                <ActivityEntry label="Created By" by={viewing.created_by} at={viewing.created_at} color="primary" />
                                <ActivityEntry label="Last Updated By" by={viewing.last_updated_by} at={viewing.last_updated_at} color="warning" />
                                <ActivityEntry label="Last Opened By" by={viewing.last_opened_by} at={viewing.last_opened_at} color="accent" />
                                {viewing.short_closed && (
                                    <ActivityEntry
                                        label="Short Closed By"
                                        by={viewing.short_closed_by}
                                        at={viewing.short_closed_at}
                                        color="slate-500"
                                        remark={viewing.short_closed_remark}
                                    />
                                )}
                            </div>

                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
                        {viewing && (
                            <>
                                <Button variant="outline" onClick={() => openPODocument(viewing.id)}>
                                    <Printer className="h-4 w-4 mr-2" /> Print PO
                                </Button>
                                <Button className="bg-gradient-primary" disabled={viewing.short_closed} onClick={() => { const o = viewing; setViewing(null); openEdit(o); }}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!shortCloseItem} onOpenChange={(open) => !open && setShortCloseItem(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Short Close Purchase Order</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to short close <strong>{shortCloseItem?.po_number}</strong>?
                            No further invoices or dispatches can be created against it.
                        </p>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
                            <Textarea
                                placeholder="Enter reason for short closing..."
                                value={shortCloseRemark}
                                onChange={(e) => setShortCloseRemark(e.target.value)}
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShortCloseItem(null)}>Cancel</Button>
                        <Button
                            variant="default"
                            className="bg-slate-700 hover:bg-slate-800"
                            disabled={shortCloseMutation.isPending}
                            onClick={() => {
                                shortCloseMutation.mutate({
                                    id: shortCloseItem.id,
                                    body: { remark: shortCloseRemark || "", user: getCurrentUser() }
                                });
                            }}
                        >Confirm Short Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Confirm Deletion</DialogTitle></DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">Are you sure you want to delete this purchase order? This action cannot be undone.</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setItemToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => { deleteMutation.mutate(itemToDelete); setItemToDelete(null); }}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Confirm Bulk Deletion</DialogTitle></DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">
                            Delete {selectedIds.size} selected purchase order{selectedIds.size === 1 ? "" : "s"}? Any linked Sales/Invoices will be deleted first. This action cannot be undone.
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

            <input
                type="file"
                id="direct-file-upload"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleDirectUpload(e, uploadingPoId)}
            />

            {/* Import Dialog */}
            <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportFile(null); setImportResult(null); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-blue-600" /> Import Purchase Orders
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                            Upload an Excel (.xlsx) file exported from this system. All fields will be auto-populated and validated before saving.
                        </p>
                        <div className="space-y-2">
                            <Label>Select File (.xlsx or .csv)</Label>
                            <div
                                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                                onClick={() => importFileRef.current?.click()}
                            >
                                {importFile ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-green-700">
                                        <FileText className="h-4 w-4" />
                                        <span className="font-medium">{importFile.name}</span>
                                        <span className="text-muted-foreground">({(importFile.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                ) : (
                                    <div className="text-muted-foreground text-sm">
                                        <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                                        Click to choose or drop a file here
                                    </div>
                                )}
                            </div>
                            <input
                                ref={importFileRef}
                                type="file"
                                className="hidden"
                                accept=".xlsx,.csv,.json"
                                onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>If PO Number already exists</Label>
                            <Select value={importConflict} onValueChange={setImportConflict}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="skip">Skip — keep existing record (safe)</SelectItem>
                                    <SelectItem value="update">Update — overwrite header fields</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {importResult && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
                                <div className="font-semibold text-foreground mb-2">Import Results</div>
                                <div className="flex gap-4 flex-wrap">
                                    <span className="text-green-700">Created: <strong>{importResult.created}</strong></span>
                                    <span className="text-blue-700">Updated: <strong>{importResult.updated}</strong></span>
                                    <span className="text-orange-600">Skipped: <strong>{importResult.skipped}</strong></span>
                                </div>
                                {importResult.errors?.length > 0 && (
                                    <div className="mt-2">
                                        <div className="text-destructive font-medium text-xs mb-1">Errors ({importResult.errors.length}):</div>
                                        <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                                            {importResult.errors.map((e, i) => (
                                                <li key={i} className="text-destructive text-xs">• {e}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
                        <Button
                            onClick={handleImport}
                            disabled={!importFile || importing}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {importing ? "Importing…" : "Import"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Merge Clients</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">Select the correct client name to keep, and the duplicate one to merge and delete.</p>
                        <div className="space-y-1">
                            <Label>Master Client (Keep)</Label>
                            <Select value={mergeData.masterId} onValueChange={(v) => setMergeData({ ...mergeData, masterId: v })}>
                                <SelectTrigger><SelectValue placeholder="Select master client..." /></SelectTrigger>
                                <SelectContent>
                                    {fullClients.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.location})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Duplicate Client (Merge & Delete)</Label>
                            <Select value={mergeData.duplicateId} onValueChange={(v) => setMergeData({ ...mergeData, duplicateId: v })}>
                                <SelectTrigger><SelectValue placeholder="Select duplicate client..." /></SelectTrigger>
                                <SelectContent>
                                    {fullClients.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.location})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="flex items-center sm:justify-between w-full">
                        <Button variant="destructive" onClick={handleClientDelete} className="mr-auto">Delete Only</Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
                            <Button onClick={handleMerge} disabled={mergeMutation.isPending}>Merge</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ItemMasterManageDialog open={manageItemsOpen} onOpenChange={setManageItemsOpen} type="PO" />
            <UomManageDialog open={manageUomOpen} onOpenChange={setManageUomOpen} />
        </div>
    );
};

const Field = ({ label, value, full }) => (
    <div className={full ? "col-span-2" : ""}>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground break-words">{value ?? "—"}</div>
    </div>
);

const ActivityEntry = ({ label, by, at, color, remark }) => (
    <div className={`flex items-start gap-3 text-xs border-l-2 border-${color}/40 pl-3`}>
        <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-semibold text-foreground">{by || "—"}</div>
            <div className="text-muted-foreground">{at ? fmtDateTime(at) : "—"}</div>
            {remark && <div className="mt-1 text-muted-foreground italic border-l-2 border-muted pl-2">"{remark}"</div>}
        </div>
    </div>
);

export default PurchaseOrders;
