import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Pencil, Plus, Search, Trash2, X, Tag, Phone, MapPin, FileText, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchStoreVendors, createStoreVendor, updateStoreVendor, deleteStoreVendor, fetchItemMasterList } from "@/lib/api";
import { toast } from "sonner";

export default function StoreVendorManageDialog({ open, onOpenChange }) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [viewMode, setViewMode] = useState("list"); // "list" | "form"
    const [editingVendor, setEditingVendor] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        vendor_name: "",
        person_name: "",
        vendor_gst: "",
        contact: "",
        address: "",
        items_supplied: [],
        status: "Active",
    });
    const [itemInput, setItemInput] = useState("");

    // Queries
    const { data: vendors = [], isLoading } = useQuery({
        queryKey: ["store-vendors"],
        queryFn: fetchStoreVendors,
        enabled: open,
    });

    const { data: itemMasterList = [] } = useQuery({
        queryKey: ["item-master", "STORE"],
        queryFn: () => fetchItemMasterList("STORE"),
        enabled: open && viewMode === "form",
    });

    // Mutations
    const saveMutation = useMutation({
        mutationFn: (payload) =>
            editingVendor
                ? updateStoreVendor(editingVendor.id, payload)
                : createStoreVendor(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["store-vendors"] });
            toast.success(editingVendor ? "Vendor details updated." : "Vendor added successfully.");
            closeForm();
        },
        onError: (err) => toast.error(err.message || "Failed to save vendor."),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => deleteStoreVendor(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["store-vendors"] });
            toast.success("Vendor removed.");
        },
        onError: (err) => toast.error(err.message || "Failed to delete vendor."),
    });

    const openCreateForm = () => {
        setEditingVendor(null);
        setFormData({
            vendor_name: "",
            person_name: "",
            vendor_gst: "",
            contact: "",
            address: "",
            items_supplied: [],
            status: "Active",
        });
        setItemInput("");
        setViewMode("form");
    };

    const openEditForm = (vendor) => {
        setEditingVendor(vendor);
        setFormData({
            vendor_name: vendor.vendor_name || "",
            person_name: vendor.person_name || "",
            vendor_gst: vendor.vendor_gst || "",
            contact: vendor.contact || "",
            address: vendor.address || "",
            items_supplied: Array.isArray(vendor.items_supplied) ? [...vendor.items_supplied] : [],
            status: vendor.status || "Active",
        });
        setItemInput("");
        setViewMode("form");
    };

    const closeForm = () => {
        setViewMode("list");
        setEditingVendor(null);
    };

    const handleAddItem = (itemName) => {
        const trimmed = (itemName || itemInput).trim();
        if (!trimmed) return;
        if (formData.items_supplied.some((x) => x.toLowerCase() === trimmed.toLowerCase())) {
            toast.info(`"${trimmed}" is already in the materials list.`);
            setItemInput("");
            return;
        }
        setFormData((prev) => ({
            ...prev,
            items_supplied: [...prev.items_supplied, trimmed],
        }));
        setItemInput("");
    };

    const handleRemoveItem = (indexToRemove) => {
        setFormData((prev) => ({
            ...prev,
            items_supplied: prev.items_supplied.filter((_, idx) => idx !== indexToRemove),
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.vendor_name.trim()) {
            return toast.error("Vendor Name is required.");
        }
        saveMutation.mutate(formData);
    };

    const filteredVendors = vendors.filter((v) => {
        const q = search.toLowerCase();
        const items = Array.isArray(v.items_supplied) ? v.items_supplied.join(" ") : "";
        return (
            (v.vendor_name || "").toLowerCase().includes(q) ||
            (v.person_name || "").toLowerCase().includes(q) ||
            (v.vendor_gst || "").toLowerCase().includes(q) ||
            (v.contact || "").toLowerCase().includes(q) ||
            items.toLowerCase().includes(q)
        );
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-6 sm:p-7">
                <DialogHeader className="border-b pb-4">
                    <div className="flex items-center justify-between pr-4">
                        <div className="flex items-center gap-2.5">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
                                <Building2 className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold text-slate-900">
                                    {viewMode === "form"
                                        ? editingVendor
                                            ? "Edit Vendor Details"
                                            : "Add Vendor Details"
                                        : "Vendor Details Directory"}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    {viewMode === "form"
                                        ? "Fill vendor information, GST, contact person, materials supplied and status."
                                        : "Manage suppliers, contacts, materials supplied and active/inactive status."}
                                </DialogDescription>
                            </div>
                        </div>

                        {viewMode === "list" ? (
                            <Button
                                onClick={openCreateForm}
                                size="sm"
                                className="bg-gradient-primary shadow-sm font-semibold"
                            >
                                <Plus className="mr-1.5 h-4 w-4" /> Add Vendor
                            </Button>
                        ) : (
                            <Button variant="outline" size="sm" onClick={closeForm}>
                                Back to List
                            </Button>
                        )}
                    </div>
                </DialogHeader>

                {viewMode === "form" ? (
                    /* ── Vendor Form ─────────────────────────────────────────── */
                    <form onSubmit={handleSubmit} className="mt-4 space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* Vendor Name */}
                            <div className="space-y-1 sm:col-span-2">
                                <label className="text-xs font-bold text-slate-700">
                                    Vendor Name <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                    required
                                    value={formData.vendor_name}
                                    onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                                    placeholder="e.g. Jindal Steel & Power Ltd."
                                    className="bg-white"
                                />
                            </div>

                            {/* Person Name (Contact Person) */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700">
                                    Person Name (Contact Person)
                                </label>
                                <Input
                                    value={formData.person_name}
                                    onChange={(e) => setFormData({ ...formData, person_name: e.target.value })}
                                    placeholder="e.g. Ramesh Sharma"
                                    className="bg-white"
                                />
                            </div>

                            {/* Vendor GST No. */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700">
                                    Vendor GST No.
                                </label>
                                <Input
                                    value={formData.vendor_gst}
                                    onChange={(e) => setFormData({ ...formData, vendor_gst: e.target.value.toUpperCase() })}
                                    placeholder="e.g. 02AAFCR5621L1ZG"
                                    className="bg-white uppercase"
                                />
                            </div>

                            {/* Contact Number */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700">
                                    Contact (Phone / Mobile)
                                </label>
                                <Input
                                    value={formData.contact}
                                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                                    placeholder="e.g. +91 9888603791"
                                    className="bg-white"
                                />
                            </div>

                            {/* Vendor Status */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700">
                                    Vendor Status
                                </label>
                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, status: "Active" })}
                                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition-all ${
                                            formData.status === "Active"
                                                ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm"
                                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                        }`}
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Active
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, status: "Inactive" })}
                                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition-all ${
                                            formData.status === "Inactive"
                                                ? "border-rose-600 bg-rose-50 text-rose-700 shadow-sm"
                                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                        }`}
                                    >
                                        <XCircle className="h-3.5 w-3.5 text-rose-600" /> Inactive
                                    </button>
                                </div>
                            </div>

                            {/* Address */}
                            <div className="space-y-1 sm:col-span-2">
                                <label className="text-xs font-bold text-slate-700">
                                    Address
                                </label>
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    rows={2}
                                    placeholder="Vendor factory or office address..."
                                    className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                                />
                            </div>

                            {/* Items / Materials Supplied ⭐ */}
                            <div className="space-y-2 sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                            <Tag className="h-3.5 w-3.5 text-cyan-600" />
                                            Items / Materials Supplied ⭐
                                        </label>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                            Add multiple items this vendor supplies (e.g. MS Plate, Bolt, Nut, Welding Rod, Electrical Cable etc).
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-[11px] font-bold text-cyan-800">
                                        {formData.items_supplied.length} item{formData.items_supplied.length === 1 ? "" : "s"}
                                    </span>
                                </div>

                                {/* Custom input + Add button */}
                                <div className="flex gap-2 pt-1">
                                    <Input
                                        value={itemInput}
                                        onChange={(e) => setItemInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleAddItem();
                                            }
                                        }}
                                        placeholder="Type item name and press Enter (e.g. MS Plate)..."
                                        className="bg-white"
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => handleAddItem()}
                                        className="shrink-0 font-semibold"
                                    >
                                        <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
                                    </Button>
                                </div>

                                {/* Selected Items Chips */}
                                {formData.items_supplied.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 pt-2">
                                        {formData.items_supplied.map((item, idx) => (
                                            <span
                                                key={idx}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-900 shadow-2xs"
                                            >
                                                {item}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveItem(idx)}
                                                    className="rounded-full hover:bg-cyan-200/80 p-0.5 text-cyan-700 transition-colors"
                                                    title="Remove item"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs italic text-slate-400 pt-1">No materials added yet.</p>
                                )}
                            </div>
                        </div>

                        {/* Footer buttons */}
                        <div className="flex justify-end gap-2.5 pt-4 border-t">
                            <Button type="button" variant="outline" onClick={closeForm}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={saveMutation.isPending}
                                className="bg-gradient-primary font-bold shadow-md"
                            >
                                {saveMutation.isPending ? "Saving..." : editingVendor ? "Update Vendor" : "Save Vendor"}
                            </Button>
                        </div>
                    </form>
                ) : (
                    /* ── Vendor Directory List ─────────────────────────────────── */
                    <div className="mt-4 space-y-4">
                        {/* Search & Stat bar */}
                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search vendor, contact person, GST or material..."
                                    className="pl-9 bg-slate-50"
                                />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                    Total: {vendors.length}
                                </span>
                                <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
                                    Active: {vendors.filter((v) => v.status === "Active").length}
                                </span>
                            </div>
                        </div>

                        {/* Vendors Table */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b bg-slate-50 font-bold uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Vendor Name</th>
                                        <th className="px-4 py-3">Person / Contact</th>
                                        <th className="px-4 py-3">GST No.</th>
                                        <th className="px-4 py-3">Items / Materials Supplied</th>
                                        <th className="px-3 py-3 text-center">Status</th>
                                        <th className="px-3 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-slate-400">
                                                Loading vendors...
                                            </td>
                                        </tr>
                                    ) : filteredVendors.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-10 text-center text-slate-400">
                                                <Building2 className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                                                {search ? "No vendors match your search." : "No vendor details added yet. Click '+ Add Vendor' to add your first vendor."}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredVendors.map((vendor) => {
                                            const items = Array.isArray(vendor.items_supplied) ? vendor.items_supplied : [];
                                            const isActive = vendor.status === "Active";
                                            return (
                                                <tr key={vendor.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-4 py-3.5">
                                                        <p className="font-bold text-slate-900 text-sm">{vendor.vendor_name}</p>
                                                        {vendor.address && (
                                                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5" title={vendor.address}>
                                                                {vendor.address}
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <p className="font-semibold text-slate-800">{vendor.person_name || "—"}</p>
                                                        <p className="text-[11px] text-slate-500 mt-0.5">{vendor.contact || "—"}</p>
                                                    </td>
                                                    <td className="px-4 py-3.5 font-medium text-slate-700">
                                                        {vendor.vendor_gst || "—"}
                                                    </td>
                                                    <td className="px-4 py-3.5 max-w-[280px]">
                                                        {items.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {items.slice(0, 4).map((m, idx) => (
                                                                    <span
                                                                        key={idx}
                                                                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                                                                    >
                                                                        {m}
                                                                    </span>
                                                                ))}
                                                                {items.length > 4 && (
                                                                    <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-800" title={items.slice(4).join(", ")}>
                                                                        +{items.length - 4} more
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 italic">None specified</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3.5 text-center">
                                                        <span
                                                            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                                                isActive
                                                                    ? "bg-emerald-100 text-emerald-800"
                                                                    : "bg-slate-100 text-slate-600"
                                                            }`}
                                                        >
                                                            {vendor.status || "Active"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3.5 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-slate-600 hover:text-cyan-700"
                                                                onClick={() => openEditForm(vendor)}
                                                                title="Edit Vendor"
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                                                onClick={() => {
                                                                    if (window.confirm(`Delete vendor "${vendor.vendor_name}"?`)) {
                                                                        deleteMutation.mutate(vendor.id);
                                                                    }
                                                                }}
                                                                title="Delete Vendor"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
