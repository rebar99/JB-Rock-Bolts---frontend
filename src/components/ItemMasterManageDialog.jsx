import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    fetchItemMasterList, createItemMasterItem, updateItemMasterItem, deleteItemMasterItem,
    addItemMasterSize, deleteItemMasterSize,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/currentUser";

// Admin-only Add/Edit/Delete for the Item Master list backing the PO Item
// field's dropdown everywhere. The trigger for this dialog is itself
// hidden from non-admins in PurchaseOrders.jsx — the mutations below are
// a second line of defense: the backend independently checks the real JWT
// role and returns 403 with "Access Denied – Only Admin can manage items."
// regardless of what the UI shows, so this dialog can only ever be opened
// by someone who's actually allowed to use it.
//
// Each item can also carry its own list of sizes (e.g. Couplers -> 16mm,
// 20mm...) — expand a row to manage them the same way (add/delete).
export const ItemMasterManageDialog = ({ open, onOpenChange, type = "PO" }) => {
    const qc = useQueryClient();
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState("");
    const [itemToDelete, setItemToDelete] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [newSize, setNewSize] = useState("");

    const { data: items = [], isLoading } = useQuery({
        queryKey: ["item-master", type],
        queryFn: () => fetchItemMasterList(type),
        enabled: open,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ["item-master", type] });

    const onMutationError = (err) => {
        toast.error(err.message || "Something went wrong");
    };

    const createMutation = useMutation({
        mutationFn: (name) => createItemMasterItem({ name, type, created_by: getCurrentUser() }),
        onSuccess: () => {
            invalidate();
            setNewName("");
            toast.success("Item added");
        },
        onError: onMutationError,
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, name }) => updateItemMasterItem(id, { name, updated_by: getCurrentUser() }),
        onSuccess: () => {
            invalidate();
            setEditingId(null);
            setEditingName("");
            toast.success("Item updated");
        },
        onError: onMutationError,
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => deleteItemMasterItem(id, getCurrentUser()),
        onSuccess: () => {
            invalidate();
            setItemToDelete(null);
            toast.success("Item deleted");
        },
        onError: onMutationError,
    });

    const addSizeMutation = useMutation({
        mutationFn: ({ itemId, size }) => addItemMasterSize(itemId, { size, created_by: getCurrentUser() }),
        onSuccess: () => {
            invalidate();
            setNewSize("");
            toast.success("Size added");
        },
        onError: onMutationError,
    });

    const deleteSizeMutation = useMutation({
        mutationFn: ({ itemId, sizeId }) => deleteItemMasterSize(itemId, sizeId, getCurrentUser()),
        onSuccess: () => {
            invalidate();
            toast.success("Size deleted");
        },
        onError: onMutationError,
    });

    const handleAdd = () => {
        const name = newName.trim();
        if (!name) return;
        createMutation.mutate(name);
    };

    const startEdit = (item) => {
        setEditingId(item.id);
        setEditingName(item.name);
    };

    const saveEdit = () => {
        const name = editingName.trim();
        if (!name) return;
        updateMutation.mutate({ id: editingId, name });
    };

    const toggleExpand = (itemId) => {
        setExpandedId((prev) => (prev === itemId ? null : itemId));
        setNewSize("");
    };

    const handleAddSize = (itemId) => {
        const size = newSize.trim();
        if (!size) return;
        addSizeMutation.mutate({ itemId, size });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Manage Items</DialogTitle>
                    </DialogHeader>

                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="New item name..."
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        />
                        <Button type="button" onClick={handleAdd} disabled={createMutation.isPending || !newName.trim()}>
                            <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                    </div>

                    <div className="overflow-y-auto -mx-1 px-1 space-y-1 flex-1">
                        {isLoading && <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>}
                        {!isLoading && items.map((item) => {
                            const isExpanded = expandedId === item.id;
                            const sizes = item.sizes || [];
                            return (
                                <div key={item.id} className="rounded-md bg-muted/40 overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60 transition-colors">
                                        {editingId === item.id ? (
                                            <>
                                                <Input
                                                    className="h-8"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                                                    autoFocus
                                                />
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-success" onClick={saveEdit} disabled={updateMutation.isPending} title="Save">
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)} title="Cancel">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                                                    onClick={() => toggleExpand(item.id)}
                                                >
                                                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                                    <span className="text-sm truncate">{item.name}</span>
                                                    {sizes.length > 0 && (
                                                        <span className="text-[10px] text-muted-foreground shrink-0">({sizes.length} sizes)</span>
                                                    )}
                                                </button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(item)} title="Edit">
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setItemToDelete(item)} title="Delete">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </>
                                        )}
                                    </div>

                                    {isExpanded && (
                                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/60">
                                            <div className="flex items-center gap-2 pt-2">
                                                <Input
                                                    className="h-8"
                                                    placeholder="New size (e.g. 16mm)..."
                                                    value={newSize}
                                                    onChange={(e) => setNewSize(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && handleAddSize(item.id)}
                                                />
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleAddSize(item.id)}
                                                    disabled={addSizeMutation.isPending || !newSize.trim()}
                                                >
                                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                                                </Button>
                                            </div>
                                            {sizes.length === 0 ? (
                                                <div className="text-xs text-muted-foreground">No sizes yet — add one above.</div>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {sizes.map((s) => (
                                                        <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-card border border-border rounded-full pl-2.5 pr-1 py-1">
                                                            {s.size}
                                                            <button
                                                                type="button"
                                                                className="h-4 w-4 grid place-items-center rounded-full hover:bg-destructive/10 text-destructive"
                                                                onClick={() => deleteSizeMutation.mutate({ itemId: item.id, sizeId: s.id })}
                                                                title="Delete size"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {!isLoading && items.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">No items yet — add one above.</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!itemToDelete} onOpenChange={(o) => !o && setItemToDelete(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete Item</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Delete <strong className="text-foreground">{itemToDelete?.name}</strong> from the Item Master? Existing Purchase Orders that already used this item are not affected.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setItemToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => deleteMutation.mutate(itemToDelete.id)} disabled={deleteMutation.isPending}>Delete</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
