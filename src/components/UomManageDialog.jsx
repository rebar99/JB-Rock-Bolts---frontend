import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUomOptions, createUomOption, updateUomOption, deleteUomOption } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { toast } from "sonner";

export const UomManageDialog = ({ open, onOpenChange }) => {
    const qc = useQueryClient();
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState("");
    const [uomToDelete, setUomToDelete] = useState(null);

    const { data: uomOptions = [], isLoading } = useQuery({
        queryKey: ["uom"],
        queryFn: fetchUomOptions,
    });

    const createMutation = useMutation({
        mutationFn: (name) => createUomOption({ name }),
        onSuccess: () => {
            qc.invalidateQueries(["uom"]);
            qc.invalidateQueries(["constants"]);
            setNewName("");
            toast.success("UOM added");
        },
        onError: (err) => toast.error(err.message),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, name }) => updateUomOption(id, { name }),
        onSuccess: () => {
            qc.invalidateQueries(["uom"]);
            qc.invalidateQueries(["constants"]);
            setEditingId(null);
            toast.success("UOM updated");
        },
        onError: (err) => toast.error(err.message),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => deleteUomOption(id),
        onSuccess: () => {
            qc.invalidateQueries(["uom"]);
            qc.invalidateQueries(["constants"]);
            setUomToDelete(null);
            toast.success("UOM deleted");
        },
        onError: (err) => toast.error(err.message),
    });

    const handleAdd = () => {
        if (!newName.trim()) return;
        createMutation.mutate(newName.trim());
    };

    const startEdit = (uom) => {
        setEditingId(uom.id);
        setEditingName(uom.name);
    };

    const saveEdit = () => {
        if (!editingName.trim()) return;
        updateMutation.mutate({ id: editingId, name: editingName.trim() });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-4 sm:p-6 gap-0">
                    <DialogHeader className="mb-4">
                        <DialogTitle>Manage UOM Options</DialogTitle>
                    </DialogHeader>

                    <div className="flex items-center gap-2 mb-4 shrink-0">
                        <Input
                            placeholder="New UOM (e.g. Ltr, Kg)..."
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                            disabled={createMutation.isPending}
                        />
                        <Button onClick={handleAdd} disabled={createMutation.isPending || !newName.trim()}>
                            <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                        {isLoading && <div className="text-sm text-muted-foreground text-center py-4">Loading...</div>}
                        {!isLoading && uomOptions.map((uom) => (
                            <div key={uom.id} className="rounded-md bg-muted/40 overflow-hidden flex items-center gap-2 px-3 py-2 hover:bg-muted/60 transition-colors">
                                {editingId === uom.id ? (
                                    <>
                                        <Input
                                            className="h-8 flex-1"
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
                                        <span className="text-sm flex-1 truncate">{uom.name}</span>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(uom)} title="Edit">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setUomToDelete(uom)} title="Delete">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        ))}
                        {!isLoading && uomOptions.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">No UOM options yet.</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!uomToDelete} onOpenChange={(o) => !o && setUomToDelete(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete UOM</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Delete <strong className="text-foreground">{uomToDelete?.name}</strong>? Existing orders using this UOM will not be affected.
                    </p>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setUomToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => deleteMutation.mutate(uomToDelete.id)} disabled={deleteMutation.isPending}>Delete</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
