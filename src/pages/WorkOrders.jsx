import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { inr, fmtDate, fmtDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/currentUser";
import { useConstants } from "@/lib/constants";
import {
    fetchWorkOrders, createWorkOrder, updateWorkOrder,
    deleteWorkOrder, bulkDeleteWorkOrders, fetchWorkOrder, openWODocument, closeWorkOrder,
    createClient, createProject, fetchProjects, fetchNextWONumber,
    exportWorkOrders, importWorkOrders, uploadWorkOrderFile,
} from "@/lib/api";
import { Pencil, Plus, Search, Trash2, Eye, FileText, Package, CheckCircle2, Clock, Printer, X, Download, Upload, UploadCloud, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSortableRows } from "@/hooks/useSortableRows";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { useResizableRows } from "@/hooks/useResizableRows";
import { useColumnFilters } from "@/hooks/useColumnFilters";
import { SortableHeader } from "@/components/SortableHeader";
import { FilterableHeader } from "@/components/FilterableHeader";
import { StickyScrollArea } from "@/components/StickyScrollArea";

const emptyLineItem = () => ({ item: "", quantity: "", completed_quantity: "", uom: "Nos", unit_price: "", gst: "0", freight: "" });

const WO_TABLE_WIDTHS = {
    sno: 56, client_name: 140, project: 120, item: 150, wo_number: 130,
    wo_date: 110, total_quantity: 100, completed_quantity: 100, pending_quantity: 100,
    target_completion_date: 120, status: 120, activity: 120, actions: 190,
};

const CLOSED_STATUSES = ["Closed", "Cancelled"];

const empty = () => ({
    clientName: "", clientDropdown: "",
    woNumber: "",
    woDate: new Date().toISOString().slice(0, 10),
    gst: "", freight: 0,
    project: "",
    workDescription: "",
    siteLocation: "",
    engineerName: "",
    priority: "Medium",
    startDate: new Date().toISOString().slice(0, 10),
    targetCompletionDate: "",
    remarks: "",
    status: "Pending",
    fileUrl: "",
    lineItems: [emptyLineItem()],
});

// Pulls the calendar date straight off the ISO string (e.g. "2026-07-02" from
// "2026-07-02T00:00:00") instead of round-tripping through `new Date()` — a
// browser not in UTC would otherwise shift the date by a day (local midnight
// converted to UTC can land on the previous day), which made an untouched
// date field look "changed" on every save.
const isoToDateInput = (iso) => (iso ? String(iso).slice(0, 10) : "");

const woItemDisplay = (o) => (o.line_items?.length > 0 ? o.line_items.map((l) => l.item).join(", ") : o.item);
const WOColumnAccessors = {
    client_name: (o) => o.client_name,
    project: (o) => o.project || "",
    item: woItemDisplay,
    wo_number: (o) => o.wo_number,
    wo_date: (o) => (o.wo_date ? fmtDate(o.wo_date) : ""),
    total_quantity: (o) => o.total_quantity,
    completed_quantity: (o) => o.completed_quantity,
    pending_quantity: (o) => o.pending_quantity,
    target_completion_date: (o) => (o.target_completion_date ? fmtDate(o.target_completion_date) : ""),
    status: (o) => o.status || "Pending",
};

const WorkOrders = () => {
    const qc = useQueryClient();
    const { wo_clients: clients, projects, uom_options, wo_statuses, wo_priorities } = useConstants();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ["work-orders"],
        queryFn: () => fetchWorkOrders({ limit: 100000 }),
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["work-orders"] });
        qc.invalidateQueries({ queryKey: ["workOrderReport"] });
    };

    const createMutation = useMutation({ mutationFn: createWorkOrder, onSuccess: invalidate });
    const updateMutation = useMutation({ mutationFn: ({ id, body }) => updateWorkOrder(id, body), onSuccess: invalidate });
    const deleteMutation = useMutation({
        mutationFn: (id) => deleteWorkOrder(id, getCurrentUser()),
        onSuccess: () => {
            invalidate();
            toast.success("Work Order deleted");
        },
        onError: (err) => {
            toast.error(err.message || "Failed to delete Work Order");
        }
    });
    const bulkDeleteMutation = useMutation({
        mutationFn: (ids) => bulkDeleteWorkOrders(ids, getCurrentUser()),
        onSuccess: (result) => {
            invalidate();
            setSelectedIds(new Set());
            if (result.errors?.length) {
                toast.warning(`Deleted ${result.deleted.length} work order(s), ${result.errors.length} failed`);
            } else {
                toast.success(`Deleted ${result.deleted.length} work order(s)`);
            }
        },
        onError: (err) => {
            toast.error(err.message || "Bulk delete failed");
        }
    });
    const markOpenedMutation = useMutation({ mutationFn: (id) => fetchWorkOrder(id, getCurrentUser()), onSuccess: invalidate });
    const closeMutation = useMutation({
        mutationFn: ({ id, body }) => closeWorkOrder(id, body),
        onSuccess: () => {
            invalidate();
            toast.success("Work Order Closed successfully");
            setCloseItem(null);
            setCloseRemark("");
        },
        onError: (err) => {
            toast.error(err.message || "Failed to close Work Order");
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

    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(empty());
    const [viewing, setViewing] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
    const [generatingNumber, setGeneratingNumber] = useState(false);

    const [closeItem, setCloseItem] = useState(null);
    const [closeRemark, setCloseRemark] = useState("");

    const [importOpen, setImportOpen] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importConflict, setImportConflict] = useState("skip");
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);

    const handleExport = async () => {
        const tid = toast.loading("Preparing Excel export…");
        try {
            await exportWorkOrders();
            toast.success("Work Orders exported", { id: tid });
        } catch (err) {
            toast.error("Export failed: " + err.message, { id: tid });
        }
    };

    const handleImport = async () => {
        if (!importFile) return toast.error("Please select an Excel (.xlsx) or CSV file");
        setImporting(true);
        const tid = toast.loading("Importing…");
        try {
            const result = await importWorkOrders(importFile, importConflict, getCurrentUser());
            setImportResult(result);
            toast.success(
                `Import done — Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`,
                { id: tid, duration: 6000 }
            );
            invalidate();
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
                (o.wo_number || "").toLowerCase().includes(s) ||
                (o.item || "").toLowerCase().includes(s) ||
                (o.project || "").toLowerCase().includes(s) ||
                (o.status || "").toLowerCase().includes(s)
        );
    }, [orders, search]);

    const { filters: woFilters, setFilter: setWoFilter } = useColumnFilters();

    const columnFiltered = useMemo(() => {
        const keys = Object.keys(woFilters);
        if (keys.length === 0) return filtered;
        return filtered.filter((o) =>
            keys.every((k) => {
                const v = WOColumnAccessors[k](o);
                return woFilters[k].has(v == null || v === "" ? "—" : String(v));
            })
        );
    }, [filtered, woFilters]);

    const totals = useMemo(() => ({
        tot: columnFiltered.reduce((s, o) => s + (o.total_quantity || 0), 0),
        completed: columnFiltered.reduce((s, o) => s + (o.completed_quantity || 0), 0),
        pending: columnFiltered.reduce((s, o) => s + (o.pending_quantity || 0), 0),
    }), [columnFiltered]);

    const { widths: woWidths, startResize: startWoResize } = useResizableColumns("colw:work-orders", WO_TABLE_WIDTHS);
    const { sortedRows: sortedOrders, sortConfig: woSortConfig, requestSort: requestWoSort, setSort: setWoSort } = useSortableRows(columnFiltered);
    const { getHeight: getWoRowHeight, startResize: startWoRowResize } = useResizableRows("rowh:work-orders", 52);

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
        queryKey: ["projects", effectiveClient, "wo"],
        queryFn: () => fetchProjects({ client_name: effectiveClient, source: "wo" }),
        enabled: !!effectiveClient,
    });

    const openNew = () => { setEditingId(null); setForm(empty()); setDialogOpen(true); };
    const openEdit = (o) => {
        markOpenedMutation.mutate(o.id);
        setEditingId(o.id);
        const li = (o.line_items && o.line_items.length > 0)
            ? o.line_items.map(l => ({ id: l.id, item: l.item, quantity: l.quantity, completed_quantity: l.completed_quantity, uom: l.uom, unit_price: l.unit_price ? Number(l.unit_price).toFixed(2) : "", gst: l.gst || "0", freight: l.freight || "" }))
            : [emptyLineItem()];
        setForm({
            clientName: "", clientDropdown: o.client_name,
            woNumber: o.wo_number,
            woDate: isoToDateInput(o.wo_date) || new Date().toISOString().slice(0, 10),
            gst: o.gst || "", freight: o.freight,
            project: o.project || "",
            workDescription: o.work_description || "",
            siteLocation: o.site_location || "",
            engineerName: o.engineer_name || "",
            priority: o.priority || "Medium",
            startDate: isoToDateInput(o.start_date),
            targetCompletionDate: isoToDateInput(o.target_completion_date),
            remarks: o.remarks || "",
            status: o.status || "Pending",
            fileUrl: o.file_url || "",
            lineItems: li,
        });
        setDialogOpen(true);
    };
    const openView = (o) => { markOpenedMutation.mutate(o.id); setViewing(o); };
    const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const data = await uploadWorkOrderFile(file);
            set("fileUrl", data.file_url);
            toast.success("WO File uploaded");
        } catch (err) {
            toast.error("File upload failed: " + err.message);
        }
    };

    const handleGenerateNumber = async () => {
        setGeneratingNumber(true);
        try {
            const data = await fetchNextWONumber();
            set("woNumber", data.wo_number);
        } catch (e) {
            toast.error("Could not generate number: " + e.message);
        } finally {
            setGeneratingNumber(false);
        }
    };

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

    const submit = async () => {
        const hasItems = (form.lineItems || []).some(li => li.item.trim());
        if (!effectiveClient || !form.woNumber || !form.woDate || !hasItems) {
            toast.error("Client, Work Order Number, Work Order Date and at least one Item are required");
            return;
        }
        const payload = {
            client_name: effectiveClient,
            wo_number: form.woNumber,
            wo_date: form.woDate ? new Date(form.woDate).toISOString() : null,
            project: form.project || null,
            gst: form.gst || "0",
            freight: Number(form.freight) || 0,
            work_description: form.workDescription || null,
            site_location: form.siteLocation || null,
            engineer_name: form.engineerName || null,
            priority: form.priority || "Medium",
            start_date: form.startDate ? new Date(form.startDate).toISOString() : null,
            target_completion_date: form.targetCompletionDate ? new Date(form.targetCompletionDate).toISOString() : null,
            remarks: form.remarks || null,
            status: form.status || "Pending",
            file_url: form.fileUrl || null,
            created_by: getCurrentUser(),
            last_updated_by: getCurrentUser(),
            line_items: (form.lineItems || []).map(li => ({
                id: li.id || null,
                item: li.item.trim(),
                quantity: Number(li.quantity) || 0,
                completed_quantity: Number(li.completed_quantity) || 0,
                uom: li.uom || "Nos",
                unit_price: Number(li.unit_price) || 0,
                gst: li.gst || "0",
                freight: Number(li.freight) || 0
            })).filter(li => li.item)
        };
        try {
            const tid = toast.loading(editingId ? "Updating Work Order..." : "Creating Work Order...");
            const result = editingId
                ? await updateMutation.mutateAsync({ id: editingId, body: payload })
                : await createMutation.mutateAsync(payload);
            if (editingId && result?.no_changes) {
                toast.info("No changes to save", { id: tid });
            } else {
                toast.success("Work Order " + (editingId ? "updated" : "created"), { id: tid });
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
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">Work Orders</h2>
                <p className="text-sm text-muted-foreground">Track work orders with quantities, completion progress and activity log.</p>
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
                                <Plus className="h-4 w-4 mr-2" /> New Work Order
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Edit Work Order" : "Create Work Order"}</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">

                            {/* Section 1: Client */}
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Name of Client *</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Select value={form.clientDropdown} onValueChange={(v) => { set("clientDropdown", v); set("clientName", ""); }}>
                                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                                        <SelectContent>
                                            {clients.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline">Add New Client</Button>
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
                                </div>
                                {effectiveClient && <p className="text-xs text-muted-foreground">Using: <span className="font-medium text-foreground">{effectiveClient}</span></p>}
                            </div>

                            {/* Section 2: Project */}
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

                            {/* Section 3: WO Number + Date */}
                            <div className="space-y-2">
                                <Label>Work Order No. *</Label>
                                <div className="flex gap-2">
                                    <Input className="flex-1" value={form.woNumber} onChange={(e) => set("woNumber", e.target.value)} placeholder="WO-2026-XXXX" />
                                    <Button type="button" variant="outline" size="icon" onClick={handleGenerateNumber} disabled={generatingNumber} title="Generate number">
                                        <RefreshCw className={`h-4 w-4 ${generatingNumber ? "animate-spin" : ""}`} />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Work Order Date *</Label>
                                <Input type="date" value={form.woDate} onChange={(e) => set("woDate", e.target.value)} />
                            </div>

                            <div className="space-y-3 sm:col-span-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-semibold">Items *</Label>
                                    <Button type="button" size="sm" variant="outline" onClick={addLineItem}>
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                                    </Button>
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
                                                    <Input
                                                        placeholder="Enter item name"
                                                        value={li.item}
                                                        onChange={(e) => setLineItem(idx, "item", e.target.value)}
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
                                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">GST</Label>
                                                    <div className="flex gap-1">
                                                        <Input
                                                            placeholder="18"
                                                            value={(li.gst || "").replace("₹", "")}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if ((li.gst || "").toString().startsWith("₹")) {
                                                                    if (/^\d*\.?\d*$/.test(val)) setLineItem(idx, "gst", `₹${val}`);
                                                                } else {
                                                                    if (/^\d{0,2}%?$/.test(val)) setLineItem(idx, "gst", val);
                                                                }
                                                            }}
                                                        />
                                                        <Select value={(li.gst || "").toString().startsWith("₹") ? "amount" : "percent"} onValueChange={(v) => {
                                                            if (v === "amount") {
                                                                setLineItem(idx, "gst", `₹${(li.gst || "18").replace("₹", "").replace("%", "")}`);
                                                            } else {
                                                                setLineItem(idx, "gst", (li.gst || "18").replace("₹", "").replace("%", ""));
                                                            }
                                                        }}>
                                                            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="percent">%</SelectItem>
                                                                <SelectItem value="amount">₹</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Freight</Label>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        value={li.freight || ""}
                                                        onChange={(e) => setLineItem(idx, "freight", e.target.value)}
                                                    />
                                                </div>
                                                <div className="sm:col-span-2 flex items-end justify-end space-x-6">
                                                    <div className="text-right">
                                                        <div className="text-[10px] uppercase text-muted-foreground font-semibold">Subtotal</div>
                                                        <div className="font-medium text-sm">{inr((li.quantity || 0) * (li.unit_price || 0))}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] uppercase text-muted-foreground font-semibold">Row Total</div>
                                                        <div className="font-bold text-base text-green-700">
                                                            {inr(
                                                                ((li.quantity || 0) * (li.unit_price || 0)) +
                                                                Number(li.freight || 0) +
                                                                ((li.gst || "").toString().startsWith("₹")
                                                                    ? Number((li.gst || "").toString().replace("₹", "") || 0)
                                                                    : ((li.quantity || 0) * (li.unit_price || 0) * Number(li.gst || 18) / 100))
                                                            )}
                                                        </div>
                                                    </div>
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
                                            <select
                                                className="bg-slate-100 border-r border-slate-300 px-1.5 py-1 h-full text-xs font-bold text-slate-700 outline-none cursor-pointer"
                                                value={isGlobalGstAmount ? "amount" : "percent"}
                                                onChange={(e) => {
                                                    if (e.target.value === "amount") {
                                                        set("gst", `₹${globalGstAmount || 0}`);
                                                    } else {
                                                        set("gst", "18");
                                                    }
                                                }}
                                            >
                                                <option value="percent">%</option>
                                                <option value="amount">₹</option>
                                            </select>
                                            <input
                                                type="text"
                                                className="w-16 h-full px-2 text-right font-bold text-slate-900 outline-none"
                                                value={isGlobalGstAmount ? (form.gst?.toString().replace("₹", "") || "") : (form.gst || "")}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (isGlobalGstAmount) {
                                                        if (/^\d*\.?\d*$/.test(val)) set("gst", `₹${val}`);
                                                    } else {
                                                        if (/^\d{0,2}%?$/.test(val)) set("gst", val);
                                                    }
                                                }}
                                            />
                                        </div>
                                        {!isGlobalGstAmount && <span className="text-sm font-bold text-slate-900 ml-1">({inr(globalGstAmount)})</span>}
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

                            {/* Additional Fields */}
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Work Description</Label>
                                <Textarea
                                    placeholder="Describe the work to be carried out..."
                                    value={form.workDescription || ""}
                                    onChange={(e) => set("workDescription", e.target.value)}
                                    rows={2}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Site Location</Label>
                                <Input value={form.siteLocation || ""} onChange={(e) => set("siteLocation", e.target.value)} placeholder="Site / location" />
                            </div>

                            <div className="space-y-2">
                                <Label>Engineer / Supervisor Name</Label>
                                <Input value={form.engineerName || ""} onChange={(e) => set("engineerName", e.target.value)} placeholder="Name" />
                            </div>

                            <div className="space-y-2">
                                <Label>Priority</Label>
                                <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                                    <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                                    <SelectContent>
                                        {wo_priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                                    <SelectContent>
                                        {wo_statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label>Target Completion Date</Label>
                                <Input type="date" value={form.targetCompletionDate} onChange={(e) => set("targetCompletionDate", e.target.value)} />
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Remarks</Label>
                                <Textarea
                                    placeholder="Optional remarks for this Work Order..."
                                    value={form.remarks || ""}
                                    onChange={(e) => set("remarks", e.target.value)}
                                    rows={2}
                                />
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Upload WO Document</Label>
                                <div className="flex items-center gap-2">
                                    <Input type="file" className="hidden" id="wo-file-upload" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png" />
                                    <Button type="button" variant="outline" className="w-full" onClick={() => document.getElementById("wo-file-upload").click()}>
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
                                {editingId ? "Save changes" : "Create Work Order"}
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
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total WOs</div><div className="text-2xl font-bold text-foreground">{orders.length}</div></div>
                    </div>
                </Card>
                <Card className="p-5 shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-accent/15 grid place-items-center"><Package className="h-5 w-5 text-accent" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total Qty</div><div className="text-2xl font-bold text-foreground">{totals.tot.toLocaleString()}</div></div>
                    </div>
                </Card>
                <Card className="p-5 shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-success/15 grid place-items-center"><CheckCircle2 className="h-5 w-5 text-success" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Completed</div><div className="text-2xl font-bold text-foreground">{totals.completed.toLocaleString()}</div></div>
                    </div>
                </Card>
                <Card className="p-5 shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-warning/15 grid place-items-center"><Clock className="h-5 w-5 text-warning" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Pending</div><div className="text-2xl font-bold text-foreground">{totals.pending.toLocaleString()}</div></div>
                    </div>
                </Card>
            </div>

            <Card className="p-4 shadow-card">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by client, project, work order number, item, status..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                                <SortableHeader label="S.No." width={woWidths.sno} onResizeStart={startWoResize("sno")} />
                                <FilterableHeader label="Client" columnKey="client_name" accessor={WOColumnAccessors.client_name} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.client_name} onResizeStart={startWoResize("client_name")} rows={filtered} filterValue={woFilters.client_name} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="Project" columnKey="project" accessor={WOColumnAccessors.project} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.project} onResizeStart={startWoResize("project")} rows={filtered} filterValue={woFilters.project} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="Item" columnKey="item" accessor={WOColumnAccessors.item} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.item} onResizeStart={startWoResize("item")} rows={filtered} filterValue={woFilters.item} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="WO #" columnKey="wo_number" accessor={WOColumnAccessors.wo_number} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.wo_number} onResizeStart={startWoResize("wo_number")} rows={filtered} filterValue={woFilters.wo_number} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="WO Date" columnKey="wo_date" type="date" accessor={WOColumnAccessors.wo_date} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.wo_date} onResizeStart={startWoResize("wo_date")} rows={filtered} filterValue={woFilters.wo_date} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="Total Qty" columnKey="total_quantity" type="number" align="right" accessor={WOColumnAccessors.total_quantity} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.total_quantity} onResizeStart={startWoResize("total_quantity")} rows={filtered} filterValue={woFilters.total_quantity} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="Completed" columnKey="completed_quantity" type="number" align="right" accessor={WOColumnAccessors.completed_quantity} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.completed_quantity} onResizeStart={startWoResize("completed_quantity")} rows={filtered} filterValue={woFilters.completed_quantity} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="Pending" columnKey="pending_quantity" type="number" align="right" accessor={WOColumnAccessors.pending_quantity} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.pending_quantity} onResizeStart={startWoResize("pending_quantity")} rows={filtered} filterValue={woFilters.pending_quantity} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="Target Completion" columnKey="target_completion_date" type="date" accessor={WOColumnAccessors.target_completion_date} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.target_completion_date} onResizeStart={startWoResize("target_completion_date")} rows={filtered} filterValue={woFilters.target_completion_date} onApplyFilter={setWoFilter} />
                                <FilterableHeader label="Status" columnKey="status" accessor={WOColumnAccessors.status} sortConfig={woSortConfig} setSort={setWoSort} width={woWidths.status} onResizeStart={startWoResize("status")} rows={filtered} filterValue={woFilters.status} onApplyFilter={setWoFilter} />
                                <SortableHeader label="Activity" width={woWidths.activity} onResizeStart={startWoResize("activity")} />
                                <SortableHeader label="Actions" align="right" width={woWidths.actions} onResizeStart={startWoResize("actions")} />
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && (
                                <tr><td colSpan={14} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
                            )}
                            {sortedOrders.map((o, idx) => {
                                // Only a real edit should change who's shown here — merely opening/
                                // viewing a WO (last_opened_at/by) must never override this, or the
                                // name would flip just from someone looking at the record.
                                const lastAct = o.last_updated_at || o.created_at;
                                const lastBy = o.last_updated_by || o.created_by || "—";
                                const isClosedLike = CLOSED_STATUSES.includes(o.status);
                                return (
                                    <tr
                                        key={o.id}
                                        style={{ height: getWoRowHeight(o.id) }}
                                        className={`relative border-t border-border hover:bg-muted/30 text-sm${o.remarks ? " bg-amber-50 dark:bg-amber-950/20" : ""}`}
                                    >
                                        <td className="px-1.5 py-3 text-center">
                                            <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggleSelectOne(o.id)} aria-label={`Select WO ${o.wo_number}`} />
                                        </td>
                                        <td className="relative px-1.5 py-3 text-center text-muted-foreground">
                                            {idx + 1}
                                            <div
                                                onMouseDown={startWoRowResize(o.id)}
                                                className="group absolute left-0 bottom-0 w-full h-2.5 cursor-row-resize hover:bg-primary/20 active:bg-primary/40 z-10 flex items-end"
                                                title="Drag to resize row"
                                            >
                                                <div className="w-full h-[3px] bg-border group-hover:bg-primary group-active:bg-primary rounded-full transition-colors" />
                                            </div>
                                        </td>
                                        <td className="px-1.5 py-3 text-center text-foreground font-semibold truncate cursor-pointer hover:underline" title={o.client_name} onClick={() => setViewing(o)}>{o.client_name}</td>
                                        <td className="px-1.5 py-3 text-center text-muted-foreground truncate cursor-pointer hover:underline" title={o.project} onClick={() => setViewing(o)}>{o.project}</td>
                                        <td
                                            className="px-1.5 py-3 text-center text-muted-foreground truncate cursor-pointer hover:underline"
                                            title={(o.line_items?.length > 0) ? o.line_items.map(l => l.item).join(", ") : o.item}
                                            onClick={() => setViewing(o)}
                                        >
                                            {(o.line_items?.length > 0) ? o.line_items[0].item : o.item}
                                            {(o.line_items?.length > 1) && <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">+{o.line_items.length - 1}</span>}
                                        </td>
                                        <td className="px-1.5 py-3 text-center font-medium text-foreground truncate text-xs cursor-pointer hover:underline" title={o.wo_number} onClick={() => setViewing(o)}>{o.wo_number}</td>
                                        <td className="px-1.5 py-3 text-center text-muted-foreground whitespace-nowrap text-xs">{o.wo_date ? fmtDate(o.wo_date) : "—"}</td>
                                        <td className="px-1.5 py-3 text-center font-semibold whitespace-nowrap">{o.total_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className="px-1.5 py-3 text-center text-success font-bold whitespace-nowrap">{o.completed_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className="px-1.5 py-3 text-center text-warning font-bold whitespace-nowrap">{o.pending_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className="px-1.5 py-3 text-center text-muted-foreground whitespace-nowrap text-xs">{o.target_completion_date ? fmtDate(o.target_completion_date) : "—"}</td>
                                        <td className="px-1.5 py-3">
                                            <div className="flex justify-center">
                                                <StatusBadge status={o.status || "Pending"} label={o.status || "Pending"} />
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
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openView(o)} title="View details"><Eye className="h-3 w-3" /></Button>
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openWODocument(o.id)} title="Print Work Order"><Printer className="h-3 w-3" /></Button>
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(o)} disabled={isClosedLike} title="Edit">
                                                    <Pencil className={`h-3 w-3 ${isClosedLike ? "text-muted-foreground" : "text-blue-500"}`} />
                                                </Button>
                                                {!isClosedLike && (
                                                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100" onClick={() => setCloseItem(o)} title="Close Work Order">
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
                                <tr><td colSpan={14} className="px-5 py-12 text-center text-muted-foreground">No work orders found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </StickyScrollArea>
            </Card>

            <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Work Order Details</DialogTitle>
                    </DialogHeader>
                    {viewing && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Name of Client</Label>
                                <Input value={viewing.client_name} disabled className="opacity-100 font-medium" />
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Name of Project</Label>
                                <Input value={viewing.project || ""} disabled placeholder="—" className="opacity-100" />
                            </div>

                            <div className="space-y-2">
                                <Label>Work Order No.</Label>
                                <Input value={viewing.wo_number} disabled className="opacity-100 font-medium" />
                            </div>

                            <div className="space-y-2">
                                <Label>Work Order Date</Label>
                                <Input type="date" value={viewing.wo_date ? isoToDateInput(viewing.wo_date) : ""} disabled className="opacity-100" />
                            </div>

                            <div className="space-y-3 sm:col-span-2">
                                <Label className="text-sm font-semibold">Items</Label>
                                <div className="space-y-2">
                                    {(viewing.line_items?.length > 0
                                        ? viewing.line_items
                                        : [{ item: viewing.item, quantity: viewing.total_quantity, completed_quantity: viewing.completed_quantity, uom: viewing.uom || "Nos", unit_price: viewing.unit_price, gst: viewing.gst || "0", freight: viewing.freight || 0 }]
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
                                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mt-4 pt-4 border-t border-slate-200">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">GST</Label>
                                                    <Input value={li.gst || "0"} disabled className="opacity-100" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Freight</Label>
                                                    <Input value={li.freight ?? "0"} disabled className="opacity-100" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Completed</Label>
                                                    <Input value={li.completed_quantity ?? "0"} disabled className="opacity-100" />
                                                </div>
                                                <div className="sm:col-span-2 flex items-end justify-end space-x-6">
                                                    <div className="text-right">
                                                        <div className="text-[10px] uppercase text-muted-foreground font-semibold">Subtotal</div>
                                                        <div className="font-medium text-sm">{inr((li.quantity || 0) * (li.unit_price || 0))}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] uppercase text-muted-foreground font-semibold">Row Total</div>
                                                        <div className="font-bold text-base text-green-700">
                                                            {inr(
                                                                ((li.quantity || 0) * (li.unit_price || 0)) +
                                                                Number(li.freight || 0) +
                                                                ((li.gst || "").toString().startsWith("₹")
                                                                    ? Number((li.gst || "").toString().replace("₹", "") || 0)
                                                                    : ((li.quantity || 0) * (li.unit_price || 0) * Number(li.gst || 0) / 100))
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

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

                            <div className="space-y-2 sm:col-span-2">
                                <Label>Work Description</Label>
                                <Textarea value={viewing.work_description || ""} disabled rows={2} placeholder="—" className="opacity-100" />
                            </div>

                            <div className="space-y-2">
                                <Label>Site Location</Label>
                                <Input value={viewing.site_location || ""} disabled placeholder="—" className="opacity-100" />
                            </div>
                            <div className="space-y-2">
                                <Label>Engineer / Supervisor</Label>
                                <Input value={viewing.engineer_name || ""} disabled placeholder="—" className="opacity-100" />
                            </div>
                            <div className="space-y-2">
                                <Label>Priority</Label>
                                <Input value={viewing.priority || ""} disabled className="opacity-100" />
                            </div>
                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Input value={viewing.status || ""} disabled className="opacity-100" />
                            </div>
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input type="date" value={viewing.start_date ? isoToDateInput(viewing.start_date) : ""} disabled className="opacity-100" />
                            </div>
                            <div className="space-y-2">
                                <Label>Target Completion Date</Label>
                                <Input type="date" value={viewing.target_completion_date ? isoToDateInput(viewing.target_completion_date) : ""} disabled className="opacity-100" />
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label className="font-semibold text-amber-700 dark:text-amber-400">Remarks</Label>
                                <Textarea
                                    value={viewing.remarks || ""}
                                    disabled
                                    rows={2}
                                    placeholder="No remarks"
                                    className="opacity-100 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 text-foreground"
                                />
                            </div>

                            {viewing.file_url && (
                                <div className="sm:col-span-2">
                                    <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(`http://localhost:8000${viewing.file_url}`, "_blank")}>
                                        <FileText className="h-4 w-4 mr-2" /> View Attached WO Document
                                    </Button>
                                </div>
                            )}

                            <div className="sm:col-span-2 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <Clock className="h-4 w-4 text-accent" /> Activity Log
                                </div>
                                <ActivityEntry label="Created By" by={viewing.created_by} at={viewing.created_at} color="primary" />
                                <ActivityEntry label="Last Updated By" by={viewing.last_updated_by} at={viewing.last_updated_at} color="warning" />
                                <ActivityEntry label="Last Opened By" by={viewing.last_opened_by} at={viewing.last_opened_at} color="accent" />
                                {CLOSED_STATUSES.includes(viewing.status) && (
                                    <ActivityEntry
                                        label="Closed By"
                                        by={viewing.closed_by}
                                        at={viewing.closed_at}
                                        color="slate-500"
                                        remark={viewing.closed_remark}
                                    />
                                )}
                            </div>

                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
                        {viewing && (
                            <>
                                <Button variant="outline" onClick={() => openWODocument(viewing.id)}>
                                    <Printer className="h-4 w-4 mr-2" /> Print
                                </Button>
                                <Button className="bg-gradient-primary" disabled={CLOSED_STATUSES.includes(viewing.status)} onClick={() => { const o = viewing; setViewing(null); openEdit(o); }}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!closeItem} onOpenChange={(open) => !open && setCloseItem(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Close Work Order</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to close <strong>{closeItem?.wo_number}</strong>?
                            No further edits can be made once closed.
                        </p>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
                            <Textarea
                                placeholder="Enter reason for closing..."
                                value={closeRemark}
                                onChange={(e) => setCloseRemark(e.target.value)}
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCloseItem(null)}>Cancel</Button>
                        <Button
                            variant="default"
                            className="bg-slate-700 hover:bg-slate-800"
                            disabled={closeMutation.isPending}
                            onClick={() => {
                                closeMutation.mutate({
                                    id: closeItem.id,
                                    body: { remark: closeRemark || "", user: getCurrentUser() }
                                });
                            }}
                        >Confirm Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Confirm Deletion</DialogTitle></DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">Are you sure you want to delete this work order? This action cannot be undone.</p>
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
                            Delete {selectedIds.size} selected work order{selectedIds.size === 1 ? "" : "s"}? Any linked WO Sales/Invoices will be deleted first. This action cannot be undone.
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

            {/* Import Dialog */}
            <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportFile(null); setImportResult(null); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-blue-600" /> Import Work Orders
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
                                onClick={() => document.getElementById("wo-import-file")?.click()}
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
                                id="wo-import-file"
                                type="file"
                                className="hidden"
                                accept=".xlsx,.csv,.json"
                                onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>If Work Order Number already exists</Label>
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
        </div>
    );
};

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

export default WorkOrders;
