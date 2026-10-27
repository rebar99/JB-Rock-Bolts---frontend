import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Filter, Package, Pencil, Save, Search, ShieldCheck, X, XCircle } from "lucide-react";
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

function StatCard({ label, value, detail, icon: Icon, color }) {
    return (
        <div className="rounded-xl border bg-white p-5 shadow-card">
            <div className="flex items-center gap-3">
                <div className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-2xl font-bold text-foreground">{value}</p>
                    {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
                </div>
            </div>
        </div>
    );
}

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

export default function StoreStockStatus() {
    const client = useQueryClient();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all"); // all | in_stock | low_stock | out_of_stock
    const [groupFilter, setGroupFilter] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [editOutLimit, setEditOutLimit] = useState("");
    const [editLowLimit, setEditLowLimit] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmItem, setConfirmItem] = useState(null);

    const { data: items = [], isLoading } = useQuery({
        queryKey: ["stock-status"],
        queryFn: fetchStockStatusList,
    });

    const updateLimit = useMutation({
        mutationFn: ({ id, out_of_stock_limit, low_stock_limit }) =>
            updateItemStockLimit(id, { out_of_stock_limit, low_stock_limit }),
        onSuccess: (data) => {
            client.invalidateQueries({ queryKey: ["stock-status"] });
            client.invalidateQueries({ queryKey: ["store-inventory"] });
            client.invalidateQueries({ queryKey: ["store-dashboard"] });
            toast.success(`Stock limits updated! Status is now: ${data.status}`);
            setEditingId(null);
            setEditOutLimit("");
            setEditLowLimit("");
            setConfirmOpen(false);
            setConfirmItem(null);
        },
        onError: (error) => toast.error(error.message || "Failed to update limits"),
    });

    const groupNames = useMemo(() => {
        const set = new Set();
        items.forEach((i) => {
            if (i.group_name) set.add(i.group_name.trim());
        });
        return Array.from(set).sort();
    }, [items]);

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

    const totals = useMemo(() => ({
        total: items.length,
        inStock: items.filter((i) => i.status === "In Stock").length,
        lowStock: items.filter((i) => i.status === "Low Stock").length,
        outOfStock: items.filter((i) => i.status === "Out of Stock").length,
    }), [items]);

    const startEdit = (item) => {
        setEditingId(item.id);
        setEditOutLimit(String(item.out_of_stock_limit ?? 0));
        setEditLowLimit(String(item.low_stock_limit ?? item.reorder_level ?? 0));
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditOutLimit("");
        setEditLowLimit("");
    };

    const handleSave = (item) => {
        const newOut = Number(editOutLimit);
        const newLow = Number(editLowLimit);
        if (isNaN(newOut) || newOut < 0) {
            toast.error("Please enter a valid non-negative number for Out of Stock Limit.");
            return;
        }
        if (isNaN(newLow) || newLow < 0) {
            toast.error("Please enter a valid non-negative number for Low Stock Limit.");
            return;
        }
        if (newLow > 0 && newLow < newOut) {
            toast.error("Low Stock Limit should be greater than or equal to Out of Stock Limit.");
            return;
        }

        const newStatus = calcPreviewStatus(item.available_quantity, newOut, newLow);
        if (newStatus !== item.status) {
            setConfirmItem({ ...item, newOut, newLow, newStatus });
            setConfirmOpen(true);
        } else {
            updateLimit.mutate({ id: item.id, out_of_stock_limit: newOut, low_stock_limit: newLow });
        }
    };

    const confirmSave = () => {
        if (confirmItem) {
            updateLimit.mutate({
                id: confirmItem.id,
                out_of_stock_limit: confirmItem.newOut,
                low_stock_limit: confirmItem.newLow,
            });
        }
    };

    if (isLoading) {
        return (
            <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8">
                <div className="flex items-center justify-center py-32">
                    <div className="text-center text-muted-foreground">
                        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-slate-300 animate-pulse" />
                        <p className="text-sm">Loading stock status data…</p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8">
            <div className="w-full">
                {/* Header */}
                <div className="text-center">
                    <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg">
                        <ShieldCheck className="h-7 w-7" />
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                        Manage Stock Status
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Super Admin Control — Configure item-wise <strong>Low Stock</strong> and <strong>Out of Stock</strong> limits.
                    </p>
                </div>

                {/* Status Definition Legend */}
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-emerald-800">In Stock</span>
                                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Available</span>
                            </div>
                            <p className="mt-1 text-xs text-emerald-700">Sufficient stock available. Available Qty &gt; Low Stock Limit.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                        <Clock className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-amber-800">Low Stock</span>
                                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Running Low</span>
                            </div>
                            <p className="mt-1 text-xs text-amber-700">Stock is running low. Available Qty &le; Low Stock Limit.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                        <XCircle className="mt-0.5 h-5 w-5 text-rose-600 shrink-0" />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-rose-800">Out of Stock</span>
                                <span className="text-[10px] font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">Depleted / 0</span>
                            </div>
                            <p className="mt-1 text-xs text-rose-700">No stock available. Automatically marks Out of Stock when quantity reaches 0.</p>
                        </div>
                    </div>
                </div>

                {/* Stat Cards */}
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Total Items" value={totals.total} detail="All active store materials" icon={Package} color="bg-primary/10 text-primary" />
                    <StatCard label="In Stock" value={totals.inStock} detail="Sufficient stock available" icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
                    <StatCard label="Low Stock" value={totals.lowStock} detail="Stock is running low" icon={Clock} color="bg-amber-50 text-amber-700" />
                    <StatCard label="Out of Stock" value={totals.outOfStock} detail="Stock is depleted or zero" icon={XCircle} color="bg-rose-50 text-rose-700" />
                </div>

                {/* Search + Filters */}
                <section className="mt-5 rounded-xl border bg-white p-4 shadow-card">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by Group Name, Item Name, U/M..."
                                className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <select
                                value={groupFilter}
                                onChange={(e) => setGroupFilter(e.target.value)}
                                className="h-10 rounded-lg border bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">All Groups</option>
                                {groupNames.map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </select>

                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="h-10 rounded-lg border bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="all">All Status ({totals.total})</option>
                                <option value="in_stock">In Stock ({totals.inStock})</option>
                                <option value="low_stock">Low Stock ({totals.lowStock})</option>
                                <option value="out_of_stock">Out of Stock ({totals.outOfStock})</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* Table */}
                <section className="mt-5 overflow-hidden rounded-xl border bg-white shadow-card">
                    <div className="border-b p-5">
                        <h2 className="font-bold">Item-wise Stock Status Control</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Configure item-wise thresholds. Available Qty is calculated automatically from existing inventory ledger.
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="border-b px-4 py-3 w-[60px] text-center">S.No.</th>
                                    <th className="border-b px-4 py-3">Group Name</th>
                                    <th className="border-b px-4 py-3">Item Name</th>
                                    <th className="border-b px-4 py-3 w-[80px] text-center">U/M</th>
                                    <th className="border-b px-4 py-3 w-[120px] text-right">Available Qty</th>
                                    <th className="border-b px-4 py-3 w-[160px] text-center">Low Stock Limit<br/><span className="text-[10px] text-muted-foreground font-normal">(Reorder threshold)</span></th>
                                    <th className="border-b px-4 py-3 w-[160px] text-center">Out of Stock Limit<br/><span className="text-[10px] text-muted-foreground font-normal">(Automatic at 0)</span></th>
                                    <th className="border-b px-4 py-3 w-[130px] text-center">Status</th>
                                    <th className="border-b px-4 py-3 w-[110px] text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length ? (
                                    filtered.map((item, index) => {
                                        const isEditing = editingId === item.id;
                                        const previewStatus = isEditing
                                            ? calcPreviewStatus(item.available_quantity, editOutLimit, editLowLimit)
                                            : item.status;

                                        return (
                                            <tr key={item.id} className="border-b transition-colors hover:bg-slate-50">
                                                <td className="px-4 py-4 text-center text-muted-foreground">{index + 1}</td>
                                                <td className="px-4 py-4 font-semibold">{item.group_name}</td>
                                                <td className="px-4 py-4">{item.item_name}</td>
                                                <td className="px-4 py-4 text-center">{item.uom}</td>
                                                <td className="px-4 py-4 text-right font-bold text-foreground">
                                                    {number(item.available_quantity)}
                                                </td>
                                                {/* Low Stock Limit Column */}
                                                <td className="px-4 py-3 text-center">
                                                    {isEditing ? (
                                                        <div className="flex flex-col items-center">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={editLowLimit}
                                                                onChange={(e) => setEditLowLimit(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") handleSave(item);
                                                                    if (e.key === "Escape") cancelEdit();
                                                                }}
                                                                className="h-9 w-24 rounded-md border border-amber-300 bg-amber-50/40 px-2 text-center text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-200"
                                                                placeholder="e.g. 10"
                                                            />
                                                            <span className="text-[10px] text-amber-700 mt-0.5">Low stock if &le; this</span>
                                                        </div>
                                                    ) : (
                                                        <span className={`inline-block min-w-[50px] rounded-md px-2.5 py-1 text-xs font-semibold ${
                                                            Number(item.low_stock_limit || item.reorder_level || 0) > 0
                                                                ? "bg-amber-50 text-amber-800 border border-amber-200"
                                                                : "bg-slate-100 text-slate-500"
                                                        }`}>
                                                            {number(item.low_stock_limit || item.reorder_level || 0)}
                                                        </span>
                                                    )}
                                                </td>
                                                {/* Out of Stock Limit Column */}
                                                <td className="px-4 py-3 text-center">
                                                    {isEditing ? (
                                                        <div className="flex flex-col items-center">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={editOutLimit}
                                                                onChange={(e) => setEditOutLimit(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") handleSave(item);
                                                                    if (e.key === "Escape") cancelEdit();
                                                                }}
                                                                className="h-9 w-24 rounded-md border border-rose-300 bg-rose-50/40 px-2 text-center text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-200"
                                                                placeholder="0"
                                                            />
                                                            <span className="text-[10px] text-rose-700 mt-0.5">Out of stock if &le; this</span>
                                                        </div>
                                                    ) : (
                                                        <span className={`inline-block min-w-[50px] rounded-md px-2.5 py-1 text-xs font-semibold ${
                                                            Number(item.out_of_stock_limit || 0) > 0
                                                                ? "bg-rose-50 text-rose-800 border border-rose-200"
                                                                : "bg-slate-100 text-slate-500"
                                                        }`}>
                                                            {number(item.out_of_stock_limit || 0)}
                                                        </span>
                                                    )}
                                                </td>
                                                {/* Status Column */}
                                                <td className="px-4 py-4 text-center">
                                                    <StatusBadge status={previewStatus} />
                                                    {isEditing && previewStatus !== item.status && (
                                                        <p className="text-[10px] text-muted-foreground mt-0.5">preview</p>
                                                    )}
                                                </td>
                                                {/* Actions Column */}
                                                <td className="px-4 py-3 text-center">
                                                    {isEditing ? (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="default"
                                                                className="h-8 bg-violet-600 hover:bg-violet-700"
                                                                disabled={updateLimit.isPending}
                                                                onClick={() => handleSave(item)}
                                                            >
                                                                <Save className="mr-1 h-3.5 w-3.5" />
                                                                Save
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="h-8" onClick={cancelEdit}>
                                                                <X className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                                            onClick={() => startEdit(item)}
                                                        >
                                                            <Pencil className="mr-1 h-3.5 w-3.5" />
                                                            Configure
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="9" className="p-12 text-center text-muted-foreground">
                                            <Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                                            No items match your search or filter criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* Confirmation Dialog */}
            <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) { setConfirmOpen(false); setConfirmItem(null); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Confirm Stock Status Change
                        </DialogTitle>
                        <DialogDescription>
                            Updating these thresholds will change this item's live status.
                        </DialogDescription>
                    </DialogHeader>
                    {confirmItem && (
                        <div className="space-y-3">
                            <div className="rounded-lg border bg-slate-50 p-4 text-sm space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Item:</span>
                                    <span className="font-semibold">{confirmItem.full_item_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Available Quantity:</span>
                                    <span className="font-bold text-foreground">{number(confirmItem.available_quantity)} {confirmItem.uom}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">New Low Stock Limit:</span>
                                    <span className="font-semibold text-amber-700">{number(confirmItem.newLow)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">New Out of Stock Limit:</span>
                                    <span className="font-semibold text-rose-700">{number(confirmItem.newOut)}</span>
                                </div>
                                <hr />
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Status will change:</span>
                                    <div className="flex items-center gap-2">
                                        <StatusBadge status={confirmItem.status} />
                                        <span className="text-muted-foreground">→</span>
                                        <StatusBadge status={confirmItem.newStatus} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setConfirmOpen(false); setConfirmItem(null); }}>Cancel</Button>
                        <Button className="bg-violet-600 hover:bg-violet-700" disabled={updateLimit.isPending} onClick={confirmSave}>
                            {updateLimit.isPending ? "Saving…" : "Confirm & Save"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}
