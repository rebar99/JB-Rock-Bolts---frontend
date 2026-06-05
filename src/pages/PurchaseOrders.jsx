import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { inr, fmtDate, fmtDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/currentUser";
import { useConstants } from "@/lib/constants";
import {
    fetchPurchaseOrders, createPurchaseOrder, updatePurchaseOrder,
    deletePurchaseOrder, fetchPurchaseOrder, openPODocument,
    createClient, createProject, fetchProjects, uploadPOFile
} from "@/lib/api";
import { Pencil, Plus, Search, Trash2, Eye, FileText, Package, Truck, Clock, Printer, X, UploadCloud } from "lucide-react";
import { toast } from "sonner";

const generatePONumber = () => {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, "");
    return `PO-${datePart}-${timePart}`;
};

const emptyLineItem = () => ({ item: "", quantity: "", uom: "Nos", unit_price: "", gst: "0", freight: "" });

const empty = () => ({
    clientName: "", clientDropdown: "",
    poNumber: generatePONumber(),
    validityDate: new Date().toISOString().slice(0, 10),
    gst: "", freight: 0,
    project: "",
    paymentTerms: "",
    fileUrl: "",
    lineItems: [emptyLineItem()],
});

const isoToDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

const PurchaseOrders = () => {
    const qc = useQueryClient();
    const { products, clients, projects, payment_terms, uom_options } = useConstants();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ["purchase-orders"],
        queryFn: () => fetchPurchaseOrders(),
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ["purchase-orders"] });

    const createMutation = useMutation({ mutationFn: createPurchaseOrder, onSuccess: invalidate });
    const updateMutation = useMutation({ mutationFn: ({ id, body }) => updatePurchaseOrder(id, body), onSuccess: invalidate });
    const deleteMutation = useMutation({ 
        mutationFn: deletePurchaseOrder, 
        onSuccess: () => {
            invalidate();
            toast.success("Purchase Order deleted");
        },
        onError: (err) => {
            toast.error(err.message || "Failed to delete Purchase Order");
        }
    });
    const markOpenedMutation = useMutation({ mutationFn: (id) => fetchPurchaseOrder(id, getCurrentUser()), onSuccess: invalidate });

    const clientMutation = useMutation({ mutationFn: createClient, onSuccess: () => qc.invalidateQueries({ queryKey: ["constants"] }) });
    const projectMutation = useMutation({ mutationFn: createProject, onSuccess: () => qc.invalidateQueries({ queryKey: ["constants"] }) });

    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(empty());
    const [viewing, setViewing] = useState(null);
    const [uploadingPoId, setUploadingPoId] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);

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

    const totals = useMemo(() => ({
        tot: orders.reduce((s, o) => s + o.total_quantity, 0),
        del: orders.reduce((s, o) => s + o.delivered_quantity, 0),
        pending: orders.reduce((s, o) => s + o.pending_quantity, 0),
    }), [orders]);

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
            item: "", itemDropdown: o.item,
            uom: o.uom || "Nos",
            totalQuantity: o.total_quantity, deliveredQuantity: o.delivered_quantity,
            unitPrice: o.unit_price, gst: o.gst || "", freight: o.freight,
            project: o.project || "",
            paymentTerms: o.payment_terms || "",
            validityDate: isoToDateInput(o.validity_date),
            fileUrl: o.file_url || "",
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
            project: form.project || null,
            gst: form.gst || "0",
            freight: Number(form.freight) || 0,
            payment_terms: form.paymentTerms || null,
            validity_date: form.validityDate ? new Date(form.validityDate).toISOString() : null,
            file_url: form.fileUrl || null,
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
            if (editingId) {
                await updateMutation.mutateAsync({ id: editingId, body: { ...payload, last_updated_by: getCurrentUser() } });
                toast.success("Purchase Order updated");
            } else {
                await createMutation.mutateAsync({ ...payload, created_by: getCurrentUser() });
                toast.success("Purchase Order created");
            }
            setDialogOpen(false);
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Purchase Orders</h2>
                    <p className="text-sm text-muted-foreground mt-1">Track POs with quantities, delivery progress and activity log.</p>
                </div>
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
                                <Label>PO Validity Date</Label>
                                <Input type="date" value={form.validityDate} onChange={(e) => set("validityDate", e.target.value)} />
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

                            <div className="space-y-2 sm:col-span-1">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Payment Terms</Label>
                                <Select value={form.paymentTerms} onValueChange={(v) => set("paymentTerms", v)}>
                                    <SelectTrigger className="h-8"><SelectValue placeholder="Select terms" /></SelectTrigger>
                                    <SelectContent>
                                        {payment_terms.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-5 shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center"><FileText className="h-5 w-5 text-primary" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total POs</div><div className="text-2xl font-bold text-foreground">{orders.length}</div></div>
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
                        <div className="h-11 w-11 rounded-xl bg-success/15 grid place-items-center"><Truck className="h-5 w-5 text-success" /></div>
                        <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Delivered</div><div className="text-2xl font-bold text-foreground">{totals.del.toLocaleString()}</div></div>
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
                    <Input placeholder="Search by client, PO number, item, project..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
            </Card>

            <Card className="shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                            <tr>
                                <th className="text-left font-semibold px-1.5 py-3">Client</th>
                                <th className="text-left font-semibold px-1.5 py-3">Project</th>
                                <th className="text-left font-semibold px-1.5 py-3">Item</th>
                                <th className="text-left font-semibold px-1.5 py-3">PO #</th>
                                <th className="text-right font-semibold px-1.5 py-3">Qty</th>
                                <th className="text-right font-semibold px-1.5 py-3">Del.</th>
                                <th className="text-right font-semibold px-1.5 py-3">Pend.</th>
                                <th className="text-left font-semibold px-1.5 py-3">Validity</th>
                                <th className="text-left font-semibold px-1.5 py-3">Status</th>
                                <th className="text-left font-semibold px-1.5 py-3">Activity</th>
                                <th className="text-right font-semibold px-1.5 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && (
                                <tr><td colSpan={12} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
                            )}
                            {filtered.map((o) => {
                                const lastAct = o.last_opened_at || o.last_updated_at || o.created_at;
                                const lastBy = o.last_opened_by || o.last_updated_by || o.created_by || "—";
                                return (
                                    <tr key={o.id} className="border-t border-border hover:bg-muted/30 text-sm">
                                        <td className="px-1.5 py-3 text-foreground font-semibold truncate max-w-[100px]" title={o.client_name}>{o.client_name}</td>
                                        <td className="px-1.5 py-3 text-muted-foreground truncate max-w-[80px]" title={o.project}>{o.project}</td>
                                        <td className="px-1.5 py-3 text-muted-foreground max-w-[120px] truncate" title={(o.line_items?.length > 0) ? o.line_items.map(l => l.item).join(", ") : o.item}>
                                            {(o.line_items?.length > 0) ? o.line_items[0].item : o.item}
                                            {(o.line_items?.length > 1) && <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">+{o.line_items.length - 1}</span>}
                                        </td>
                                        <td className="px-1.5 py-3 font-medium text-foreground whitespace-nowrap text-xs">{o.po_number}</td>
                                        <td className="px-1.5 py-3 text-right font-semibold whitespace-nowrap">{o.total_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className="px-1.5 py-3 text-right text-success font-bold whitespace-nowrap">{o.delivered_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className="px-1.5 py-3 text-right text-warning font-bold whitespace-nowrap">{o.pending_quantity} <span className="text-[10px] font-normal text-muted-foreground">{o.uom || "Nos"}</span></td>
                                        <td className="px-1.5 py-3 text-muted-foreground whitespace-nowrap text-xs">{o.validity_date ? fmtDate(o.validity_date) : "—"}</td>
                                        <td className="px-1.5 py-3 scale-90 origin-left -mr-4">
                                            <StatusBadge 
                                                status={
                                                    (o.delivery_status === "Delivered" && o.all_dispatches_marked) ? "Delivered" :
                                                    (o.delivery_status === "Delivered" || o.delivery_status === "Partial") ? "Partial" :
                                                    "Not Delivered"
                                                } 
                                                label={
                                                    (o.delivery_status === "Delivered" && o.all_dispatches_marked) ? "Delivered" :
                                                    o.delivery_status === "Delivered" ? "Dispatched (Pending Challans)" :
                                                    o.delivery_status
                                                } 
                                            />
                                        </td>
                                        <td className="px-1.5 py-3">
                                            <div className="text-[11px] leading-tight">
                                                <div className="font-bold text-foreground truncate max-w-[70px]">{lastBy}</div>
                                                <div className="text-muted-foreground whitespace-nowrap">{lastAct ? fmtDate(lastAct) : "—"}</div>
                                            </div>
                                        </td>
                                        <td className="px-1.5 py-3 text-right">
                                            <div className="flex gap-0.5 justify-end">
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
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(o)} title="Edit"><Pencil className="h-3 w-3 text-blue-500" /></Button>
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setItemToDelete(o.id)} title="Delete"><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!isLoading && filtered.length === 0 && (
                                <tr><td colSpan={12} className="px-5 py-12 text-center text-muted-foreground">No purchase orders found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Purchase Order Details</DialogTitle></DialogHeader>
                    {viewing && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <Field label="PO Number" value={viewing.po_number} />
                                <div className="space-y-1">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Delivery Status</div>
                                    <StatusBadge 
                                        status={
                                            (viewing.delivery_status === "Delivered" && viewing.all_dispatches_marked) ? "Delivered" :
                                            (viewing.delivery_status === "Delivered" || viewing.delivery_status === "Partial") ? "Partial" :
                                            "Not Delivered"
                                        } 
                                        label={
                                            (viewing.delivery_status === "Delivered" && viewing.all_dispatches_marked) ? "Delivered" :
                                            viewing.delivery_status === "Delivered" ? "Dispatched (Pending Challans)" :
                                            viewing.delivery_status
                                        } 
                                    />
                                </div>
                                <Field label="Client" value={viewing.client_name} />
                                <Field label="Project" value={viewing.project} />
                                <Field label="Payment Terms" value={viewing.payment_terms} />
                                <Field label="Validity Date" value={viewing.validity_date ? fmtDate(viewing.validity_date) : "—"} />
                                <Field label="GST %" value={viewing.gst || "0%"} />
                                <Field label="Freight" value={inr(viewing.freight)} />

                                {viewing.file_url && (
                                    <div className="col-span-2 mt-2">
                                        <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(`http://localhost:8000${viewing.file_url}`, "_blank")}>
                                            <FileText className="h-4 w-4 mr-2" /> View Attached PO Document
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="rounded-lg border border-border overflow-x-auto">
                                <div className="bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</div>
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/30">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Item</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-success">Del.</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-warning">Pend.</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">UOM</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Unit Price</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(viewing.line_items?.length > 0 ? viewing.line_items : [{ item: viewing.item, quantity: viewing.total_quantity, uom: viewing.uom, unit_price: viewing.unit_price }]).map((li, i) => (
                                            <tr key={i} className="border-t border-border">
                                                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                                <td className="px-3 py-2 font-medium">{li.item}</td>
                                                <td className="px-3 py-2 text-right">{li.quantity}</td>
                                                <td className="px-3 py-2 text-right text-success font-bold">{li.delivered_quantity || 0}</td>
                                                <td className="px-3 py-2 text-right text-warning font-bold">{Math.max(0, (li.quantity || 0) - (li.delivered_quantity || 0))}</td>
                                                <td className="px-3 py-2">{li.uom || "Nos"}</td>
                                                <td className="px-3 py-2 text-right">{inr(li.unit_price)}</td>
                                                <td className="px-3 py-2 text-right font-semibold">{inr(li.quantity * li.unit_price)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <Clock className="h-4 w-4 text-accent" /> Activity Log
                                </div>
                                <ActivityEntry label="Created By" by={viewing.created_by} at={viewing.created_at} color="primary" />
                                <ActivityEntry label="Last Updated By" by={viewing.last_updated_by} at={viewing.last_updated_at} color="warning" />
                                <ActivityEntry label="Last Opened By" by={viewing.last_opened_by} at={viewing.last_opened_at} color="accent" />
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
                                <Button className="bg-gradient-primary" onClick={() => { const o = viewing; setViewing(null); openEdit(o); }}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                </Button>
                            </>
                        )}
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

            <input 
                type="file" 
                id="direct-file-upload" 
                className="hidden" 
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleDirectUpload(e, uploadingPoId)} 
            />
        </div>
    );
};

const Field = ({ label, value, full }) => (
    <div className={full ? "col-span-2" : ""}>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground break-words">{value ?? "—"}</div>
    </div>
);

const ActivityEntry = ({ label, by, at, color }) => (
    <div className={`flex items-start gap-3 text-xs border-l-2 border-${color}/40 pl-3`}>
        <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-semibold text-foreground">{by || "—"}</div>
            <div className="text-muted-foreground">{at ? fmtDateTime(at) : "—"}</div>
        </div>
    </div>
);

export default PurchaseOrders;
