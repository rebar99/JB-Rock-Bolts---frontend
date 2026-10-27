import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Filter, Package, Pencil, RotateCcw, Save, Search, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchStockStatusList, updateItemStockLimit } from "@/lib/api";
import { toast } from "sonner";

const number = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const calcPreviewStatus = (avail, outLimit, lowLimit) => {
    const q = Number(avail || 0);
    const outL = Math.max(0, Number(outLimit || 0));
    const lowL = Number(lowLimit || 0);
    if (q <= 0 || q <= outL) return "Out of Stock";
    if (lowL > outL && q <= lowL) return "Low Stock";
    return "In Stock";
};

function StatusBadge({ status }) {
    if (status === "In Stock") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                In Stock
            </span>
        );
    }
    if (status === "Low Stock") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                Low Stock
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
            Out of Stock
        </span>
    );
}

export default function StoreStockStatusDialog({ open, onOpenChange }) {
    const client = useQueryClient();
    const formRef = useRef(null);

    // Form inputs state
    const [selectedId, setSelectedId] = useState(null);
    const [formLowLimit, setFormLowLimit] = useState("");
    const [formOutLimit, setFormOutLimit] = useState("");

    // Table filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [groupFilter, setGroupFilter] = useState("");

    // Fetch items list
    const { data: items = [], isLoading } = useQuery({
        queryKey: ["stock-status"],
        queryFn: fetchStockStatusList,
        enabled: open,
    });

    // Currently selected item in the form
    const selectedItem = useMemo(() => {
        if (!items || items.length === 0) return null;
        if (!selectedId) return items[0];
        return items.find((i) => i.id === selectedId) || items[0];
    }, [items, selectedId]);

    // Keep form fields synced whenever selected item changes
    useEffect(() => {
        if (selectedItem) {
            setSelectedId(selectedItem.id);
            setFormLowLimit(String(selectedItem.low_stock_limit ?? selectedItem.reorder_level ?? 0));
            setFormOutLimit(String(selectedItem.out_of_stock_limit ?? 0));
        }
    }, [selectedItem?.id, selectedItem?.low_stock_limit, selectedItem?.out_of_stock_limit]);

    // Mutation to update stock limit
    const updateLimit = useMutation({
        mutationFn: ({ id, out_of_stock_limit, low_stock_limit }) =>
            updateItemStockLimit(id, { out_of_stock_limit, low_stock_limit }),
        onSuccess: (data) => {
            client.invalidateQueries({ queryKey: ["stock-status"] });
            client.invalidateQueries({ queryKey: ["store-inventory"] });
            client.invalidateQueries({ queryKey: ["store-dashboard"] });
            toast.success(`Stock limits saved successfully! Status is now: ${data.status}`);
        },
        onError: (error) => toast.error(error.message || "Failed to update limits"),
    });

    const handleSelectItem = (id) => {
        const found = items.find((i) => i.id === id);
        if (found) {
            setSelectedId(found.id);
            setFormLowLimit(String(found.low_stock_limit ?? found.reorder_level ?? 0));
            setFormOutLimit(String(found.out_of_stock_limit ?? 0));
            if (formRef.current) {
                formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
    };

    const handleResetForm = () => {
        if (selectedItem) {
            setFormLowLimit(String(selectedItem.low_stock_limit ?? selectedItem.reorder_level ?? 0));
            setFormOutLimit(String(selectedItem.out_of_stock_limit ?? 0));
        }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!selectedItem) return;
        const newLow = Number(formLowLimit);
        const newOut = Number(formOutLimit);
        if (isNaN(newLow) || newLow < 0) {
            toast.error("Please enter a valid non-negative number for Low Stock Limit.");
            return;
        }
        if (isNaN(newOut) || newOut < 0) {
            toast.error("Please enter a valid non-negative number for Out of Stock Limit.");
            return;
        }
        if (newLow > 0 && newLow < newOut) {
            toast.error("Low Stock Limit should be greater than or equal to Out of Stock Limit.");
            return;
        }
        updateLimit.mutate({
            id: selectedItem.id,
            out_of_stock_limit: newOut,
            low_stock_limit: newLow,
        });
    };

    // Live preview status calculation
    const previewStatus = useMemo(() => {
        if (!selectedItem) return "In Stock";
        return calcPreviewStatus(selectedItem.available_quantity, formOutLimit, formLowLimit);
    }, [selectedItem, formOutLimit, formLowLimit]);

    // Group dropdown options
    const groupNames = useMemo(() => {
        const set = new Set();
        items.forEach((i) => {
            if (i.group_name) set.add(i.group_name.trim());
        });
        return Array.from(set).sort();
    }, [items]);

    // Filtered table rows
    const filtered = useMemo(() => {
        return items.filter((item) => {
            const matchSearch =
                `${item.group_name} ${item.item_name} ${item.full_item_name} ${item.uom} ${item.location}`
                    .toLowerCase()
                    .includes(search.toLowerCase());
            const matchStatus =
                statusFilter === "all" ||
                (statusFilter === "in_stock" && item.status === "In Stock") ||
                (statusFilter === "low_stock" && item.status === "Low Stock") ||
                (statusFilter === "out_of_stock" && item.status === "Out of Stock");
            const matchGroup = !groupFilter || item.group_name === groupFilter;
            return matchSearch && matchStatus && matchGroup;
        });
    }, [items, search, statusFilter, groupFilter]);

    // Stats
    const totals = useMemo(() => ({
        total: items.length,
        inStock: items.filter((i) => i.status === "In Stock").length,
        lowStock: items.filter((i) => i.status === "Low Stock").length,
        outOfStock: items.filter((i) => i.status === "Out of Stock").length,
    }), [items]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-6 sm:p-7">
                <DialogHeader className="border-b pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-violet-700">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                                    Manage Stock Status
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    Super Admin Control — Configure item-wise Low Stock and Out of Stock limits.
                                </DialogDescription>
                            </div>
                        </div>
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 border border-violet-200">
                            Super Admin Only
                        </span>
                    </div>
                </DialogHeader>

                {/* Status Definition Legend */}
                <div className="grid gap-2.5 sm:grid-cols-3 pt-2">
                    <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
                        <div>
                            <span className="font-bold text-xs text-emerald-800">In Stock</span>
                            <p className="text-[11px] text-emerald-700 mt-0.5">
                                Available &gt; Low Stock Limit
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                        <Clock className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
                        <div>
                            <span className="font-bold text-xs text-amber-800">Low Stock</span>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                                Available &le; Low Stock Limit
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/70 p-3">
                        <XCircle className="mt-0.5 h-4 w-4 text-rose-600 shrink-0" />
                        <div>
                            <span className="font-bold text-xs text-rose-800">Out of Stock</span>
                            <p className="text-[11px] text-rose-700 mt-0.5">
                                Available &le; Out Limit or 0
                            </p>
                        </div>
                    </div>
                </div>

                {/* Form: Item Limit Configuration */}
                <form
                    ref={formRef}
                    onSubmit={handleFormSubmit}
                    className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 sm:p-5 space-y-4 shadow-sm"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-200/70 pb-3">
                        <div>
                            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                                <Pencil className="h-4 w-4 text-violet-600" />
                                Item Limit Configuration Form
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Select an inventory item, configure its threshold limits, and click Save.
                            </p>
                        </div>

                        {selectedItem && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Preview Status:</span>
                                <StatusBadge status={previewStatus} />
                            </div>
                        )}
                    </div>

                    {/* Select Item Dropdown */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Select Item to Configure
                        </label>
                        <select
                            value={selectedItem?.id || ""}
                            onChange={(e) => handleSelectItem(Number(e.target.value))}
                            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        >
                            {items.map((i) => (
                                <option key={i.id} value={i.id}>
                                    {i.group_name} — {i.item_name} (Avail: {number(i.available_quantity)} {i.uom}) — [{i.status}]
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedItem && (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Group Name
                                </label>
                                <input
                                    type="text"
                                    disabled
                                    value={selectedItem.group_name || "—"}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-700 cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Item Name
                                </label>
                                <input
                                    type="text"
                                    disabled
                                    value={selectedItem.item_name || "—"}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-700 cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Unit of Measure (U/M)
                                </label>
                                <input
                                    type="text"
                                    disabled
                                    value={selectedItem.uom || "Nos"}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-700 cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Available Qty (Auto-calculated)
                                </label>
                                <div className="h-9 flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800">
                                    {number(selectedItem.available_quantity)} {selectedItem.uom}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-amber-900 mb-1">
                                    Low Stock Limit
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={formLowLimit}
                                    onChange={(e) => setFormLowLimit(e.target.value)}
                                    placeholder="e.g. 15"
                                    className="h-9 w-full rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-950 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
                                    required
                                />
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                    Low Stock when Qty &le; this limit
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-rose-900 mb-1">
                                    Out of Stock Limit
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={formOutLimit}
                                    onChange={(e) => setFormOutLimit(e.target.value)}
                                    placeholder="0"
                                    className="h-9 w-full rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-950 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 shadow-sm"
                                    required
                                />
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                    Out of Stock when Qty &le; this limit or 0
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Calculated Status
                                </label>
                                <div className="h-9 flex items-center">
                                    <StatusBadge status={previewStatus} />
                                </div>
                            </div>

                            <div className="flex items-end gap-2">
                                <Button
                                    type="submit"
                                    disabled={updateLimit.isPending}
                                    className="h-9 flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs shadow-sm"
                                >
                                    <Save className="mr-1.5 h-3.5 w-3.5" />
                                    {updateLimit.isPending ? "Saving..." : "Save Limits"}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleResetForm}
                                    className="h-9 text-xs"
                                    title="Reset inputs"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </form>

                {/* Table Section */}
                <div className="space-y-3 pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="font-bold text-sm text-foreground">
                                All Inventory Items ({totals.total})
                            </h4>
                            <p className="text-xs text-muted-foreground">
                                Click "Configure" on any item below to edit its limits in the form above.
                            </p>
                        </div>

                        {/* Status Filter Badges */}
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => setStatusFilter("all")}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                                    statusFilter === "all"
                                        ? "bg-slate-900 text-white"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                            >
                                All ({totals.total})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter("in_stock")}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                                    statusFilter === "in_stock"
                                        ? "bg-emerald-600 text-white"
                                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                }`}
                            >
                                In Stock ({totals.inStock})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter("low_stock")}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                                    statusFilter === "low_stock"
                                        ? "bg-amber-600 text-white"
                                        : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                }`}
                            >
                                Low Stock ({totals.lowStock})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter("out_of_stock")}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                                    statusFilter === "out_of_stock"
                                        ? "bg-rose-600 text-white"
                                        : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                                }`}
                            >
                                Out of Stock ({totals.outOfStock})
                            </button>
                        </div>
                    </div>

                    {/* Search & Group Filter Bar */}
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by Group Name, Item Name, U/M..."
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            />
                        </div>

                        <select
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.target.value)}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        >
                            <option value="">All Groups</option>
                            {groupNames.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Items Table */}
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full min-w-[760px] text-xs">
                            <thead className="bg-slate-50 text-left uppercase tracking-wider text-slate-500 font-bold border-b">
                                <tr>
                                    <th className="px-3 py-2.5 text-center w-12">S.No.</th>
                                    <th className="px-3 py-2.5">Group Name</th>
                                    <th className="px-3 py-2.5">Item Name</th>
                                    <th className="px-3 py-2.5 text-center">U/M</th>
                                    <th className="px-3 py-2.5 text-center">Available Qty</th>
                                    <th className="px-3 py-2.5 text-center">Low Stock Limit</th>
                                    <th className="px-3 py-2.5 text-center">Out of Stock Limit</th>
                                    <th className="px-3 py-2.5 text-center">Status</th>
                                    <th className="px-3 py-2.5 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan="9" className="py-8 text-center text-muted-foreground">
                                            Loading stock data...
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" className="py-8 text-center text-muted-foreground">
                                            <Package className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                                            No inventory items match your search.
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((item, index) => {
                                        const isSelected = selectedItem?.id === item.id;
                                        return (
                                            <tr
                                                key={item.id}
                                                className={`transition-colors hover:bg-slate-50/80 ${
                                                    isSelected ? "bg-violet-50/50 font-medium" : ""
                                                }`}
                                            >
                                                <td className="px-3 py-2.5 text-center text-muted-foreground">
                                                    {index + 1}
                                                </td>
                                                <td className="px-3 py-2.5 font-semibold text-slate-900">
                                                    {item.group_name}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-700">
                                                    {item.item_name}
                                                </td>
                                                <td className="px-3 py-2.5 text-center text-slate-600">
                                                    {item.uom}
                                                </td>
                                                <td className="px-3 py-2.5 text-center font-bold text-slate-900">
                                                    {number(item.available_quantity)}
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <span className="inline-block rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                                                        {number(item.low_stock_limit ?? item.reorder_level ?? 0)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <span className="inline-block rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                                                        {number(item.out_of_stock_limit ?? 0)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <StatusBadge status={item.status} />
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={isSelected ? "default" : "outline"}
                                                        onClick={() => handleSelectItem(item.id)}
                                                        className={`h-7 px-2.5 text-xs ${
                                                            isSelected
                                                                ? "bg-violet-600 text-white hover:bg-violet-700"
                                                                : "border-violet-200 text-violet-700 hover:bg-violet-50"
                                                        }`}
                                                    >
                                                        <Pencil className="mr-1 h-3 w-3" />
                                                        {isSelected ? "Editing" : "Configure"}
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <DialogFooter className="border-t pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
